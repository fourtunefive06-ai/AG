// Integration test for Phase B: MT5 account creation, and matching the money operations operations does by hand in MT5 Manager.
// Core + lib/mt5-actions.js + lib/mt5.js + lib/mt5-sync.js against tools/mt5-mock.js. Our system never moves money in MT5.
//   node tools/mt5-actions-test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const require = createRequire(import.meta.url);
const { startMock } = require("./mt5-mock.js");

const mock = await startMock({ from: 7000000, to: 7099999 });
for (const k of Object.keys(process.env)) if (k.startsWith("MT5_")) delete process.env[k];
Object.assign(process.env, mock.env, { MT5_TIMEOUT_MS: "1200" });
const mt5 = require("../lib/mt5.js");
const { execute, strongPassword } = require("../lib/mt5-actions.js");
const { runSync } = require("../lib/mt5-sync.js");
const { createCRM, createMemoryStore } = require("../lib/core.js");
const alerts = []; mt5.setAlert(m => alerts.push(m));
const set = body => fetch(mock.url + "/_set", { method: "POST", body: JSON.stringify(body) }).then(r => r.json());
const G = "real\\absel-global\\ecn", GD = "demo\\absel-global\\ecn";
let passed = 0; const ok = (c, m) => { assert(c, m); passed++; };
let clock = Date.now(); const later = h => { clock += h * 3600e3; };
const moneyCalls = () => mock.state.calls.filter(c => /^\/api\/(trade|order)\//.test(c.path) || /balance|credit/i.test(c.path)).length;
// operations credits or debits in MT5 Manager (outside our system); returns the deal ticket
const manager = async (login, amount, comment) => (await set({ manager: [{ login: Number(login), amount, comment }] })).deals[0];

try {
  const store = createMemoryStore(); store.transaction = fn => fn();
  const crm = createCRM({ store, now: () => new Date(clock), mt5Mode: () => "api", hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p, random: n => new Uint8Array(require("crypto").randomBytes(n)) });
  const ctx = { mt5, crm, store }, sync = () => runSync(ctx);
  crm.ensureDefaults();
  const ADMIN = crm.saveUser(crm.SYSTEM, { name: "Admin", username: "admin", role: "admin", password: "Strong-pass-123", must_change_password: false });
  const OPS = crm.saveUser(ADMIN, { name: "Fatima", username: "fatima", role: "operations", password: "Strong-pass-456", must_change_password: false });
  const OPS2 = crm.saveUser(ADMIN, { name: "Ali", username: "ali", role: "operations", password: "Strong-pass-457", must_change_password: false });
  const MGR = crm.saveUser(ADMIN, { name: "Sara", username: "sara", role: "manager", password: "Strong-pass-789", must_change_password: false });
  const s0 = crm.getSettings();
  crm.saveSettings(ADMIN, { portal: { second_approval_over: 1000, account_types: s0.portal.account_types.map(t => Object.assign({}, t, t.id === "ecn" ? { mt5_group: G, mt5_demo_group: GD } : {})) } });
  const client = (first, email, phone) => {
    const reg = crm.portalRegister({ first_name: first, last_name: "Okoro", email, dial_code: "+234", phone, country: "Nigeria", password: "Client-pass-2026", terms: true }), C = { id: reg.client.id };
    crm.portalVerifyEmail(reg.verify_token); crm.portalUploadKyc(C, { kind: "kyc_id", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.portalUploadKyc(C, { kind: "kyc_address", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.decideKyc(ADMIN, C.id, "approved");
    return { C, lead: reg.client.lead_id };
  };
  const { C, lead } = client("Amina", "amina@example.com", "8012345678");

  /* ---------- no money commands: refused before any request ---------- */
  const n0 = mock.state.calls.length;
  for (const f of [{ balance: 100 }, { credit: 100 }, { leverage: 100, balance: 1 }]) { await assert.rejects(mt5.updateUser(7000001, f), e => e.refused); passed++; }
  ok(mock.state.calls.length === n0 && typeof mt5.balance === "undefined" && !crm.mt5PaymentAction && !crm.mt5BonusCredit, "a balance call is impossible: no function, refused before the network");
  ok(!/trade\/balance|"balance"|kind === "balance"/.test(require("fs").readFileSync(new URL("../lib/mt5-actions.js", import.meta.url), "utf8")), "the action runner has no balance operation");

  /* ---------- B1 account creation: off by default ---------- */
  const req0 = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 });
  assert.throws(() => crm.mt5AccountCreate(OPS, req0.id), /switched off/); passed++;
  crm.openAccount(OPS, req0.id, { login: "7000500", server: "Live" });
  ok(store.get("accounts", req0.id).status === "open" && !mock.state.calls.some(c => c.path === "/api/user/add"), "off: recorded by hand, nothing created in MT5");
  crm.saveSettings(ADMIN, { mt5: { account_creation_enabled: true } });
  ok(store.all("logins").some(g => g.event === "mt5_accounts_on"), "switching account creation on is audited");

  const req = crm.portalRequestAccount(C, { type: "ecn", leverage: 200 });
  assert.throws(() => crm.mt5AccountCreate(MGR, req.id), /operations or an admin/); passed++;
  const prep = crm.mt5AccountCreate(OPS, req.id);
  ok(store.get("accounts", req.id).status === "creating" && store.get("accounts", req.id).approved_by === OPS.id && store.get("accounts", req.id).approved_at, "Approve locks the request as creating, with who and when");
  assert.throws(() => crm.mt5AccountCreate(OPS2, req.id), /already being opened/); passed++;
  assert.throws(() => crm.openAccount(OPS2, req.id, { login: "7000999" }), /already handled/); passed++;
  ok(crm.listAccountRequests(OPS, { status: "requested" }).some(a => a.id === req.id && a.status === "creating"), "still in the To open list while being opened");
  const rc = await execute(ctx, prep.op), acc = store.get("accounts", req.id);
  ok(rc.ok && acc.status === "open" && mt5.inRange(acc.login) && acc.group === G && acc.leverage === 200, "approve → creating → open: login recorded, in the type's group");
  const mu = mock.state.users.get(acc.login), addCall = mock.state.calls.filter(c => c.path === "/api/user/add").pop();
  ok(mu.Group === G && mu.Leverage === 200 && mu.Comment === "ABSEL " + req.id && mu.Email === "amina@example.com" && mu.Phone === "+2348012345678" && mu.Login === Number(acc.login), "user/add: right group, leverage, Comment ABSEL <id>, contact details");
  ok(addCall.query.pass_main === undefined && !JSON.stringify(addCall).includes(acc.pw_once), "passwords never in the logged calls");
  ok(mock.state.accounts.get(acc.login).Balance === 0 && acc.balance === 0 && moneyCalls() === 0, "it starts with a zero balance: our system never funds it");
  const pwOk = p => p.length >= 10 && p.length <= 12 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && (p.match(/[#@!$%]/g) || []).length === 1 && /^[A-Za-z0-9#@!$%]+$/.test(p);
  ok(pwOk(acc.pw_once), "main password: 10–12 characters, upper, lower, digit and one of #@!$%");
  ok(Array.from({ length: 200 }, () => strongPassword(12)).every(pwOk) && new Set(Array.from({ length: 200 }, () => strongPassword(12))).size === 200, "the generator always follows the policy and never repeats");
  const op1 = store.all("mt5_ops").find(o => o.kind === "create_account" && o.account_id === req.id);
  ok(op1.command === "user/add" && op1.by === OPS.id && op1.login === acc.login && op1.retcode !== undefined && op1.created_at && op1.finished_at && !JSON.stringify(store.all("mt5_ops")).includes(acc.pw_once), "audit: who, request, command, login, time, no passwords");
  ok(crm.portalRevealPassword(C, req.id).password && !store.get("accounts", req.id).pw_once, "client sees the password once, then it's erased");
  assert.throws(() => crm.portalRevealPassword(C, req.id), /already shown/); passed++;
  ok(!JSON.stringify(crm.listAccountRequests(OPS, { status: "open" })).includes("pw_once"), "operations never sees passwords");
  ok(store.all("messages").some(m => m.template_id === "tpl_portal_account" && m.lead_id === lead), "account-opened email sent (same path as the manual form)");
  ok(store.get("leads", lead).checklist.account_opened && store.all("activities").some(a => /Live ECN account opened/.test(a.data.label || "")), "sales checklist and timeline updated");
  // no group for the type → clear error; MT5 refuses → back to waiting with the error; the manual form still works
  crm.saveSettings(ADMIN, { portal: { account_types: crm.getSettings().portal.account_types.map(t => t.id === "stp" ? Object.assign({}, t, { mt5_group: "" }) : t) } });
  const reqStp = crm.portalRequestAccount(C, { type: "stp", leverage: 100 });
  assert.throws(() => crm.mt5AccountCreate(OPS, reqStp.id), /Set the MT5 group for STP in settings/); passed++;
  crm.saveSettings(ADMIN, { portal: { account_types: crm.getSettings().portal.account_types.map(t => t.id === "stp" ? Object.assign({}, t, { mt5_group: "real\\nope" }) : t) } });
  await execute(ctx, crm.mt5AccountCreate(OPS, reqStp.id).op);
  const aStp = store.get("accounts", reqStp.id);
  ok(aStp.status === "requested" && /group “real\\nope” not found/.test(aStp.mt5_error) && aStp.mt5_error_at, "MT5 failure → back to waiting with a readable error and its time");
  crm.openAccount(OPS, reqStp.id, { login: "7000600" }); ok(store.get("accounts", reqStp.id).status === "open", "Record manually still works");
  // timeout after MT5 created it: not retried blindly; found by its Comment and linked once
  await set({ fail: { path: "/api/user/add", mode: "timeout", times: 1 } });
  const reqT = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }), usersBefore = mock.state.users.size;
  const rT = await execute(ctx, crm.mt5AccountCreate(OPS, reqT.id).op);
  const aT = store.get("accounts", reqT.id);
  ok(rT.ok && aT.status === "open" && aT.mt5_created.found_existing && mock.state.users.size === usersBefore + 1 && mock.state.users.get(aT.login).Comment === "ABSEL " + reqT.id, "timeout → found by Comment → linked once, no duplicate");
  ok(aT.pw_once, "the password generated for it still reaches the client once");
  // demo: same function, the demo group, never funded by us; automatic only with the switch on
  ok(crm.mt5AutoDemo() === false, "Approve demo accounts automatically: off by default");
  const demo = crm.portalRequestAccount(C, { type: "ecn", kind: "demo", leverage: 100, demo_balance: 50000 });
  ok(store.get("accounts", demo.id).balance === 0, "api mode: no practice balance picked or kept by us");
  await execute(ctx, crm.mt5AccountCreate(crm.SYSTEM, demo.id).op);
  ok(store.get("accounts", demo.id).status === "open" && store.get("accounts", demo.id).group === GD && mock.state.accounts.get(store.get("accounts", demo.id).login).Balance === 0 && moneyCalls() === 0, "demo account created in the demo group, nothing deposited");
  crm.saveSettings(ADMIN, { mt5: { auto_demo: true } }); ok(crm.mt5AutoDemo() === true, "auto-approve demo on");
  crm.saveSettings(ADMIN, { mt5: { account_creation_enabled: false } }); ok(crm.mt5AutoDemo() === false, "auto demo needs account creation on too");
  crm.saveSettings(ADMIN, { mt5: { account_creation_enabled: true, auto_demo: false } });
  // another client: KYC withdrawn after the request → refused; MT5 assigns a login outside our range → not linked
  const three = client("Chidi", "chidi@example.com", "8077777777");
  const rK = crm.portalRequestAccount(three.C, { type: "ecn", leverage: 100 });
  const cx = store.get("clients", three.C.id); cx.kyc = Object.assign({}, cx.kyc, { status: "resubmit" }); store.put("clients", cx);
  assert.throws(() => crm.mt5AccountCreate(OPS, rK.id), /KYC is no longer approved/); passed++;
  ok(store.get("accounts", rK.id).status === "requested", "KYC refusal leaves the request untouched");
  cx.kyc.status = "approved"; store.put("clients", cx);
  const keepTo = process.env.MT5_LOGIN_TO, aR = alerts.length; process.env.MT5_LOGIN_TO = String(mock.state.next - 1); // MT5's next login is just outside our range
  await execute(ctx, crm.mt5AccountCreate(OPS, rK.id).op); process.env.MT5_LOGIN_TO = keepTo;
  const aK = store.get("accounts", rK.id);
  ok(aK.status === "requested" && !aK.login && /OUTSIDE the Absel Global range/.test(aK.mt5_error) && alerts.length > aR, "a login outside our range is not linked, and it's alerted");
  // leverage: only the type's list; changed in MT5 with an audit entry
  assert.throws(() => crm.mt5Leverage(OPS, req.id, 333), /allowed/); passed++;
  await execute(ctx, crm.mt5Leverage(OPS, req.id, 500).op);
  ok(store.get("accounts", req.id).leverage === 500 && mock.state.users.get(acc.login).Leverage === 500 && store.all("activities").some(a => /from 1:200 to 1:500/.test(a.data.label || "")), "leverage changed in MT5 and audited");
  ok(store.all("mt5_ops").some(o => o.kind === "leverage" && o.command === "user/update" && o.status === "done"), "leverage change logged");
  // out of range: refused before anything is sent, alerted
  const reqX = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }); crm.openAccount(OPS, reqX.id, { login: "9000001" });
  const nX = mock.state.calls.length, aX = alerts.length;
  const lx = await execute(ctx, crm.mt5Leverage(OPS, reqX.id, 200).op);
  ok(!lx.ok && mock.state.calls.length === nX && alerts.length === aX + 1 && store.get("accounts", reqX.id).leverage === 100, "out-of-range login refused, nothing sent, alerted");

  /* ---------- B2 deposits: operations credits in MT5 Manager, the sync matches, a person confirms ---------- */
  const L = acc.login;
  const dep = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 1500 });
  let m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dep.id).mt5_match;
  ok(m && !m.ok && m.legs[0].state === "missing" && m.legs[0].comment === "DEP " + dep.reference, "before MT5: not seen yet, the comment to use is shown");
  const t1 = await manager(L, 1500, "DEP " + dep.reference);
  await sync();
  ok(store.get("payments", dep.id).status === "pending", "seen in MT5 but never applied on its own");
  ok(store.all("notifications").some(n => n.user_id === OPS.id && /Seen in MT5: DEP/.test(n.text)), "operations is told it's seen in MT5");
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dep.id).mt5_match;
  ok(m.ok && m.tickets[0] === t1 && m.legs[0].deals[0].amount === 1500, "exact match: Seen in MT5 · deal # · amount");
  assert.throws(() => crm.decidePayment(MGR, dep.id, "complete", { mt5_ticket: t1 }), /operations/); passed++;
  assert.throws(() => crm.decidePayment(OPS, dep.id, "complete", { mt5_ticket: "999" }), /isn't the MT5 deal/); passed++;
  crm.decidePayment(OPS, dep.id, "complete", { mt5_ticket: t1 });
  const p1 = store.get("payments", dep.id);
  ok(p1.status === "completed" && p1.ext_reference === "MT5 deal #" + t1 && p1.completed_by === OPS.id && p1.mt5.matched && p1.mt5.by === OPS.id, "one click: completed with the deal ticket as the reference and the staff user");
  const ld = store.get("leads", lead);
  ok(ld.stage === "funded" && store.all("deposits").some(d => d.lead_id === lead && d.status === "verified"), "first deposit → verified FTD, as before");
  ok(store.all("messages").some(m => m.template_id === "tpl_portal_deposit" && m.lead_id === lead), "deposit email sent");
  ok(store.get("accounts", req.id).balance === 1500, "balance comes from MT5, not added twice");
  // amount differs
  const dA = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 300 }); await manager(L, 250, "DEP " + dA.reference); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dA.id).mt5_match;
  ok(!m.ok && m.legs[0].state === "amount" && /\$250/.test(m.legs[0].warn) && /\$300/.test(m.legs[0].warn), "warning: amount in MT5 differs");
  assert.throws(() => crm.decidePayment(OPS, dA.id, "complete", { mt5_ticket: m.legs[0].ticket }), /no longer matches/); passed++;
  assert.throws(() => crm.decidePayment(OPS, dA.id, "complete", { reference: "BANK-9" }), e => !!(e.fields && e.fields.no_match_reason)); passed++;
  crm.decidePayment(OPS, dA.id, "complete", { amount: 250, reference: "BANK-9", no_match_reason: "Client sent 250, bank fee" });
  const pA = store.get("payments", dA.id);
  ok(pA.status === "completed" && pA.amount === 250 && pA.mt5.matched === false && pA.mt5.reason === "Client sent 250, bank fee" && store.all("activities").some(a => /without an MT5 match: Client sent 250/.test(a.data.label || "")), "confirm without a match needs a reason, and it's logged");
  // wrong login
  const reqB = reqT, LB = store.get("accounts", reqT.id).login; // her second live account (5 is the most a client can have)
  const dL = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 120 }); await manager(LB, 120, "DEP " + dL.reference); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dL.id).mt5_match;
  ok(m.legs[0].state === "login" && m.legs[0].warn.includes(LB), "warning: the deal is on a different login");
  // missing after X hours
  const dM = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 180 });
  ok(crm.listPayments(OPS, { status: "open" }).find(p => p.id === dM.id).mt5_match.legs[0].state === "missing", "not late before the setting's hours");
  later(2.5);
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dM.id).mt5_match;
  ok(m.late && m.legs[0].state === "late" && /after 2 h/.test(m.legs[0].warn), "warning: no MT5 deal after 2 hours (default)");
  crm.saveSettings(ADMIN, { mt5: { match_after_hours: 6 } });
  ok(!crm.listPayments(OPS, { status: "open" }).find(p => p.id === dM.id).mt5_match.late, "the hours are a setting");
  crm.saveSettings(ADMIN, { mt5: { match_after_hours: 2 } });
  // two deals with the same reference: flagged, neither is picked
  const dD = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 160 }); await manager(L, 160, "DEP " + dD.reference); await manager(L, 160, "dep " + dD.reference + " again"); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === dD.id).mt5_match;
  ok(m.legs[0].state === "duplicate" && !m.ok && !m.tickets.length && m.legs[0].deals.length === 2, "two deals with the same reference: flagged, none picked");
  // unknown reference
  await manager(L, 75, "DEP D-NOSUCH1"); await sync();
  ok(crm.opsOverview(OPS).mt5.unknown_refs >= 1 && store.all("notifications").some(n => n.user_id === OPS.id && /DEP D-NOSUCH1/.test(n.text) && /don't know/.test(n.text)), "warning: an MT5 balance deal with a DEP reference we don't know");
  const ov = crm.opsOverview(OPS).mt5;
  ok(ov.mismatch === 2 && ov.late >= 1, "operations desk counts open mismatches (wrong login, duplicate) and late ones");

  /* ---------- B3 withdrawals ---------- */
  const w1 = crm.portalWithdraw(C, { account_id: req.id, method: "usdt", amount: 200, details: "TRC20 TXabc" });
  const wl = crm.listPayments(OPS, { status: "open" }).find(p => p.id === w1.id);
  ok(wl.margin_free != null && wl.mt5_seen_at && wl.positions_open === 0, "approval screen shows the live free margin (information only)");
  crm.decidePayment(OPS, w1.id, "approve");
  ok(store.get("payments", w1.id).status === "approved" && moneyCalls() === 0, "approved: nothing is debited by our system");
  const tw = await manager(L, -200, "WD " + w1.reference); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === w1.id).mt5_match;
  ok(m.ok && m.legs[0].amount === -200, "Debit seen in MT5");
  assert.throws(() => crm.decidePayment(OPS, w1.id, "complete", { mt5_ticket: tw }), /payout reference/); passed++;
  crm.decidePayment(OPS, w1.id, "complete", { mt5_ticket: tw, reference: "USDT-tx-1" });
  const pw = store.get("payments", w1.id);
  ok(pw.status === "completed" && pw.ext_reference === "USDT-tx-1" && pw.mt5.tickets[0] === tw && store.all("messages").some(m => m.template_id === "tpl_portal_withdrawal"), "Mark paid with the payout reference: completed, deal kept, client emailed");
  // above the limit: two people
  const w2 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 1100, details: "IBAN" });
  crm.decidePayment(OPS, w2.id, "approve"); assert.throws(() => crm.decidePayment(OPS, w2.id, "approve"), /second person/); passed++;
  assert.throws(() => crm.decidePayment(OPS, w2.id, "complete", { reference: "x", no_match_reason: "y" }), /two approvals/); passed++;
  crm.decidePayment(OPS2, w2.id, "approve"); ok(store.get("payments", w2.id).status === "approved", "two approvals above the limit, as before");
  // debited in MT5 before the approval → warning; reject after a debit → operations told to reverse it
  const w3 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 30, details: "IBAN" }); await manager(L, -30, "WD " + w3.reference); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === w3.id).mt5_match;
  ok(m.warn.some(w => /before the approval/.test(w)), "warning: debited in MT5 before approval");
  crm.decidePayment(OPS, w3.id, "reject", { reason: "Third-party account" });
  ok(store.all("notifications").some(n => n.user_id === OPS.id && new RegExp(w3.reference + " was rejected, but MT5 already has").test(n.text)), "rejected after the debit: operations is told to reverse it in MT5 Manager");
  // client's available balance: an open withdrawal holds money until MT5 shows the debit
  const w4 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 40, details: "IBAN" });
  // what the client can still withdraw (the client area's own check)
  const avail = () => { try { crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: store.get("accounts", req.id).balance + 1, details: "IBAN" }); } catch (e) { return Number((e.message.match(/is \$([\d.]+)/) || [])[1]); } };
  const bal0 = store.get("accounts", req.id).balance, av0 = avail(); // w4 is held while it is open
  crm.decidePayment(OPS, w4.id, "approve"); await manager(L, -40, "WD " + w4.reference); await sync();
  const bal1 = store.get("accounts", req.id).balance, av1 = avail();
  ok(bal1 === bal0 - 40 && av1 === av0, "a withdrawal already debited in MT5 isn't held twice (balance down 40, available unchanged)");

  /* ---------- B4 transfers: both sides matched ---------- */
  const tr = crm.portalTransfer(C, { account_id: req.id, to_account_id: reqB.id, amount: 100 });
  await manager(L, -100, "TRF-OUT " + tr.reference); await sync();
  later(3);
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === tr.id).mt5_match;
  ok(!m.ok && m.legs[0].state === "match" && m.legs[1].state === "late" && /TRF-IN/.test(m.legs[1].warn), "only one side seen after X hours: warning");
  const tIn = await manager(LB, 100, "TRF-IN " + tr.reference); await sync();
  m = crm.listPayments(OPS, { status: "open" }).find(p => p.id === tr.id).mt5_match;
  ok(m.ok && m.tickets.length === 2, "both sides seen");
  crm.decidePayment(OPS, tr.id, "complete", { mt5_ticket: m.tickets.join(",") });
  ok(store.get("payments", tr.id).status === "completed" && store.get("payments", tr.id).ext_reference.includes("#" + tIn), "transfer confirmed with both deals");

  /* ---------- B5 company-funded $100: BONUS <id> credited by Absel Markets in MT5 Manager ---------- */
  const two = client("Brian", "brian@example.com", "8099999999");
  const rb = crm.portalRequestAccount(two.C, { type: "ecn", leverage: 100 }); await execute(ctx, crm.mt5AccountCreate(OPS, rb.id).op);
  const bl = store.get("accounts", rb.id).login;
  const b = crm.requestBonus(MGR, two.lead, { terms_accepted: true, account_id: bl, approve: true });
  ok(b.status === "requested", "api mode: a manager's request waits for the MT5 credit");
  assert.throws(() => crm.decideBonus(MGR, b.id, true, {}), e => !!(e.fields && e.fields.no_match_reason)); passed++;
  const tb = await manager(bl, 100, "BONUS " + b.id); await sync();
  ok(store.all("notifications").some(n => n.user_id === MGR.id && /Seen in MT5: BONUS/.test(n.text)), "the manager is told it's seen in MT5");
  crm.decideBonus(MGR, b.id, true, { mt5_ticket: tb });
  const bb = store.get("bonuses", b.id);
  ok(bb.status === "credited" && bb.mt5.ticket === tb && bb.account_id === bl, "one-click confirm with the matched deal");
  ok(!store.all("mt5_deals").some(d => d.action === 3) && moneyCalls() === 0, "our system never touched the MT5 credit field");

  /* ---------- reconciliation and the call log ---------- */
  const rec = crm.mt5Reconcile(OPS, {}), row = rec.rows.find(r => r.login === L);
  ok(row.matched >= 3 && row.outside.some(o => /D-NOSUCH1/.test(o.comment)), "reconciliation: our requests matched by reference, the unknown one shown as made outside");
  ok(!JSON.stringify(store.all("mt5_ops")).includes(mock.cfg.password), "no secrets in mt5_ops");
  ok(moneyCalls() === 0 && !mock.state.calls.some(c => /trade|order/.test(c.path)), "in the whole run, not one money command reached MT5");

  console.log(`✔ MT5 Phase B: ${passed} checks passed (no money commands, account creation off/on with zero balance, demo, leverage, range lock, matching: exact, amount, login, late, duplicate, unknown reference; confirm needs a person and a reason without a match; withdrawals, transfers, $100 accounts)`);
} finally { mt5.reset(); await mock.close(); }
