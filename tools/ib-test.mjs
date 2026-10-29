// Integration test for the IB programme against the mock MT5 Web API: a deal synced from MT5 → commission line →
// month approval → payout request (two approvals above the limit) → operations credits it in MT5 Manager → matched → confirmed
// with the MT5 deal ticket. Our system never moves money in MT5.
//   node tools/ib-test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const require = createRequire(import.meta.url);
const { startMock } = require("./mt5-mock.js");

const mock = await startMock({ from: 7000000, to: 7099999 });
for (const k of Object.keys(process.env)) if (k.startsWith("MT5_")) delete process.env[k];
Object.assign(process.env, mock.env, { MT5_TIMEOUT_MS: "1500" });
const mt5 = require("../lib/mt5.js");
const { execute } = require("../lib/mt5-actions.js");
const { runSync } = require("../lib/mt5-sync.js");
const { createCRM, createMemoryStore } = require("../lib/core.js");
const set = body => fetch(mock.url + "/_set", { method: "POST", body: JSON.stringify(body) }).then(r => r.json());
const G = "real\\absel-global\\ecn";
let passed = 0; const ok = (c, m) => { assert(c, m); passed++; };
let T = Date.now() - 40 * 864e5;
try {
  const store = createMemoryStore(); store.transaction = fn => fn();
  const crm = createCRM({ store, now: () => new Date(T), mt5Mode: () => "api", hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p, random: n => new Uint8Array(require("crypto").randomBytes(n)) });
  const ctx = { mt5, crm, store };
  crm.ensureDefaults();
  const ADMIN = crm.saveUser(crm.SYSTEM, { name: "Admin", username: "admin", role: "admin", password: "Strong-pass-123", must_change_password: false });
  const OPS = crm.saveUser(ADMIN, { name: "Fatima", username: "fatima", role: "operations", password: "Strong-pass-456", must_change_password: false });
  const OPS2 = crm.saveUser(ADMIN, { name: "Ali", username: "ali", role: "operations", password: "Strong-pass-457", must_change_password: false });
  const PT = crm.saveUser(ADMIN, { name: "Lina", username: "lina", role: "partnerships", password: "Strong-pass-789", must_change_password: false });
  crm.saveSettings(ADMIN, { mt5: { account_creation_enabled: true }, portal: { second_approval_over: 50, account_types: crm.getSettings().portal.account_types.map(t => t.id === "ecn" ? Object.assign({}, t, { mt5_group: G }) : t) } });
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  let n = 0;
  const client = async (first, ib) => {
    const r = crm.portalRegister({ first_name: first, last_name: "Test", email: first.toLowerCase() + "@example.com", dial_code: "+254", phone: String(711000000 + ++n), country: "Kenya", password: "Client-pass-2026", terms: true, ib: ib || "" }, { ip: "10.1.0." + n });
    const C = { id: r.client.id }; crm.portalVerifyEmail(r.verify_token);
    crm.portalUploadKyc(C, { kind: "kyc_id", data: PNG }); crm.portalUploadKyc(C, { kind: "kyc_address", data: PNG }); crm.decideKyc(ADMIN, C.id, "approved");
    const q = crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }); await execute(ctx, crm.mt5AccountCreate(OPS, q.id).op);
    return { C, acc: store.get("accounts", q.id) };
  };
  // the IB: approved, with its own MT5 account (created in MT5)
  const ib = await client("Partner");
  crm.portalIbApply(ib.C, { promotion: "WhatsApp channel for traders", expected_clients: 10, accept: true }, { ip: "10.9.9.9" });
  const pt0 = store.all("partners")[0]; crm.decidePartner(PT, pt0.id, { decision: "approve", plan_id: "PL_standard" });
  const code = store.get("partners", pt0.id).code;
  // the referred client: registers with the code; MT5 account created in MT5; trades
  const cl = await client("Referred", code);
  ok(store.get("clients", cl.C.id).partner_id === pt0.id, "attributed by code");
  const now = Math.floor(T / 1000) + 3600;
  await set({ deals: [
    { Deal: 7701, Login: Number(cl.acc.login), Time: now, TimeMsc: now * 1000, Action: 0, Entry: 0, Symbol: "XAUUSD", Volume: 50000, VolumeExt: 500000000, PositionID: 91 },
    { Deal: 7702, Login: Number(cl.acc.login), Time: now + 900, TimeMsc: (now + 900) * 1000, Action: 1, Entry: 1, Symbol: "XAUUSD", Volume: 50000, VolumeExt: 500000000, Profit: 120, PositionID: 91 },
    { Deal: 7703, Login: Number(cl.acc.login), Time: now + 1000, TimeMsc: (now + 1000) * 1000, Action: 0, Entry: 0, Symbol: "EURUSD", Volume: 80000, PositionID: 92 },
    { Deal: 7704, Login: Number(cl.acc.login), Time: now + 2000, TimeMsc: (now + 2000) * 1000, Action: 1, Entry: 1, Symbol: "EURUSD", Volume: 80000, Profit: -40, PositionID: 92 },
  ] });
  T += 3 * 3600e3;
  const r1 = await runSync(ctx);
  ok(r1.deals.new === 4 && r1.deals.ib_lines === 2, "synced deals made two commission lines");
  const lines = store.all("commissions").filter(l => l.partner_id === pt0.id);
  ok(lines.find(l => l.deal_ticket === "7702").amount === 30 && lines.find(l => l.deal_ticket === "7704").amount === 40, "5 lots metals × $6 = $30; 8 lots forex × $5 = $40");
  await runSync(ctx); ok(store.all("commissions").filter(l => l.partner_id === pt0.id).length === 2, "second sync: no duplicate lines");
  // the month ends; the partnerships manager approves
  const period = lines[0].period; T += 35 * 864e5;
  const ap = crm.ibApprovePeriod(PT, pt0.id, period); ok(ap.approved === 2 && ap.amount === 70, "month approved");
  // payout to the IB's own MT5 account: two approvals over the limit; operations credits it by hand in MT5 Manager with IB <ref>
  const p = crm.portalIbPayout(ib.C, { method: "mt5", account_id: ib.acc.id }); ok(p.amount === 70 && p.type === "ib_payout", "payout requested");
  assert.throws(() => crm.decidePayment(OPS, p.id, "complete", { no_match_reason: "x", reference: "x" }), /two approvals|Approve/); passed++;
  crm.decidePayment(OPS, p.id, "approve"); ok(store.get("payments", p.id).status === "first_approved", "over the limit: first approval");
  crm.decidePayment(OPS2, p.id, "approve"); ok(store.get("payments", p.id).status === "approved", "second approval by another person");
  const open = () => crm.listPayments(OPS, { status: "open" }).find(z => z.id === p.id);
  ok(open().mt5_match.legs[0].state === "missing" && open().mt5_match.legs[0].comment === "IB " + p.reference, "approved: waiting for the credit in MT5 Manager, comment shown");
  ok(!mock.state.calls.some(c => /trade|order|balance/.test(c.path)), "our system sent no money command to MT5");
  // operations credits $70 in MT5 Manager (simulated in the mock); the next sync reads the balance deal
  const t = Math.floor(T / 1000);
  await set({ deals: [{ Deal: 7801, Login: Number(ib.acc.login), Time: t, TimeMsc: t * 1000, Action: 2, Entry: 0, Profit: 70, Comment: "IB " + p.reference }] });
  await runSync(ctx);
  ok(store.get("payments", p.id).status === "approved" && store.all("commissions").filter(l => l.payout_id === p.id).every(l => l.status === "approved"), "seen in MT5, but nothing is applied on its own");
  const m = open().mt5_match; ok(m.ok && m.tickets[0] === "7801", "matched: Seen in MT5 · deal #7801");
  crm.decidePayment(OPS, p.id, "complete", { mt5_ticket: m.tickets[0], amount: 9999 });
  const pay = store.get("payments", p.id);
  ok(pay.status === "completed" && pay.amount === 70, "confirmed for the payout amount (not a typed one)");
  ok(pay.ext_reference === "MT5 deal #7801" && pay.mt5.tickets[0] === "7801" && pay.mt5.by === OPS.id, "deal ticket recorded on the payout, with who confirmed it");
  ok(store.all("commissions").filter(l => l.payout_id === p.id).every(l => l.status === "paid"), "commission lines paid");
  ok(crm.getPartner(PT, pt0.id).audit.some(a => a.action === "payout_paid"), "payout in the partner's audit trail");
  ok(crm.mt5Reconcile(OPS, { from: new Date(T - 864e5).toISOString().slice(0, 10), to: new Date(T + 864e5).toISOString().slice(0, 10) }).rows.find(r => r.login === ib.acc.login).matched === 1, "reconciliation matches the IB payout");
  // a deal that MT5 no longer returns on the next sync: kept, marked missing, its commission reversed (never deleted)
  const t2 = Math.floor(T / 1000) + 60;
  await set({ deals: [
    { Deal: 7901, Login: Number(cl.acc.login), Time: t2, TimeMsc: t2 * 1000, Action: 0, Entry: 0, Symbol: "EURUSD", Volume: 20000, PositionID: 93 },
    { Deal: 7902, Login: Number(cl.acc.login), Time: t2 + 540, TimeMsc: (t2 + 540) * 1000, Action: 1, Entry: 1, Symbol: "EURUSD", Volume: 20000, Profit: 5, PositionID: 93 },
  ] });
  T += 3600e3; await runSync(ctx);
  ok(store.get("commissions", "CM1_7902_" + pt0.id).status === "pending" && store.get("commissions", "CM1_7902_" + pt0.id).amount === 10, "new closing deal: 2 lots forex × $5 = $10 pending");
  mock.state.deals.splice(mock.state.deals.findIndex(d => d.Deal === 7902), 1);
  const r3 = await runSync(ctx);
  ok(r3.deals.missing === 1 && store.get("mt5_deals", "MD7902").missing_at && store.get("commissions", "CM1_7902_" + pt0.id).status === "reversed" && /no longer in MT5/.test(store.get("commissions", "CM1_7902_" + pt0.id).reversed_reason), "deal gone from MT5 on re-sync: kept, marked missing, its line reversed with the reason");
  ok(!store.get("mt5_deals", "MD7901").missing_at && store.get("mt5_deals", "MD7801") && !store.get("mt5_deals", "MD7801").missing_at, "deals still in MT5 are untouched");
  const r4 = await runSync(ctx); ok(r4.deals.missing === 0 && store.all("commissions").filter(l => l.deal_ticket === "7902").length === 1, "re-sync: nothing new, no duplicate");
  console.log(`✔ IB chain: ${passed} checks passed (MT5 deal → commission → month approval → payout request → credited by hand in MT5 Manager → matched → confirmed with the deal ticket; a deal removed in MT5 reverses its commission)`);
} finally { mt5.reset(); await mock.close(); }
