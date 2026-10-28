#!/usr/bin/env node
/* Checks the MT5 Web API settings in .env step by step: server reachable, signed in, the test account, the groups, recent deals.
   Read-only: it never changes anything in MT5.
   Run on the server:  node tools/mt5-check.js                     (groups from Client area settings in the database)
                       node tools/mt5-check.js "real\absel-global\ecn" "real\absel-global\stp"   (check these groups instead) */
"use strict";
const fs = require("fs"), path = require("path"), net = require("net"), tls = require("tls");
const ROOT = path.join(__dirname, "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const mt5 = require("../lib/mt5.js");

const hint = (e, c) => {
  const m = e.message || "";
  if (e.range) return `The login is outside MT5_LOGIN_FROM–MT5_LOGIN_TO (${c.from}–${c.to}). Use a login from the Absel Global login series, or ask Absel Markets for the correct range.`;
  if (/ENOTFOUND|not found \(check MT5_SERVER\)/.test(m)) return "The server name in MT5_SERVER doesn't resolve. Check the address Absel Markets gave you (host:port, without https://).";
  if (/ECONNREFUSED|refused the connection/.test(m)) return `Nothing answers on port ${c.port}. Check the Web API port with Absel Markets (often 443) and that the Web API is switched on for this manager.`;
  if (/ETIMEDOUT|ECONNRESET|closed the connection|didn't answer|firewall|whitelist/i.test(m)) return "MT5 isn't answering this server. Most often our server's IP isn't whitelisted: send Absel Markets the server's public IP (run: curl ifconfig.me) and ask them to allow it for the Web API.";
  if (/certificate|TLS/i.test(m)) return "The MT5 server's TLS certificate isn't trusted. Ask Absel Markets for a valid certificate. Only for a test server: MT5_TLS_INSECURE=1.";
  if (/sign-in|password|Invalid account|doesn't match/i.test(m)) return "Sign-in refused. Check MT5_MANAGER_LOGIN and MT5_WEBAPI_PASSWORD. It's the \"Web API Pass\" from Absel Markets, not the MT5 Manager terminal password. MT5_BUILD may need to match the server build.";
  if (/Access denied|permission|rights/i.test(m)) return "The manager account doesn't have the rights for this (or the group/login isn't Absel Global's). Ask Absel Markets to check the manager's permissions and groups.";
  if (/Not found/i.test(m)) return "MT5 says it doesn't exist. Check the login or group name exactly as it is in MT5 (including back-slashes).";
  return "Send this message to your developer or Absel Markets.";
};
function reach(c) {
  return new Promise(resolve => {
    const s = c.plain ? net.connect(c.port, c.host) : tls.connect({ host: c.host, port: c.port, servername: c.host, rejectUnauthorized: !c.insecure });
    const done = r => { s.destroy(); resolve(r); };
    s.setTimeout(8000, () => done({ ok: false, error: Object.assign(new Error("ETIMEDOUT: no answer"), { code: "ETIMEDOUT" }) }));
    s.once(c.plain ? "connect" : "secureConnect", () => done({ ok: true, tls: c.plain ? null : s.getProtocol && s.getProtocol() }));
    s.once("error", e => done({ ok: false, error: e }));
  });
}
// MT5 groups from Client area settings (SQLite file or Postgres, whichever .env points to)
async function groupsFromDb() {
  try {
    let s = null;
    if ((process.env.DATABASE_URL || "").trim()) { const { neon } = require("../lib/pg.js"); const sch = (process.env.DATABASE_SCHEMA || "public").trim(); const r = await neon(process.env.DATABASE_URL.trim()).query(`SELECT data::text AS data FROM "${sch}".settings WHERE id = 'main'`); s = r[0] && JSON.parse(r[0].data); }
    else { const f = path.resolve(ROOT, process.env.DB_FILE || "db/crm.db"); if (!fs.existsSync(f)) return []; process.removeAllListeners("warning"); const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(f, { readOnly: true }); const r = db.prepare("SELECT data FROM settings WHERE id = 'main'").get(); s = r && JSON.parse(r.data); db.close(); }
    return [...new Set(((s && s.portal && s.portal.account_types) || []).flatMap(t => [t.mt5_group, t.mt5_demo_group]).filter(Boolean))];
  } catch (e) { console.log("! Couldn't read the groups from the database:", e.message); return []; }
}

(async () => {
  const c = mt5.cfg(), st = mt5.status();
  console.log("Mode:", c.mode === "api" ? "api" : "manual (MT5_MODE=manual: the app doesn't connect; this check still tests the settings)");
  console.log("Server:", st.server || "(MT5_SERVER empty)", "· manager login:", c.login || "(empty)", "· Web API password set:", !!c.password, "· build:", c.build, c.insecure ? "· TLS NOT CHECKED (MT5_TLS_INSECURE=1)" : "");
  console.log("Login range:", c.from && c.to ? `${c.from}–${c.to}` : "(MT5_LOGIN_FROM / MT5_LOGIN_TO empty)", "· test login:", c.testLogin || "(MT5_TEST_LOGIN empty)", "· server time offset:", c.tzMin, "min");
  if (!mt5.configured()) { console.error("✖ Add MT5_SERVER, MT5_MANAGER_LOGIN and MT5_WEBAPI_PASSWORD to .env"); process.exit(1); }
  if (!(c.from && c.to) || c.from > c.to) { console.error("✖ Add MT5_LOGIN_FROM and MT5_LOGIN_TO (the Absel Global login range, from ≤ to). Every account call is checked against it."); process.exit(1); }
  // 1. reachable
  const r = await reach(c);
  if (!r.ok) { console.error(`✖ Can't reach ${c.host}:${c.port}: ${r.error.code || r.error.message}\n  ${hint(Object.assign(new Error(r.error.code + " " + r.error.message), {}), c)}`); process.exit(1); }
  console.log(`✔ Server reachable${r.tls ? " (" + r.tls + ")" : ""}`);
  // 2. signed in
  try { await mt5.ping(); console.log("✔ Signed in as manager", c.login, "(the server proved it knows the password too)"); }
  catch (e) { console.error("✖", e.message, "\n ", hint(e, c)); process.exit(1); }
  // 3. the test account
  if (c.testLogin) {
    try {
      const u = await mt5.getUser(c.testLogin), a = await mt5.getAccount(c.testLogin);
      console.log(`✔ Test account ${u.login}: group ${u.group} · leverage 1:${u.leverage} · balance ${a.balance} · equity ${a.equity} · free margin ${a.margin_free}`);
    } catch (e) { console.error("✖ Reading test account", c.testLogin, "failed:", e.message, "\n ", hint(e, c)); }
  } else console.log("! Set MT5_TEST_LOGIN (the first test account) to check reading an account and its deals.");
  // 4. groups
  const groups = process.argv.slice(2).length ? process.argv.slice(2) : await groupsFromDb();
  if (!groups.length) console.log("! No MT5 groups yet. Set them per account type in Client area settings (or pass them: node tools/mt5-check.js \"real\\\\absel-global\\\\ecn\").");
  for (const g of groups) {
    try { const l = await mt5.listLogins(g); console.log(`✔ Group ${g}: ${l.logins.length} account(s) in our range${l.outside ? ` · ${l.outside} OUTSIDE the range (ignored; ask Absel Markets why)` : ""}`); }
    catch (e) { console.error(`✖ Group ${g}:`, e.message, "\n ", hint(e, c)); }
  }
  // 5. deals in the last 7 days
  if (c.testLogin) {
    try {
      const to = new Date(Date.now() + 864e5).toISOString(), from = new Date(Date.now() - 7 * 864e5).toISOString();
      const d = await mt5.dealsBatch({ logins: [c.testLogin], from, to });
      const trades = d.filter(x => x.action === 0 || x.action === 1), bal = d.filter(x => x.action === 2);
      console.log(`✔ Deals for ${c.testLogin}, last 7 days: ${d.length} (${trades.length} trades, ${bal.length} balance)`);
      d.slice(-5).forEach(x => console.log(`   #${x.ticket} ${x.time} ${["buy", "sell", "balance", "credit"][x.action] || "action " + x.action}${x.symbol ? " " + x.symbol + " " + x.lots + " lot" : ""} ${x.profit}${x.comment ? " · " + x.comment : ""}`));
      if (trades.length) console.log("  Check the lot sizes above against MT5 Manager (1 lot = Volume 10000). If they're 10× or 100× off, tell your developer.");
    } catch (e) { console.error("✖ Reading deals failed:", e.message, "\n ", hint(e, c)); }
  }
  mt5.reset();
})();
