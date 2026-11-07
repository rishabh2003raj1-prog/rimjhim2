// Rimjhim Cafe backend - a Cloudflare Worker.
//
// Serves the app from ./public and stores every list the app keeps in D1, so
// nothing depends on the phone's ~5 MB browser storage any more. Both partners'
// phones read and write the same data.
//
//   POST   /api/login          { login, password }  -> sets the session cookie
//                               (owner: login blank or "owner", password = APP_PIN;
//                                store logins: created by the owner, one store each)
//   POST   /api/logout
//   GET    /api/session                          -> { ok, ai, role, outlet, login, name }
//   POST   /api/password       { old, new }      -> a store login changes its own password
//   GET    /api/users                            -> owner: list store logins
//   POST   /api/users  { login, outlet, name, password? } -> owner: create / update
//   DELETE /api/users/:login                     -> owner: remove
//   GET    /api/data?outlet=&since=              -> { items: { key: { value, rev } }, serverTime }
//   PUT    /api/data/:key?outlet=  { value, baseRev } -> { rev }  (409 + current value on conflict)
//   POST   /api/photos?outlet=  { dataUrl }      -> { url }
//   GET    /api/photos/:id
//   POST   /api/ai  { prompt }                   -> { text }
//   GET    /api/export?outlet=                   -> full JSON download

import Anthropic from "@anthropic-ai/sdk";

const COOKIE = "rj_session";
const CHUNK_CHARS = 400000;            // D1 caps a row at 2 MB; 400k chars stays under it even for 4-byte UTF-8
const MAX_VALUE_CHARS = 40 * 1000000;  // one list; far beyond anything a cafe produces
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS kv (outlet TEXT NOT NULL, key TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, wid TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (outlet, key))",
  "CREATE TABLE IF NOT EXISTS kv_chunks (outlet TEXT NOT NULL, key TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (outlet, key, idx))",
  "CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, outlet TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS login_fails (ip TEXT NOT NULL, ts INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS users (login TEXT PRIMARY KEY, outlet TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, hash TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS kv_updated ON kv (outlet, updated_at)",
  "CREATE INDEX IF NOT EXISTS login_fails_ip ON login_fails (ip, ts)"
];

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function outletOf(url) {
  const o = (url.searchParams.get("outlet") || "rimjhim").trim();
  return /^[a-z0-9_-]{1,40}$/i.test(o) ? o : null;
}

// ---- auth ----
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// The session token is derived from the PIN, so changing APP_PIN signs everyone out.
function sessionToken(env) {
  return hmacHex(env.APP_PIN, "rimjhim-session-v1");
}
// A store login's token names the login and its version; changing the password or
// removing the login bumps / deletes the row, which signs that login out everywhere.
async function storeToken(env, login, ver) {
  return "u." + login + "." + ver + "." + await hmacHex(env.APP_PIN, "rimjhim-store-v1|" + login + "|" + ver);
}
const PBKDF2_ITER = 100000;
function hexOf(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hexOf(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256));
}
function newSalt() { return hexOf(crypto.getRandomValues(new Uint8Array(16))); }
function cleanLogin(v) { return String(v || "").trim().toLowerCase(); }
function validLogin(v) { return /^[a-z0-9._-]{3,32}$/.test(v) && v !== "owner" && v !== "admin"; }
function readCookie(req, name) {
  const all = req.headers.get("Cookie") || "";
  for (const part of all.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
// Who is signed in: { role: "owner" } (every store) or { role: "store", outlet, login, name }.
async function whoIs(req, env) {
  const got = readCookie(req, COOKIE);
  if (!got) return null;
  if (safeEqual(got, await sessionToken(env))) return { role: "owner" };
  const m = /^u\.([a-z0-9._-]{3,32})\.(\d+)\.[a-f0-9]{64}$/.exec(got);
  if (!m) return null;
  const row = await env.DB.prepare("SELECT login, outlet, name, ver FROM users WHERE login = ?").bind(m[1]).first();
  if (!row || String(row.ver) !== m[2]) return null;
  if (!safeEqual(got, await storeToken(env, row.login, row.ver))) return null;
  return { role: "store", outlet: row.outlet, login: row.login, name: row.name };
}
// The store's display name, from the shared outlet list (store logins can't read that list).
async function outletNameOf(env, id) {
  try {
    const cur = await readOne(env, "_global", "outlets_v1");
    const o = Array.isArray(cur.value) ? cur.value.find((x) => x && x.id === id) : null;
    if (o) return o.name;
  } catch (e) { /* fall through */ }
  return id === "rimjhim" ? "Rimjhim Cafe" : id;
}
// Store logins only reach their own store's data.
function canUseOutlet(who, outlet) {
  return who.role === "owner" || outlet === who.outlet;
}

async function handleLogin(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const since = Date.now() - LOGIN_WINDOW_MS;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE ip = ? AND ts > ?").bind(ip, since).first();
  if (row && row.n >= LOGIN_MAX_FAILS) {
    return json({ error: "Too many wrong attempts. Wait 15 minutes and try again." }, 429);
  }
  let body = {};
  try { body = await req.json(); } catch (e) { /* empty */ }
  const login = cleanLogin(body.login);
  const password = String(body.password !== undefined ? body.password : (body.pin || ""));
  let token = null, who = null;
  if (!login || login === "owner" || login === "admin") {
    if (safeEqual(await hmacHex("pin-check", password), await hmacHex("pin-check", env.APP_PIN))) {
      token = await sessionToken(env); who = { role: "owner" };
    }
  } else {
    const row = await env.DB.prepare("SELECT login, outlet, name, salt, hash, ver FROM users WHERE login = ?").bind(login).first();
    // Hash even when the login doesn't exist, so timing doesn't reveal valid IDs.
    const h = await hashPassword(password, row ? row.salt : "00000000000000000000000000000000");
    if (row && safeEqual(h, row.hash)) {
      token = await storeToken(env, row.login, row.ver);
      who = { role: "store", outlet: row.outlet, login: row.login, name: row.name, outletName: await outletNameOf(env, row.outlet) };
    }
  }
  if (!token) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO login_fails (ip, ts) VALUES (?, ?)").bind(ip, Date.now()),
      env.DB.prepare("DELETE FROM login_fails WHERE ts < ?").bind(since)
    ]);
    return json({ error: login ? "Wrong login ID or password." : "Wrong PIN." }, 401);
  }
  await env.DB.prepare("DELETE FROM login_fails WHERE ip = ?").bind(ip).run();
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json(Object.assign({ ok: true }, who), 200, {
    "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`
  });
}

// ---- store logins (owner only) ----
async function handleUsers(req, env, path) {
  if (req.method === "GET" && path === "/api/users") {
    const rows = await env.DB.prepare("SELECT login, outlet, name, created_at FROM users ORDER BY outlet, login").all();
    return json({ users: rows.results });
  }
  if (req.method === "POST" && path === "/api/users") {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const login = cleanLogin(body.login), outlet = String(body.outlet || "").trim(), name = String(body.name || "").trim().slice(0, 60);
    const password = body.password === undefined || body.password === null ? "" : String(body.password);
    if (!validLogin(login)) return json({ error: "Login ID: 3-32 letters, numbers, dot, dash or underscore (not 'owner' or 'admin')." }, 400);
    if (!/^[a-z0-9_-]{1,40}$/i.test(outlet) || outlet === "_global") return json({ error: "Pick a store." }, 400);
    const cur = await env.DB.prepare("SELECT login FROM users WHERE login = ?").bind(login).first();
    if (!cur && password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    if (password && password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    if (!cur) {
      const salt = newSalt();
      await env.DB.prepare("INSERT INTO users (login, outlet, name, salt, hash, ver, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .bind(login, outlet, name, salt, await hashPassword(password, salt), Date.now()).run();
    } else if (password) {
      const salt = newSalt();
      await env.DB.prepare("UPDATE users SET outlet = ?, name = ?, salt = ?, hash = ?, ver = ver + 1 WHERE login = ?")
        .bind(outlet, name, salt, await hashPassword(password, salt), login).run();
    } else {
      // Moving a login to another store signs it out; a rename alone doesn't.
      await env.DB.prepare("UPDATE users SET name = ?, ver = CASE WHEN outlet = ? THEN ver ELSE ver + 1 END, outlet = ? WHERE login = ?")
        .bind(name, outlet, outlet, login).run();
    }
    return json({ ok: true, created: !cur });
  }
  const m = path.match(/^\/api\/users\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM users WHERE login = ?").bind(cleanLogin(decodeURIComponent(m[1]))).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

async function handleOwnPassword(req, env, who) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const row = await env.DB.prepare("SELECT salt, hash, ver FROM users WHERE login = ?").bind(who.login).first();
  if (!row || !safeEqual(await hashPassword(String(body.old || ""), row.salt), row.hash)) return json({ error: "Current password is wrong." }, 401);
  const nw = String(body.new || "");
  if (nw.length < 6) return json({ error: "New password must be at least 6 characters." }, 400);
  const salt = newSalt();
  await env.DB.prepare("UPDATE users SET salt = ?, hash = ?, ver = ver + 1 WHERE login = ?").bind(salt, await hashPassword(nw, salt), who.login).run();
  // Keep this phone signed in with the new version; others are signed out.
  const token = await storeToken(env, who.login, row.ver + 1);
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}` });
}

// ---- data ----
async function readAll(env, outlet, since) {
  const rows = await env.DB.prepare(
    "SELECT k.key AS key, k.rev AS rev, k.updated_at AS updated_at, c.idx AS idx, c.data AS data " +
    "FROM kv k JOIN kv_chunks c ON c.outlet = k.outlet AND c.key = k.key " +
    "WHERE k.outlet = ? AND k.updated_at > ? ORDER BY k.key, c.idx"
  ).bind(outlet, since).all();
  const parts = {};
  for (const r of rows.results) {
    const p = parts[r.key] || (parts[r.key] = { rev: r.rev, chunks: [] });
    p.chunks.push(r.data);
  }
  const items = {};
  for (const k of Object.keys(parts)) {
    try { items[k] = { rev: parts[k].rev, value: JSON.parse(parts[k].chunks.join("")) }; }
    catch (e) { /* half-written value can't happen inside a batch; skip if it somehow does */ }
  }
  return items;
}

async function readOne(env, outlet, key) {
  const items = await env.DB.prepare(
    "SELECT k.rev AS rev, c.data AS data FROM kv k JOIN kv_chunks c ON c.outlet = k.outlet AND c.key = k.key " +
    "WHERE k.outlet = ? AND k.key = ? ORDER BY c.idx"
  ).bind(outlet, key).all();
  if (!items.results.length) {
    const r = await env.DB.prepare("SELECT rev FROM kv WHERE outlet = ? AND key = ?").bind(outlet, key).first();
    return { rev: r ? r.rev : 0, value: null };
  }
  return { rev: items.results[0].rev, value: JSON.parse(items.results.map((r) => r.data).join("")) };
}

async function writeOne(env, outlet, key, value, baseRev) {
  const text = JSON.stringify(value);
  if (text.length > MAX_VALUE_CHARS) return { tooBig: true };
  const wid = crypto.randomUUID();
  const now = Date.now();
  const has = "EXISTS (SELECT 1 FROM kv WHERE outlet = ? AND key = ? AND wid = ?)";
  const stmts = [
    env.DB.prepare("INSERT OR IGNORE INTO kv (outlet, key, rev, wid, updated_at) VALUES (?, ?, 0, '', 0)").bind(outlet, key),
    // Only the writer that saw the current revision wins; the rest get a 409.
    env.DB.prepare("UPDATE kv SET rev = rev + 1, wid = ?, updated_at = ? WHERE outlet = ? AND key = ? AND rev = ?")
      .bind(wid, now, outlet, key, baseRev),
    env.DB.prepare(`DELETE FROM kv_chunks WHERE outlet = ? AND key = ? AND ${has}`).bind(outlet, key, outlet, key, wid)
  ];
  for (let i = 0, idx = 0; i < text.length || idx === 0; i += CHUNK_CHARS, idx++) {
    stmts.push(env.DB.prepare(`INSERT INTO kv_chunks (outlet, key, idx, data) SELECT ?, ?, ?, ? WHERE ${has}`)
      .bind(outlet, key, idx, text.slice(i, i + CHUNK_CHARS), outlet, key, wid));
  }
  const res = await env.DB.batch(stmts);
  if (!res[1].meta || res[1].meta.changes !== 1) return { conflict: true };
  return { rev: baseRev + 1 };
}

function validKey(k) { return /^[a-z0-9_]{1,40}$/.test(k); }

async function handleData(req, env, url, path, who) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
  if (!canUseOutlet(who, outlet)) {
    return json({ error: "This login can only open its own store.", outlet: who.outlet }, 403);
  }

  if (req.method === "GET" && path === "/api/data") {
    const serverTime = Date.now();
    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
    return json({ items: await readAll(env, outlet, since), serverTime });
  }

  const m = path.match(/^\/api\/data\/([^/]+)$/);
  if (m && req.method === "PUT") {
    const key = m[1];
    if (!validKey(key)) return json({ error: "bad key" }, 400);
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : 0;
    const r = await writeOne(env, outlet, key, body.value === undefined ? null : body.value, baseRev);
    if (r.tooBig) return json({ error: "too big" }, 413);
    if (r.conflict) {
      const cur = await readOne(env, outlet, key);
      return json({ conflict: true, rev: cur.rev, value: cur.value }, 409);
    }
    return json({ rev: r.rev });
  }
  return json({ error: "not found" }, 404);
}

async function handleExport(env, url, who) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
  if (!canUseOutlet(who, outlet)) return json({ error: "not allowed" }, 403);
  const items = await readAll(env, outlet, -1);
  const out = { exportedAt: new Date().toISOString(), outlet };
  for (const k of Object.keys(items)) out[k] = items[k].value;
  return json(out, 200, { "Content-Disposition": `attachment; filename="${outlet}_cloud_export.json"` });
}

// ---- photos ----
async function handlePhotoUpload(req, env, url, who) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
  if (!canUseOutlet(who, outlet)) return json({ error: "not allowed" }, 403);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ""));
  if (!m) return json({ error: "Not an image." }, 400);
  const bin = atob(m[2]);
  if (bin.length > MAX_PHOTO_BYTES) return json({ error: "Photo too large." }, 413);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO photos (id, outlet, mime, data, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, outlet, m[1], bytes, Date.now()).run();
  return json({ url: "/api/photos/" + id });
}

async function handlePhotoGet(env, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT mime, data FROM photos WHERE id = ?").bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=31536000, immutable" }
  });
}

// ---- AI note reading ----
// Uses Claude when ANTHROPIC_API_KEY is set; otherwise Cloudflare Workers AI,
// which is free within the account's daily allowance and needs no key.
const FREE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function aiAvailable(env) { return !!(env.ANTHROPIC_API_KEY || env.AI); }

async function handleAi(req, env) {
  if (!aiAvailable(env)) return json({ error: "AI not configured" }, 503);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt || prompt.length > 20000) return json({ error: "bad prompt" }, 400);
  try {
    if (env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: env.AI_MODEL || "claude-opus-5",
        max_tokens: 16000,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }]
      });
      if (msg.stop_reason === "refusal") return json({ error: "refused" }, 502);
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      return json({ text });
    }
    const out = await env.AI.run(env.FREE_AI_MODEL || FREE_MODEL, {
      messages: [
        { role: "system", content: "You turn a cafe owner's short notes into data. Reply with only the JSON array asked for - no explanation, no markdown." },
        { role: "user", content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0
    });
    const r = out && out.response;
    const text = typeof r === "string" ? r : JSON.stringify(r);
    return json({ text });
  } catch (e) {
    return json({ error: "AI request failed" }, 502);
  }
}

// ---- import from the old single-file app ----
// The old app's "Cloud sync → Push to cloud" sends every list in one PUT to
// {Backend URL}/api/data?outlet=..., with the API key in an x-api-key header.
// Accept that here (the PIN is the API key) so old data moves over in one tap,
// without copying a backup that phones cut short.
const LEGACY_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Max-Age": "86400"
};

function mergeIncoming(current, incoming) {
  if (!Array.isArray(incoming)) {
    if (incoming && typeof incoming === "object" && current && typeof current === "object" && !Array.isArray(current)) {
      return Object.assign({}, current, incoming);
    }
    return incoming === null || incoming === undefined ? current : incoming;
  }
  if (!Array.isArray(current) || !current.length) return incoming;
  const withIds = (a) => a.every((x) => x && typeof x === "object" && x.id !== undefined);
  if (!withIds(current) || !withIds(incoming)) {
    const seen = new Set(current.map((x) => JSON.stringify(x)));
    return current.concat(incoming.filter((x) => !seen.has(JSON.stringify(x))));
  }
  const out = current.slice();
  const at = new Map(out.map((x, i) => [x.id, i]));
  for (const x of incoming) {
    if (at.has(x.id)) out[at.get(x.id)] = x; else out.push(x);
  }
  return out;
}

async function handleLegacyPush(req, env, url) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const since = Date.now() - LOGIN_WINDOW_MS;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE ip = ? AND ts > ?").bind(ip, since).first();
  if (row && row.n >= LOGIN_MAX_FAILS) return json({ error: "Too many wrong attempts. Wait 15 minutes." }, 429, LEGACY_CORS);
  const key = req.headers.get("x-api-key") || "";
  if (!safeEqual(await hmacHex("pin-check", key), await hmacHex("pin-check", env.APP_PIN))) {
    await env.DB.prepare("INSERT INTO login_fails (ip, ts) VALUES (?, ?)").bind(ip, Date.now()).run();
    return json({ error: "Wrong API key - use the app PIN." }, 401, LEGACY_CORS);
  }
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400, LEGACY_CORS);
  if (req.method === "GET") {
    const items = await readAll(env, outlet, -1);
    const data = {};
    for (const k of Object.keys(items)) data[k] = items[k].value;
    return json({ data }, 200, LEGACY_CORS);
  }
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400, LEGACY_CORS); }
  if (!body || typeof body !== "object") return json({ error: "bad data" }, 400, LEGACY_CORS);
  const counts = {};
  for (const k of Object.keys(body)) {
    if (!validKey(k)) continue;
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await readOne(env, outlet, k);
      const r = await writeOne(env, outlet, k, mergeIncoming(cur.value, body[k]), cur.rev);
      if (r.tooBig) return json({ error: "too big: " + k }, 413, LEGACY_CORS);
      if (!r.conflict) break;
    }
    if (Array.isArray(body[k])) counts[k] = body[k].length;
  }
  return json({ ok: true, imported: counts }, 200, LEGACY_CORS);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);

    if (!env.APP_PIN) {
      return json({ error: "The server has no APP_PIN set. Run: npx wrangler secret put APP_PIN" }, 500);
    }
    const legacy = path === "/api/data" && (req.headers.has("x-api-key") || req.method === "OPTIONS");
    if (legacy && req.method === "OPTIONS") return new Response(null, { status: 204, headers: LEGACY_CORS });
    if (legacy) {
      try { await ensureSchema(env); return await handleLegacyPush(req, env, url); }
      catch (e) { return json({ error: "server error", detail: String(e && e.message || e) }, 500, LEGACY_CORS); }
    }
    // Cookie auth + JSON bodies: reject cross-site writes outright.
    if (req.method !== "GET") {
      const origin = req.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "bad origin" }, 403);
    }
    try {
      await ensureSchema(env);
      if (path === "/api/login" && req.method === "POST") return await handleLogin(req, env);
      if (path === "/api/logout" && req.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
      }
      const who = await whoIs(req, env);
      if (path === "/api/session") {
        if (who && who.role === "store") who.outletName = await outletNameOf(env, who.outlet);
        return json(Object.assign({ ok: !!who, ai: aiAvailable(env) }, who || {}), who ? 200 : 401);
      }
      if (!who) return json({ error: "login required" }, 401);

      if (path === "/api/data" || path.startsWith("/api/data/")) return await handleData(req, env, url, path, who);
      if (path === "/api/export" && req.method === "GET") return await handleExport(env, url, who);
      if (path === "/api/photos" && req.method === "POST") return await handlePhotoUpload(req, env, url, who);
      if (path === "/api/password" && req.method === "POST") {
        if (who.role !== "store") return json({ error: "The owner PIN is changed with the APP_PIN secret." }, 400);
        return await handleOwnPassword(req, env, who);
      }
      if (path === "/api/users" || path.startsWith("/api/users/")) {
        if (who.role !== "owner") return json({ error: "Only the owner can manage logins." }, 403);
        return await handleUsers(req, env, path);
      }
      if (path.startsWith("/api/photos/") && req.method === "GET") return await handlePhotoGet(env, path.slice(12));
      if (path === "/api/ai" && req.method === "POST") return await handleAi(req, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error", detail: String(e && e.message || e) }, 500);
    }
  }
};
