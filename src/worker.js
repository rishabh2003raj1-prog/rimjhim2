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
//   POST   /api/logout-all                       -> owner: sign every phone out now
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
//   GET    /api/audit?outlet=&limit=             -> owner / partner: who changed what
//   GET    /api/backups?outlet=                  -> owner / partner: daily backups (POST: owner backs up now)
//   GET    /api/backups/:day?outlet=             -> download one day's backup
// Logins have a role (partner / manager / chef / billing / full); see POLICY for what each may see and change.

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
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS users (login TEXT PRIMARY KEY, outlet TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, hash TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, outlet TEXT NOT NULL, key TEXT NOT NULL, who TEXT NOT NULL, access TEXT NOT NULL, added INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS audit_ts ON audit (outlet, ts)",
  "CREATE TABLE IF NOT EXISTS backups (outlet TEXT NOT NULL, day TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (outlet, day, idx))",
  "CREATE INDEX IF NOT EXISTS kv_updated ON kv (outlet, updated_at)",
  "CREATE INDEX IF NOT EXISTS login_fails_ip ON login_fails (ip, ts)"
];

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)))
      // Older databases: add the role column once (SQLite has no "ADD COLUMN IF NOT EXISTS").
      .then(() => env.DB.prepare("ALTER TABLE users ADD COLUMN access TEXT NOT NULL DEFAULT 'full'").run().catch(() => null))
      .catch((e) => {
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
// A phone signs in once a day: its session lasts until the next 4 AM (India time),
// and the server refuses it after that. Tokens are signed with APP_PIN, so changing
// the PIN signs everyone out. They also carry a "generation": the owner's "Sign out
// all phones" bumps it, which ends every session at once.
const DAY_START_HOUR = 4, TZ_OFFSET_MIN = 330;
function sessionExpiry(now) {
  const local = new Date(now + TZ_OFFSET_MIN * 60000);
  let exp = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), DAY_START_HOUR) - TZ_OFFSET_MIN * 60000;
  while (exp - now < 2 * 3600000) exp += 24 * 3600000;   // at least 2 hours, so a late-night sign-in isn't cut short
  return exp;
}
async function sessionGen(env) {
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'session_gen'").first();
  return r ? String(r.v) : "1";
}
// Owner: "o.<expiry>.<gen>.<sig>"; store login: "u.<login>.<ver>.<expiry>.<gen>.<sig>".
// A store token also names the login's version, so a new password, a move to another
// store or deleting the login signs that login out everywhere.
async function ownerToken(env, exp, gen) {
  return "o." + exp + "." + gen + "." + await hmacHex(env.APP_PIN, "rimjhim-owner-v2|" + exp + "|" + gen);
}
async function storeToken(env, login, ver, exp, gen) {
  return "u." + login + "." + ver + "." + exp + "." + gen + "." + await hmacHex(env.APP_PIN, "rimjhim-store-v2|" + login + "|" + ver + "|" + exp + "|" + gen);
}
function sessionCookie(req, token, exp) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
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
  const now = Date.now();
  const o = /^o\.(\d{10,15})\.(\d+)\.[a-f0-9]{64}$/.exec(got);
  if (o) {
    const exp = +o[1];
    if (exp <= now || o[2] !== await sessionGen(env)) return null;
    if (!safeEqual(got, await ownerToken(env, exp, o[2]))) return null;
    return { role: "owner", exp };
  }
  const m = /^u\.([a-z0-9._-]{3,32})\.(\d+)\.(\d{10,15})\.(\d+)\.[a-f0-9]{64}$/.exec(got);
  if (!m) return null;
  const exp = +m[3];
  if (exp <= now || m[4] !== await sessionGen(env)) return null;
  const row = await env.DB.prepare("SELECT login, outlet, name, ver, access FROM users WHERE login = ?").bind(m[1]).first();
  if (!row || String(row.ver) !== m[2]) return null;
  if (!safeEqual(got, await storeToken(env, row.login, row.ver, exp, m[4]))) return null;
  return { role: "store", outlet: row.outlet, login: row.login, name: row.name, access: row.access || "full", exp };
}

// ---- roles and what each can see / change ----
// owner (the PIN) and "partner" and "full" logins see and change everything in their
// stores. manager, chef and billing logins get only what their job needs, decided
// HERE on the server - the app's screens only follow along. A restricted login never
// receives data it may not see, and when it saves a list the server merges: records it
// cannot see are kept exactly as they are, so a staff phone can never wipe them.
const ACCESS_LEVELS = ["partner", "manager", "chef", "billing", "full"];
const FULL_ACCESS = { owner: true, partner: true, full: true };
// Pay details are hidden from staff logins.
const PAY_FIELDS = ["salary", "salaryHistory", "salaryMonths", "houseRent", "foodAllowance", "travelAllowance", "foodBasis", "travelBasis", "allowHistory", "allowMonths", "upi"];
const STAFF_PUBLIC = ["id", "name", "role", "defaultShift", "status", "joinDate", "leftDate"];
const SETTINGS_PRIVATE = ["bankBalance", "bankDate", "bankReviewed"];
// Readable by the manager but only the owner / partners can change them.
const SETTINGS_OWNER = ["poManagerLimit"];
const SETTINGS_PUBLIC = ["shifts", "mealTypes", "mealWeek", "mealBasics", "mealDays", "defaultFloat", "openingCash", "openingCashDate", "fixedExtra", "noteAliases", "paidLeaveDays", "upiId", "upiName", "maxDiscountPct", "checklists", "stockCoverDays"];
const STAFF_PAY_CATS = ["Staff Salary", "Staff House Rent", "Staff Food Allowance", "Staff Travel Allowance", "Staff Bonus"];
const CASH_MGR_TYPES = ["counter", "atm", "atmheld", "taken", "pass", "bank"];
const CASH_BILL_TYPES = ["counter", "atm", "taken"];
// key -> { manager, chef, billing } rule. No rule = not visible.
const POLICY = {
  sales_v1:          { manager: "rw", billing: "append2" },
  purchases_v1:      { manager: "rw", chef: "append" },
  bills_v1:          { manager: "rw", chef: "append" },
  notes_v1:          { manager: "own", chef: "own", billing: "own" },
  expenses_v1:       { manager: "expenses" },
  vendors_v1:        { manager: "rw", chef: "r" },
  menu_v1:           { manager: "rw", chef: "rw", billing: "r" },
  ingredients_v1:    { manager: "rw", chef: "rw", billing: "r" },
  dishlog_v1:        { manager: "rw", chef: "rw", billing: "append2" },
  wastage_v1:        { manager: "rw", chef: "rw" },
  prepbatches_v1:    { manager: "rw", chef: "rw" },
  stockaudits_v1:    { manager: "rw", chef: "rw" },
  cafeuse_v1:        { manager: "rw", chef: "rw" },
  retail_v1:         { manager: "rw", chef: "r", billing: "r" },
  retailsales_v1:    { manager: "rw", billing: "append2" },
  customers_v1:      { manager: "rw", billing: "append" },
  custpayments_v1:   { manager: "rw", billing: "append" },
  offers_v1:         { manager: "rw", billing: "r" },
  creditpayments_v1: { manager: "rw", billing: "append" },
  assets_v1:         { manager: "rw", chef: "r" },
  cashdays_v1:       { manager: "rw", billing: "append2" },
  cashmoves_v1:      { manager: "cashmgr", billing: "cashbill" },
  staff_v1:          { manager: "staff", chef: "staffpub", billing: "staffpub" },
  roster_v1:         { manager: "rw", chef: "r", billing: "r" },
  attendance_v1:     { manager: "rw", chef: "r", billing: "r" },
  tasks_v1:          { manager: "rw", chef: "r", billing: "r" },
  conduct_v1:        { manager: "rw" },
  settings_v1:       { manager: "settings", chef: "settingspub", billing: "settingspub" },
  checks_v1:         { manager: "rw", chef: "append2", billing: "append2" },
  pos_v1:            { manager: "po", chef: "po", billing: "po" },
  partners_v1:       { manager: "r", chef: "r", billing: "r" }
  // investments, loans, payroll and anything new: owner / partner / full only.
};
function accessOf(who) { return who.role === "owner" ? "owner" : (who.access || "full"); }
function isFull(who) { return !!FULL_ACCESS[accessOf(who)]; }
function ruleFor(who, key) { if (isFull(who)) return "rw"; const p = POLICY[key]; return (p && p[accessOf(who)]) || null; }
function pick(o, keys) { const r = {}; keys.forEach((k) => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; }
function omit(o, keys) { const r = Object.assign({}, o || {}); keys.forEach((k) => { delete r[k]; }); return r; }
function istDay(offsetDays) { const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000 + (offsetDays || 0) * 86400000); return d.toISOString().slice(0, 10); }
function arr(v) { return Array.isArray(v) ? v : []; }
function idMap(list) { const m = new Map(); arr(list).forEach((r) => { if (r && r.id !== undefined) m.set(String(r.id), r); }); return m; }
function recentOrOwn(r, who) { return (r && r.by === who.login) || !r || !r.date || r.date >= istDay(-1); }
function redactPay(x) { return { id: x.id, date: x.date, category: x.category, description: "Staff payment", amount: x.amount, mode: x.mode, paidBy: x.paidBy, redacted: true }; }

// What a login may read of one stored value (undefined = not at all).
function readView(rule, value, who) {
  if (!rule) return undefined;
  switch (rule) {
    case "rw": case "r": case "append": case "po": return value;
    case "append2": return arr(value).filter((r) => recentOrOwn(r, who));
    case "own": return arr(value).filter((r) => r && r.by === who.login);
    case "expenses": return arr(value).map((x) => (x && STAFF_PAY_CATS.indexOf(x.category) >= 0) ? redactPay(x) : x);
    case "staff": return arr(value).map((x) => omit(x, PAY_FIELDS));
    case "staffpub": return arr(value).map((x) => pick(x, STAFF_PUBLIC));
    case "settings": return omit(value, SETTINGS_PRIVATE);
    case "settingspub": return pick(value, SETTINGS_PUBLIC);
    case "cashmgr": return arr(value).filter((m) => m && CASH_MGR_TYPES.indexOf(m.type) >= 0);
    case "cashbill": return arr(value).filter((m) => m && CASH_BILL_TYPES.indexOf(m.type) >= 0);
  }
  return undefined;
}
// The value to store when a restricted login saves `sent` over `cur`.
// Returns { value } or { error }.
// ---- purchase orders: request -> (manager) approve or send to owner -> ordered -> received ----
// The server stamps who approved, holds managers to their limit, and lets staff only request,
// edit their own pending requests and receive goods that were ordered.
const PO_APPROVED = ["approved", "ordered", "partial", "received"];
const PO_STAMP = ["approvedBy", "approvedRole", "approvedAt"];
const PO_RECEIVE_FIELDS = ["status", "received", "receivedAt", "receivedByName", "purchaseIds"];
function poTotal(po) { return arr(po && po.lines).reduce((a, l) => a + (+(l && l.qty) || 0) * (+(l && l.rate) || 0), 0); }
function poStamp(o, r, who) {
  if (!r || typeof r !== "object") return r;
  const out = omit(r, PO_STAMP);
  if (o && o.approvedBy) return Object.assign(out, pick(o, PO_STAMP));
  if (PO_APPROVED.indexOf(r.status) >= 0) return Object.assign(out, { approvedBy: who.role === "owner" ? "owner" : who.login, approvedRole: accessOf(who), approvedAt: Date.now() });
  return out;
}
function poHistory(o, r) { const h = arr(o && o.history); return h.concat(arr(r && r.history).slice(h.length)); }
async function poWrite(env, outlet, cur, sent, who) {
  if (!Array.isArray(sent)) return { error: "bad value" };
  const old = idMap(cur), acc = accessOf(who), me = who.role === "owner" ? "owner" : who.login;
  if (isFull(who) || acc === "manager") {
    let limit = 2000;
    if (acc === "manager") {
      const st = (await readOne(env, outlet, "settings_v1")).value || {};
      if (st.poManagerLimit !== undefined && st.poManagerLimit !== null && st.poManagerLimit !== "" && +st.poManagerLimit >= 0) limit = +st.poManagerLimit;
    }
    const out = [];
    for (const r of sent) {
      const o = r && old.get(String(r.id));
      const was = !!o && PO_APPROVED.indexOf(o.status) >= 0, now = !!r && PO_APPROVED.indexOf(r.status) >= 0;
      if (acc === "manager" && now && !was && poTotal(r) > limit + 0.5) return { error: "Above your approval limit (Rs " + limit + "). Send it to the owner." };
      const x = poStamp(o, r, who);
      if (x && typeof x === "object") x.by = (o && o.by) || x.by || me;
      out.push(x);
    }
    return { value: out };
  }
  const sentMap = idMap(sent), out = [], seen = new Set();
  arr(cur).forEach((o) => {
    const id = String(o && o.id); seen.add(id);
    const r = sentMap.get(id);
    if (!r) { out.push(o); return; }
    if (o.by === who.login && o.status === "requested" && (r.status === "requested" || r.status === "cancelled")) {
      out.push(Object.assign(omit(r, PO_STAMP), { by: o.by, history: poHistory(o, r) })); return;
    }
    if ((o.status === "ordered" || o.status === "partial") && ["ordered", "partial", "received"].indexOf(r.status) >= 0) {
      out.push(Object.assign({}, o, pick(r, PO_RECEIVE_FIELDS), { history: poHistory(o, r) })); return;
    }
    out.push(o);
  });
  arr(sent).forEach((r) => {
    const id = r && String(r.id);
    if (r && typeof r === "object" && !seen.has(id)) out.push(Object.assign(omit(r, PO_STAMP), { status: "requested", by: who.login }));
  });
  return { value: out };
}
function mergeWrite(rule, cur, sent, who) {
  const stamp = (r) => (r && typeof r === "object" && !r.by) ? Object.assign({}, r, { by: who.login }) : r;
  switch (rule) {
    case "rw": {
      // Keep who added each record, and stamp new ones.
      if (!Array.isArray(sent)) return { value: sent };
      const old = idMap(cur);
      return { value: sent.map((r) => { const o = r && old.get(String(r.id)); return o ? (o.by && !r.by ? Object.assign({}, r, { by: o.by }) : r) : stamp(r); }) };
    }
    case "append": case "append2": {
      // Add new records; change or remove only your own (and only recent ones for append2).
      const old = idMap(cur), seen = new Set(), out = [];
      const sentMap = idMap(sent);
      arr(cur).forEach((r) => {
        const id = r && String(r.id), mine = r && r.by === who.login, visible = rule === "append" || recentOrOwn(r, who);
        if (mine && visible) { if (sentMap.has(id)) { out.push(Object.assign({}, sentMap.get(id), { by: who.login })); seen.add(id); } }
        else { out.push(r); seen.add(id); }
      });
      arr(sent).forEach((r) => { const id = r && String(r.id); if (r && !seen.has(id) && !old.has(id)) out.push(Object.assign({}, r, { by: who.login })); });
      return { value: out };
    }
    case "own": {
      const others = arr(cur).filter((r) => !(r && r.by === who.login));
      return { value: others.concat(arr(sent).map((r) => Object.assign({}, r, { by: who.login }))) };
    }
    case "expenses": {
      // Staff pay records stay exactly as they are; new ones can't be added from here.
      const keep = arr(cur).filter((x) => x && STAFF_PAY_CATS.indexOf(x.category) >= 0);
      const old = idMap(cur);
      const mine = arr(sent).filter((x) => x && !x.redacted && STAFF_PAY_CATS.indexOf(x.category) < 0)
        .map((r) => { const o = old.get(String(r.id)); return o ? (o.by && !r.by ? Object.assign({}, r, { by: o.by }) : r) : stamp(r); });
      return { value: keep.concat(mine) };
    }
    case "staff": {
      // Names, roles, shifts and dates can change; pay details come from the stored record.
      const old = idMap(cur);
      return { value: arr(sent).map((r) => { const o = old.get(String(r && r.id)); return Object.assign(omit(r, PAY_FIELDS), o ? pick(o, PAY_FIELDS) : {}); }) };
    }
    case "settings": { const keep = SETTINGS_PRIVATE.concat(SETTINGS_OWNER); return { value: Object.assign(omit(sent, keep), pick(cur, keep)) }; }
    case "cashmgr": {
      const keep = arr(cur).filter((m) => !(m && CASH_MGR_TYPES.indexOf(m.type) >= 0));
      return { value: keep.concat(arr(sent).filter((m) => m && CASH_MGR_TYPES.indexOf(m.type) >= 0).map(stamp)) };
    }
  }
  return { error: "This login can't change this." };
}
// Counts of records added / changed / removed, for the activity log.
function diffCounts(cur, next) {
  if (!Array.isArray(cur) && !Array.isArray(next)) return { added: 0, changed: JSON.stringify(cur) === JSON.stringify(next) ? 0 : 1, removed: 0 };
  const a = idMap(cur), b = idMap(next); let added = 0, changed = 0, removed = 0;
  b.forEach((r, id) => { const o = a.get(id); if (!o) added++; else if (JSON.stringify(o) !== JSON.stringify(r)) changed++; });
  a.forEach((r, id) => { if (!b.has(id)) removed++; });
  return { added, changed, removed };
}
// For the app: which lists this login can see and how it may change them.
function permsFor(who) {
  if (isFull(who)) return { "*": "rw" };
  const out = {};
  Object.keys(POLICY).forEach((k) => { const r = ruleFor(who, k); if (r) out[k] = r; });
  return out;
}

// The store's display name, from the shared outlet list (store logins can't read that list).
async function outletNameOf(env, id) {
  if (id === "*") return "All stores";
  try {
    const cur = await readOne(env, "_global", "outlets_v1");
    const o = Array.isArray(cur.value) ? cur.value.find((x) => x && x.id === id) : null;
    if (o) return o.name;
  } catch (e) { /* fall through */ }
  return id === "rimjhim" ? "Rimjhim Cafe" : id;
}
// Store logins only reach their own store's data.
// A partner login can be for every store ("*"); the store list itself stays read-only for it.
function canUseOutlet(who, outlet) {
  return who.role === "owner" || outlet === who.outlet || (who.outlet === "*" && (outlet !== "_global" || who.access === "partner"));
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
  const exp = sessionExpiry(Date.now()), gen = await sessionGen(env);
  if (!login || login === "owner" || login === "admin") {
    if (safeEqual(await hmacHex("pin-check", password), await hmacHex("pin-check", env.APP_PIN))) {
      token = await ownerToken(env, exp, gen); who = { role: "owner", exp, access: "owner", perms: { "*": "rw" } };
    }
  } else {
    const row = await env.DB.prepare("SELECT login, outlet, name, salt, hash, ver, access FROM users WHERE login = ?").bind(login).first();
    // Hash even when the login doesn't exist, so timing doesn't reveal valid IDs.
    const h = await hashPassword(password, row ? row.salt : "00000000000000000000000000000000");
    if (row && safeEqual(h, row.hash)) {
      token = await storeToken(env, row.login, row.ver, exp, gen);
      who = { role: "store", outlet: row.outlet, login: row.login, name: row.name, access: row.access || "full", exp, outletName: await outletNameOf(env, row.outlet) };
      who.perms = permsFor(who);
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
  return json(Object.assign({ ok: true }, who), 200, { "Set-Cookie": sessionCookie(req, token, exp) });
}

// ---- store logins (owner only) ----
async function handleUsers(req, env, path) {
  if (req.method === "GET" && path === "/api/users") {
    const rows = await env.DB.prepare("SELECT login, outlet, name, access, created_at FROM users ORDER BY outlet, login").all();
    return json({ users: rows.results });
  }
  if (req.method === "POST" && path === "/api/users") {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const login = cleanLogin(body.login), outlet = String(body.outlet || "").trim(), name = String(body.name || "").trim().slice(0, 60);
    const password = body.password === undefined || body.password === null ? "" : String(body.password);
    const access = ACCESS_LEVELS.indexOf(body.access) >= 0 ? body.access : null;
    if (!validLogin(login)) return json({ error: "Login ID: 3-32 letters, numbers, dot, dash or underscore (not 'owner' or 'admin')." }, 400);
    if (!(/^[a-z0-9_-]{1,40}$/i.test(outlet) || outlet === "*") || outlet === "_global") return json({ error: "Pick a store." }, 400);
    if (outlet === "*" && access !== "partner") return json({ error: "Only a partner login can be for all stores." }, 400);
    const cur = await env.DB.prepare("SELECT login, access FROM users WHERE login = ?").bind(login).first();
    if (!cur && password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    if (password && password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    if (!cur) {
      const salt = newSalt();
      await env.DB.prepare("INSERT INTO users (login, outlet, name, salt, hash, ver, created_at, access) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(login, outlet, name, salt, await hashPassword(password, salt), Date.now(), access || "manager").run();
    } else if (password) {
      const salt = newSalt();
      await env.DB.prepare("UPDATE users SET outlet = ?, name = ?, salt = ?, hash = ?, ver = ver + 1 WHERE login = ?")
        .bind(outlet, name, salt, await hashPassword(password, salt), login).run();
    } else {
      // Moving a login to another store signs it out; a rename alone doesn't.
      await env.DB.prepare("UPDATE users SET name = ?, ver = CASE WHEN outlet = ? THEN ver ELSE ver + 1 END, outlet = ? WHERE login = ?")
        .bind(name, outlet, outlet, login).run();
    }
    // A new role signs that login out, so it starts again with the new access.
    if (cur && access && access !== (cur.access || "full")) {
      await env.DB.prepare("UPDATE users SET access = ?, ver = ver + 1 WHERE login = ?").bind(access, login).run();
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

async function handleLogoutAll(env) {
  const gen = String((parseInt(await sessionGen(env), 10) || 1) + 1);
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('session_gen', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(gen).run();
  return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
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
  const exp = who.exp || sessionExpiry(Date.now());
  const token = await storeToken(env, who.login, row.ver + 1, exp, await sessionGen(env));
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, token, exp) });
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
    const items = await readAll(env, outlet, since);
    if (!isFull(who)) {
      for (const k of Object.keys(items)) {
        const v = readView(ruleFor(who, k), items[k].value, who);
        if (v === undefined) delete items[k]; else items[k].value = v;
      }
    }
    return json({ items, serverTime });
  }

  const m = path.match(/^\/api\/data\/([^/]+)$/);
  if (m && req.method === "PUT") {
    const key = m[1];
    if (!validKey(key)) return json({ error: "bad key" }, 400);
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : 0;
    const sent = body.value === undefined ? null : body.value;
    const rule = ruleFor(who, key);
    if (!rule || rule === "r" || rule === "staffpub" || rule === "settingspub" || rule === "cashbill") return json({ error: "This login can't change this.", readOnly: true }, 403);
    if (outlet === "_global" && who.role !== "owner") return json({ error: "Only the owner can change the store list.", readOnly: true }, 403);
    const cur = await readOne(env, outlet, key);
    if (cur.rev !== baseRev) return json({ conflict: true, rev: cur.rev, value: isFull(who) ? cur.value : readView(rule, cur.value, who) }, 409);
    let value = sent;
    if (key === "pos_v1") {
      const pw = await poWrite(env, outlet, cur.value, sent, who);
      if (pw.error) return json({ error: pw.error, readOnly: true }, 403);
      value = pw.value;
    } else if (!isFull(who)) {
      const mw = mergeWrite(rule, cur.value, sent, who);
      if (mw.error) return json({ error: mw.error, readOnly: true }, 403);
      value = mw.value;
    }
    const r = await writeOne(env, outlet, key, value, baseRev);
    if (r.tooBig) return json({ error: "too big" }, 413);
    if (r.conflict) {
      const now = await readOne(env, outlet, key);
      return json({ conflict: true, rev: now.rev, value: isFull(who) ? now.value : readView(rule, now.value, who) }, 409);
    }
    // Who changed what, for the owner's activity log (owner PIN saves are logged without counts).
    try {
      const d = who.role === "owner" ? { added: -1, changed: -1, removed: -1 } : diffCounts(cur.value, value);
      if (d.added || d.changed || d.removed) {
        await env.DB.prepare("INSERT INTO audit (ts, outlet, key, who, access, added, changed, removed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(Date.now(), outlet, key, who.role === "owner" ? "owner" : who.login, accessOf(who), d.added, d.changed, d.removed).run();
      }
    } catch (e) { /* the log never blocks a save */ }
    return isFull(who) ? json({ rev: r.rev }) : json({ rev: r.rev, value: readView(rule, value, who) });
  }
  return json({ error: "not found" }, 404);
}

async function handleExport(env, url, who) {
  const outlet = outletOf(url);
  if (!outlet) return json({ error: "bad outlet" }, 400);
  if (!canUseOutlet(who, outlet) || !isFull(who)) return json({ error: "not allowed" }, 403);
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

async function handlePhotoGet(env, id, who) {
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT outlet, mime, data FROM photos WHERE id = ?").bind(id).first();
  // A store login only sees its own store's bill photos.
  if (!row || !canUseOutlet(who, row.outlet)) return new Response("Not found", { status: 404 });
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

// ---- daily backups ----
// Once a day every store's data is copied into the backups table and kept for 14 days,
// so a bad day (a wrong delete, a lost phone syncing old data) can be undone.
const BACKUP_DAYS = 14;
async function dailyBackup(env) {
  await ensureSchema(env);
  const day = istDay(0);
  const outs = await env.DB.prepare("SELECT DISTINCT outlet FROM kv").all();
  for (const r of outs.results) {
    const items = await readAll(env, r.outlet, -1);
    const data = { backupDay: day, outlet: r.outlet };
    for (const k of Object.keys(items)) data[k] = items[k].value;
    const text = JSON.stringify(data);
    const stmts = [env.DB.prepare("DELETE FROM backups WHERE outlet = ? AND day = ?").bind(r.outlet, day)];
    for (let i = 0, idx = 0; i < text.length; i += CHUNK_CHARS, idx++) {
      stmts.push(env.DB.prepare("INSERT INTO backups (outlet, day, idx, data) VALUES (?, ?, ?, ?)").bind(r.outlet, day, idx, text.slice(i, i + CHUNK_CHARS)));
    }
    await env.DB.batch(stmts);
  }
  await env.DB.prepare("DELETE FROM backups WHERE day < ?").bind(istDay(-BACKUP_DAYS)).run();
  await env.DB.prepare("DELETE FROM audit WHERE ts < ?").bind(Date.now() - 180 * 86400000).run();
}
async function handleBackups(req, env, url, path, who) {
  const outlet = outletOf(url);
  if (!outlet || !canUseOutlet(who, outlet) || !isFull(who) || accessOf(who) === "full") return json({ error: "Only the owner or a partner can open server backups." }, 403);
  if (path === "/api/backups") {
    if (req.method === "POST" && who.role === "owner") { await dailyBackup(env); }
    const rows = await env.DB.prepare("SELECT day, SUM(LENGTH(data)) AS size FROM backups WHERE outlet = ? GROUP BY day ORDER BY day DESC").bind(outlet).all();
    return json({ backups: rows.results });
  }
  const m = path.match(/^\/api\/backups\/(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const rows = await env.DB.prepare("SELECT data FROM backups WHERE outlet = ? AND day = ? ORDER BY idx").bind(outlet, m[1]).all();
    if (!rows.results.length) return json({ error: "No backup for that day." }, 404);
    return new Response(rows.results.map((x) => x.data).join(""), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${outlet}_backup_${m[1]}.json"` } });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dailyBackup(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);

    if (!env.APP_PIN) {
      return json({ error: "The server has no APP_PIN set. Run: npx wrangler secret put APP_PIN" }, 500);
    }
    // The old PIN-header import route reads everything from any website, so it is off
    // unless the server is deliberately configured with ALLOW_LEGACY_PUSH = "1".
    const legacy = env.ALLOW_LEGACY_PUSH === "1" && path === "/api/data" && (req.headers.has("x-api-key") || req.method === "OPTIONS");
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
      if (path === "/api/backups" || path.startsWith("/api/backups/")) return await handleBackups(req, env, url, path, who);
      if (path === "/api/audit" && req.method === "GET") {
        if (!isFull(who) || accessOf(who) === "full") return json({ error: "Only the owner or a partner can see the activity log." }, 403);
        const o = outletOf(url);
        if (!o || !canUseOutlet(who, o)) return json({ error: "not allowed" }, 403);
        const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));
        const rows = await env.DB.prepare("SELECT ts, key, who, access, added, changed, removed FROM audit WHERE outlet = ? ORDER BY ts DESC LIMIT ?").bind(o, lim).all();
        return json({ entries: rows.results });
      }
      if (path === "/api/session") {
        if (who) { who.access = accessOf(who); who.perms = permsFor(who); }
        if (who && who.role === "store") who.outletName = await outletNameOf(env, who.outlet);
        return json(Object.assign({ ok: !!who, ai: aiAvailable(env) }, who || {}), who ? 200 : 401);
      }
      if (!who) return json({ error: "login required" }, 401);

      if (path === "/api/data" || path.startsWith("/api/data/")) return await handleData(req, env, url, path, who);
      if (path === "/api/export" && req.method === "GET") return await handleExport(env, url, who);
      if (path === "/api/photos" && req.method === "POST") return await handlePhotoUpload(req, env, url, who);
      if (path === "/api/logout-all" && req.method === "POST") {
        if (who.role !== "owner") return json({ error: "Only the owner can sign out every phone." }, 403);
        return await handleLogoutAll(env);
      }
      if (path === "/api/password" && req.method === "POST") {
        if (who.role !== "store") return json({ error: "The owner PIN is changed with the APP_PIN secret." }, 400);
        return await handleOwnPassword(req, env, who);
      }
      if (path === "/api/users" || path.startsWith("/api/users/")) {
        if (who.role !== "owner") return json({ error: "Only the owner can manage logins." }, 403);
        return await handleUsers(req, env, path);
      }
      if (path.startsWith("/api/photos/") && req.method === "GET") return await handlePhotoGet(env, path.slice(12), who);
      if (path === "/api/ai" && req.method === "POST") return await handleAi(req, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error", detail: String(e && e.message || e) }, 500);
    }
  }
};
