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
    if (i === 0) { crm.importBalances(OPS, [{ login: String(7100000 + i), balance: 3400, equity: 3350 }]); const w = crm.portalWithdraw(C, { account_id: a.id, method: "usdt", amount: 1200, details: "USDT TRC20 TQx8...9k" }); crm.decidePayment(OPS, w.id, "approve"); }
    if (i === 6) { const w = crm.portalWithdraw(C, { account_id: a.id, method: "bank", amount: 150, details: "IBAN KE12 3456 7890 · Equity Bank" }); }
  });
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
    const pw = arg("--password") || "demo-pass-123", h = hash(pw);
    const db = openStore(path.resolve(arg("--db")), path.join(__dirname, "..", "db", "schema.sql"));
    if (db.all("leads").length) { console.error("✖ That database already has leads. Use a new file."); process.exit(1); }
    db.transaction(() => { for (const c of COLS) for (const o of data[c]) { if (c === "users") { o.password_hash = h; o.must_change_password = false; } db.put(c, o); } });
    console.log(`✔ Demo database written to ${arg("--db")}. Sign in as admin, sara (sales manager), daniel / grace / chinedu / rahul / yousef / mai (agents), nadia (marketing manager), omar (marketing), fatima / ali (operations) or joy (compliance) with password: ${pw}`);
  }
}
