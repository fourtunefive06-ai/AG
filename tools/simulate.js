/**
 * Simulates a 30-day call-centre month against the CRM core.
 *   node tools/simulate.js            → runs checks + prints report summaries
 *   node tools/simulate.js --dump DIR → also writes every collection as JSON (used for demo data)
 */
"use strict";
const path = require("path"), fs = require("fs"), assert = require("assert");
const { createCRM, createMemoryStore } = require("../lib/core.js");

let seed = 42; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const TZ = 240 * 60000; // Dubai

const START = Date.parse("2026-09-17T00:00:00Z") - TZ; let T = START;
const store = createMemoryStore();
const crm = createCRM({ store, now: () => new Date(T), random: n => new Uint8Array(require("crypto").randomBytes(n)), hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p, onQueue: m => setTimeout0.push(m) });
const setTimeout0 = [];
const flushQueue = () => { while (setTimeout0.length) { const m = setTimeout0.shift(); { const okSend = chance(0.94); crm.markMessage(m.id, okSend ? "simulated" : "failed", okSend ? {} : { error: "Simulated provider error" }); } } };
crm.ensureDefaults();

/* ---------- team ---------- */
const ADMIN = crm.saveUser(crm.SYSTEM, { name: "Alex Morgan", username: "admin", role: "admin", email: "admin@abselglobal.com", accepts_leads: false, password: "demo-pass-123", must_change_password: false });
const team = [
  ["Sara Malik", "sara", "manager", "Sales", []],
  ["Daniel Kariuki", "daniel", "agent", "East Africa desk", ["Swahili", "English"]],
  ["Grace Wanjiru", "grace", "agent", "East Africa desk", ["Swahili", "English"]],
  ["Chinedu Okafor", "chinedu", "agent", "Africa desk", ["English"]],
  ["Rahul Mehta", "rahul", "agent", "South Asia desk", ["Hindi", "English"]],
  ["Yousef Al-Amin", "yousef", "agent", "Arabic desk", ["Arabic", "English"]],
  ["Mai Tran", "mai", "agent", "SEA desk", ["Vietnamese", "English"]],
  ["Nadia Rahman", "nadia", "marketing_manager", "Marketing", []],
  ["Omar Haddad", "omar", "marketing", "Marketing", []],
  ["Fatima Noor", "fatima", "operations", "Operations", []],
  ["Ali Hassan", "ali", "operations", "Operations", []],
  ["Joy Atieno", "joy", "compliance", "Compliance", []],
].map(([name, username, role, t, langs], i) => crm.saveUser(ADMIN, { name, username, role, team: t, languages: langs, email: username + "@abselglobal.com", phone: "+971 50 555 01" + (10 + i), accepts_leads: role === "agent", target_ftd: role === "agent" ? 8 : 0, target_amount: role === "agent" ? 8000 : 0, extension: role === "agent" ? String(201 + i) : "", password: "demo-pass-123", must_change_password: false }));
const U = Object.fromEntries(team.map(u => [u.username, u]));
const MGR = U.sara;
const R = (name, match, agents, priority, method = "round_robin") => crm.saveRule(MGR, { name, match, agents: agents.map(a => U[a].id), priority, method });
R("Kenya · Nairobi & Mombasa", { countries: ["Kenya"], cities: ["Nairobi", "Mombasa"] }, ["daniel"], 1);
R("East Africa", { countries: ["Kenya", "Tanzania", "Uganda", "Rwanda"] }, ["grace", "daniel"], 2, "least_loaded");
R("West Africa", { countries: ["Nigeria", "Ghana", "Cameroon", "Senegal"] }, ["chinedu"], 3);
R("South Asia", { countries: ["India", "Sri Lanka", "Bangladesh", "Nepal"] }, ["rahul"], 4);
R("GCC & Levant (Arabic)", { countries: ["Saudi Arabia", "Oman", "Qatar", "Kuwait", "Bahrain", "Jordan", "Egypt"] }, ["yousef"], 5);
R("Southeast Asia", { countries: ["Vietnam", "Thailand", "Malaysia", "Indonesia", "Philippines"] }, ["mai"], 6);

/* ---------- marketing: campaigns that match the ad links ---------- */
const MKT = U.nadia, MKTX = U.omar;
const CAMPS = [
  ["Google Search · ECN", "Google Ads", "google", "search-ecn", 45], ["Google Search · Gold", "Google Ads", "google", "search-gold", 35], ["Google PMax · Brand", "Google Ads", "google", "pmax-brand", 20],
  ["Meta Lead Ads · Islamic", "Facebook / Instagram", "facebook", "lead-ads-islamic", 40], ["Meta Retargeting 30d", "Facebook / Instagram", "facebook", "retarget-30d", 18], ["Meta Lookalike FTD", "Facebook / Instagram", "facebook", "lookalike-ftd", 30],
  ["Instagram Reels · Gold", "Facebook / Instagram", "instagram", "reels-gold", 15], ["TikTok creator promo", "TikTok", "tiktok", "creator-promo", 12],
].map(([name, channel, src, camp, daily]) => Object.assign(crm.saveCampaign(MKT, { name, channel, utm_source: src, utm_medium: src === "google" ? "cpc" : "paid-social", utm_campaign: camp, budget: daily * 30, status: "active", start_date: "2026-09-17", landing_url: "https://abselglobal.com/" }), { daily }));

/* ---------- lead generator ---------- */
const GEO = [
  ["Kenya", "+254", ["Nairobi", "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"], 16], ["Tanzania", "+255", ["Dar es Salaam", "Arusha", "Mwanza"], 6], ["Uganda", "+256", ["Kampala", "Entebbe"], 4],
  ["Nigeria", "+234", ["Lagos", "Abuja", "Port Harcourt", "Ibadan"], 15], ["Ghana", "+233", ["Accra", "Kumasi"], 5],
  ["India", "+91", ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune"], 14], ["Sri Lanka", "+94", ["Colombo"], 3], ["Bangladesh", "+880", ["Dhaka", "Chattogram"], 4],
  ["Saudi Arabia", "+966", ["Riyadh", "Jeddah", "Dammam"], 8], ["Oman", "+968", ["Muscat"], 3], ["Qatar", "+974", ["Doha"], 2], ["Kuwait", "+965", ["Kuwait City"], 2], ["Egypt", "+20", ["Cairo", "Alexandria"], 4], ["Jordan", "+962", ["Amman"], 2],
  ["Vietnam", "+84", ["Ho Chi Minh City", "Hanoi"], 5], ["Thailand", "+66", ["Bangkok"], 3], ["Malaysia", "+60", ["Kuala Lumpur"], 3], ["Indonesia", "+62", ["Jakarta", "Surabaya"], 3],
  ["South Africa", "+27", ["Johannesburg", "Cape Town"], 3],
];
const W = GEO.reduce((s, g) => s + g[3], 0);
const geo = () => { let r = rnd() * W; for (const g of GEO) { r -= g[3]; if (r <= 0) return g; } return GEO[0]; };
const NAMES = {
  EA: [["Brian", "Faith", "Kevin", "Mercy", "Joseph", "Esther", "Peter", "Amani", "Neema", "Baraka", "Wanjiru", "Otieno", "Achieng", "Juma"], ["Kamau", "Odhiambo", "Njoroge", "Kimani", "Mutua", "Mollel", "Okello", "Mugisha", "Nyambura", "Kiprop"]],
  NG: [["Emeka", "Tunde", "Chiamaka", "Ngozi", "Chinedu", "Ifeoma", "Segun", "Kemi", "Kwame", "Ama", "Kofi", "Abena"], ["Okafor", "Adeyemi", "Bello", "Okonkwo", "Eze", "Mensah", "Boateng", "Owusu", "Adebayo", "Nwosu"]],
  IN: [["Arjun", "Priya", "Rohan", "Anjali", "Vikram", "Deepa", "Rahul", "Sneha", "Kavya", "Nimal", "Tanvir", "Farhana"], ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Perera", "Rahman", "Das", "Mehta"]],
  AR: [["Khalid", "Noura", "Faisal", "Reem", "Omar", "Mona", "Yousef", "Huda", "Salem", "Layla", "Ahmed", "Nadia"], ["Al-Harbi", "Al-Otaibi", "Haddad", "Saleh", "Al-Balushi", "Mansour", "Al-Sabah", "Nasser", "Farouk", "Al-Mutairi"]],
  SEA: [["Linh", "Minh", "Anh", "Somchai", "Niran", "Siti", "Budi", "Aisyah", "Wei Ling", "Hafiz", "Thanh", "Putri"], ["Nguyen", "Tran", "Pham", "Wongsakul", "Santoso", "Rahman", "Tan", "Lim", "Wijaya", "Le"]],
  AF: [["Wanjiru", "Kamau", "Thabo", "Lerato", "Sipho", "Achieng", "Naledi", "Otieno"], ["Mwangi", "Naidoo", "Dlamini", "Otieno", "Nkosi", "Ochieng", "Mokoena", "Kariuki"]],
};
const REGION = { Kenya: "EA", Tanzania: "EA", Uganda: "EA", Nigeria: "NG", Ghana: "NG", India: "IN", "Sri Lanka": "IN", Bangladesh: "IN", "Saudi Arabia": "AR", Oman: "AR", Qatar: "AR", Kuwait: "AR", Egypt: "AR", Jordan: "AR", Vietnam: "SEA", Thailand: "SEA", Malaysia: "SEA", Indonesia: "SEA", Kenya: "AF", "South Africa": "AF" };
const FIRST = ["Emeka", "Ngozi", "Tunde", "Kofi", "Ama", "Arjun", "Priya", "Rohan", "Anjali", "Khalid", "Noura", "Faisal", "Reem", "Omar", "Mona", "Linh", "Minh", "Somchai", "Siti", "Budi", "Wanjiru", "Thabo", "Brian", "Faith", "Chiamaka", "Kwame", "Vikram", "Deepa", "Huda", "Anh", "Nadia", "Kevin", "Mercy"];
const LAST = ["Okafor", "Adeyemi", "Mensah", "Boateng", "Sharma", "Patel", "Iyer", "Al-Harbi", "Al-Otaibi", "Haddad", "Nguyen", "Tran", "Wong", "Santoso", "Mwangi", "Naidoo", "Bello", "Reddy", "Saleh", "Pham", "Kamau", "Odhiambo"];
const SOURCES = [["google", ["search-ecn", "search-gold", "pmax-brand"], 34], ["facebook", ["lead-ads-islamic", "retarget-30d", "lookalike-ftd"], 28], ["instagram", ["reels-gold"], 10], ["tiktok", ["creator-promo"], 6], ["ib-partner", ["ib-1023", "ib-2041"], 8], ["direct", [""], 14]];
const SW = SOURCES.reduce((s, x) => s + x[2], 0);
const source = () => { let r = rnd() * SW; for (const s of SOURCES) { r -= s[2]; if (r <= 0) return s; } return SOURCES[0]; };
const INTERESTS = ["ECN account", "ECN account", "STP account", "STP account", "Islamic (swap-free) account", "Cent account", "Introducing Broker (IB)", "PAMM / MAM"];
const EXP = ["New to trading", "Under 1 year", "1–3 years", "3+ years"];

function newLead() {
  const g = geo(), s = source(), pool = NAMES[REGION[g[0]]] || [FIRST, LAST], fn = pick(pool[0]), ln = pick(pool[1]);
  const ph = String(3000000000 + Math.floor(rnd() * 699999999)).slice(0, 10);
  const l = crm.createLead(crm.SYSTEM, {
    firstName: fn, lastName: ln, email: `${fn}.${ln}${Math.floor(rnd() * 90 + 10)}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.com",
    dialCode: g[1], phone: ph, country: g[0], city: pick(g[2]), interest: (g[0] === "Saudi Arabia" || g[0] === "Egypt") && chance(0.35) ? "Islamic (swap-free) account" : pick(INTERESTS), experience: pick(EXP),
    form: chance(0.45) ? "popup" : "hero", consent: true, sample: true, utm: { utm_source: s[0] === "direct" ? "" : s[0], utm_medium: s[0] === "direct" ? "" : s[0] === "ib-partner" ? "referral" : "cpc", utm_campaign: pick(s[1]), ref: s[0] === "ib-partner" ? "IB" + (1000 + Math.floor(rnd() * 90)) : "" },
  });
  l.quality = rnd(); // hidden propensity for the simulation only
}

/* ---------- agent behaviour ---------- */
const SKILL = { daniel: 0.62, grace: 0.7, chinedu: 0.55, rahul: 0.6, yousef: 0.66, mai: 0.5 };
const QA = () => ({
  capital: pick(["Under $500", "$500–2k", "$500–2k", "$2k–10k", "$2k–10k", "$10k–50k", "$50k+"]),
  instruments: ["Forex", "Gold", "Indices", "Oil", "Crypto"].filter(() => chance(0.4)).concat(chance(0.6) ? ["Gold"] : []).filter((v, i, a) => a.indexOf(v) === i),
  account_type: pick(["ECN", "STP", "Islamic", "Cent"]), timeline: pick(["Today", "This week", "This week", "This month", "Later"]),
  objections: ["Regulation / trust", "Spreads & costs", "Deposit methods", "Withdrawal speed", "Leverage", "Needs more info", "Partner / family decision", "Bad past broker experience"].filter(() => chance(0.22)),
  current_broker: chance(0.35) ? pick(["Exness", "XM", "IC Markets", "FBS", "Octa", "HFM"]) : "", expected_deposit: pick([100, 250, 500, 500, 1000, 2000, 5000]),
  questions: chance(0.5) ? pick(["Is Absel regulated and where?", "How fast are withdrawals to my bank?", "Can I deposit with USDT?", "What is the spread on gold?", "Do you have a swap-free account?", "Is there a bonus?", "Can I use EAs on MT5?", "What is the minimum deposit?"]) : "",
});
const NOTES = { interested: ["Keen on gold, wants ECN. Sending registration link.", "Experienced trader moving from another broker, asked about withdrawals.", "Wants Islamic account, will register tonight."], callback: ["Driving, call back after 6pm.", "In a meeting, asked for a call tomorrow morning.", "Wants to discuss with spouse first."], not_interested: ["Just browsing, not ready.", "Already happy with current broker."] };

function presence(u, hourStart, breakAt) {
  for (let m = 0; m < 60; m += 4) { if (breakAt != null && m >= breakAt && m < breakAt + 40) continue; T = hourStart + m * 60000 + 1000; crm.heartbeat(u); }
}
function agentHour(u, hourStart) {
  const q = crm.queue(u); const budget = 3 + Math.floor(rnd() * 4);
  let n = 0;
  for (const item of q.dial) {
    if (n >= budget) break;
    const l = store.get("leads", item.lead_id); if (!l || !["new", "attempting", "contacted", "qualified", "registered", "kyc"].includes(l.stage)) continue;
    if (item.why === "Hot lead" && l.last_call_at && T - Date.parse(l.last_call_at) < 20 * 3600e3) continue;
    if (item.why.startsWith("Hot lead") && chance(0.6)) continue;
    const at = hourStart + (n * 9 + Math.floor(rnd() * 6)) * 60000;
    if (Date.parse(l.created_at) > at || (l.last_call_at && Date.parse(l.last_call_at) > at)) continue;
    T = at; n++;
    const skill = SKILL[u.username] || 0.55, qual = l.quality ?? 0.5;
    const connected = chance(0.38 + skill * 0.3);
    if (!connected) { crm.logCall(u, l.id, { outcome: pick(["no_answer", "no_answer", "busy", "switched_off", "voicemail"]), duration_sec: Math.floor(rnd() * 25) }); continue; }
    if (chance(0.006)) { crm.logCall(u, l.id, { outcome: "wrong_number", duration_sec: 15 }); continue; }
    const p = qual * 0.6 + skill * 0.4;
    const outcome = l.stage === "registered" || l.stage === "kyc" ? "interested" : p > 0.7 ? "interested" : p > 0.42 ? (chance(0.75) ? "callback" : "interested") : chance(0.6) ? "not_interested" : "callback";
    const dur = outcome === "not_interested" ? 40 + Math.floor(rnd() * 80) : 120 + Math.floor(rnd() * 600);
    const next = outcome === "callback" ? { type: "call", title: "Call back", due_at: new Date(T + (4 + Math.floor(rnd() * 40)) * 3600e3).toISOString() } : outcome === "interested" && l.stage !== "kyc" ? { type: "call", title: "Check registration", due_at: new Date(T + (20 + Math.floor(rnd() * 30)) * 3600e3).toISOString() } : null;
    const c = { outcome, duration_sec: dur, notes: pick(NOTES[outcome] || [""]), qa: l.connected_calls ? {} : QA(), next };
    // progression on good calls
    if (outcome === "interested") {
      if (l.stage === "qualified" && chance(0.3 + qual * 0.3)) { c.stage = "registered"; c.account_id = String(51000000 + Math.floor(rnd() * 900000)); }
      else if (l.stage === "registered" && chance(0.45 + qual * 0.2)) c.stage = "kyc";
      else if (l.stage === "kyc" && !l.deposit_pending && chance(0.3 + qual * 0.3 + (l.bonus_status === "traded" ? 0.15 : 0))) { c.stage = "funded"; c.deposit_amount = pick([100, 250, 250, 500, 500, 1000, 1000, 2000, 3000, 5000, 10000]); c.deposit_method = pick(["Card", "Card", "USDT", "Bank wire", "Skrill", "Local bank transfer"]); c.tx_ref = "TX" + Math.floor(rnd() * 1e8); c.next = null; }
      else if (l.stage === "registered" && chance(0.4)) crm.setChecklist(u, l.id, "docs_uploaded", true);
      else if (l.stage === "kyc" && !(l.checklist || {}).method_agreed && chance(0.5)) crm.setChecklist(u, l.id, "method_agreed", true, pick(["Card", "USDT", "Bank wire"]));
    }
    if (outcome === "not_interested") c.lost_reason = pick(["Not interested", "Low budget", "Using another broker", "Trust / regulation concerns"]);
    crm.logCall(u, l.id, c);
    if (outcome === "interested") journeyStep(u, l.id);
    if (chance(0.5)) crm.recordCallEvent({ direction: "out", phone: l.dial_code + l.phone, extension: store.get("users", u.id).extension, duration_sec: dur + 7, status: "answered", call_id: "pbx-" + Math.floor(rnd() * 1e9), recording_url: "https://pbx.example.com/recordings/" + Math.floor(rnd() * 1e9) + ".mp3", started_at: new Date(T).toISOString() });
    if (chance(0.15)) crm.addNote(u, l.id, pick(["Sent MT5 download links on WhatsApp.", "Explained FSC licence and segregated funds.", "Client asked for swap-free details.", "Shared deposit methods: card, USDT, Skrill."]));
  }
}

// Optional journey: demo account for some interested leads, company-funded account for some verified clients
function journeyStep(u, id) {
  const l = store.get("leads", id); if (!l || !["contacted", "qualified", "registered", "kyc"].includes(l.stage)) return;
  const d = l.demo || {};
  if (!d.given_at && ["contacted", "qualified"].includes(l.stage) && chance(0.35)) crm.setDemo(u, id, "give", { login: String(9000000 + Math.floor(rnd() * 900000)), server: "AbselMarkets-Demo" });
  else if (d.given_at && !d.first_trade_at && chance(0.6)) crm.setDemo(u, id, chance(0.5) ? "active" : "traded");
  if (l.stage === "kyc" && !l.bonus_status && chance(0.18) && crm.bonusEligibility(u, id).ok) crm.requestBonus(u, id, { terms_accepted: true });
  const b = store.all("bonuses").find(x => x.lead_id === id && ["credited", "traded"].includes(x.status));
  if (b && chance(0.7)) {
    const lots = Math.round((b.lots + rnd() * 1.5) * 10) / 10, profit = Math.round((b.profit + (rnd() - 0.45) * 40) * 100) / 100;
    crm.updateBonus(u, b.id, { lots, profit, balance: Math.max(0, b.amount + profit) });
    if (lots >= 2 && profit > 20 && chance(0.3)) try { crm.requestBonusWithdrawal(u, b.id, Math.min(Math.floor(profit), 50)); } catch (e) { /* limits */ }
  }
}

/* ---------- run the month ---------- */
const days = 30;
for (let h = 0; h < days * 24; h++) {
  const hourStart = START + h * 3600e3; T = hourStart;
  const localHour = new Date(hourStart + TZ).getUTCHours(), dow = new Date(hourStart + TZ).getUTCDay();
  const rate = (localHour >= 10 && localHour <= 23 ? 0.32 : 0.06) * (dow === 5 || dow === 6 ? 0.8 : 1);
  if (chance(rate)) { T = hourStart + Math.floor(rnd() * 50) * 60000; newLead(); if (chance(0.15)) newLead(); }
  if (localHour >= 9 && localHour < 21 && dow !== 0) for (const k of Object.keys(SKILL)) {
    const lunch = localHour === 13 ? 5 : null;
    if (lunch != null) { T = hourStart + lunch * 60000; crm.setBreak(U[k], "Lunch"); presence(U[k], hourStart, lunch); T = hourStart + (lunch + 40) * 60000; crm.setBreak(U[k], null); continue; }
    presence(U[k], hourStart, null);
    if (chance(0.85)) agentHour(U[k], hourStart);
  }
  // sales manager verifies deposits at 12:00 and 18:00, reviews a few calls in the evening
  if ((localHour === 12 || localHour === 18) && dow !== 0) { T = hourStart + 20 * 60000; crm.listDeposits(MGR, { status: "pending" }).forEach(d => chance(0.95) ? crm.verifyDeposit(MGR, d.id, true) : crm.verifyDeposit(MGR, d.id, false, "Proof doesn't show the transaction reference"));
    crm.listBonuses(MGR, { status: "requested" }).forEach(b => chance(0.9) ? crm.decideBonus(MGR, b.id, true, { account_id: b.account_id || String(52000000 + Math.floor(rnd() * 900000)) }) : crm.decideBonus(MGR, b.id, false, { reason: "Same household as an existing client" }));
    crm.listBonuses(MGR, { status: "withdrawals" }).forEach(b => b.withdrawals.filter(w => w.status === "requested").forEach(w => crm.decideBonusWithdrawal(MGR, b.id, w.id, true))); }
  if (localHour === 19 && dow !== 0) { T = hourStart + 10 * 60000; crm.listCallsForReview(MGR, {}).rows.slice(0, 3).forEach(c => crm.saveReview(MGR, { activity_id: c.activity_id, scores: Object.fromEntries(["opening", "discovery", "product", "objections", "close", "tone"].map(k => [k, 2 + Math.floor(rnd() * 4)])), compliance_ok: chance(0.96), strengths: pick(["Good rapport", "Clear explanation of the licence", "Strong close"]), improve: pick(["Ask about capital earlier", "Book a fixed callback time", "Mention risk warning"]) })); }
  // marketing logs yesterday's ad spend every morning
  if (localHour === 10) { const day = new Date(hourStart + TZ - 864e5).toISOString().slice(0, 10); CAMPS.forEach(c => crm.addSpend(MKTX, { campaign_id: c.id, date: day, amount: Math.round(c.daily * (0.7 + rnd() * 0.6)) })); }
  if (h === 20 * 24 + 11) { // a re-engagement broadcast drafted by marketing, approved by the manager
    T = hourStart; const b = crm.saveBroadcast(MKTX, { name: "Re-engage: lost in September", channel: "email", template_id: "tpl_promo_email", segment: { stages: ["lost", "contacted"], inactive_days: 5 } });
    const sb = crm.submitBroadcast(MKTX, b.id); assert.strictEqual(sb.status, "pending_approval", "marketing exec needs approval");
    crm.approveBroadcast(MKT, b.id, true);
  }
  if (localHour === 13 && chance(0.3)) { const l = pick(store.all("leads").filter(x => x.owner_id && x.stage !== "lost")); if (l) { T = hourStart + 30 * 60000; crm.recordInbound({ phone: l.dial_code + l.phone, text: pick(["Hi, please call me after 5", "I registered, what next?", "Is USDT deposit possible?", "Yes interested, send details"]), provider_id: "wamid.sim" + h }); } }
  T = hourStart + 59 * 60000; crm.tick(); flushQueue();
}
T = START + days * 24 * 3600e3 + 9 * 3600e3; crm.tick(); flushQueue();

/* ---------- checks ---------- */
const leads = store.all("leads");
const byStage = s => leads.filter(l => l.stage === s).length;
console.log(`Leads ${leads.length} | activities ${store.size("activities")} | tasks ${store.size("tasks")} | messages ${store.size("messages")} | jobs ${store.size("jobs")} | notifications ${store.size("notifications")}`);
console.log("Stages:", Object.fromEntries(["new", "attempting", "contacted", "qualified", "registered", "kyc", "funded", "lost", "invalid"].map(s => [s, byStage(s)])));
// territory routing
for (const l of leads.filter(x => x.source_type === "web")) {
  if (l.country === "Kenya" && ["Nairobi", "Mombasa"].includes(l.city) && !l.duplicate_of) assert.strictEqual(l.owner_id, U.daniel.id, "Nairobi lead must go to Daniel: " + l.reference);
  if (["Nigeria", "Ghana"].includes(l.country) && !l.duplicate_of) assert.strictEqual(l.owner_id, U.chinedu.id);
  if (l.country === "South Africa") assert.strictEqual(l.owner_id, null, "No territory → pool");
}
// agent visibility
const agentView = crm.listLeads(U.daniel, { pageSize: 200 });
assert(agentView.rows.every(r => r.owner_id === U.daniel.id), "Agent must only see own leads");
assert.throws(() => crm.getLead(U.daniel, leads.find(l => l.owner_id === U.chinedu.id).id), /not found/i);
assert.throws(() => crm.saveUser(U.daniel, { name: "x", username: "x" }), /admin/i);
assert.throws(() => crm.deleteLeads(MGR, [leads[0].id]), /admin/i);
// automation produced messages
assert(store.all("messages").some(m => m.rule_id === "auto_welcome"), "welcome emails sent");
assert(store.all("messages").some(m => m.rule_id === "auto_missed"), "missed-call WhatsApps sent");
assert(store.all("jobs").some(j => j.rule_id === "auto_nocontact" && j.status === "done"), "no-contact rule ran");
// reports
const f = { from: "2026-09-17", to: "2026-10-16" };
for (const t of ["dashboard", "funnel", "agents", "sources", "geo", "calls", "discovery", "lost", "mis", "automation"]) crm.report(MGR, t, f);
const dash = crm.report(MGR, "dashboard", f).kpis;
console.log("KPIs:", { leads: dash.leads, calls: dash.calls, connected: dash.connected_calls, funded: dash.funded_in_range, ftd: dash.ftd_in_range, conv: dash.conversion + "%", speed_min: dash.median_speed_min, sla: dash.within_sla + "%" });
console.table(crm.report(MGR, "agents", f).rows.map(r => ({ agent: r.name, assigned: r.assigned, calls: r.calls, connect: r.connect_rate + "%", talk: r.talk_min, speed: r.median_speed_min, reg: r.registered, ftd: r.funded, amount: r.ftd_amount })));
const agentRep = crm.report(U.mai, "agents", f); assert(agentRep.rows.length === 1 && agentRep.rows[0].id === U.mai.id, "agent sees only own row");
const funnel = crm.report(MGR, "funnel", f).steps; console.log("Funnel:", funnel.map(s => `${s.label} ${s.n}`).join(" → "));
// export + import
const ex = crm.exportLeads(MGR, { stage: "funded" }); assert.strictEqual(ex.rows.length, byStage("funded"));
const imp = crm.importLeads(MGR, [{ first_name: "Test", last_name: "Import", phone: "711222333", dial_code: "+254", country: "Kenya", city: "Nairobi" }, { first_name: "", last_name: "Bad" }]);
assert.strictEqual(imp.created, 1); assert.strictEqual(imp.failed.length, 1);
const imported = store.all("leads").find(l => l.first_name === "Test"); assert.strictEqual(imported.owner_id, U.daniel.id);
crm.deleteLeads(ADMIN, [imported.id]);
// auth
// security: lookup/result, lockout, gate, password policy, 2FA
assert.throws(() => crm.saveUser(ADMIN, { name: "Weak", username: "weakuser", role: "agent", password: "short1" }), /10 characters/);
assert.throws(() => crm.saveUser(ADMIN, { name: "NoPw", username: "nopw", role: "agent" }), /starting password/);
const nu = crm.saveUser(ADMIN, { name: "New Agent", username: "newbie", role: "agent", password: "Welcome-2026x" });
assert(nu.must_change_password, "new users must change password"); assert.strictEqual(crm.gate(nu), "change_password");
for (let i = 0; i < 5; i++) crm.authResult("newbie", "bad_password", { ip: "1.2.3.4" });
assert(crm.authLookup("newbie").user.locked, "locks after 5 failures");
crm.adminUserAction(ADMIN, nu.id, "unlock"); assert(!crm.authLookup("newbie").user.locked);
const changed = crm.changeOwnPassword(nu, "Better-pass-42"); assert(!changed.must_change_password && changed.session_ver > nu.session_ver);
const tb = crm.totpBegin(nu); const { totpCode } = require("../lib/core.js");
assert.throws(() => crm.totpEnable(nu, "000000"), /wrong/i);
crm.totpEnable(nu, totpCode(tb.secret, T)); assert(crm.authLookup("newbie").user.totp_enabled && crm.totpCheck(nu.id, totpCode(tb.secret, T)));
crm.saveSettings(ADMIN, { require_2fa_roles: ["admin"] }); assert.strictEqual(crm.gate(ADMIN), "setup_2fa"); crm.saveSettings(ADMIN, { require_2fa_roles: [] });
assert(crm.listLogins(ADMIN).some(l => l.event === "account_locked")); assert.throws(() => crm.listLogins(U.daniel), /admin/i);
assert.strictEqual(crm.exportAll(ADMIN).collections.leads.length, store.all("leads").length);
crm.saveUser(ADMIN, { id: nu.id, active: false }); assert(crm.authLookup("newbie").user.session_ver > changed.session_ver, "deactivation ends sessions");
store.remove("users", nu.id);
/* ---------- split workspaces + new sales/marketing features ---------- */
const anyLead = leads.find(l => l.owner_id === U.daniel.id && ["qualified", "registered", "kyc"].includes(l.stage) && !l.deposit_pending);
assert.strictEqual(crm.listLeads(MKTX, { pageSize: 10 }).total, crm.listLeads(MGR, { pageSize: 10 }).total, "marketing can see all leads");
assert.throws(() => crm.logCall(MKTX, anyLead.id, { outcome: "interested" }), /only the sales team/i);
assert.throws(() => crm.updateLead(MKTX, anyLead.id, { first_name: "X" }), /contact permissions/i);
crm.updateLead(MKT, anyLead.id, { unsubscribed: { email: true } }); assert(store.get("leads", anyLead.id).unsubscribed.email);
assert.throws(() => crm.changeStage(U.daniel, anyLead.id, "funded", { deposit_amount: 500 }), /verification/i);
assert.throws(() => crm.saveAutomation(U.daniel, { name: "x" }), /access/i);
assert.throws(() => crm.verifyDeposit(MKT, "x", true), /sales managers/i);
assert.throws(() => crm.report(MKTX, "agents", {}), /sales team/i);
// deposits: submit → verify
const dep = crm.submitDeposit(U.daniel, anyLead.id, { amount: 750, method: "USDT", tx_ref: "T-1" });
assert.strictEqual(dep.status, "pending"); assert.throws(() => crm.submitDeposit(U.daniel, anyLead.id, { amount: 10 }), /already waiting/);
assert.strictEqual(store.get("leads", anyLead.id).stage === "funded", false, "not funded before verification");
crm.verifyDeposit(MGR, dep.id, true); const fl = store.get("leads", anyLead.id);
assert.strictEqual(fl.stage, "funded"); assert.strictEqual(fl.deposit_amount, 750); assert(fl.checklist.funded && fl.checklist.kyc_approved, "checklist ticked");
const verified = store.all("deposits").filter(d => d.status === "verified");
assert.strictEqual(verified.length, store.all("leads").filter(l => l.stage === "funded").length, "every funded lead has a verified deposit");
const tg = crm.targets(MGR, { month: "2026-10" }); assert(tg.rows.length >= 6 && tg.total.ftd === verified.filter(d => d.deposited_at.slice(0, 7) === "2026-10" || new Date(Date.parse(d.deposited_at) + TZ).toISOString().slice(0, 7) === "2026-10").length);
// checklist moves stages
const q2 = store.all("leads").find(l => l.stage === "qualified" && l.owner_id);
crm.setChecklist(store.get("users", q2.owner_id), q2.id, "account_opened", true, "5100777"); assert.strictEqual(store.get("leads", q2.id).stage, "registered");
assert(crm.listPipeline(MGR).rows.length > 0);
// DNC list
const d1 = crm.addDnc(MGR, { dial_code: q2.dial_code, phone: q2.phone, reason: "Asked on call" }); assert(d1.leads_updated >= 1 && store.get("leads", q2.id).dnc);
const nl = crm.createLead(crm.SYSTEM, { firstName: "Again", lastName: "Caller", email: "again@example.com", dialCode: q2.dial_code, phone: q2.phone, country: q2.country }); assert(nl.dnc, "new lead on DNC list is flagged");
crm.removeDnc(MGR, d1.id); assert(!store.get("leads", q2.id).dnc);
// duplicates and merge
const groups = crm.duplicateGroups(MGR); assert(groups.length >= 1);
const g0 = groups.find(g => g.some(x => x.id === nl.id)) || groups[0]; const merged = crm.mergeLeads(MGR, g0[0].id, g0.slice(1).map(x => x.id));
assert(g0.slice(1).every(x => !store.get("leads", x.id)) && merged.id === g0[0].id);
// inbox
crm.simulateInbound(U.daniel, fl.id, "STOP"); assert(store.get("leads", fl.id).unsubscribed.whatsapp, "STOP opts out of WhatsApp");
assert(crm.listConversations(U.daniel, { box: "unread" }).some(c => c.lead.id === fl.id)); crm.getConversation(U.daniel, fl.id); assert(!crm.listConversations(U.daniel, { box: "unread" }).some(c => c.lead.id === fl.id));
// recordings linked, reviews, attendance
assert(store.all("activities").some(a => a.type === "call" && a.data.recording_url), "PBX recordings linked to calls");
assert(store.all("reviews").length > 10); assert(crm.report(MGR, "qa", f).count > 0);
const act = crm.report(MGR, "activity", f); assert(act.rows.length > 50 && act.agents.every(a => a.online_h > 0));
assert(crm.liveBoard(MGR).length >= 6);
// telephony: missed inbound call creates a callback task
const ol = store.all("leads").find(l => l.stage === "contacted" && l.owner_id && !l.dnc);
crm.recordCallEvent({ direction: "in", phone: ol.dial_code + ol.phone, status: "missed", call_id: "in-1" }); assert(store.all("tasks").some(t => t.lead_id === ol.id && /missed/.test(t.title)));
const unk = crm.recordCallEvent({ direction: "in", phone: "+971501112233", status: "answered", call_id: "in-2", duration_sec: 60 }); assert(store.get("leads", unk.lead_id).source_type === "phone");
// marketing
const cr = crm.report(MKT, "campaigns", f); assert(cr.rows.length === CAMPS.length && cr.total.spend > 0 && cr.rows.some(r => r.cost_per_ftd));
const bc = crm.listBroadcasts(MKT)[0]; assert.strictEqual(bc.status, "done"); assert(bc.stats.queued > 0 && bc.stats.queued === bc.total - (bc.skipped || 0));
assert(store.all("messages").filter(m => m.broadcast_id).every(m => !store.get("leads", m.lead_id) || !store.get("leads", m.lead_id).dnc));
const pv = crm.previewSegment(MKT, { stages: ["lost"] }, "email"); assert(pv.count >= 0 && pv.excluded);
crm.report(MKT, "quality", f); crm.report(MKT, "broadcasts", f); crm.report(MGR, "deposits", f);
// SLA reassignment: the first owner ignores a new lead while a colleague is online
crm.saveSettings(ADMIN, { sla_reassign: { enabled: true, minutes: 30, max: 1 } });
const sl = crm.createLead(crm.SYSTEM, { firstName: "Sla", lastName: "Test", email: "sla@example.com", dialCode: "+255", phone: "754555000", country: "Tanzania", city: "Arusha" });
const firstOwner = sl.owner_id; T += 31 * 60000; crm.heartbeat(U.grace); crm.heartbeat(U.daniel); crm.tick();
assert.notStrictEqual(store.get("leads", sl.id).owner_id, firstOwner, "lead moved after SLA breach");
crm.saveSettings(ADMIN, { sla_reassign: { enabled: false, minutes: 30, max: 1 } });
// recycling
const rc = crm.listRecycle(MGR); if (rc.rows.length) { const r0 = rc.rows[0]; crm.recycleLeads(MGR, [r0.id]); const rl = store.get("leads", r0.id); assert(rl.stage !== "lost" && rl.recycled === 1); }
assert(crm.misSummary("2026-10-10").text.includes("Verified FTDs"));
// optional journey: demo and company-funded account
const B = store.all("bonuses"), demos = store.all("leads").filter(l => l.demo && l.demo.given_at);
assert(demos.length > 10, "demos given"); assert(B.some(b => b.credited_at) && B.some(b => b.status === "converted"), "funded accounts credited and converted");
assert(store.all("jobs").some(j => j.rule_id === "auto_demo_given") && store.all("jobs").some(j => j.rule_id === "auto_bonus_credited"), "journey automations fire");
assert(B.every(b => b.status !== "converted" || store.get("leads", b.lead_id).stage === "funded"), "converted only after own deposit");
const jr = crm.report(MGR, "journey", { from: "2026-09-01", to: "2026-12-31" });
assert(jr.steps.length === 9 && jr.programme.credited > 0 && jr.programme.total_cost >= jr.programme.credited * 100 && jr.routes.length === 3);
assert.throws(() => crm.setDemo(MKTX, demos[0].id, "traded"), /sales team/i);
// eligibility, approval, limits, expiry
const jl = store.all("leads").find(l => l.stage === "kyc" && l.owner_id && !l.bonus_status && !l.dnc && !l.deposit_pending);
const jo = store.get("users", jl.owner_id);
assert.throws(() => crm.requestBonus(jo, jl.id, {}), /terms/i);
const bq = crm.requestBonus(jo, jl.id, { terms_accepted: true }); assert.strictEqual(bq.status, "requested");
assert.throws(() => crm.decideBonus(jo, bq.id, true, { account_id: "1" }), /sales managers/i);
assert(!crm.bonusEligibility(jo, jl.id).checks.find(c => c.id === "first").ok, "one per client");
const bc2 = crm.decideBonus(MGR, bq.id, true, { account_id: "52999001" }); assert.strictEqual(bc2.status, "credited"); assert(bc2.days_left >= 29);
assert.throws(() => crm.requestBonusWithdrawal(jo, bq.id, 10), /at least 2 lots/);
crm.updateBonus(jo, bq.id, { lots: 2.5, profit: 30, balance: 130 }); assert.strictEqual(store.get("bonuses", bq.id).status, "traded");
assert.throws(() => crm.requestBonusWithdrawal(jo, bq.id, 31), /Only profit/);
crm.requestBonusWithdrawal(jo, bq.id, 30); assert.throws(() => crm.requestBonusWithdrawal(jo, bq.id, 1), /Only profit/);
crm.decideBonusWithdrawal(MGR, bq.id, store.get("bonuses", bq.id).withdrawals[0].id, true);
assert(crm.queue(jo).journey.bonus_profit.some(x => x.id === jl.id));
const dupe = crm.createLead(crm.SYSTEM, { firstName: "Same", lastName: "Person", email: "other@example.com", dialCode: jl.dial_code, phone: jl.phone, country: jl.country });
assert(!crm.bonusEligibility(MGR, dupe.id).ok, "same phone can't get a second account");
{ const bb = store.get("bonuses", bq.id); bb.expires_at = new Date(T - 1000).toISOString(); store.put("bonuses", bb); } crm.tick(); assert.strictEqual(store.get("bonuses", bq.id).status, "expired"); assert.strictEqual(store.get("leads", jl.id).bonus_status, "expired");
assert(store.all("jobs").some(j => j.rule_id === "auto_bonus_ended" && j.lead_id === jl.id));
assert.throws(() => crm.updateBonus(jo, bq.id, { lots: 3 }), /Only active/);
const seg = crm.previewSegment(MKT, { journey: "bonus_expired" }, "whatsapp"); assert(seg.count >= 0);
// client area: register → verify → KYC → live account → deposit (FTD) → withdrawal with two approvals
{
  const OPS = U.fatima, OPS2 = U.ali, CMP = U.joy, PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const pl = store.all("leads").find(l => l.stage === "contacted" && l.owner_id && l.email && !l.dnc && !l.client_id);
  const reg = crm.portalRegister({ first_name: pl.first_name, last_name: pl.last_name, email: pl.email.toUpperCase(), dial_code: pl.dial_code, phone: pl.phone, country: pl.country, password: "Client-pass-2026", terms: true });
  assert.strictEqual(reg.client.lead_id, pl.id, "client linked to the existing lead"); assert(store.get("leads", pl.id).client_id === reg.client.id);
  assert.throws(() => crm.portalRegister({ first_name: "A", last_name: "B", email: pl.email, dial_code: "+1", phone: "5551234", country: "Kenya", password: "Client-pass-2026", terms: true }), /already an account/);
  assert.throws(() => crm.portalRegister({ first_name: "A", last_name: "B", email: "x@example.com", dial_code: "+1", phone: "5551234", country: "Kenya", password: "short", terms: true }), /10 characters/);
  const C = { id: reg.client.id };
  assert.throws(() => crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }), /Verify your email/);
  crm.portalVerifyEmail(reg.verify_token); assert.throws(() => crm.portalVerifyEmail(reg.verify_token), /expired/);
  assert.throws(() => crm.portalRequestAccount(C, { type: "ecn", leverage: 100 }), /documents first/);
  const demo = crm.portalRequestAccount(C, { type: "stp", leverage: 100, kind: "demo" }); assert.strictEqual(demo.status, "requested");
  crm.portalUploadKyc(C, { kind: "kyc_id", name: "passport.png", data: PNG }); assert.strictEqual(store.get("clients", C.id).kyc.status, "none");
  crm.portalUploadKyc(C, { kind: "kyc_address", name: "bill.png", data: PNG }); assert.strictEqual(store.get("clients", C.id).kyc.status, "pending");
  assert.throws(() => crm.decideKyc(U.daniel, C.id, "approved"), /compliance/i);
  assert.throws(() => crm.decideKyc(CMP, C.id, "rejected"), /what's wrong/);
  crm.decideKyc(CMP, C.id, "approved"); assert.strictEqual(store.get("leads", pl.id).stage, "kyc", "KYC approval moves the lead");
  assert(store.all("messages").some(m => m.lead_id === pl.id && m.template_id === "tpl_portal_kyc_ok"));
  const acc = crm.portalRequestAccount(C, { type: "ecn", leverage: 200 });
  assert.throws(() => crm.openAccount(CMP, acc.id, { login: "7001234" }), /operations/i);
  crm.openAccount(OPS, acc.id, { login: "7001234", server: "AbselGlobal-Live", password: "Mt5-Temp-99" });
  crm.openAccount(OPS, demo.id, { login: "9001234", server: "AbselGlobal-Demo", password: "Demo-1" }); assert(store.get("leads", pl.id).demo.given_at);
  assert.strictEqual(crm.portalRevealPassword(C, acc.id).password, "Mt5-Temp-99"); assert.throws(() => crm.portalRevealPassword(C, acc.id), /already shown/);
  assert(!JSON.stringify(crm.getClient(OPS, C.id)).includes("Mt5-Temp-99"), "staff never see the MT5 password");
  assert.throws(() => crm.portalDeposit(C, { account_id: acc.id, method: "usdt", amount: 20 }), /minimum/);
  const dp = crm.portalDeposit(C, { account_id: acc.id, method: "usdt", amount: 600, proof: { name: "tx.png", data: PNG } }); assert(dp.reference.startsWith("D-"));
  assert.throws(() => crm.decidePayment(U.sara, dp.id, "complete", { reference: "X" }), /operations/i);
  assert.throws(() => crm.decidePayment(OPS, dp.id, "complete", {}), /reference/);
  crm.decidePayment(OPS, dp.id, "complete", { reference: "TRC-abc123", amount: 600 });
  const fl2 = store.get("leads", pl.id); assert.strictEqual(fl2.stage, "funded", "first client-area deposit is a verified FTD"); assert.strictEqual(fl2.deposit_amount, 600);
  assert(store.all("deposits").some(d => d.lead_id === pl.id && d.status === "verified"));
  assert.strictEqual(store.get("accounts", acc.id).balance, 600);
  assert.throws(() => crm.portalWithdraw(C, { account_id: acc.id, method: "usdt", amount: 900, details: "TXYZ" }), /available balance/);
  crm.importBalances(OPS, [{ login: "7001234", balance: 2400, equity: 2380 }, { login: "1111", balance: 5 }]);
  const wd = crm.portalWithdraw(C, { account_id: acc.id, method: "usdt", amount: 1500, details: "TRC20 wallet TXYZ123" });
  assert.throws(() => crm.portalWithdraw(C, { account_id: acc.id, method: "usdt", amount: 1000, details: "TXYZ" }), /available balance/, "pending withdrawals are reserved");
  assert.throws(() => crm.decidePayment(OPS, wd.id, "complete", { reference: "R" }), /two approvals/);
  assert.strictEqual(crm.decidePayment(OPS, wd.id, "approve").status, "first_approved");
  assert.throws(() => crm.decidePayment(OPS, wd.id, "approve"), /second person/);
  assert.strictEqual(crm.decidePayment(OPS2, wd.id, "approve").status, "approved");
  assert.throws(() => crm.portalCancel(C, wd.id), /already being processed/);
  crm.decidePayment(OPS, wd.id, "complete", { reference: "TRC-out-1" }); assert.strictEqual(store.get("accounts", acc.id).balance, 900);
  const acc2 = crm.portalRequestAccount(C, { type: "islamic", leverage: 100 }); crm.openAccount(OPS, acc2.id, { login: "7001235" });
  const tr = crm.portalTransfer(C, { account_id: acc.id, to_account_id: acc2.id, amount: 300 }); crm.decidePayment(OPS2, tr.id, "complete", {});
  assert.strictEqual(store.get("accounts", acc2.id).balance, 300);
  const me = crm.portalMe(C); assert(me.accounts.length === 3 && me.totals.deposits === 600 && me.totals.withdrawals === 1500 && !JSON.stringify(me).includes("pw_once"));
  assert(!JSON.stringify(me).includes("Absel Markets") || JSON.stringify(me.config.legal_line).includes("trading name"), "client sees the Absel Global brand");
  assert(crm.getLead(U.sara, pl.id).portal.accounts.length === 3, "sales sees client-area status on the lead");
  assert(crm.listClients(store.get("users", pl.owner_id), {}).every(x => store.get("leads", x.lead_id).owner_id === pl.owner_id), "agents only see their own clients");
  const ov = crm.opsOverview(OPS); assert(ov.money.dep_month >= 600 && ov.clients.funded >= 1);
  // sign-in lockout
  for (let i = 0; i < 5; i++) crm.portalAuthResult(pl.email, "bad_password", {}); assert(crm.portalAuthLookup(pl.email).client.locked);
  crm.setClientStatus(OPS, C.id, "active"); assert(!crm.portalAuthLookup(pl.email).client.locked);
  const fg = crm.portalForgot(pl.email); crm.portalReset(fg.reset_token, "New-client-pass-1"); assert.throws(() => crm.portalReset(fg.reset_token, "New-client-pass-2"), /expired/);
}
// lifecycle and lead capture
{
  const OPS = U.fatima, before = store.size("leads");
  const lost = store.all("leads").find(l => l.stage === "lost" && l.email && !l.client_id && !l.dnc);
  const r1 = crm.portalRegister({ first_name: lost.first_name, last_name: lost.last_name, email: lost.email, dial_code: lost.dial_code, phone: lost.phone, country: lost.country, password: "Client-pass-2026", terms: true, utm_source: "facebook", utm_campaign: "winback" });
  assert.strictEqual(r1.client.lead_id, lost.id, "registration matched the lost lead"); assert.strictEqual(store.size("leads"), before, "no duplicate lead");
  assert(["new", "contacted"].includes(store.get("leads", lost.id).stage), "lost lead reopened"); assert(store.get("leads", lost.id).owner_id);
  assert(store.all("jobs").some(j => j.rule_id === "auto_portal_signup" && j.lead_id === lost.id), "sign-up automation scheduled");
  const ph = store.all("leads").find(l => l.stage === "contacted" && !l.client_id && l.phone_key.length >= 7 && !l.dnc);
  const r2 = crm.portalRegister({ first_name: ph.first_name, last_name: ph.last_name, email: "other." + ph.email, dial_code: ph.dial_code, phone: ph.phone, country: ph.country, password: "Client-pass-2026", terms: true });
  assert.strictEqual(r2.client.lead_id, ph.id, "matched by phone when the email differs");
  const r3 = crm.portalRegister({ first_name: "Direct", last_name: "Signup", email: "direct.signup@example.com", dial_code: "+254", phone: "700111222", country: "Kenya", password: "Client-pass-2026", terms: true, utm_source: "google", utm_medium: "cpc", utm_campaign: "brand", gclid: "abc", landing: "https://abselglobal.com/?utm_source=google" });
  const nl3 = store.get("leads", r3.client.lead_id); assert(nl3 && nl3.utm_source === "google" && nl3.utm_campaign === "brand" && nl3.gclid === "abc" && nl3.owner_id, "direct sign-up becomes an attributed, assigned lead");
  assert.strictEqual(crm.getLead(MGR, nl3.id).lifecycle.id, "registered");
  const segs = crm.listLifecycle(MGR, { segment: "incomplete" }); assert(segs.rows.some(r => r.id === nl3.id) && segs.segments.find(x => x.id === "incomplete").n >= 1);
  T += 25 * 3600e3; crm.tick(); assert(store.all("jobs").some(j => j.rule_id === "auto_reg_incomplete" && j.lead_id === nl3.id), "incomplete registration reminder");
  // funded via the client area, then trading detected by the daily import
  { const C3 = { id: r3.client.id }, PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    crm.portalVerifyEmail(r3.verify_token); crm.portalUploadKyc(C3, { kind: "kyc_id", data: PNG }); crm.portalUploadKyc(C3, { kind: "kyc_address", data: PNG });
    assert.strictEqual(crm.getLead(MGR, nl3.id).lifecycle.id, "kyc_pending"); crm.decideKyc(U.joy, C3.id, "approved");
    assert(store.all("jobs").some(j => j.rule_id === "auto_kyc_approved" && j.lead_id === nl3.id));
    const a3 = crm.portalRequestAccount(C3, { type: "stp", leverage: 100 }); crm.openAccount(OPS, a3.id, { login: "7400001" }); assert.strictEqual(crm.getLead(MGR, nl3.id).lifecycle.id, "account_open");
    const d3 = crm.portalDeposit(C3, { account_id: a3.id, method: "bank", amount: 300 }); crm.decidePayment(OPS, d3.id, "complete", { reference: "B-1" }); }
  const fundedRow = crm.listLifecycle(MGR, { segment: "funded_not_trading" }).rows.find(r => r.id === nl3.id);
  assert(fundedRow, "funded-not-trading list");
  const acc = store.all("accounts").find(a => a.client_id === fundedRow.client_id && a.kind === "live" && a.status === "open");
  T += 3 * 864e5; crm.tick(); assert(store.all("jobs").some(j => j.rule_id === "auto_funded_idle" && j.lead_id === fundedRow.id), "first-trade nudge");
  const imp = crm.importBalances(OPS, [{ login: acc.login, balance: 999, equity: 1010, lots: 1.5 }]); assert(imp.trading === 1);
  assert.strictEqual(crm.getLead(MGR, fundedRow.id).lifecycle.id, "trading", "trading started from import");
  assert(crm.listTradingAccounts(OPS, {}).rows.some(r => r.login === acc.login && r.activity === "active"));
  // merging keeps the client link
  const dupe = crm.createLead(crm.SYSTEM, { firstName: "Dup", lastName: "Copy", email: "dup.copy@example.com", dialCode: nl3.dial_code, phone: nl3.phone, country: "Kenya" });
  crm.mergeLeads(MGR, dupe.id, [nl3.id]); assert.strictEqual(store.get("clients", r3.client.id).lead_id, dupe.id, "client moved to the kept lead"); assert.strictEqual(store.get("leads", dupe.id).client_id, r3.client.id);
  const legacy = store.all("leads").find(l => l.stage === "funded" && !l.client_id && l.account_id);
  if (legacy) { const ri = crm.importBalances(OPS, [{ login: legacy.account_id, balance: 500, equity: 520 }]); assert(ri.leads === 1 && crm.getLead(MGR, legacy.id).lifecycle.id === "trading", "sales-opened accounts matched by login"); }
  // crypto gateway states (the server maps B2BINPAY callbacks to these)
  { const s0 = crm.getSettings(); crm.saveSettings(ADMIN, { portal: { methods: s0.portal.methods.map(m => m.id === "usdt" ? Object.assign({}, m, { gateway: "b2binpay", gateway_wallet: "11" }) : m) } });
    const C3 = { id: r3.client.id }, acc3 = store.all("accounts").find(a => a.client_id === C3.id && a.kind === "live");
    const g1 = crm.portalDeposit(C3, { account_id: acc3.id, method: "usdt", amount: 200 }); assert.strictEqual(g1.gateway.status, "creating");
    assert(!crm.listPayments(OPS, { type: "deposit", status: "open" }).find(p => p.id === g1.id).gateway.paid, "nothing paid yet");
    crm.gatewayAttach(g1.id, { ext_id: "900", address: "TXabc", network: "trc20", currency: "USDT", payment_page: "https://pay-sandbox.com/x", expires_at: new Date(T + 3600e3).toISOString(), target: 200 });
    crm.gatewayEvent(g1.id, { ext_id: "900", state: "partial", amount: 120, txid: "t1" }); let gp = store.get("payments", g1.id);
    assert(gp.status === "pending" && /Only 120/.test(gp.gateway.review), "partial payment flagged");
    assert.throws(() => crm.portalCancel(C3, g1.id), /already being processed/, "can't cancel once money arrived");
    crm.gatewayEvent(g1.id, { ext_id: "900", state: "paid", amount: 200, txid: "t2" }); gp = store.get("payments", g1.id); assert.strictEqual(gp.status, "paid");
    assert.strictEqual(crm.gatewayEvent(g1.id, { ext_id: "900", state: "paid", amount: 200, txid: "t2" }).duplicate, true, "duplicate callback ignored");
    crm.decidePayment(OPS, g1.id, "complete", {}); gp = store.get("payments", g1.id); assert(gp.status === "completed" && gp.amount === 200 && gp.ext_reference === "t2");
    const g2 = crm.portalDeposit(C3, { account_id: acc3.id, method: "usdt", amount: 90 }); crm.gatewayAttach(g2.id, { ext_id: "901", address: "TXdef", expires_at: new Date(T - 7200e3).toISOString(), target: 90 });
    crm.tick(); assert.strictEqual(store.get("payments", g2.id).status, "cancelled", "unpaid invoice closed after its window");
    crm.gatewayEvent("901", { ext_id: "901", state: "review", amount: 90, note: "late payment" }); assert.strictEqual(store.get("payments", g2.id).status, "pending", "late payment reopens for a decision");
    const g3 = crm.portalDeposit(C3, { account_id: acc3.id, method: "usdt", amount: 60 }); crm.gatewayFailed(g3.id, "timeout"); assert.strictEqual(store.get("payments", g3.id).status, "cancelled");
    crm.saveSettings(ADMIN, { portal: { methods: s0.portal.methods } }); }
  const br = crm.report(MGR, "business", { from: "2026-09-01", to: "2027-12-31" }); assert(br.kpi.registrations >= 3 && br.steps.length === 10 && br.book.length === 11 && br.queues && br.base.live_accounts > 0);
  assert.throws(() => crm.report(U.daniel, "business", {}), /access/i);
}
console.log("Journey:", { demos: demos.length, credited: B.filter(b => b.credited_at).length, converted: B.filter(b => b.status === "converted").length, conversion: jr.programme.conversion + "%", cost: jr.programme.total_cost, cost_per_ftd: jr.programme.cost_per_ftd });
console.log("Deposits:", { verified: verified.length, pending: store.all("deposits").filter(d => d.status === "pending").length, rejected: store.all("deposits").filter(d => d.status === "rejected").length }, "| reviews", store.size("reviews"), "| attendance days", store.size("attendance"), "| broadcast msgs", store.all("messages").filter(m => m.broadcast_id).length);
console.log("✔ all checks passed");

/* ---------- demo data for the client area: a few clients at every step, so each ops queue has work ---------- */
{
  const OPS = U.fatima, OPS2 = U.ali, CMP = U.joy, PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const pool = store.all("leads").filter(l => l.email && !l.client_id && !l.dnc && ["contacted", "qualified", "registered", "kyc", "funded"].includes(l.stage)).sort((a, b) => ({ kyc: 0, registered: 1, qualified: 2, contacted: 3, funded: 4 })[a.stage] - ({ kyc: 0, registered: 1, qualified: 2, contacted: 3, funded: 4 })[b.stage]).slice(0, 18);
  pool.forEach((l, i) => {
    T += 7 * 60000;
    const r = crm.portalRegister({ first_name: l.first_name, last_name: l.last_name, email: l.email, dial_code: l.dial_code, phone: l.phone, country: l.country, password: "Client-pass-2026", terms: true }), C = { id: r.client.id };
    if (i % 6 !== 5) crm.portalVerifyEmail(r.verify_token);
    if (i % 6 === 5) return;                                                     // registered, email not verified
    crm.portalUploadKyc(C, { kind: "kyc_id", name: "id-card.png", data: PNG });
    if (i % 6 === 4) return;                                                     // documents half done
    crm.portalUploadKyc(C, { kind: "kyc_address", name: "utility-bill.png", data: PNG });
    if (i % 6 === 3) return;                                                     // waiting for KYC review
    crm.decideKyc(CMP, C.id, "approved");
    const t = ["ecn", "stp", "islamic", "ecn"][i % 4], a = crm.portalRequestAccount(C, { type: t, leverage: 100 });
    if (i % 6 === 2) return;                                                     // waiting for an account
    crm.openAccount(OPS, a.id, { login: String(7100000 + i), server: "AbselGlobal-Live", password: "Mt5-" + (1000 + i) });
    const amt = [250, 500, 1000, 300, 2000, 750][i % 6];
    const d = crm.portalDeposit(C, { account_id: a.id, method: ["usdt", "bank", "card", "skrill"][i % 4], amount: amt, proof: { name: "receipt.png", data: PNG } });
    if (i % 6 === 1) return;                                                     // deposit waiting for operations
    crm.decidePayment(OPS, d.id, "complete", { reference: "AM-" + (880000 + i) });
    if (i % 4 === 2 || i === 12) crm.importBalances(OPS, [{ login: String(7100000 + i), balance: amt * 1.08, equity: amt * 1.1, lots: 1.2 + i / 10 }]);
    if (i === 0) { crm.importBalances(OPS, [{ login: String(7100000 + i), balance: 3400, equity: 3350 }]); const w = crm.portalWithdraw(C, { account_id: a.id, method: "usdt", amount: 1200, details: "USDT TRC20 TQx8...9k" }); crm.decidePayment(OPS, w.id, "approve"); }
    if (i === 6) { const w = crm.portalWithdraw(C, { account_id: a.id, method: "bank", amount: 150, details: "IBAN KE12 3456 7890 · Equity Bank" }); }
  });
}

/* ---------- payment history for the Payment performance report: card, crypto and manual attempts over the last weeks ---------- */
{
  const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v]), OPS = U.fatima, s0 = crm.getSettings(), back = (iso, ms) => iso ? new Date(Date.parse(iso) - ms).toISOString() : iso;
  crm.saveSettings(ADMIN, { portal: { methods: s0.portal.methods.map(m => m.id === "usdt" ? Object.assign({}, m, { gateway: "b2binpay", gateway_wallet: "11" }) : m.id === "card" ? Object.assign({}, m, { gateway: "cyrafa" }) : m) } });
  const accs = store.all("accounts").filter(a => a.kind === "live" && a.status === "open" && a.client_id);
  const DECLINE = ["Insufficient funds", "Do not honour", "3-D Secure authentication failed", "Card not enabled for online payments", "Insufficient funds"];
  let n = 0;
  for (let k = 0; k < 64; k++) {
    const a = accs[k % accs.length], x = store.get("clients", a.client_id), C = { id: x.id }, stuck = k % accs.length >= accs.length - 2, r = stuck ? 70 : (k * 37) % 100, daysAgo = 1 + (k * 7) % 20;
    if (!x.address) { x.address = "12 Market Street"; x.city = "Dubai"; store.put("clients", x); }
    const m = stuck || k % 5 < 3 ? "card" : k % 5 === 3 ? "usdt" : "bank", amt = [100, 250, 500, 150, 1000, 300][k % 6];
    let p;
    try { p = crm.portalDeposit(C, { account_id: a.id, method: m, amount: amt, billing: { address1: x.address, city: x.city } }); } catch (e) { continue; }
    n++;
    if (m === "card") {
      crm.gatewayAttach(p.id, { ext_id: "cs" + k, payment_page: "https://checkout.cyrafa.com/s/cs" + k, expires_at: new Date(T + 900e3).toISOString(), currency: "AED", target: (amt * 3.6725).toFixed(2), rate: 3.6725 });
      if (r < 58) { crm.gatewayEvent(p.id, { ext_id: "cs" + k, state: "paid", amount: amt, amount_local: amt * 3.6725, amount_after_fees: amt * 3.6725 * 0.965, txid: "TX" + (500000 + k) }); if (r < 52) crm.decidePayment(OPS, p.id, "complete", {}); }
      else if (r < 82) crm.gatewayEvent(p.id, { ext_id: "cs" + k, state: "failed", note: DECLINE[k % DECLINE.length] });
      else { const q = store.get("payments", p.id); q.gateway.returned = r < 92 ? "cancel" : undefined; Object.assign(q, { status: "cancelled", reject_reason: "The card payment wasn't completed.", completed_at: new Date(T + 1800e3).toISOString() }); q.gateway.status = "expired"; store.put("payments", q); }
    } else if (m === "usdt") {
      crm.gatewayAttach(p.id, { ext_id: "bz" + k, address: "TQdemo" + k, network: "trc20", currency: "USDT", expires_at: new Date(T + 3600e3).toISOString(), target: amt });
      if (r < 70) { crm.gatewayEvent(p.id, { ext_id: "bz" + k, state: "paid", amount: amt, txid: "0x" + (k * 991).toString(16) }); crm.decidePayment(OPS, p.id, "complete", {}); }
      else crm.gatewayEvent(p.id, { ext_id: "bz" + k, state: "expired" });
    } else { if (r < 80) crm.decidePayment(OPS, p.id, "complete", { reference: "AM-" + (770000 + k) }); else if (r < 90) crm.portalCancel(C, p.id); }
    // spread over the last weeks: the client paid within minutes, operations credited within hours
    const q = store.get("payments", p.id), dt = daysAgo * 864e5, credit = (0.5 + (k % 7)) * 36e5;
    q.created_at = back(q.created_at, dt);
    if (q.gateway) { arr(q.gateway.events).forEach((e, i) => { e.at = new Date(Date.parse(q.created_at) + (3 + (k % 9) * 2 + i) * 60e3).toISOString(); }); if (q.gateway.created_at) q.gateway.created_at = q.created_at; }
    if (q.completed_at) q.completed_at = new Date(Date.parse(q.created_at) + (q.status === "completed" ? credit : 20 * 60e3)).toISOString();
    store.put("payments", q);
    x.deposit_views = arr(x.deposit_views).concat([q.created_at]).sort(); store.put("clients", x);
  }
  // clients who opened the deposit page without starting a deposit
  store.all("clients").filter(x => (x.kyc || {}).status === "approved").slice(0, 14).forEach((x, i) => { x.deposit_views = arr(x.deposit_views).concat([new Date(T - (1 + i) * 864e5).toISOString()]).sort(); store.put("clients", x); });
  crm.saveSettings(ADMIN, { portal: { methods: s0.portal.methods } });
  const pr = crm.report(ADMIN, "payments", { from: new Date(T - 30 * 864e5).toISOString().slice(0, 10), to: new Date(T + 864e5).toISOString().slice(0, 10) });
  assert(pr.total.attempts >= n && pr.by_method.length >= 3 && pr.total.success_rate > 0 && pr.total.success_rate < 100, "payment report rates");
  const card = pr.by_method.find(x => x.id === "card"); assert(card && card.by.declined > 0 && card.providers.includes("cyrafa") && card.median_pay_min != null, "card stats");
  assert(pr.funnel[0].n >= pr.funnel[1].n && pr.funnel[1].n >= pr.funnel[2].n && pr.funnel[2].n >= pr.funnel[3].n, "payment funnel never goes up");
  assert(pr.reasons.some(x => /Declined: Insufficient funds/.test(x.reason)) && pr.recovery.failed_clients > 0, "failure reasons and recovery");
  assert.throws(() => crm.report(U.daniel, "payments", {}), /access|managers/i);
  console.log("Payments:", { attempts: pr.total.attempts, success: pr.total.success_rate + "%", card: card.success_rate + "%", recovered: pr.recovery.recovered + "/" + pr.recovery.failed_clients });
}

/* ---------- MT5 Web API read-only sync: fake MT5 rows through the core (the server reads MT5; the core stays network-free) ---------- */
{
  const OPS = U.fatima, range = { from: 7000000, to: 7999999 }, iso = ms => new Date(ms).toISOString();
  const acc = store.all("accounts").filter(a => a.kind === "live" && a.status === "open" && /^71/.test(a.login)).sort((a, b) => a.login.localeCompare(b.login))[0];
  const lots0 = Number(acc.lots_total) || 0, dep = store.all("payments").find(p => p.account_id === acc.id && p.type === "deposit" && p.status === "completed");
  // balances: our account updated, an unknown login listed for operations, a login outside the range refused
  const ra = crm.mt5IngestAccounts([{ login: acc.login, group: "real\\absel-global\\ecn", leverage: 200, balance: 1234.5, equity: 1240.25, margin: 50, margin_free: 1190.25, margin_level: 2480.5 }, { login: "7900001", group: "real\\absel-global\\stp", name: "Walk-in trader", email: "walkin@example.com", balance: 75 }, { login: "123", balance: 1 }], { range });
  const a1 = store.get("accounts", acc.id);
  assert(a1.balance === 1234.5 && a1.equity === 1240.25 && a1.margin_free === 1190.25 && a1.leverage === 200 && a1.mt5_seen_at, "MT5 balances update the account");
  assert(ra.refused === 1 && ra.unlinked === 1 && !store.all("accounts").some(a => a.login === "7900001"), "unknown login listed, never linked automatically; outside the range refused");
  assert.strictEqual(crm.listMt5Unlinked(OPS).length, 1); assert.throws(() => crm.listMt5Unlinked(U.daniel), /operations/);
  // deals: a balance deal with our reference, one made by hand in MT5, and a 2-lot trade; the same rows twice (sync overlap)
  const t = T - 5 * 3600e3, rows = [
    { ticket: "800001", login: acc.login, time: iso(t), action: 2, entry: 0, profit: dep.amount, comment: "DEP " + dep.reference },
    { ticket: "800002", login: acc.login, time: iso(t + 60e3), action: 2, entry: 0, profit: 25, comment: "correction" },
    { ticket: "800003", login: acc.login, time: iso(t + 3600e3), action: 0, entry: 0, symbol: "XAUUSD", lots: 2, price: 2400, position_id: "61" },
    { ticket: "800004", login: acc.login, time: iso(t + 7200e3), action: 1, entry: 1, symbol: "XAUUSD", lots: 2, price: 2410, profit: 2000, commission: -14, position_id: "61" },
    { ticket: "800005", login: "7900001", time: iso(t + 7300e3), action: 0, entry: 0, symbol: "EURUSD", lots: 0.1, position_id: "62" },
  ];
  const d1 = crm.mt5IngestDeals(rows), d2 = crm.mt5IngestDeals(rows);
  assert(d1.new === 5 && d2.new === 0 && d2.duplicate === 5 && store.all("mt5_deals").length === 5, "deals stored once, no duplicates on re-sync");
  const a2 = store.get("accounts", acc.id), md = store.get("mt5_deals", "MD800004");
  assert(Math.abs(a2.lots_total - (lots0 + 2)) < 1e-9 && a2.trading_started_at && a2.last_trade_at >= iso(t + 7200e3), "trading activity fed from deals (lots counted once, latest trade kept)");
  assert(md.account_id === acc.id && md.client_id === acc.client_id && md.lots === 2 && md.profit === 2000 && md.commission === -14, "deal fields");
  crm.mt5IngestDeals([Object.assign({}, rows[3], { profit: 1990 })]); assert.strictEqual(store.get("mt5_deals", "MD800004").profit, 1990, "a corrected deal is updated, not duplicated");
  // open positions snapshot
  crm.mt5IngestPositions([{ position_id: "63", login: acc.login, symbol: "EURUSD", action: 0, lots: 0.5, profit: -12.5, opened_at: iso(T - 600e3) }], [acc.login]);
  assert(store.get("accounts", acc.id).positions_open === 1 && store.get("accounts", acc.id).floating === -12.5, "open positions on the account");
  crm.mt5IngestPositions([], [acc.login]); assert(store.get("accounts", acc.id).positions_open === 0 && !store.get("mt5_positions", "MP63"), "closed positions leave the snapshot");
  // reconciliation: our deposit matched by its reference; the hand-made correction shows as made outside the system
  const rec = crm.mt5Reconcile(OPS, { from: "2026-01-01", to: "2027-01-01" }), rr = rec.rows.find(r => r.login === acc.login);
  assert(rr.matched >= 1 && rr.outside.some(o => o.ticket === "800002" && o.amount === 25) && !rr.outside.some(o => o.ticket === "800001"), "reconciliation matches by reference");
  assert.throws(() => crm.mt5Reconcile(U.sara, {}), /operations/);
  // sync failures alert operations once, and recovery is announced
  const before = store.all("notifications").filter(n => n.user_id === OPS.id && /MT5 sync/.test(n.text)).length;
  crm.mt5SyncDone({ ok: false, error: "MT5 didn't answer within 20s" }); crm.mt5SyncDone({ ok: false, error: "MT5 didn't answer within 20s" }); crm.mt5SyncDone({ ok: true });
  assert.strictEqual(store.all("notifications").filter(n => n.user_id === OPS.id && /MT5 sync/.test(n.text)).length - before, 2, "one alert when it breaks, one when it's back");
  // operations links the unknown login to a client
  const cl = store.get("clients", acc.client_id); crm.mt5LinkAccount(OPS, "UL7900001", { client_id: cl.id, type: "stp" });
  assert(store.all("accounts").some(a => a.login === "7900001" && a.client_id === cl.id) && store.get("mt5_deals", "MD800005").client_id === cl.id, "linked by operations; its deals follow");
  assert(!(crm.getSettings().mt5 || {}).account_creation_enabled && !("writes_enabled" in (crm.getSettings().mt5 || {})), "MT5 account creation is off by default; there is no MT5 money switch");
  console.log("MT5 sync:", { deals: store.size("mt5_deals"), reconciled_logins: rec.rows.length, outside: rec.totals.outside });
}

/* ---------- Phase B: our system never moves money in MT5. Operations does it in MT5 Manager with our reference in the comment;
              the synced balance deals (fake MT5 rows here, no network) are matched, and a person confirms. ---------- */
{
  const OPS = U.fatima, OPS2 = U.ali, iso = ms => new Date(ms).toISOString();
  assert(!crm.mt5PaymentAction && !crm.mt5BonusCredit && !crm.mt5SettleFromDeals, "no MT5 money function in the core");
  const acc = store.all("accounts").filter(a => a.kind === "live" && a.status === "open" && /^71/.test(a.login)).sort((a, b) => a.login.localeCompare(b.login))[1];
  const x = store.get("clients", acc.client_id), C = { id: x.id };
  // manual mode (this simulation): no matching, today's flow unchanged
  const m0 = crm.portalDeposit(C, { account_id: acc.id, method: "bank", amount: 200 });
  assert.strictEqual(crm.listPayments(OPS, { status: "open" }).find(p => p.id === m0.id).mt5_match, null, "manual mode: no MT5 matching");
  crm.decidePayment(OPS, m0.id, "complete", { reference: "BANK-M0" }); assert.strictEqual(store.get("payments", m0.id).status, "completed", "manual mode: confirmed as today");
  const api = createCRM({ store, now: () => new Date(T), mt5Mode: () => "api", random: n => new Uint8Array(require("crypto").randomBytes(n)), hashPassword: p => "x:" + p, verifyPassword: (p, h) => h === "x:" + p });
  let tk = 991000; const deal = (login, amount, comment) => ({ ticket: String(++tk), login, time: iso(T), action: 2, profit: amount, comment });
  const match = id => api.listPayments(OPS, { status: "open" }).find(p => p.id === id).mt5_match;
  // deposit: credited in MT5 Manager with DEP <reference> → seen in MT5 → one click
  const dp = crm.portalDeposit(C, { account_id: acc.id, method: "bank", amount: 400 });
  api.mt5IngestDeals([deal(acc.login, 400, "DEP " + dp.reference)]);
  assert.strictEqual(store.get("payments", dp.id).status, "pending", "a matched deal is never applied on its own");
  let m = match(dp.id); assert(m.ok && m.tickets[0] === String(tk), "Seen in MT5");
  assert.throws(() => api.decidePayment(U.sara, dp.id, "complete", { mt5_ticket: m.tickets[0] }), /operations/, "only operations confirms");
  api.decidePayment(OPS, dp.id, "complete", { mt5_ticket: m.tickets[0] });
  const p1 = store.get("payments", dp.id); assert(p1.status === "completed" && p1.ext_reference === "MT5 deal #" + tk && p1.completed_by === OPS.id && p1.mt5.matched, "confirmed: the deal ticket is the reference");
  // the amount differs: flagged; confirming needs a reason
  const dp2 = crm.portalDeposit(C, { account_id: acc.id, method: "bank", amount: 150 });
  api.mt5IngestDeals([deal(acc.login, 140, "DEP " + dp2.reference)]);
  assert.strictEqual(match(dp2.id).legs[0].state, "amount", "amount mismatch flagged");
  assert.throws(() => api.decidePayment(OPS, dp2.id, "complete", { reference: "BANK-10" }), /Say why/, "no reason, no confirm");
  api.decidePayment(OPS, dp2.id, "complete", { amount: 140, reference: "BANK-10", no_match_reason: "Bank fee of $10" });
  assert(store.get("payments", dp2.id).status === "completed" && store.get("payments", dp2.id).mt5.reason === "Bank fee of $10", "confirmed with the reason logged");
  // withdrawal over the limit: two people approve (as before); operations debits in MT5 Manager; Mark paid with the payout reference
  const lim = crm.getSettings().portal.second_approval_over, bal = store.get("accounts", acc.id); bal.balance = 5000; bal.balance_at = iso(T); store.put("accounts", bal);
  const wd = crm.portalWithdraw(C, { account_id: acc.id, method: "bank", amount: lim + 100, details: "IBAN KE00 1234" });
  api.decidePayment(OPS, wd.id, "approve"); assert.strictEqual(store.get("payments", wd.id).status, "first_approved");
  api.decidePayment(OPS2, wd.id, "approve"); assert.strictEqual(store.get("payments", wd.id).status, "approved", "two approvals above the limit");
  api.mt5IngestDeals([deal(acc.login, -(lim + 100), "WD " + wd.reference)]);
  m = match(wd.id); assert(m.ok, "Debit seen in MT5");
  assert.throws(() => api.decidePayment(OPS, wd.id, "complete", { mt5_ticket: m.tickets[0] }), /payout reference/);
  api.decidePayment(OPS, wd.id, "complete", { mt5_ticket: m.tickets[0], reference: "SWIFT-1" }); assert.strictEqual(store.get("payments", wd.id).status, "completed");
  // transfer: both sides matched
  const acc2 = store.all("accounts").find(a => a.client_id === x.id && a.kind === "live" && a.status === "open" && a.id !== acc.id) || (() => { const r = crm.portalRequestAccount(C, { type: "stp", leverage: 100 }); crm.openAccount(OPS, r.id, { login: "7199999" }); return store.get("accounts", r.id); })();
  const tr = crm.portalTransfer(C, { account_id: acc.id, to_account_id: acc2.id, amount: 50 });
  api.mt5IngestDeals([deal(acc.login, -50, "TRF-OUT " + tr.reference)]); assert(!match(tr.id).ok && match(tr.id).legs[1].state === "missing", "one side only: not confirmable yet");
  api.mt5IngestDeals([deal(acc2.login, 50, "TRF-IN " + tr.reference)]); m = match(tr.id); assert(m.ok && m.tickets.length === 2, "both sides seen");
  api.decidePayment(OPS, tr.id, "complete", { mt5_ticket: m.tickets.join(",") }); assert.strictEqual(store.get("payments", tr.id).status, "completed");
  // two deals with one reference: flagged, none picked; a reference we don't know: counted for operations
  const dp3 = crm.portalDeposit(C, { account_id: acc.id, method: "bank", amount: 120 });
  api.mt5IngestDeals([deal(acc.login, 120, "DEP " + dp3.reference), deal(acc.login, 120, "DEP " + dp3.reference)]);
  assert(match(dp3.id).legs[0].state === "duplicate" && !match(dp3.id).tickets.length, "duplicate reference flagged, none picked");
  api.mt5IngestDeals([deal(acc.login, 75, "DEP D-ZZZZZZ")]); assert(api.opsOverview(OPS).mt5.unknown_refs >= 1, "unknown reference counted");
  api.decidePayment(OPS, dp3.id, "reject", { reason: "Duplicate request" });
  console.log("MT5 matching:", { confirmed: store.all("payments").filter(p => p.mt5 && p.mt5.matched).length, without_match: store.all("payments").filter(p => p.mt5 && p.mt5.matched === false).length });
}

/* ---------- IB / partner programme: 4 IBs (a master with 2 sub-IBs, 1 independent), referred clients at every stage,
              deals from fake MT5 rows, holds, CPA, month close and payouts. Runs 40 days back so the month can be closed. ---------- */
{
  const OPS = U.fatima, OPS2 = U.ali, CMP = U.joy, T0 = T, iso = ms => new Date(ms).toISOString(), PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const PT = crm.saveUser(ADMIN, { name: "Lina Farah", username: "lina", role: "partnerships", team: "Partnerships", email: "lina@abselglobal.com", accepts_leads: false, password: "demo-pass-123", must_change_password: false });
  T = T0 - 40 * 864e5;
  let ph = 600100;
  const mk = (first, last, country, o = {}) => {
    T += 60e3; const email = (first + "." + last + "@example.com").toLowerCase().replace(/[^a-z.@]/g, "");
    const r = crm.portalRegister({ first_name: first, last_name: last, email, dial_code: "+254", phone: String(700000000 + ph++), country, password: "Client-pass-2026", terms: true, ib: o.ib || "", utm_source: o.utm_source || "" }, { ip: o.ip || "41.90." + (ph % 250) + ".7" });
    const C = { id: r.client.id }; crm.portalVerifyEmail(r.verify_token);
    if (o.stage === "signed_up") return { C, x: store.get("clients", C.id) };
    crm.portalUploadKyc(C, { kind: "kyc_id", data: PNG }); crm.portalUploadKyc(C, { kind: "kyc_address", data: PNG }); crm.decideKyc(CMP, C.id, "approved");
    let acc = null; if (o.login) { const q = crm.portalRequestAccount(C, { type: o.type || "ecn", leverage: 100 }); crm.openAccount(OPS, q.id, { login: o.login }); acc = store.get("accounts", q.id); }
    if (o.deposit) { const d = crm.portalDeposit(C, { account_id: acc.id, method: "bank", amount: o.deposit }); crm.decidePayment(OPS, d.id, "complete", { reference: "BNK-" + ph }); }
    return { C, x: store.get("clients", C.id), acc, lead: store.get("leads", store.get("clients", C.id).lead_id) };
  };
  const apply = (p, d) => crm.portalIbApply(p.C, Object.assign({ promotion: "Telegram trading group and YouTube channel", expected_clients: 20, accept: true }, d), { ip: "10.0.0.1" });
  const ptOf = p => store.all("partners").find(z => z.client_id === p.C.id);
  // plans
  const std = store.get("ib_plans", "PL_standard"); assert(std && std.rates.length === 6, "a starting plan exists");
  const masterPlan = crm.saveIbPlan(PT, { name: "Master", rates: [{ account_type: "*", symbol_group: "forex", per_lot: 6 }, { account_type: "*", symbol_group: "metals", per_lot: 7 }, { account_type: "*", symbol_group: "indices", per_lot: 4 }], override_per_lot: [{ symbol_group: "forex", per_lot: 2 }, { symbol_group: "metals", per_lot: 2.5 }, { symbol_group: "indices", per_lot: 1 }, { symbol_group: "other", per_lot: 0.5 }], min_hold_seconds: 120, holdback_days: 30 });
  const cpaPlan = crm.saveIbPlan(PT, { name: "CPA 150", rates: [{ account_type: "*", symbol_group: "forex", per_lot: 4 }, { account_type: "ecn", symbol_group: "forex", per_lot: 3 }], cpa: { enabled: true, amount: 150, min_deposit: 200, min_lots: 1, within_days: 30 }, min_hold_seconds: 120, holdback_days: 30 });
  assert.throws(() => crm.saveIbPlan(U.fatima, { name: "x" }), /partnerships/);
  const pv = crm.ibPlanPreview(PT, std.id, "EURUSD", 1, "ecn", masterPlan.id); assert(pv.ib === 5 && pv.master === 2 && pv.symbol_group === "forex", "plan preview");
  // four partners
  const M = mk("Hassan", "Omondi", "Kenya", { login: "7300001", deposit: 500 }), S1 = mk("Grace", "Achieng", "Kenya", { login: "7300002", ip: "41.80.1.1" }), S2 = mk("Peter", "Mwangi", "Kenya", { ip: "41.81.2.2" }), IN = mk("Aisha", "Bello", "Nigeria");
  const notKyc = mk("Tom", "Early", "Kenya", { stage: "signed_up" }); assert.throws(() => apply(notKyc, {}), /documents must be approved/);
  apply(M, {}); assert.throws(() => apply(M, {}), /being reviewed/);
  assert.throws(() => crm.decidePartner(U.sara, ptOf(M).id, { decision: "approve", plan_id: std.id }), /partnerships/);
  crm.decidePartner(PT, ptOf(M).id, { decision: "approve", plan_id: masterPlan.id, can_recruit: true });
  const pm = ptOf(M); assert(pm.status === "approved" && /^[A-Z0-9]{6,10}$/.test(pm.code), "approved with a code");
  apply(S1, { via: pm.code }); crm.decidePartner(PT, ptOf(S1).id, { decision: "approve", plan_id: std.id });
  assert.strictEqual(ptOf(S1).parent_id, pm.id, "sub-IB recruited through the master's link gets the master");
  apply(S2, { kind: "company", company: { name: "Mwangi Capital Ltd", reg_no: "PVT-2026-118", country: "Kenya" } });
  assert.throws(() => crm.decidePartner(PT, ptOf(S2).id, { decision: "approve", plan_id: std.id }), /Compliance must approve/);
  crm.portalUploadKyc(S2.C, { kind: "ib_company_reg", name: "certificate.png", data: PNG });
  assert.strictEqual(store.get("clients", S2.C.id).kyc.status, "approved", "company documents don't change the IB's own KYC");
  crm.reviewPartnerDocs(CMP, ptOf(S2).id, true, "Certificate checked");
  crm.decidePartner(PT, ptOf(S2).id, { decision: "approve", plan_id: std.id, parent_id: pm.id });
  apply(IN, {}); crm.decidePartner(PT, ptOf(IN).id, { decision: "approve", plan_id: cpaPlan.id });
  assert.throws(() => crm.updatePartner(PT, ptOf(IN).id, { parent_id: ptOf(S1).id, reason: "x" }), /sub-IB/, "two levels only");
  const RJ = mk("Ray", "Spammer", "Ghana"); apply(RJ, {}); assert.throws(() => crm.decidePartner(PT, ptOf(RJ).id, { decision: "reject" }), /Say why/);
  crm.decidePartner(PT, ptOf(RJ).id, { decision: "reject", reason: "Promotion method not allowed" });
  const ps1 = ptOf(S1), ps2 = ptOf(S2), pin = ptOf(IN);
  // links and clicks
  assert(crm.ibClick(ps1.code, "summer", "h1").counted && !crm.ibClick(ps1.code, "summer", "h1").counted && crm.ibClick(ps1.code, "", "h2").counted, "clicks counted once per visitor");
  assert(!crm.ibClick("NOPE123", "", "h3").ok, "unknown code");
  // attribution: from the register form (code) and from the lead API (link parameter)
  const A = mk("Brian", "Kariuki", "Kenya", { ib: ps1.code, login: "7300011", deposit: 1000 });
  assert(A.x.partner_id === ps1.id && A.lead.partner_id === ps1.id && A.lead.ib_client && A.lead.utm_source === "ib" && A.lead.utm_campaign === ps1.code, "registered with the code: attributed");
  const apiLead = crm.createLead(crm.SYSTEM, { first_name: "Faith", last_name: "Njeri", email: "faith.njeri@example.com", dial_code: "+254", phone: "711222333", country: "Kenya", partner: ps2.code, utm: { utm_source: "telegram" } }, { source: "api", requireEmail: false });
  assert(apiLead.partner_id === ps2.id && apiLead.ib_client && apiLead.utm_source === "telegram", "lead API with partner code: attributed, first-touch source kept");
  const dupLead = crm.createLead(crm.SYSTEM, { first_name: "Faith", last_name: "Njeri", email: "faith.njeri@example.com", dial_code: "+254", phone: "711222333", country: "Kenya", partner: pin.code }, { source: "api", requireEmail: false });
  assert(dupLead.duplicate_of === apiLead.id && !dupLead.partner_id, "a duplicate keeps the first attribution");
  // self-referral: the IB's own phone with another email
  const selfLead = crm.createLead(crm.SYSTEM, { first_name: "Grace", last_name: "A", email: "grace.second@example.com", dial_code: S1.x.dial_code, phone: S1.x.phone, country: "Kenya", ib: ps1.code }, { source: "web" });
  assert(!selfLead.partner_id && !selfLead.ib_client, "self-referral blocked");
  // referred clients at every stage
  const Bs = mk("Kevin", "Otieno", "Kenya", { ib: ps2.code, stage: "signed_up" });
  const Bk = mk("Mercy", "Wambui", "Kenya", { ib: ps2.code });
  const Bf = mk("Joseph", "Kimani", "Kenya", { ib: ps2.code, ip: "41.81.2.2", login: "7300021", deposit: 400 }); // shares the IB's sign-up IP
  const Bd = mk("Rose", "Atieno", "Kenya", { ib: ps2.code, login: "7300022", deposit: 250 });                 // funded, not trading
  const Cc = mk("Ngozi", "Eze", "Nigeria", { ib: pin.code, login: "7300031", deposit: 300 });
  const Cx = mk("Emeka", "Obi", "Nigeria", { ib: pin.code, login: "7300032", deposit: 250 });
  assert([Bs, Bk, Bf, Bd].every(p => store.get("clients", p.C.id).partner_id === ps2.id), "company sub-IB has clients at every stage");
  // the master's own account moved under its sub-IB (reassign, logged): its trades must never pay
  assert.throws(() => crm.ibReassignClient(U.sara, M.C.id, ps1.id, "x"), /partnerships manager/);
  assert.throws(() => crm.ibReassignClient(PT, M.C.id, ps1.id, ""), /reason/);
  crm.ibReassignClient(PT, M.C.id, ps1.id, "Test of own-account rule");
  assert(store.get("partners", ps1.id).audit.some(a => a.action === "client_moved_in") && store.all("activities").some(a => a.lead_id === M.x.lead_id && /Partner changed/.test(a.data.label || "")), "reassign logged");
  // deals (fake MT5 rows): open + close pairs
  let tk = 880000; const t0 = Date.parse(store.get("clients", A.C.id).partner_locked_at) + 3600e3;
  const trade = (acc, sym, lots, openAt, secs) => { const pos = String(++tk); return [{ ticket: String(++tk), login: acc.login, time: iso(openAt), action: 0, entry: 0, symbol: sym, lots, position_id: pos }, { ticket: String(++tk), login: acc.login, time: iso(openAt + secs * 1000), action: 1, entry: 1, symbol: sym, lots, profit: 10, position_id: pos }]; };
  const rows = [].concat(trade(A.acc, "EURUSD", 2, t0, 900), trade(A.acc, "XAUUSD", 1, t0 + 7200e3, 600), trade(A.acc, "US30", 0.5, t0 + 9000e3, 300), trade(A.acc, "GBPUSD", 1, t0 + 10000e3, 60),
    trade(Bf.acc, "EURUSD", 1, t0 + 11000e3, 400), trade(M.acc, "EURUSD", 3, t0 + 12000e3, 400), trade(Cc.acc, "EURUSD", 1.2, t0 + 13000e3, 500), trade(Cx.acc, "EURUSD", 1, t0 + 14000e3, 500));
  T = t0 + 20000e3; crm.mt5IngestDeals(rows);
  const L = id => store.all("commissions").filter(l => l.partner_id === id && l.kind === "lot");
  const sumOf = (ls, f) => Math.round(ls.filter(f).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const tA = new Set(rows.slice(0, 8).filter(r => r.entry === 1).map(r => r.ticket));
  assert.strictEqual(sumOf(L(ps1.id), l => tA.has(l.deal_ticket) && l.level === 1 && l.status === "pending"), 17.5, "level 1: 2×5 forex + 1×6 metals + 0.5×3 indices");
  assert.strictEqual(sumOf(L(pm.id), l => tA.has(l.deal_ticket) && l.level === 2 && l.status === "pending"), 7, "level 2 override: 2×2 + 1×2.5 + 0.5×1");
  const short = L(ps1.id).find(l => l.symbol === "GBPUSD"); assert(short.status === "held" && /under 2 minutes/.test(short.hold_reason) && L(pm.id).find(l => l.symbol === "GBPUSD").status === "held", "trade under 2 minutes held at both levels");
  const own = store.all("commissions").filter(l => l.client_id === M.C.id); assert(own.length === 2 && own.every(l => l.status === "held" && l.hold_code === "own"), "own-account trading never paid");
  const fp = L(ps2.id).find(l => l.client_id === Bf.C.id); assert(fp && fp.status === "held" && fp.hold_code === "fingerprint" && store.all("notifications").some(n => n.user_id === PT.id && /abuse/.test(n.text)), "shared IP held and flagged");
  assert.strictEqual(L(pin.id).find(l => l.client_id === Cc.C.id).rate, 3, "account-type rate beats the * rate");
  const nLines = store.size("commissions"); crm.mt5IngestDeals(rows); crm.ibProcessDeals(); assert.strictEqual(store.size("commissions"), nLines, "re-sync: no duplicate lines");
  // CPA: qualifies (first deposit ≥ 200, KYC, ≥ 1 lot) → held for the holdback → payable; the other one is charged back
  crm.tick();
  const cpa = id => store.all("commissions").find(l => l.kind === "cpa" && l.client_id === id);
  assert(cpa(Cc.C.id) && cpa(Cc.C.id).status === "held" && cpa(Cc.C.id).amount === 150 && cpa(Cx.C.id).status === "held", "CPA held for the holdback");
  assert(!store.all("commissions").some(l => l.kind === "cpa" && l.partner_id !== pin.id), "CPA only on plans that have it");
  const ftdX = store.all("payments").find(p => p.client_id === Cx.C.id && p.type === "deposit"); crm.markChargeback(OPS, ftdX.id, "Card chargeback");
  assert.strictEqual(cpa(Cx.C.id).status, "reversed", "chargeback reverses the CPA");
  T = T0;
  crm.tick(); assert(cpa(Cc.C.id).status === "pending" && cpa(Cc.C.id).period === crm.ibMonthReview(PT, {}).current, "after the holdback the CPA is payable");
  // month close
  const period = short.period, rv = crm.ibMonthReview(PT, { period });
  assert(rv.closable && rv.rows.some(r => r.partner_id === ps1.id && r.pending_amount === 17.5 && r.held === 2), "month review per IB (held: the short trade and the own-account trade)");
  assert.throws(() => crm.ibApprovePeriod(PT, ps1.id, rv.current), /ended/);
  crm.ibLineAction(PT, short.id, "release", "Scalping allowed for this client after review");
  crm.ibAdjust(PT, ps1.id, 40, "Marketing contribution", period);
  assert.throws(() => crm.ibLineAction(PT, short.id, "hold", ""), /reason/);
  const ap = crm.ibApprovePeriod(PT, ps1.id, period); assert(ap.approved === 5 && ap.amount === 62.5, "approved: 17.5 + released 5 + 40 adjustment; the own-account line stays held");
  assert(store.all("messages").some(m => m.template_id === "tpl_ib_statement" && m.lead_id === S1.x.lead_id), "statement email");
  crm.ibAdjust(PT, pm.id, 60, "Launch bonus", period); crm.ibApprovePeriod(PT, pm.id, period); crm.ibApprovePeriod(PT, pin.id, rv.current < "9999" ? period : period);
  // payouts: rejected restores the lines; paid marks them paid
  assert.throws(() => crm.portalIbPayout(S2.C, { method: "bank", details: "IBAN KE01 0001" }), /from \$50/);
  const p1 = crm.portalIbPayout(S1.C, { method: "bank", details: "IBAN KE12 3456 7890 · Equity Bank" });
  assert(p1.type === "ib_payout" && p1.amount === 62.5 && store.all("commissions").filter(l => l.payout_id === p1.id).length === 5, "payout of the approved balance");
  assert(!store.all("commissions").some(l => l.payout_id && l.status !== "approved"), "no pending or held line in a payout");
  assert.throws(() => crm.portalIbPayout(S1.C, { method: "bank", details: "IBAN KE12 3456 7890" }), /from \$50/, "nothing left to pay");
  crm.decidePayment(OPS, p1.id, "reject", { reason: "Bank details don't match the partner's name" });
  assert(store.all("commissions").filter(l => l.partner_id === ps1.id && l.status === "approved" && !l.payout_id).length === 5, "rejected payout: lines back to approved");
  const p2 = crm.portalIbPayout(S1.C, { method: "usdt", details: "TRC20 TXk9...4f" });
  assert.throws(() => crm.decidePayment(OPS, p2.id, "complete", { reference: "x" }), /Approve the withdrawal first|approvals/);
  crm.decidePayment(OPS, p2.id, "approve"); crm.decidePayment(OPS, p2.id, "complete", { reference: "USDT-0xab12" });
  assert(store.all("commissions").filter(l => l.payout_id === p2.id).every(l => l.status === "paid") && store.all("messages").some(m => m.template_id === "tpl_ib_payout"), "paid: lines paid, IB emailed");
  const p3 = crm.portalIbPayout(M.C, { method: "mt5", account_id: M.acc.id }); assert(p3.amount >= 50 && p3.status === "pending", "master's payout to its MT5 account waits for approval");
  // the Partner section shows no email, phone, documents, login or balance
  const views = JSON.stringify([crm.portalIbMe(S2.C), crm.portalIbDashboard(S2.C, { from: "2026-01-01", to: "2027-12-31" }), crm.portalIbClients(S2.C, { from: "2026-01-01", to: "2027-12-31" }), crm.portalIbCommissions(S2.C, { period }), crm.portalIbSubs(M.C, {}), crm.portalIbClients(M.C, {})]);
  [Bs, Bk, Bf, Bd].forEach(p => { const x = store.get("clients", p.C.id); assert(!views.includes(x.email) && !views.includes(x.phone) && !views.includes(x.last_name) && !views.includes(x.id), "partner views: no client email, phone, full name or id"); });
  assert(!views.includes("7300021") && !/"balance":\s*\d/.test(JSON.stringify(crm.portalIbClients(S2.C, {}))), "no MT5 login or balance");
  assert(crm.portalIbClients(S2.C, { from: "2026-01-01", to: "2027-12-31" }).map(r => r.status).sort().join() === "funded,kyc,signed_up,trading", "clients at every stage, masked");
  assert.strictEqual(crm.portalIbClients(S2.C, {})[0].name.split(" ")[1].length, 2, "first name and last initial");
  assert.throws(() => crm.portalIbDashboard({ id: Bs.C.id }, {}), /isn't active/, "a client who isn't a partner gets nothing");
  // sales integration: IB FTDs apart from agent targets
  const tg = crm.targets(MGR, { month: period }); assert(tg.total.ib_ftd >= 1, "IB-referred FTDs counted apart");
  { const all = store.all("deposits").filter(d => d.status === "verified" && crm.ibMonthReview(PT, { period }).period === period && new Date(Date.parse(d.deposited_at) + 240 * 60000).toISOString().slice(0, 7) === period);
    const ibN = all.filter(d => (store.get("leads", d.lead_id) || {}).ib_client).length;
    assert(ibN >= 1 && tg.total.ib_ftd === ibN && tg.total.ftd === all.length - ibN, "IB-referred FTDs excluded from agent targets and counted apart"); }
  const biz = crm.report(ADMIN, "business", { from: period + "-01", to: crm.ibMonthReview(PT, {}).current + "-28" }); assert(biz.ib && biz.ib.active === 4 && biz.ib.ftd >= 1 && biz.ib.commission_due > 0, "business overview IB card");
  const rep = crm.ibReport(PT, { from: "2026-01-01", to: "2027-12-31" }); assert(rep.rows.find(r => r.id === ps1.id).clicks === 2 && rep.rows.find(r => r.id === ps1.id).paid === 62.5, "IB report");
  assert.throws(() => crm.ibReport(U.fatima, {}), /partnerships/);
  console.log("IB:", { partners: store.size("partners"), lines: store.size("commissions"), held: store.all("commissions").filter(l => l.status === "held").length, paid: sumOf(store.all("commissions"), l => l.status === "paid"), payouts: store.all("payments").filter(p => p.type === "ib_payout").length });
}

/* ---------- export: shift dates so the month ends "now", then dump or load ---------- */
function shiftDates(obj, delta) {
  if (Array.isArray(obj)) return obj.map(x => shiftDates(x, delta));
  if (obj && typeof obj === "object") { for (const k of Object.keys(obj)) obj[k] = shiftDates(obj[k], delta); return obj; }
  if (typeof obj === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(obj)) return new Date(Date.parse(obj) + delta).toISOString();
  return obj;
}
const COLS = require("../lib/core.js").COLLECTIONS;
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg("--dump") || arg("--db")) {
  leads.forEach(l => delete l.quality);
  const delta = process.argv.includes("--shift-to-now") ? Date.now() - T : 0;
  const data = Object.fromEntries(COLS.map(c => [c, shiftDates(JSON.parse(JSON.stringify(store.all(c))), delta)]));
  data.users.forEach(u => { delete u.password_hash; u.sample = true; });
  if (arg("--dump")) { const dir = arg("--dump"); fs.mkdirSync(dir, { recursive: true }); for (const c of COLS) fs.writeFileSync(path.join(dir, c + ".json"), JSON.stringify(data[c])); console.log("dumped to", dir); }
  if (arg("--db")) {
    // Demo database for trying the CRM: every sample user signs in with the password below.
    const { openStore } = require("../lib/store-sqlite.js");
    const crypto = require("crypto");
    const hash = p => { const salt = crypto.randomBytes(16); return `pbkdf2$sha256$310000$${salt.toString("base64")}$${crypto.pbkdf2Sync(p, salt, 310000, 32, "sha256").toString("base64")}`; };
    const pw = arg("--password") || "demo-pass-123", h = hash(pw), hc = hash("Client-pass-2026");
    const db = openStore(path.resolve(arg("--db")), path.join(__dirname, "..", "db", "schema.sql"));
    if (db.all("leads").length) { console.error("✖ That database already has leads. Use a new file."); process.exit(1); }
    db.transaction(() => { for (const c of COLS) for (const o of data[c]) { if (c === "users") { o.password_hash = h; o.must_change_password = false; } if (c === "clients") o.password_hash = hc; db.put(c, o); } });
    console.log(`✔ Demo database written to ${arg("--db")}. Sign in as admin, sara (sales manager), daniel / grace / chinedu / rahul / yousef / mai (agents), nadia (marketing manager), omar (marketing), fatima / ali (operations) or joy (compliance) with password: ${pw}`);
  }
}
