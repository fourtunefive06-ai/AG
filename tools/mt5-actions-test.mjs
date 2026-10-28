// Integration test for MT5 actions after approval (Phase B): core + lib/mt5-actions.js + lib/mt5.js against tools/mt5-mock.js.
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
const balCalls = () => mock.state.calls.filter(c => c.path === "/api/trade/balance").length;
const dealsWith = cm => mock.state.deals.filter(d => d.Comment === cm);

try {
  const store = createMemoryStore(); store.transaction = fn => fn();
  const crm = createCRM({ store, mt5Mode: () => "api", hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p, random: n => new Uint8Array(require("crypto").randomBytes(n)) });
  const ctx = { mt5, crm, store };
  crm.ensureDefaults();
  const ADMIN = crm.saveUser(crm.SYSTEM, { name: "Admin", username: "admin", role: "admin", password: "Strong-pass-123", must_change_password: false });
  const OPS = crm.saveUser(ADMIN, { name: "Fatima", username: "fatima", role: "operations", password: "Strong-pass-456", must_change_password: false });
  const OPS2 = crm.saveUser(ADMIN, { name: "Ali", username: "ali", role: "operations", password: "Strong-pass-457", must_change_password: false });
  const MGR = crm.saveUser(ADMIN, { name: "Sara", username: "sara", role: "manager", password: "Strong-pass-789", must_change_password: false });
  const s0 = crm.getSettings();
  crm.saveSettings(ADMIN, { portal: { second_approval_over: 1000, account_types: s0.portal.account_types.map(t => Object.assign({}, t, t.id === "ecn" ? { mt5_group: G, mt5_demo_group: GD } : {})) } });
  const reg = crm.portalRegister({ first_name: "Amina", last_name: "Okoro", email: "amina@example.com", dial_code: "+234", phone: "8012345678", country: "Nigeria", password: "Client-pass-2026", terms: true }), C = { id: reg.client.id };
  crm.portalVerifyEmail(reg.verify_token); crm.portalUploadKyc(C, { kind: "kyc_id", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.portalUploadKyc(C, { kind: "kyc_address", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.decideKyc(ADMIN, C.id, "approved");

  /* ---------- writes off: the manual flow stays, nothing goes to MT5 ---------- */
  const req0 = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 });
  assert.throws(() => crm.mt5AccountCreate(OPS, req0.id), /switched off/); passed++;
  crm.openAccount(OPS, req0.id, { login: "7000500", server: "Live" });
  const d0 = crm.portalDeposit(C, { account_id: req0.id, method: "bank", amount: 200 });
  assert.throws(() => crm.mt5PaymentAction(OPS, d0.id, "credit", {}), /switched off/); passed++;
  crm.decidePayment(OPS, d0.id, "complete", { reference: "BANK-0" });
  ok(store.get("payments", d0.id).status === "completed" && balCalls() === 0, "writes off: recorded by hand, no MT5 call");

  crm.saveSettings(ADMIN, { mt5: { writes_enabled: true } });
  ok(store.all("logins").some(g => g.event === "mt5_writes_on"), "switching writes on is audited");

  /* ---------- B1 account opening ---------- */
  const req = crm.portalRequestAccount(C, { type: "ecn", leverage: 200 });
  assert.throws(() => crm.mt5AccountCreate(MGR, req.id), /operations/); passed++;
  const ca = crm.mt5AccountCreate(OPS, req.id); const rc = await execute(ctx, ca.op);
  const acc = store.get("accounts", req.id);
  ok(rc.ok && acc.status === "open" && mt5.inRange(acc.login) && acc.group === G && acc.leverage === 200, "live account created in MT5 in the type's group");
  ok(acc.pw_once && /[a-z]/.test(acc.pw_once) && /[A-Z]/.test(acc.pw_once) && /\d/.test(acc.pw_once) && /[#@!$%&*?]/.test(acc.pw_once), "strong main password kept for the one-time reveal");
  const op1 = store.all("mt5_ops").find(o => o.kind === "create_account" && o.account_id === req.id);
  ok(!JSON.stringify(op1).includes(acc.pw_once) && !JSON.stringify(mock.state.calls).includes(acc.pw_once), "passwords not in the ledger or the logged calls");
  ok(crm.portalRevealPassword(C, req.id).password && !store.get("accounts", req.id).pw_once, "client sees the password once");
  ok(store.all("messages").some(m => m.template_id === "tpl_portal_account" && m.lead_id === reg.client.lead_id), "account-opened email sent");
  ok(mock.state.users.get(acc.login).Email === "amina@example.com", "name and email in MT5");
  for (let i = 0; i < 5; i++) strongPassword(); // generator is stable
  // the type has no demo group → clear error, request stays
  crm.saveSettings(ADMIN, { portal: { account_types: crm.getSettings().portal.account_types.map(t => t.id === "stp" ? Object.assign({}, t, { mt5_group: "" }) : t) } });
  const reqStp = crm.portalRequestAccount(C, { type: "stp", leverage: 100 });
  assert.throws(() => crm.mt5AccountCreate(OPS, reqStp.id), /Set the MT5 live group/); passed++;
  // MT5 refuses (unknown group) → stays requested with the error shown; manual "Record account" still works
  crm.saveSettings(ADMIN, { portal: { account_types: crm.getSettings().portal.account_types.map(t => t.id === "stp" ? Object.assign({}, t, { mt5_group: "real\\nope" }) : t) } });
  await execute(ctx, crm.mt5AccountCreate(OPS, reqStp.id).op);
  ok(store.get("accounts", reqStp.id).status === "requested" && /MT5 refused/.test(store.get("accounts", reqStp.id).mt5_error), "failure: stays requested with the MT5 error");
  crm.openAccount(OPS, reqStp.id, { login: "7000600" }); ok(store.get("accounts", reqStp.id).status === "open", "manual record still works");
  // demo: created straight away by the system
  const demo = crm.portalRequestAccount(C, { type: "ecn", kind: "demo", leverage: 100 });
  await execute(ctx, crm.mt5AccountCreate(crm.SYSTEM, demo.id).op);
  ok(store.get("accounts", demo.id).status === "open" && store.get("accounts", demo.id).group === GD, "demo account created automatically in the demo group");
  // leverage: only the type's list; changed in MT5 with an audit entry
  assert.throws(() => crm.mt5Leverage(OPS, req.id, 333), /allowed/); passed++;
  await execute(ctx, crm.mt5Leverage(OPS, req.id, 500).op);
  ok(store.get("accounts", req.id).leverage === 500 && mock.state.users.get(acc.login).Leverage === 500 && store.all("activities").some(a => /from 1:200 to 1:500/.test(a.data.label || "")), "leverage changed in MT5 and audited");

  /* ---------- B2 deposits ---------- */
  const callsBefore = balCalls();
  const dep = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 1500 });
  assert.throws(() => crm.mt5PaymentAction(MGR, dep.id, "credit", {}), /operations/); passed++;
  ok(balCalls() === callsBefore, "no balance call without an approval");
  const r1 = await execute(ctx, crm.mt5PaymentAction(OPS, dep.id, "credit", { reference: "BANK-77" }).op);
  const p1 = store.get("payments", dep.id);
  ok(r1.ok && p1.status === "completed" && /^MT5 deal #\d+ · BANK-77$/.test(p1.ext_reference) && p1.mt5.deposit.by === OPS.id && p1.completed_by === OPS.id, "credited in MT5: deal ticket and approver recorded");
  ok(dealsWith("DEP " + dep.reference).length === 1 && mock.state.accounts.get(acc.login).Balance === 1500, "one MT5 balance deal with our reference");
  const lead = store.get("leads", reg.client.lead_id);
  ok(lead.stage === "funded" && store.all("deposits").some(d => d.lead_id === lead.id && d.status === "verified"), "first deposit → verified FTD, as before");
  ok(store.all("messages").some(m => m.template_id === "tpl_portal_deposit" && m.lead_id === lead.id), "deposit email sent");
  const led = store.all("mt5_ops").find(o => o.payment_id === dep.id);
  ok(led.status === "done" && led.ticket && led.request.amount === 1500 && led.by === OPS.id && led.retcode && led.created_at && led.finished_at, "ledger: request, retcode, ticket, staff user, time");
  assert.throws(() => crm.mt5PaymentAction(OPS, dep.id, "credit", {}), /pending|completed/); passed++;

  // timeout: MT5 credited but the answer never came → unknown; the check finds the deal; no second credit
  await set({ fail: { path: "/api/trade/balance", mode: "timeout", times: 1 } });
  const dep2 = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 300 });
  const r2 = await execute(ctx, crm.mt5PaymentAction(OPS, dep2.id, "credit", { reference: "BANK-78" }).op);
  ok(!r2.ok && store.get("payments", dep2.id).status === "mt5_unknown", "timeout → result unknown, not retried blindly");
  assert.throws(() => crm.mt5PaymentAction(OPS, dep2.id, "credit", {}), /still confirming/); passed++;
  assert.throws(() => crm.decidePayment(OPS, dep2.id, "complete", { reference: "X" }), /still confirming/); passed++;
  await new Promise(r => setTimeout(r, 300));
  const r3 = await execute(ctx, crm.mt5OpToCheck(OPS, dep2.id));
  ok(r3.ok && store.get("payments", dep2.id).status === "completed" && dealsWith("DEP " + dep2.reference).length === 1, "check found the existing deal: recorded, not credited twice");
  ok(store.all("mt5_ops").find(o => o.payment_id === dep2.id && o.status === "done").found_existing, "marked as found in MT5");
  // a definite error, then a retry: the retry looks first, finds nothing, sends once
  await set({ fail: { path: "/api/trade/balance", mode: "error", times: 1, retcode: "10 Server busy" } });
  const dep3 = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 50 + 50 });
  await execute(ctx, crm.mt5PaymentAction(OPS, dep3.id, "credit", { reference: "B-79" }).op);
  ok(store.get("payments", dep3.id).status === "pending" && /Server busy/.test(store.get("payments", dep3.id).mt5_error), "refused: request back to waiting with the MT5 error");
  const retry = crm.mt5PaymentAction(OPS, dep3.id, "credit", { reference: "B-79" });
  ok(retry.op.check_first, "the retry looks in MT5 first");
  await execute(ctx, retry.op);
  ok(store.get("payments", dep3.id).status === "completed" && dealsWith("DEP " + dep3.reference).length === 1, "retry credited once");
  // unknown result settled by the next sync (deal comment)
  await set({ fail: { path: "/api/trade/balance", mode: "timeout", times: 1 } });
  const dep4 = crm.portalDeposit(C, { account_id: req.id, method: "bank", amount: 120 });
  await execute(ctx, crm.mt5PaymentAction(OPS, dep4.id, "credit", { reference: "B-80" }).op);
  ok(store.get("payments", dep4.id).status === "mt5_unknown", "unknown again");
  await runSync({ mt5, crm, store });
  ok(store.get("payments", dep4.id).status === "completed" && dealsWith("DEP " + dep4.reference).length === 1, "the sync found the deal and completed the deposit");

  /* ---------- B3 withdrawals ---------- */
  const balBefore = mock.state.accounts.get(acc.login).Balance;
  const w1 = crm.portalWithdraw(C, { account_id: req.id, method: "usdt", amount: 200, details: "TRC20 TXabc" });
  const wa = crm.mt5PaymentAction(OPS, w1.id, "approve"); ok(wa.op && wa.op.amount === -200 && wa.op.need_margin === 200, "one approval under the limit → debit");
  await execute(ctx, wa.op);
  const pw1 = store.get("payments", w1.id);
  ok(pw1.status === "debited" && mock.state.accounts.get(acc.login).Balance === balBefore - 200 && dealsWith("WD " + w1.reference).length === 1, "debited in MT5, pay the client");
  assert.throws(() => crm.decidePayment(OPS, w1.id, "reject", { reason: "x" }), /already debited/); passed++;
  assert.throws(() => crm.decidePayment(OPS, w1.id, "complete", {}), /payout reference/); passed++;
  crm.decidePayment(OPS, w1.id, "complete", { reference: "USDT-tx-1" });
  ok(store.get("payments", w1.id).status === "completed" && store.all("messages").some(m => m.template_id === "tpl_portal_withdrawal"), "marked paid: completed, client emailed");
  // above the limit: two different people; MT5 only after the second
  const w2 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 1100, details: "IBAN" });
  const a1 = crm.mt5PaymentAction(OPS, w2.id, "approve"); const n0 = balCalls();
  ok(!a1.op && store.get("payments", w2.id).status === "first_approved" && balCalls() === n0, "first approval: nothing in MT5");
  assert.throws(() => crm.mt5PaymentAction(OPS, w2.id, "approve"), /second person/); passed++;
  const a2 = crm.mt5PaymentAction(OPS2, w2.id, "approve"); ok(a2.op && a2.op.approval.by === OPS2.id, "second approval → debit");
  await execute(ctx, a2.op); ok(store.get("payments", w2.id).status === "debited" && store.all("mt5_ops").find(o => o.payment_id === w2.id).approved_by.length === 2, "debited with both approvers in the ledger");
  // not enough free margin: refused before sending
  await set({ accounts: [{ Login: Number(acc.login), Margin: Math.max(0, mock.state.accounts.get(acc.login).Equity - 50), MarginFree: 50 }] });
  const w3 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 90, details: "IBAN" }); const n1 = balCalls();
  await execute(ctx, crm.mt5PaymentAction(OPS, w3.id, "approve").op);
  ok(store.get("payments", w3.id).status === "approved" && /Not enough free margin/.test(store.get("payments", w3.id).mt5_error) && balCalls() === n1, "insufficient margin blocks the withdrawal, nothing sent");
  await set({ accounts: [{ Login: Number(acc.login), Margin: 0, MarginFree: mock.state.accounts.get(acc.login).Equity }] });
  await execute(ctx, crm.mt5PaymentAction(OPS, w3.id, "debit").op); ok(store.get("payments", w3.id).status === "debited", "debit once margin is free");
  // cancelled before final approval → nothing in MT5
  const w4 = crm.portalWithdraw(C, { account_id: req.id, method: "bank", amount: 20, details: "IBAN" }); const n2 = balCalls();
  crm.portalCancel(C, w4.id); assert.throws(() => crm.mt5PaymentAction(OPS, w4.id, "approve"), /already cancelled/); passed++;
  ok(balCalls() === n2, "client cancelled before approval: nothing in MT5");

  /* ---------- B4 transfers ---------- */
  const req2 = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }); crm.openAccount(OPS, req2.id, { login: "7000777" }); // recorded by hand, not yet in MT5
  const tr = crm.portalTransfer(C, { account_id: req.id, to_account_id: req2.id, amount: 100 });
  await execute(ctx, crm.mt5PaymentAction(OPS, tr.id, "approve").op);
  const ptr = store.get("payments", tr.id);
  ok(ptr.status === "mt5_partial" && dealsWith("TRF-OUT " + tr.reference).length === 1 && !dealsWith("TRF-IN " + tr.reference).length, "credit failed after the debit: not reversed");
  ok(alerts.length === 0 && store.all("notifications").some(n => n.user_id === OPS.id && /NOT credited/.test(n.text)), "red alert to operations");
  assert.throws(() => crm.decidePayment(OPS, tr.id, "reject", { reason: "x" }), /already debited/); passed++;
  await set({ users: [{ Login: 7000777, Group: G, Name: "Amina Okoro", Balance: 0 }] });
  const rt = crm.mt5PaymentAction(OPS, tr.id, "retry_in"); ok(rt.op.check_first, "one-click retry checks MT5 first");
  await execute(ctx, rt.op);
  ok(store.get("payments", tr.id).status === "completed" && dealsWith("TRF-IN " + tr.reference).length === 1 && dealsWith("TRF-OUT " + tr.reference).length === 1, "transfer completed, each leg once");

  /* ---------- range lock ---------- */
  const req3 = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }); crm.openAccount(OPS, req3.id, { login: "9000001" });
  const dx = crm.portalDeposit(C, { account_id: req3.id, method: "bank", amount: 100 }); const n3 = balCalls(), al0 = alerts.length;
  await execute(ctx, crm.mt5PaymentAction(OPS, dx.id, "credit", { reference: "B-81" }).op);
  ok(store.get("payments", dx.id).status === "pending" && /outside the Absel Global range/.test(store.get("payments", dx.id).mt5_error) && balCalls() === n3 && alerts.length === al0 + 1, "out-of-range login refused, nothing sent, alerted");

  /* ---------- B5 company-funded $100 ---------- */
  // the $100 is for clients who haven't deposited: a second client, KYC approved, with an MT5 account
  const reg2 = crm.portalRegister({ first_name: "Brian", last_name: "Kamau", email: "brian@example.com", dial_code: "+254", phone: "712345678", country: "Kenya", password: "Client-pass-2026", terms: true }), C2 = { id: reg2.client.id };
  crm.portalVerifyEmail(reg2.verify_token); crm.portalUploadKyc(C2, { kind: "kyc_id", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.portalUploadKyc(C2, { kind: "kyc_address", data: "data:image/png;base64,iVBORw0KGgo=" }); crm.decideKyc(ADMIN, C2.id, "approved");
  const rb = crm.portalRequestAccount(C2, { type: "ecn", leverage: 100 }); await execute(ctx, crm.mt5AccountCreate(OPS, rb.id).op);
  const bl = store.get("accounts", rb.id).login, lead2 = store.get("leads", reg2.client.lead_id);
  const b = crm.requestBonus(MGR, lead2.id, { terms_accepted: true, account_id: bl });
  assert.throws(() => crm.mt5BonusCredit(OPS, b.id, {}), /sales managers/); passed++;
  await execute(ctx, crm.mt5BonusCredit(MGR, b.id, {}).op);
  const bb = store.get("bonuses", b.id);
  ok(bb.status === "credited" && bb.mt5.ticket && dealsWith("BONUS " + b.id).length === 1, "bonus credited in MT5 with BONUS <id>");

  /* ---------- reconciliation sees our references ---------- */
  await runSync({ mt5, crm, store });
  const rec = crm.mt5Reconcile(OPS, {}), row = rec.rows.find(r => r.login === acc.login);
  ok(row.matched >= 6 && !row.ours_unmatched.length, "every MT5 action matches by reference");

  console.log(`✔ MT5 actions: ${passed} checks passed (approval before money, two approvals, margin, range lock, timeout → check → no double credit, retries, transfer alert and retry, accounts, demo, leverage, bonus, writes off)`);
} finally { mt5.reset(); await mock.close(); }
