#!/usr/bin/env node
/* Mock MT5 Web API for development and tests (plain HTTP, in memory).
   - the manager sign-in handshake (auth/start + auth/answer) with a fixed password; the session belongs to the TCP connection
   - users, accounts, deals and positions; new logins come from the login range (new accounts start at zero)
   - refuses: wrong password, calls without a session, logins outside the range; it has no balance or trade endpoint
   - POST /_set (JSON) changes the state for tests: { users, accounts, deals, positions, manager: [{ login, amount, comment }],
     fail: { path, mode: "timeout"|"error"|"drop", times }, reset }. "manager" is operations crediting or debiting in MT5 Manager
     (outside our system): the balance changes and a balance deal with that comment appears.
     GET /_state returns it; POST /_drop closes every connection (the client must sign in again)
   Run alone:  node tools/mt5-mock.js [--port 8444] [--seed]   → prints the .env lines to use it */
"use strict";
const http = require("http");
const crypto = require("crypto");

const md5 = b => crypto.createHash("md5").update(b).digest();
const pwHash = pw => md5(Buffer.concat([md5(Buffer.from(String(pw), "utf16le")), Buffer.from("WebAPI", "ascii")]));

function startMock(o = {}) {
  const cfg = Object.assign({ port: 0, manager: "1000", password: "Mock-webapi-1", from: 7000000, to: 7099999, groups: ["real\\absel-global\\ecn", "real\\absel-global\\stp", "demo\\absel-global\\ecn"] }, o);
  const S = { users: new Map(), accounts: new Map(), deals: [], positions: [], next: cfg.from + 1000, nextDeal: 500000, fail: null, calls: [], auths: 0 };
  const inRange = l => Number(l) >= cfg.from && Number(l) <= cfg.to;
  const ok = (answer, extra) => Object.assign({ retcode: "0 Done" }, answer === undefined ? {} : { answer }, extra || {});
  const err = (rc, status = 200) => ({ status, body: { retcode: rc } });
  const accOf = login => S.accounts.get(String(login)) || { Login: Number(login), Balance: 0, Equity: 0, Margin: 0, MarginFree: 0, MarginLevel: 0, Profit: 0, Credit: 0 };
  const userOf = login => S.users.get(String(login));
  function putUser(u) {
    const login = String(u.Login); S.users.set(login, Object.assign({ Login: Number(login), Group: cfg.groups[0], Name: "", Email: "", Country: "", Leverage: 100, Registration: Math.floor(Date.now() / 1000) }, S.users.get(login) || {}, u, { Login: Number(login) }));
    const a = Object.assign(accOf(login), S.accounts.get(login) || {}); if (u.Balance != null) { a.Balance = Number(u.Balance); a.Equity = a.Equity || a.Balance; a.MarginFree = a.Equity - a.Margin; } S.accounts.set(login, a);
  }
  const loginsParam = p => String(p || "").split(",").map(s => s.trim()).filter(Boolean);
  const inGroup = (login, g) => { const u = userOf(login); return !!u && (u.Group === g || (g.endsWith("*") && u.Group.startsWith(g.slice(0, -1)))); };
  const selLogins = qs => qs.get("group") ? [...S.users.keys()].filter(l => inGroup(l, qs.get("group"))) : loginsParam(qs.get("login"));

  function route(method, path, qs, body, sess) {
    if (path === "/api/auth/start") {
      if (qs.get("type") !== "manager" || qs.get("login") !== String(cfg.manager)) return err("3006 Invalid account");
      sess.srv = crypto.randomBytes(16); sess.authed = false; return { body: ok(undefined, { version_access: "4000", srv_rand: sess.srv.toString("hex") }) };
    }
    if (path === "/api/auth/answer") {
      const ph = pwHash(cfg.password);
      if (!sess.srv || qs.get("srv_rand_answer") !== md5(Buffer.concat([ph, sess.srv])).toString("hex")) { sess.srv = null; return err("3006 Invalid password"); }
      const cli = Buffer.from(qs.get("cli_rand") || "", "hex"); sess.authed = true; sess.srv = null; S.auths++;
      return { body: ok(undefined, { cli_rand_answer: md5(Buffer.concat([ph, cli])).toString("hex"), version_trade: "4000" }) };
    }
    if (!sess.authed) return err("8 Not authorized", 403);
    if (path === "/api/test/access") return { body: ok() };
    const one = (login, fn) => { if (!inRange(login)) return err("8 Access denied (login outside the manager's range)"); const u = userOf(login); if (!u) return err("13 Not found"); return { body: ok(fn(u)) }; };
    if (path === "/api/user/get") return one(qs.get("login"), u => u);
    if (path === "/api/user/account/get") return one(qs.get("login"), u => accOf(u.Login));
    if (path === "/api/user/logins") return { body: ok([...S.users.keys()].filter(l => inGroup(l, qs.get("group") || ""))) };
    if (path === "/api/user/get_batch" || path === "/api/user/account/get_batch") {
      const ls = selLogins(qs); if (ls.some(l => !inRange(l))) return err("8 Access denied (login outside the manager's range)");
      return { body: ok(ls.filter(l => userOf(l)).map(l => path === "/api/user/get_batch" ? userOf(l) : accOf(l))) };
    }
    if (path === "/api/deal/get_batch") {
      const ls = new Set(selLogins(qs)), from = Number(qs.get("from")) || 0, to = Number(qs.get("to")) || 4e9;
      if (!qs.get("group") && [...ls].some(l => !inRange(l))) return err("8 Access denied (login outside the manager's range)");
      return { body: ok(S.deals.filter(d => ls.has(String(d.Login)) && d.Time >= from && d.Time <= to)) };
    }
    if (path === "/api/position/get_batch") { const ls = new Set(selLogins(qs)); return { body: ok(S.positions.filter(p => ls.has(String(p.Login)))) }; }
    if (path === "/api/group/get") { const g = qs.get("group"); return cfg.groups.includes(g) ? { body: ok({ Group: g, Currency: "USD", Leverage: 100 }) } : err("13 Not found"); }
    if (path === "/api/user/add" && method === "POST") {
      if (!body || !cfg.groups.includes(body.Group)) return err("3 Invalid parameters (unknown group)");
      if (!qs.get("pass_main") || !qs.get("pass_investor")) return err("3 Invalid parameters (passwords)");
      const login = body.Login && !S.ignoreLogin ? String(body.Login) : String(S.next++); // ignoreLogin: a server that picks the login itself
      if (!inRange(login)) return err("8 Access denied (login outside the manager's range)");
      if (userOf(login)) return err("3004 Login already exists");
      putUser(Object.assign({}, body, { Login: Number(login), Balance: 0 })); return { body: ok(userOf(login)) };
    }
    if (path === "/api/user/update" && method === "POST") {
      if (!body || !inRange(body.Login)) return err("8 Access denied (login outside the manager's range)"); if (!userOf(body.Login)) return err("13 Not found");
      if (body.Group && !cfg.groups.includes(body.Group)) return err("3 Invalid parameters (unknown group)");
      putUser(body); return { body: ok(userOf(body.Login)) };
    }
    return err("4 Not found", 404);
  }
  // Operations in MT5 Manager (not through the Web API): a balance operation with a comment
  function managerBalance({ login, amount, comment }) {
    const amt = Math.round(Number(amount) * 100) / 100, a = accOf(login);
    a.Balance = Math.round((a.Balance + amt) * 100) / 100; a.Equity = Math.round((a.Equity + amt) * 100) / 100; a.MarginFree = Math.round((a.Equity - a.Margin) * 100) / 100; S.accounts.set(String(login), a);
    const now = Date.now(), d = { Deal: S.nextDeal++, Login: Number(login), Time: Math.floor(now / 1000), TimeMsc: now, Action: 2, Entry: 0, Symbol: "", Volume: 0, VolumeExt: 0, Price: 0, Profit: amt, Commission: 0, Storage: 0, PositionID: 0, Comment: String(comment || "").slice(0, 31) };
    S.deals.push(d); return d;
  }

  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"), chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const reply = (status, body) => { if (!res.headersSent) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); } };
      let body = null; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null; } catch (e) { return reply(400, { retcode: "3 Invalid JSON" }); }
      if (url.pathname === "/_state") return reply(200, { users: [...S.users.values()], accounts: [...S.accounts.values()], deals: S.deals, positions: S.positions, calls: S.calls.slice(-200), auths: S.auths });
      if (url.pathname === "/_drop") { reply(200, { ok: true }); setImmediate(() => sockets.forEach(s => s.destroy())); return; }
      if (url.pathname === "/_set") {
        const b = body || {};
        if (b.reset) { S.users.clear(); S.accounts.clear(); S.deals = []; S.positions = []; S.fail = null; S.calls = []; }
        (b.users || []).forEach(putUser);
        (b.accounts || []).forEach(a => S.accounts.set(String(a.Login), Object.assign(accOf(a.Login), a)));
        (b.deals || []).forEach(d => { const i = S.deals.findIndex(x => x.Deal === d.Deal); if (i >= 0) S.deals[i] = d; else S.deals.push(d); });
        if (b.remove_deals) S.deals = S.deals.filter(d => !b.remove_deals.includes(d.Deal));
        if (b.positions) S.positions = b.positions;
        if (b.fail !== undefined) S.fail = b.fail;
        const made = (b.manager || []).map(managerBalance);
        return reply(200, { ok: true, deals: made.map(d => String(d.Deal)) });
      }
      const sess = req.socket.__mt5 || (req.socket.__mt5 = {});
      S.calls.push({ path: url.pathname, query: Object.fromEntries([...url.searchParams].filter(([k]) => !/pass|rand/.test(k))), at: Date.now() });
      if (S.fail && url.pathname === S.fail.path && (S.fail.times == null || S.fail.times > 0)) {
        if (S.fail.times != null) S.fail.times--;
        const mode = S.fail.mode;
        if (mode === "error") return reply(200, { retcode: S.fail.retcode || "10 Server busy" });
        const r = route(req.method, url.pathname, url.searchParams, body, sess);  // the operation happens, but the answer never arrives
        if (mode === "drop") { req.socket.destroy(); return; }
        return; // timeout: never answer
      }
      const r = route(req.method, url.pathname, url.searchParams, body, sess);
      reply(r.status || 200, r.body);
    });
  });
  server.on("connection", s => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  return new Promise(resolve => server.listen(cfg.port, "127.0.0.1", () => {
    const port = server.address().port;
    resolve({ port, url: "http://127.0.0.1:" + port, cfg, state: S, putUser,
      env: { MT5_MODE: "api", MT5_SERVER: "http://127.0.0.1:" + port, MT5_MANAGER_LOGIN: String(cfg.manager), MT5_WEBAPI_PASSWORD: cfg.password, MT5_LOGIN_FROM: String(cfg.from), MT5_LOGIN_TO: String(cfg.to) },
      close: () => new Promise(r => { sockets.forEach(s => s.destroy()); server.close(() => r()); }) });
  }));
}

module.exports = { startMock, pwHash };

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  startMock({ port: Number(arg("--port")) || 8444 }).then(m => {
    if (process.argv.includes("--seed")) {
      const now = Math.floor(Date.now() / 1000);
      m.putUser({ Login: m.cfg.from + 1, Group: m.cfg.groups[0], Name: "Test Account", Balance: 1000, Leverage: 100 });
      m.putUser({ Login: m.cfg.from + 2, Group: m.cfg.groups[1], Name: "Unlinked Trader", Balance: 250, Leverage: 200 });
      m.state.deals.push({ Deal: 400001, Login: m.cfg.from + 1, Time: now - 3600, TimeMsc: (now - 3600) * 1000, Action: 0, Entry: 0, Symbol: "EURUSD", Volume: 10000, VolumeExt: 100000000, Price: 1.08, Profit: 0, Commission: -7, Storage: 0, PositionID: 900001, Comment: "" },
        { Deal: 400002, Login: m.cfg.from + 1, Time: now - 1800, TimeMsc: (now - 1800) * 1000, Action: 1, Entry: 1, Symbol: "EURUSD", Volume: 10000, VolumeExt: 100000000, Price: 1.081, Profit: 10, Commission: -7, Storage: 0, PositionID: 900001, Comment: "" });
    }
    console.log(`Mock MT5 Web API on ${m.url} · range ${m.cfg.from}–${m.cfg.to} · groups ${m.cfg.groups.join(", ")}\nPut these in .env to use it:`);
    Object.entries(m.env).forEach(([k, v]) => console.log(`${k}=${v}`)); console.log(`MT5_TEST_LOGIN=${m.cfg.from + 1}`);
  });
}
