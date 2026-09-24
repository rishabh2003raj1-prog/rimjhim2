// Rimjhim Cafe backend - a Cloudflare Worker.
//
// Serves the app from ./public and stores every list the app keeps in D1, so
// nothing depends on the phone's ~5 MB browser storage any more. Both partners'
// phones read and write the same data.
//
//   POST   /api/login          { pin }          -> sets the session cookie
//   POST   /api/logout
//   GET    /api/session                          -> { ok, ai }
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
function readCookie(req, name) {
  const all = req.headers.get("Cookie") || "";
  for (const part of all.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
async function isAuthed(req, env) {
  const got = readCookie(req, COOKIE);
  if (!got) return false;
  return safeEqual(got, await sessionToken(env));
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
  const pin = String(body.pin || "");
  if (!safeEqual(await hmacHex("pin-check", pin), await hmacHex("pin-check", env.APP_PIN))) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO login_fails (ip, ts) VALUES (?, ?)").bind(ip, Date.now()),
      env.DB.prepare("DELETE FROM login_fails WHERE ts < ?").bind(since)
    ]);
    return json({ error: "Wrong PIN." }, 401);
  }
  await env.DB.prepare("DELETE FROM login_fails WHERE ip = ?").bind(ip).run();
  const token = await sessionToken(env);
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, {
    "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`
  });
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

async function handleData(req, env, url, path) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);

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

async function handleExport(env, url) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
  const items = await readAll(env, outlet, -1);
  const out = { exportedAt: new Date().toISOString(), outlet };
  for (const k of Object.keys(items)) out[k] = items[k].value;
  return json(out, 200, { "Content-Disposition": `attachment; filename="${outlet}_cloud_export.json"` });
}

// ---- photos ----
async function handlePhotoUpload(req, env, url) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
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
      const authed = await isAuthed(req, env);
      if (path === "/api/session") return json({ ok: authed, ai: aiAvailable(env) }, authed ? 200 : 401);
      if (!authed) return json({ error: "login required" }, 401);

      if (path === "/api/data" || path.startsWith("/api/data/")) return await handleData(req, env, url, path);
      if (path === "/api/export" && req.method === "GET") return await handleExport(env, url);
      if (path === "/api/photos" && req.method === "POST") return await handlePhotoUpload(req, env, url);
      if (path.startsWith("/api/photos/") && req.method === "GET") return await handlePhotoGet(env, path.slice(12));
      if (path === "/api/ai" && req.method === "POST") return await handleAi(req, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error", detail: String(e && e.message || e) }, 500);
    }
  }
};
