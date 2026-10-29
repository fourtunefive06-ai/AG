/* MT5 Web API (MetaQuotes) for the Absel Global manager account at Absel Markets.
   - session: GET /api/auth/start → srv_rand, answer with MD5(password_hash + srv_rand), check the server's answer to our cli_rand
     password_hash = MD5( MD5(password as UTF-16LE) + "WebAPI" )
   - the session belongs to the TCP connection: one keep-alive socket, calls sent one at a time, ping while idle,
     sign in again when the socket closes or MT5 says "not authorized"
   - every call that touches an account checks the login is inside MT5_LOGIN_FROM–MT5_LOGIN_TO (refused and alerted otherwise)
   - NO MONEY MOVES IN MT5 FROM OUR SYSTEM. Only the commands in ALLOWED can reach the network: reads, account creation and
     non-money account details. Balance, credit, bonus, trade, order and position commands are refused before any request.
     Operations does every credit and debit in MT5 Manager; our sync reads those balance deals and matches them.
   - every call is reported to the call log (setLog): command, parameters without secrets, retcode
   Endpoint and field names follow the MetaQuotes Web API documentation; confirm them against the server's build
   (MT5_BUILD) before going live. Settings come from .env; nothing here is stored in the database. Passwords are never logged. */
"use strict";
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const env = k => (process.env[k] || "").trim();
function cfg() {
  const raw = env("MT5_SERVER"), plain = /^http:\/\//i.test(raw), hp = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const m = hp.match(/^(.*?)(?::(\d+))?$/) || [];
  return {
    mode: env("MT5_MODE") === "api" ? "api" : "manual", plain, host: m[1] || "", port: Number(m[2]) || (plain ? 80 : 443),
    login: env("MT5_MANAGER_LOGIN"), password: process.env.MT5_WEBAPI_PASSWORD || "", agent: env("MT5_AGENT") || "AbselGlobal", build: env("MT5_BUILD") || "4000",
    from: Number(env("MT5_LOGIN_FROM")) || 0, to: Number(env("MT5_LOGIN_TO")) || 0, testLogin: env("MT5_TEST_LOGIN"),
    syncSeconds: Math.max(30, Number(env("MT5_SYNC_SECONDS")) || 120), insecure: env("MT5_TLS_INSECURE") === "1",
    tzMin: Number(env("MT5_TIME_OFFSET_MIN")) || 0, timeoutMs: Number(env("MT5_TIMEOUT_MS")) || 20000,
  };
}
const configured = () => { const c = cfg(); return !!(c.host && c.login && c.password); };

// Errors carry the MT5 code: retcode (number), plus flags the caller uses (timeout = result unknown, range = refused by the lock)
function mtError(msg, extra) { return Object.assign(new Error(msg), extra || {}); }
const md5 = b => crypto.createHash("md5").update(b).digest();
const passwordHash = pw => md5(Buffer.concat([md5(Buffer.from(String(pw), "utf16le")), Buffer.from("WebAPI", "ascii")]));

/* ---------- login range lock ---------- */
let onAlert = () => {};
function inRange(login) { const c = cfg(), n = Number(login); return !!(c.from && c.to && Number.isInteger(n) && n >= c.from && n <= c.to); }
function lock(login, what) {
  if (inRange(login)) return String(Number(login));
  const c = cfg(), msg = `MT5 ${what} refused: login ${String(login).slice(0, 20)} is outside the Absel Global range ${c.from || "?"}–${c.to || "?"}`;
  console.error("✖ " + msg); try { onAlert(msg); } catch (e) {}
  throw mtError(msg, { range: true });
}

/* ---------- allow-list: the only MT5 commands our system may send ---------- */
const ALLOWED = new Set(["auth/start", "auth/answer", "test/access", "user/get", "user/get_batch", "user/add", "user/update", "user/account/get", "user/account/get_batch", "user/logins", "deal/get_batch", "position/get_batch", "group/get"]);
// Fields an account may be created or edited with. Nothing that holds money (Balance, Credit) and no group move.
const USER_ADD_FIELDS = new Set(["Login", "Group", "Name", "Email", "Phone", "Country", "City", "Comment", "Leverage"]);
const USER_UPDATE_FIELDS = new Set(["Login", "Name", "Email", "Phone", "Country", "Comment", "Leverage"]);
const commandOf = path => String(path || "").replace(/^\/api\//, "").split("?")[0].replace(/\/+$/, "");
function guard(path, body) {
  const cmd = commandOf(path), refuse = why => { const msg = `MT5 command ${cmd || path} refused: ${why}`; console.error("✖ " + msg); try { onAlert(msg); } catch (e) {} logCall({ command: cmd, params: {}, refused: true, error: msg }); throw mtError(msg, { refused: true }); };
  if (!ALLOWED.has(cmd)) refuse("our system never moves money or trades in MT5 (only reads, account creation and account details are allowed)");
  const allowed = cmd === "user/add" ? USER_ADD_FIELDS : cmd === "user/update" ? USER_UPDATE_FIELDS : null;
  if (body != null && !allowed) refuse("this command takes no body");
  if (allowed) { const bad = Object.keys(body || {}).filter(k => !allowed.has(k)); if (bad.length) refuse("field " + bad.join(", ") + " can't be set from our system"); }
  return cmd;
}

/* ---------- call log: command, parameters without secrets, retcode ---------- */
let onCall = () => {};
const SECRET = /pass|rand|answer|token|secret/i;
const paramsOf = (path, body) => {
  const out = {}; new URLSearchParams(String(path).split("?")[1] || "").forEach((v, k) => { out[k] = SECRET.test(k) ? "***" : v.slice(0, 200); });
  if (body) Object.keys(body).forEach(k => { out[k] = SECRET.test(k) ? "***" : String(body[k]).slice(0, 120); });
  return out;
};
function logCall(c) { try { onCall(Object.assign({ at: new Date().toISOString() }, c)); } catch (e) {} }

/* ---------- one connection, one call at a time ---------- */
let agent = null, agentKey = "", socket = null, authed = false, chain = Promise.resolve(), lastCall = 0;
const state = { connected: false, last_ok_at: null, last_error: null, last_error_at: null, auth_at: null };
function getAgent(c) {
  const key = [c.plain, c.host, c.port, c.insecure].join("|");
  if (agent && agentKey === key) return agent;
  if (agent) agent.destroy();
  if (c.insecure && !c.plain) console.warn("⚠ MT5_TLS_INSECURE=1: the MT5 server's certificate is NOT checked. Use only for a self-signed test server.");
  agentKey = key; authed = false; socket = null;
  agent = new (c.plain ? http : https).Agent({ keepAlive: true, maxSockets: 1, keepAliveMsecs: 30000, rejectUnauthorized: !c.insecure });
  return agent;
}
function raw(c, method, path, body) {
  const cmd = guard(path, body), params = paramsOf(path, body), t0 = Date.now(); // refused here, before any network call
  return send0(c, method, path, body).then(r => { logCall({ command: cmd, params, retcode: r.json && r.json.retcode != null ? String(r.json.retcode) : "HTTP " + r.status, ms: Date.now() - t0 }); return r; },
    e => { logCall({ command: cmd, params, error: e.message, ms: Date.now() - t0 }); throw e; });
}
function send0(c, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = (c.plain ? http : https).request({ host: c.host, port: c.port, method, path, agent: getAgent(c), headers: Object.assign({ Accept: "application/json", Connection: "keep-alive" }, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}) }, res => {
      const chunks = []; res.on("data", d => chunks.push(d));
      res.on("end", () => { const txt = Buffer.concat(chunks).toString("utf8"); let j = null; try { j = JSON.parse(txt); } catch (e) {} resolve({ status: res.statusCode, json: j, text: txt }); });
      res.on("error", reject);
    });
    req.on("socket", s => { if (s !== socket) { if (socket) authed = false; socket = s; s.once("close", () => { if (socket === s) { socket = null; authed = false; state.connected = false; } }); } });
    req.setTimeout(c.timeoutMs, () => req.destroy(mtError(`MT5 didn't answer within ${Math.round(c.timeoutMs / 1000)}s`, { timeout: true })));
    req.on("error", e => reject(e.timeout ? e : mtError(netMsg(e, c), { network: true, code: e.code })));
    if (data) req.write(data); req.end();
  });
}
const netMsg = (e, c) => ({ ENOTFOUND: `MT5 server ${c.host} not found (check MT5_SERVER)`, ECONNREFUSED: `MT5 server refused the connection on port ${c.port} (wrong port, or the Web API is off)`, ECONNRESET: "MT5 closed the connection (our IP may not be whitelisted)", ETIMEDOUT: `No answer from ${c.host}:${c.port} (firewall or IP not whitelisted)`, EHOSTUNREACH: `Can't reach ${c.host}` }[e.code] || (/certificate|self.signed|CERT/i.test(e.message) ? "The MT5 server's TLS certificate isn't trusted (" + e.message + ")" : "MT5 connection failed: " + e.message));
// Session lost (socket changed, server restarted): HTTP 401/403 or a "not authorized" retcode. Not "access denied" (that's a rights problem).
const NOT_AUTH = r => r.status === 401 || r.status === 403 || /not.?authori[sz]ed|no session|session (expired|not found)/i.test(String(r.json && r.json.retcode || ""));
function check(r, what) {
  if (!r.json) throw mtError(`MT5 ${what}: unexpected answer (HTTP ${r.status})`, { status: r.status });
  const rc = String(r.json.retcode == null ? "" : r.json.retcode);
  if (!/^0(\s|$)/.test(rc)) throw mtError(`MT5 ${what}: ${rc || "HTTP " + r.status}`, { retcode: parseInt(rc, 10), status: r.status });
  return r.json;
}
async function auth(c) {
  if (!c.host || !c.login || !c.password) throw mtError("MT5 is not configured (set MT5_SERVER, MT5_MANAGER_LOGIN and MT5_WEBAPI_PASSWORD in .env)", { notConfigured: true });
  authed = false;
  const s = check(await raw(c, "GET", `/api/auth/start?version=${encodeURIComponent(c.build)}&agent=${encodeURIComponent(c.agent)}&login=${encodeURIComponent(c.login)}&type=manager`), "sign-in");
  if (!/^[0-9a-f]+$/i.test(s.srv_rand || "")) throw mtError("MT5 sign-in: no srv_rand in the answer");
  const ph = passwordHash(c.password), cliRand = crypto.randomBytes(16);
  const answer = md5(Buffer.concat([ph, Buffer.from(s.srv_rand, "hex")])).toString("hex");
  const a = check(await raw(c, "GET", `/api/auth/answer?srv_rand_answer=${answer}&cli_rand=${cliRand.toString("hex")}`), "sign-in (wrong manager login or Web API password?)");
  const want = md5(Buffer.concat([ph, cliRand])).toString("hex");
  if (String(a.cli_rand_answer || "").toLowerCase() !== want) throw mtError("MT5 sign-in: the server's answer doesn't match. This is not the MT5 server we expect (or the password is wrong).", { auth: true });
  authed = true; state.connected = true; state.auth_at = new Date().toISOString();
}
// Queue: the next call starts when the previous one has finished
function send(method, path, body, what) {
  const run = async () => {
    const c = cfg();
    try {
      if (!authed || !socket) await auth(c);
      let r = await raw(c, method, path, body);
      if (NOT_AUTH(r)) { await auth(c); r = await raw(c, method, path, body); }
      const j = check(r, what); lastCall = Date.now(); state.last_ok_at = new Date().toISOString(); state.last_error = null; return j;
    } catch (e) { state.last_error = e.message; state.last_error_at = new Date().toISOString(); if (e.network || e.timeout) { authed = false; state.connected = false; } throw e; }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
const q = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
let pinger = null;
function keepAlive() {
  if (pinger) return; pinger = setInterval(() => { if (authed && Date.now() - lastCall > 60000) ping().catch(() => {}); }, 15000); if (pinger.unref) pinger.unref();
}

/* ---------- conversions ---------- */
// MT5 volume: Volume is in 1/10000 lot, VolumeExt (newer builds) in 1/100000000 lot
function toLots(d) { const ext = Number(d.VolumeExt ?? d.volume_ext), v = Number(d.Volume ?? d.volume); const lots = ext > 0 ? ext / 1e8 : v > 0 ? v / 1e4 : 0; return Math.round(lots * 10000) / 10000; }
// MT5 times are in the trade server's time zone; MT5_TIME_OFFSET_MIN = server time minus UTC
const toIso = (sec, msc) => { const ms = Number(msc) > 0 ? Number(msc) : Number(sec) * 1000; return ms > 0 ? new Date(ms - cfg().tzMin * 60000).toISOString() : null; };
const toSrv = iso => Math.floor((Date.parse(iso) + cfg().tzMin * 60000) / 1000);
const n = v => (v === undefined || v === null || v === "" ? null : Number(v));
const normUser = u => ({ login: String(u.Login), group: String(u.Group || ""), name: String(u.Name || [u.FirstName, u.LastName].filter(Boolean).join(" ")), email: String(u.Email || ""), country: String(u.Country || ""), comment: String(u.Comment || ""), leverage: n(u.Leverage), registered_at: toIso(u.Registration), balance: n(u.Balance), credit: n(u.Credit) });
const normAccount = a => ({ login: String(a.Login), balance: n(a.Balance), equity: n(a.Equity), margin: n(a.Margin), margin_free: n(a.MarginFree), margin_level: n(a.MarginLevel), profit: n(a.Profit), credit: n(a.Credit) });
const normDeal = d => ({ ticket: String(d.Deal), login: String(d.Login), time: toIso(d.Time, d.TimeMsc), action: Number(d.Action), entry: Number(d.Entry), symbol: String(d.Symbol || ""), lots: toLots(d), price: n(d.Price), profit: n(d.Profit) || 0, commission: n(d.Commission) || 0, swap: n(d.Storage) || 0, position_id: d.PositionID != null ? String(d.PositionID) : "", comment: String(d.Comment || "") });
const normPosition = p => ({ position_id: String(p.Position), login: String(p.Login), symbol: String(p.Symbol || ""), action: Number(p.Action), lots: toLots(p), price_open: n(p.PriceOpen), price_current: n(p.PriceCurrent), profit: n(p.Profit) || 0, swap: n(p.Storage) || 0, opened_at: toIso(p.TimeCreate, p.TimeCreateMsc) });
const list = j => (Array.isArray(j.answer) ? j.answer : j.answer ? [j.answer] : []);
const chunk = (a, k) => { const out = []; for (let i = 0; i < a.length; i += k) out.push(a.slice(i, i + k)); return out; };

/* ---------- commands ---------- */
async function ping() { await send("GET", "/api/test/access", null, "ping"); return true; }
async function getUser(login) { return normUser((await send("GET", "/api/user/get?" + q({ login: lock(login, "read user") }), null, "read user")).answer || {}); }
async function getAccount(login) { return normAccount((await send("GET", "/api/user/account/get?" + q({ login: lock(login, "read account") }), null, "read account")).answer || {}); }
// Logins in a group. Logins outside our range are left out (never touched).
async function listLogins(group) { const j = await send("GET", "/api/user/logins?" + q({ group }), null, "list logins"); const all = list(j).map(String); return { logins: all.filter(inRange), outside: all.filter(x => !inRange(x)).length }; }
async function getUsersBatch(logins) { const out = []; for (const part of chunk(logins.map(l => lock(l, "read users")), 100)) out.push(...list(await send("GET", "/api/user/get_batch?" + q({ login: part.join(",") }), null, "read users")).map(normUser)); return out; }
async function getAccountsBatch(logins) { const out = []; for (const part of chunk(logins.map(l => lock(l, "read accounts")), 100)) out.push(...list(await send("GET", "/api/user/account/get_batch?" + q({ login: part.join(",") }), null, "read accounts")).map(normAccount)); return out; }
async function dealsBatch({ group, logins, from, to }) {
  const base = { from: toSrv(from), to: toSrv(to) }, out = [];
  if (group) out.push(...list(await send("GET", "/api/deal/get_batch?" + q(Object.assign({ group }, base)), null, "read deals")));
  else for (const part of chunk((logins || []).map(l => lock(l, "read deals")), 100)) out.push(...list(await send("GET", "/api/deal/get_batch?" + q(Object.assign({ login: part.join(",") }, base)), null, "read deals")));
  return out.map(normDeal).filter(d => inRange(d.login));
}
async function positionsBatch({ group, logins }) {
  const out = [];
  if (group) out.push(...list(await send("GET", "/api/position/get_batch?" + q({ group }), null, "read positions")));
  else for (const part of chunk((logins || []).map(l => lock(l, "read positions")), 100)) out.push(...list(await send("GET", "/api/position/get_batch?" + q({ login: part.join(",") }), null, "read positions")));
  return out.map(normPosition).filter(p => inRange(p.login));
}
async function getGroup(name) { const a = (await send("GET", "/api/group/get?" + q({ group: name }), null, "read group")).answer || {}; return { group: String(a.Group || name), currency: String(a.Currency || ""), leverage: n(a.Leverage) }; }

// Account creation (only with MT5 account creation switched on). group must come from our settings, never from user input.
// The new account starts with a zero balance: our system never funds it. Login 0 = MT5 assigns the next login of the manager's
// series. comment ("ABSEL <request id>") lets us find the account again if MT5 created it but the answer was lost.
async function createUser({ group, name, leverage, email, country, city, phone, comment, passMain, passInvestor, login }) {
  if (!group) throw mtError("MT5 create account: no MT5 group set for this account type (Client area settings)");
  if (login) lock(login, "create account");
  const body = { Login: login ? Number(login) : 0, Group: group, Name: String(name || "").slice(0, 128), Leverage: Number(leverage) || 100, Email: String(email || "").slice(0, 64), Country: String(country || "").slice(0, 32), City: String(city || "").slice(0, 32), Phone: String(phone || "").slice(0, 32), Comment: String(comment || "").slice(0, 64) };
  const j = await send("POST", "/api/user/add?" + q({ pass_main: passMain, pass_investor: passInvestor }), body, "create account");
  const u = normUser(j.answer || {});
  if (!inRange(u.login)) { const msg = `MT5 created login ${u.login} OUTSIDE the Absel Global range. Check the manager's login series at Absel Markets.`; console.error("✖ " + msg); try { onAlert(msg); } catch (e) {} throw mtError(msg, { range: true, created: u }); }
  return u;
}
// Non-money details only: name, email, phone, country, comment, leverage (checked against the type's list by the core).
// Anything else (balance, credit, group…) is refused before a request is sent.
const UPDATE_MAP = { name: ["Name", 128], email: ["Email", 64], phone: ["Phone", 32], country: ["Country", 32], comment: ["Comment", 64], leverage: ["Leverage"] };
async function updateUser(login, fields = {}) {
  const bad = Object.keys(fields).filter(k => !UPDATE_MAP[k]);
  if (bad.length) guard("/api/user/update", Object.fromEntries(bad.map(k => [k, fields[k]])));
  const body = { Login: Number(lock(login, "update account")) };
  Object.entries(fields).forEach(([k, v]) => { if (v == null) return; const [f, max] = UPDATE_MAP[k]; body[f] = max ? String(v).slice(0, max) : Number(v); });
  return normUser((await send("POST", "/api/user/update", body, "update account")).answer || {});
}

function status() {
  const c = cfg();
  return { mode: c.mode, configured: configured(), server: c.host ? c.host + ":" + c.port : "", manager: c.login || "", range: { from: c.from || null, to: c.to || null }, range_ok: !!(c.from && c.to && c.from <= c.to), test_login: c.testLogin || null, sync_seconds: c.syncSeconds, tls_insecure: c.insecure && !c.plain, build: c.build, time_offset_min: c.tzMin,
    connected: authed && state.connected, last_ok_at: state.last_ok_at, last_error: state.last_error, last_error_at: state.last_error_at };
}
function reset() { if (agent) agent.destroy(); agent = null; authed = false; socket = null; state.connected = false; }

module.exports = { cfg, configured, status, setAlert: fn => { onAlert = fn || (() => {}); }, setLog: fn => { onCall = fn || (() => {}); }, inRange, keepAlive, reset, toLots, passwordHash, ALLOWED, checkCommand: guard,
  ping, getUser, getAccount, listLogins, getUsersBatch, getAccountsBatch, dealsBatch, positionsBatch, getGroup, createUser, updateUser };
