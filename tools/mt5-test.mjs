// Integration test: lib/mt5.js + lib/mt5-sync.js + the core, against the mock MT5 Web API (tools/mt5-mock.js).
//   node tools/mt5-test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const require = createRequire(import.meta.url);
const { startMock } = require("./mt5-mock.js");

const mock = await startMock({ from: 7000000, to: 7099999 });
for (const k of Object.keys(process.env)) if (k.startsWith("MT5_")) delete process.env[k];
Object.assign(process.env, mock.env, { MT5_TIMEOUT_MS: "1500" });
const mt5 = require("../lib/mt5.js");
const { runSync } = require("../lib/mt5-sync.js");
const { createCRM, createMemoryStore } = require("../lib/core.js");
const alerts = []; mt5.setAlert(m => alerts.push(m));
const set = body => fetch(mock.url + "/_set", { method: "POST", body: JSON.stringify(body) }).then(r => r.json());
const G_ECN = "real\\absel-global\\ecn", G_STP = "real\\absel-global\\stp", G_DEMO = "demo\\absel-global\\ecn";
const now = Math.floor(Date.now() / 1000);
let passed = 0; const ok = (cond, msg) => { assert(cond, msg); passed++; };

try {
  /* ---------- connection ---------- */
  ok(await mt5.ping(), "signed in and pinged");
  ok(mt5.status().connected && mock.state.auths === 1, "one sign-in for the session");
  await mt5.ping(); ok(mock.state.auths === 1, "same TCP session reused");
  // the connection drops (MT5 restart, network): sign in again automatically
  await fetch(mock.url + "/_drop", { method: "POST" }); await new Promise(r => setTimeout(r, 100));
  ok(await mt5.ping() && mock.state.auths === 2, "signed in again after the socket closed");
  // wrong password
  process.env.MT5_WEBAPI_PASSWORD = "wrong-password"; mt5.reset();
  await assert.rejects(mt5.ping(), /sign-in|password/i); passed++;
  process.env.MT5_WEBAPI_PASSWORD = mock.cfg.password; mt5.reset();
  ok(await mt5.ping(), "right password works again");
  // range lock: refused before anything is sent, logged and alerted
  const callsBefore = mock.state.calls.length;
  await assert.rejects(mt5.getUser(1234567), e => e.range === true); passed++;
  await assert.rejects(mt5.updateUser(9000001, { leverage: 100 }), e => e.range === true); passed++;
  ok(mock.state.calls.length === callsBefore, "nothing sent to MT5 for an out-of-range login");
  ok(alerts.length === 2 && /outside the Absel Global range/.test(alerts[0]), "range lock alerted");
  // no money movement: there is no balance, credit or trade function, and anything that would change money is refused before a request
  ok(!Object.keys(mt5).some(k => /balance|credit|bonus|deposit|withdraw|trade|order/i.test(k)), "lib/mt5.js has no balance, credit or trade function");
  ok(![...mt5.ALLOWED].some(c => /^(trade|order)\//.test(c) || /balance|credit|position\/(update|delete|close)/.test(c)), "the allow-list has only reads, user/add and user/update");
  ok(!/\/api\/(trade|order)|position\/(update|delete)/.test(require("fs").readFileSync(new URL("../lib/mt5.js", import.meta.url), "utf8")), "no balance or trade endpoint anywhere in lib/mt5.js");
  // the allow-list itself: trade/balance (and every other money or trade command) is refused before any request
  const nRaw = mock.state.calls.length, aRaw = alerts.length;
  for (const p of ["/api/trade/balance?login=7000001&type=2&balance=100", "/api/trade/balance?login=7000001&type=3&balance=100", "/api/order/add", "/api/position/delete", "/api/deal/update"]) { assert.throws(() => mt5.checkCommand(p), e => e.refused === true); passed++; }
  ok(mock.state.calls.length === nRaw && alerts.length === aRaw + 5, "trade/balance, credit, order, position and deal changes are impossible: refused and alerted, nothing sent");
  for (const p of ["/api/user/add", "/api/user/get?login=1", "/api/group/get?group=x", "/api/user/logins?group=x", "/api/user/get_batch?login=1"]) mt5.checkCommand(p, p === "/api/user/add" ? { Group: "x" } : undefined);
  passed++;
  const sent0 = mock.state.calls.length, alerts0 = alerts.length;
  for (const f of [{ balance: 100 }, { credit: 50 }, { group: "real\\other" }, { leverage: 100, balance: 5 }]) { await assert.rejects(mt5.updateUser(7000001, f), e => e.refused === true && /refused/.test(e.message)); passed++; }
  ok(mock.state.calls.length === sent0 && !mock.state.calls.some(c => /trade|order/.test(c.path)), "refused before any network request (balance, credit or group through updateUser)");
  ok(alerts.length === alerts0 + 4, "each refusal is alerted");
  // the call log: command, parameters without secrets, retcode
  const logged = []; mt5.setLog(c => logged.push(c)); mt5.reset();
  await mt5.ping(); await assert.rejects(mt5.updateUser(7000001, { credit: 1 }), e => e.refused); passed++;
  ok(logged.some(c => c.command === "auth/start" && c.retcode) && logged.some(c => c.command === "auth/answer") && logged.some(c => c.command === "test/access" && /^0/.test(c.retcode)), "every call logged with its command and retcode");
  ok(logged.some(c => c.refused && c.command === "user/update"), "a refused call is logged too");
  ok(!JSON.stringify(logged).includes(mock.cfg.password) && logged.find(c => c.command === "auth/answer").params.srv_rand_answer === "***", "no secrets in the call log");
  mt5.setLog(null);
  ok(mt5.toLots({ Volume: 10000 }) === 1 && mt5.toLots({ VolumeExt: 50000000, Volume: 5000 }) === 0.5 && mt5.toLots({ Volume: 100 }) === 0.01, "volume to lots");

  /* ---------- CRM with a client and an account ---------- */
  const store = createMemoryStore(); store.transaction = fn => fn();
  const crm = createCRM({ store, mt5Mode: () => "api", hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p, random: n => new Uint8Array(require("crypto").randomBytes(n)) });
  crm.ensureDefaults();
  const ADMIN = crm.saveUser(crm.SYSTEM, { name: "Admin", username: "admin", role: "admin", password: "Strong-pass-123", must_change_password: false });
  const OPS = crm.saveUser(ADMIN, { name: "Fatima", username: "fatima", role: "operations", password: "Strong-pass-456", must_change_password: false });
  const s0 = crm.getSettings();
  crm.saveSettings(ADMIN, { portal: { account_types: s0.portal.account_types.map(t => Object.assign({}, t, t.id === "ecn" ? { mt5_group: G_ECN, mt5_demo_group: G_DEMO } : t.id === "stp" ? { mt5_group: G_STP } : {})) } });
  const reg = crm.portalRegister({ first_name: "Amina", last_name: "Okoro", email: "amina@example.com", dial_code: "+234", phone: "8012345678", country: "Nigeria", password: "Client-pass-2026", terms: true }), C = { id: reg.client.id };
  crm.portalVerifyEmail(reg.verify_token);
  const x = store.get("clients", C.id); x.kyc = { status: "approved" }; store.put("clients", x);
  const req = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 });
  crm.openAccount(OPS, req.id, { login: "7000001", server: "AbselGlobal-Live" });

  await set({ users: [
    { Login: 7000001, Group: G_ECN, Name: "Amina Okoro", Email: "amina@example.com", Leverage: 100, Balance: 1500 },
    { Login: 7000002, Group: G_STP, Name: "Walk In", Email: "walkin@example.com", Leverage: 200, Balance: 300 },
    { Login: 7000003, Group: G_DEMO, Name: "Demo Only", Leverage: 100, Balance: 10000 },
  ], accounts: [{ Login: 7000001, Balance: 1500, Equity: 1520, Margin: 100, MarginFree: 1420, MarginLevel: 1520 }],
  deals: [
    { Deal: 1001, Login: 7000001, Time: now - 7200, TimeMsc: (now - 7200) * 1000, Action: 2, Entry: 0, Symbol: "", Volume: 0, Profit: 1000, Comment: "DEP D-REC001" },
    { Deal: 1002, Login: 7000001, Time: now - 3600, TimeMsc: (now - 3600) * 1000, Action: 0, Entry: 0, Symbol: "EURUSD", Volume: 10000, VolumeExt: 100000000, Price: 1.08, Profit: 0, Commission: -7, PositionID: 55 },
    { Deal: 1003, Login: 7000001, Time: now - 1800, TimeMsc: (now - 1800) * 1000, Action: 1, Entry: 1, Symbol: "EURUSD", Volume: 10000, VolumeExt: 100000000, Price: 1.081, Profit: 10, Commission: -7, PositionID: 55 },
    { Deal: 1004, Login: 7000001, Time: now - 600, TimeMsc: (now - 600) * 1000, Action: 2, Entry: 0, Profit: 500, Comment: "manual top-up" },
    { Deal: 1005, Login: 7000002, Time: now - 900, TimeMsc: (now - 900) * 1000, Action: 0, Entry: 0, Symbol: "XAUUSD", Volume: 2000, Profit: 0, PositionID: 77 },
  ], positions: [{ Position: 77, Login: 7000002, Symbol: "XAUUSD", Action: 0, Volume: 2000, PriceOpen: 2400, PriceCurrent: 2405, Profit: 10, TimeCreate: now - 900 }, { Position: 88, Login: 7000001, Symbol: "GBPUSD", Action: 1, Volume: 5000, PriceOpen: 1.27, PriceCurrent: 1.269, Profit: 5, TimeCreate: now - 300 }] });

  // a deposit our system completed, with its reference (matches deal 1001)
  const dp = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 1000 });
  store.get("payments", dp.id).reference = "D-REC001";

  /* ---------- first sync ---------- */
  const r1 = await runSync({ mt5, crm, store });
  ok(r1.groups.length === 3 && r1.groups.every(g => !g.error), "all three groups read");
  // operations credited it in MT5 Manager with "DEP D-REC001": seen in MT5, confirmed by a person
  ok(store.get("payments", dp.id).status === "pending", "a matched deal is never applied on its own");
  crm.decidePayment(OPS, dp.id, "complete", { mt5_ticket: "1001", reference: "BANK-1" });
  ok(store.get("payments", dp.id).status === "completed" && store.get("payments", dp.id).ext_reference === "MT5 deal #1001 · BANK-1", "confirmed with the MT5 deal");
  const acc = store.get("accounts", req.id);
  ok(acc.balance === 1500 && acc.equity === 1520 && acc.margin_free === 1420 && acc.group === G_ECN && acc.mt5_seen_at, "balance, equity, margin and group updated");
  ok(r1.deals.new === 5 && store.size("mt5_deals") === 5, "deals stored");
  const d3 = store.get("mt5_deals", "MD1003");
  ok(d3.account_id === acc.id && d3.client_id === C.id && d3.lots === 1 && d3.entry === 1 && d3.symbol === "EURUSD" && d3.commission === -7 && !("Deal" in d3), "deal fields, no raw MT5 object");
  ok(acc.trading_started_at && acc.lots_total === 1, "trading activity fed from deals");
  ok(crm.getLead(ADMIN, x.lead_id).lifecycle.id === "trading", "lifecycle: active trader");
  const ul = crm.listMt5Unlinked(OPS);
  ok(ul.length === 2 && ul.some(u => u.login === "7000002") && ul.some(u => u.login === "7000003"), "unknown logins listed, not linked");
  ok(!store.all("accounts").some(a => a.login === "7000002"), "never linked automatically");
  ok(store.size("mt5_positions") === 2 && store.get("accounts", req.id).positions_open === 1, "positions snapshot");

  /* ---------- second sync: no duplicates ---------- */
  await set({ accounts: [{ Login: 7000001, Balance: 1510, Equity: 1505, Margin: 0, MarginFree: 1505 }], positions: [{ Position: 77, Login: 7000002, Symbol: "XAUUSD", Action: 0, Volume: 2000, PriceOpen: 2400, PriceCurrent: 2410, Profit: 20, TimeCreate: now - 900 }] });
  const r2 = await runSync({ mt5, crm, store });
  // incremental: only deals from the last deal time minus 10 minutes come back (1004 and 1005), and they're recognised
  ok(r2.deals.new === 0 && r2.deals.duplicate === 2 && store.size("mt5_deals") === 5, "re-sync: overlap only, no duplicates");
  ok(mock.state.calls.filter(c => c.path === "/api/deal/get_batch").slice(-3).every(c => Number(c.query.from) >= now - 600 - 601), "deals fetched from the last deal time minus 10 minutes");
  ok(store.get("accounts", req.id).balance === 1510 && store.get("accounts", req.id).lots_total === 1, "balance updated, lots not counted twice");
  ok(store.size("mt5_positions") === 1 && store.get("accounts", req.id).positions_open === 0, "closed position removed from the snapshot");
  ok(crm.listMt5Unlinked(OPS).length === 2, "unlinked list stays the same");

  /* ---------- operations links an account ---------- */
  assert.throws(() => crm.mt5LinkAccount(crm.saveUser(ADMIN, { name: "Sara", username: "sara", role: "manager", password: "Strong-pass-789", must_change_password: false }), "UL7000002", { client_id: C.id }), /operations/); passed++;
  crm.mt5LinkAccount(OPS, "UL7000002", { client_id: C.id });
  const linked = store.all("accounts").find(a => a.login === "7000002");
  ok(linked && linked.type === "stp" && linked.kind === "live" && store.get("mt5_deals", "MD1005").account_id === linked.id, "linked: account created, earlier deals attached");
  ok(crm.listMt5Unlinked(OPS).length === 1, "one left to link");

  /* ---------- reconciliation ---------- */
  const rec = crm.mt5Reconcile(OPS, {});
  const row = rec.rows.find(r => r.login === "7000001");
  ok(row.matched === 1 && row.ours_in === 1000 && row.mt5_in === 1500 && row.diff === 500, "our deposit matched by reference; difference shown");
  ok(row.outside.length === 1 && row.outside[0].ticket === "1004" && row.outside[0].comment === "manual top-up", "deal made outside the system listed");

  /* ---------- MT5 down: visible error, then recovery ---------- */
  await set({ fail: { path: "/api/user/logins", mode: "error", retcode: "10 Server busy" } });
  const r3 = await runSync({ mt5, crm, store });
  ok(r3.groups.every(g => /Server busy/.test(g.error)), "a failing group is reported, the rest of the sync continues");
  await set({ fail: null });
  mock.close && await fetch(mock.url + "/_drop", { method: "POST" });
  const st = crm.mt5Status(OPS);
  ok(st.mode === "api" && st.sync.last_ok_at && st.unlinked === 1, "status for the settings card");
  ok(st.account_creation_enabled === false && !("writes_enabled" in (crm.getSettings().mt5 || {})), "MT5 account creation off by default; no money switch exists");

  /* ---------- mt5_ops call log ---------- */
  const calls = []; mt5.setLog(c => calls.push(c));
  await runSync({ mt5, crm, store }); mt5.setLog(null);
  ok(calls.length > 3 && calls.every(c => c.command && (c.retcode || c.error)), "a sync's calls are reported");
  crm.mt5LogCalls(calls, null); crm.mt5LogCalls(calls, null);
  const hourly = store.all("mt5_ops").filter(o => o.kind === "sync_reads");
  ok(hourly.length === 1 && hourly[0].calls_total === calls.length * 2 && hourly[0].counts["deal/get_batch"].n >= 2 && hourly[0].by === "system", "the timer's reads are summed per hour");
  crm.mt5LogCalls(calls.slice(0, 2), OPS);
  const mine = store.all("mt5_ops").find(o => o.kind === "calls" && o.by === OPS.id);
  ok(mine && mine.calls.length === 2 && mine.calls[0].command && mine.calls[0].at, "a sync started by staff is logged call by call with the staff user");

  console.log(`✔ MT5 Web API: ${passed} checks passed (auth, re-auth, wrong password, range lock, allow-list: no money commands, call log, sync, no duplicates, balances, positions, unlinked, link, reconciliation)`);
} finally {
  mt5.reset(); await mock.close();
}
