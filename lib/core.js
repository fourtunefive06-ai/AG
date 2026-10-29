/**
 * Absel CRM core — all business logic, shared by the Node server and the browser prototype.
 * Storage-agnostic: works on a synchronous key/value store (see createMemoryStore).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AbselCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------ constants */
  const STAGES = [
    { id: "new", label: "New", open: true },
    { id: "attempting", label: "Attempting", open: true },
    { id: "contacted", label: "Contacted", open: true },
    { id: "qualified", label: "Qualified", open: true },
    { id: "registered", label: "Account opened", open: true },
    { id: "kyc", label: "KYC verified", open: true },
    { id: "funded", label: "Funded (FTD)", won: true },
    { id: "lost", label: "Lost", closed: true },
    { id: "invalid", label: "Invalid", closed: true },
  ];
  const STAGE_IDX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
  const MILESTONES = ["contacted", "qualified", "registered", "kyc", "funded"];
  const OPEN = new Set(STAGES.filter(s => s.open).map(s => s.id));

  const OUTCOMES = [
    { id: "interested", label: "Interested", connected: true },
    { id: "callback", label: "Call back later", connected: true },
    { id: "not_interested", label: "Not interested", connected: true },
    { id: "no_answer", label: "No answer" },
    { id: "busy", label: "Busy / rejected" },
    { id: "switched_off", label: "Switched off" },
    { id: "voicemail", label: "Voicemail" },
    { id: "wrong_number", label: "Wrong number" },
  ];
  const OUTCOME = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));

  const QA_FIELDS = [
    { id: "experience", label: "Trading experience", type: "select", options: ["None", "Under 1 year", "1–3 years", "3+ years"] },
    { id: "capital", label: "Capital to invest", type: "select", options: ["Under $500", "$500–2k", "$2k–10k", "$10k–50k", "$50k+"] },
    { id: "instruments", label: "Wants to trade", type: "multi", options: ["Forex", "Gold", "Indices", "Oil", "Crypto", "Stocks"] },
    { id: "account_type", label: "Account type", type: "select", options: ["STP", "ECN", "Islamic", "Cent", "IB partner", "PAMM / MAM"] },
    { id: "current_broker", label: "Current broker", type: "text" },
    { id: "timeline", label: "Plans to start", type: "select", options: ["Today", "This week", "This month", "Later"] },
    { id: "expected_deposit", label: "Expected first deposit (USD)", type: "number" },
    { id: "objections", label: "Concerns raised", type: "multi", options: ["Regulation / trust", "Spreads & costs", "Deposit methods", "Withdrawal speed", "Leverage", "Platform", "Needs more info", "Partner / family decision", "No time now", "Bad past broker experience"] },
    { id: "questions", label: "What the client asked", type: "textarea" },
    { id: "best_time", label: "Best time to call", type: "text" },
    { id: "language", label: "Preferred language", type: "text" },
  ];

  const DEFAULT_LOST = ["Not interested", "Low budget", "Using another broker", "Trust / regulation concerns", "Unreachable after attempts", "Restricted country", "Duplicate", "Other"];
  // Two workspaces: Sales (calling → verified first deposit) and Marketing (campaigns, broadcasts, communication)
  const ROLES = ["admin", "manager", "agent", "marketing_manager", "marketing", "operations", "compliance", "partnerships"];
  const ROLE_LABELS = { admin: "Admin", manager: "Sales manager", agent: "Sales agent", marketing_manager: "Marketing manager", marketing: "Marketing executive", operations: "Operations", compliance: "Compliance", partnerships: "Partnerships manager" };
  const TRIGGERS = ["lead_created", "lead_assigned", "stage_changed", "call_logged", "no_contact", "inactive", "stage_stuck", "whatsapp_reply", "deposit_submitted", "demo_given", "demo_idle", "bonus_credited", "bonus_expiring", "bonus_ended", "client_registered", "kyc_approved", "kyc_rejected", "deposit_received", "registration_incomplete", "funded_not_trading", "client_dormant"];
  const TIME_TRIGGERS = new Set(["no_contact", "inactive", "stage_stuck", "demo_idle", "bonus_expiring", "registration_incomplete", "funded_not_trading", "client_dormant"]);
  const TEMPLATE_VARS = ["first_name", "last_name", "full_name", "reference", "interest", "country", "city", "agent_name", "agent_phone", "agent_email", "company", "register_url", "login_url", "whatsapp_number", "unsubscribe_url"];
  // Steps between "interested" and a verified first deposit. Ticking a step with a stage moves the lead forward.
  const CHECKLIST = [
    { id: "account_opened", label: "Trading account opened", stage: "registered", input: "account_id" },
    { id: "docs_uploaded", label: "KYC documents uploaded" },
    { id: "kyc_approved", label: "KYC approved", stage: "kyc" },
    { id: "method_agreed", label: "Deposit method agreed", input: "method" },
    { id: "deposit_promised", label: "Deposit amount and date promised", input: "promise" },
    { id: "funded", label: "First deposit verified", auto: true },
  ];
  const DEPOSIT_METHODS = ["Card", "Bank wire", "USDT", "Skrill", "Neteller", "UnionPay", "Local bank transfer", "Other"];
  const QA_CRITERIA = [
    { id: "opening", label: "Opening and introduction" }, { id: "discovery", label: "Discovery questions" }, { id: "product", label: "Product knowledge" },
    { id: "objections", label: "Handling concerns" }, { id: "close", label: "Clear next step / close" }, { id: "tone", label: "Tone and rapport" },
  ];
  const BREAK_REASONS = ["Lunch", "Prayer", "Short break", "Training", "Meeting", "Other"];
  const CAMPAIGN_CHANNELS = ["Facebook / Instagram", "Google Ads", "TikTok", "YouTube", "Affiliate / IB", "SMS", "Email", "WhatsApp", "SEO / content", "Events", "Other"];
  const COLLECTIONS = ["settings", "users", "rules", "templates", "automations", "leads", "activities", "tasks", "messages", "jobs", "notifications", "logins",
    "deposits", "files", "dnc", "reviews", "attendance", "callevents", "campaigns", "spend", "broadcasts", "bonuses", "clients", "accounts", "payments",
    "mt5_deals", "mt5_positions", "mt5_unlinked", "mt5_state", "mt5_ops",
    "partners", "ib_plans", "commissions", "ib_clicks"];

  const DEFAULT_SETTINGS = {
    id: "main", company: "Absel Global", register_url: "https://abselglobal.com/portal/#register", login_url: "https://abselglobal.com/portal/",
    site_url: "https://abselglobal.com", whatsapp_number: "447576077989", support_email: "support@abselglobal.com",
    tz_offset_min: 240, sla_minutes: 15, retry_hours: [1, 3, 24, 48, 72], max_attempts: 6,
    fallback: "pool", fallback_cursor: 0, quiet: { enabled: true, start: "21:00", end: "09:00" },
    lost_reasons: DEFAULT_LOST, currency: "USD", require_2fa_roles: [],
    deposit_approval: true, stuck_days: { qualified: 3, registered: 2, kyc: 2 },
    sla_reassign: { enabled: false, minutes: 30, max: 2 },
    recycle: { enabled: false, days: 30, max: 1, reasons: ["Not interested", "Unreachable after attempts", "Low budget", "Other"] },
    broadcast_rate_per_min: 30, broadcast_cap_days: 3, broadcast_approval: true,
    mis_email: { enabled: false, recipients: [], hour: 9 }, mis_last_sent: "", defaults_version: 1,
    // Optional journey steps before the client funds with their own money
    // Client area (abselglobal.com/portal). Accounts and money are handled at the licensed broker by operations.
    portal: {
      enabled: true, brand: "Absel Global", require_kyc_for_live: true, second_approval_over: 1000, default_server: "",
      legal_line: "Absel Global is a trading name of Absel Markets, licensed by the Financial Services Commission of Mauritius (licence GB25205423). Client money is held in segregated accounts.",
      risk_warning: "CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money.",
      support_email: "", last_balance_import: null,
      platform_links: { windows: "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe", ios: "https://apps.apple.com/app/metatrader-5/id413251709", android: "https://play.google.com/store/apps/details?id=net.metaquotes.metatrader5", web: "https://web.metatrader.app/terminal" },
      account_types: [
        { id: "stp", name: "STP", desc: "No commission, spreads from 0.9 pips", min_deposit: 100, leverages: [50, 100, 200, 500], currencies: ["USD"], mt5_group: "", mt5_demo_group: "" },
        { id: "ecn", name: "ECN", desc: "Raw spreads from 0.2 pips, commission from $7 per lot", min_deposit: 100, leverages: [50, 100, 200, 500], currencies: ["USD"], mt5_group: "", mt5_demo_group: "" },
        { id: "islamic", name: "Islamic (swap-free)", desc: "No overnight swaps", min_deposit: 100, leverages: [50, 100, 200], currencies: ["USD"], mt5_group: "", mt5_demo_group: "" },
        { id: "cent", name: "Cent", desc: "Trade small sizes while you learn", min_deposit: 100, leverages: [100, 200, 500], currencies: ["USD"], mt5_group: "", mt5_demo_group: "" },
      ],
      methods: [
        { id: "bank", name: "Bank wire", kind: "bank", deposit: true, withdraw: true, min: 100, max: 0, eta: "1–3 business days", instructions: "Bank details are added by operations in Settings → Client area.", link: "" },
        { id: "card", name: "Visa / Mastercard", kind: "card", deposit: true, withdraw: true, min: 50, max: 10000, eta: "Instant once confirmed", instructions: "Use the secure payment link, then upload the confirmation.", link: "" },
        { id: "usdt", name: "USDT (TRC20)", kind: "crypto", deposit: true, withdraw: true, min: 50, max: 0, eta: "Within 1 hour", instructions: "Wallet address is added by operations in Settings → Client area.", link: "" },
        { id: "skrill", name: "Skrill", kind: "ewallet", deposit: true, withdraw: true, min: 50, max: 0, eta: "Same day", instructions: "", link: "" },
        { id: "neteller", name: "Neteller", kind: "ewallet", deposit: true, withdraw: true, min: 50, max: 0, eta: "Same day", instructions: "", link: "" },
      ],
    },
    lifecycle: { dormant_days: 30 },
    // MT5 Web API (MT5_MODE=api in .env). Our system never moves money in MT5; account creation stays off until switched on here.
    mt5: { account_creation_enabled: false, auto_demo: false, match_after_hours: 2 }, // warn when no MT5 deal shows up this many hours after operations can act
    // IB / partner programme. Symbol groups are matched in order (regular expressions on the MT5 symbol); unmatched → other.
    ib: { enabled: true, payout_min: 50, click_days: 180, agreement_version: "1.0",
      agreement_text: "Absel Global Introducing Broker agreement (version 1.0).\n\n1. You introduce clients to Absel Global; Absel Markets (FSC Mauritius) is the broker.\n2. You are paid the per-lot commission and any CPA in your plan on real trades of the clients you introduced, as calculated by Absel Global. Commission on your own trading or on accounts linked to you is not paid.\n3. You must not give investment advice, promise profits, use the Absel Global brand in paid search without written permission, or promote in restricted countries.\n4. Commission for a month is reviewed after the month ends and paid on request once it is at least $50. Commission obtained by abuse is cancelled.\n5. Either side can end this agreement with 30 days' notice. Approved commission earned before then is still paid.\n\nCompliance must approve this text before use.",
      symbol_groups: [{ group: "metals", pattern: "^(XAU|XAG|XPT|XPD|GOLD|SILVER)" }, { group: "energy", pattern: "^(XBR|XTI|XNG|WTI|BRENT|UKOIL|USOIL|NGAS|NATGAS)" }, { group: "crypto", pattern: "^(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|DOT|BCH|BNB)" }, { group: "indices", pattern: "^(US30|US100|US500|NAS100|USTEC|SPX|DJ30|DJI|GER40|DE40|UK100|JP225|JPN225|AUS200|HK50|FRA40|EU50|STOXX50)" }, { group: "forex", pattern: "^[A-Z]{6}([.#_-]|[a-z]*$)" }] },
    bonus: { enabled: true, amount: 100, require_kyc: true, expiry_days: 30, min_lots: 2, max_profit: 100, monthly_cap: 0, withdraw_needs_deposit: false },
  };

  /* --------------------------------------------------------------- utils */
  const rand = n => { let s = ""; const a = "abcdefghijklmnopqrstuvwxyz0123456789"; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const clean = (v, max = 200) => (v == null ? "" : String(v)).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  const lc = v => clean(v).toLowerCase();
  const digits = v => String(v || "").replace(/\D/g, "");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const arr = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const clone = o => JSON.parse(JSON.stringify(o));

  class CrmError extends Error { constructor(msg, code = 400, fields) { super(msg); this.code = code; this.fields = fields; } }

  /* --------------------------------------------------------- memory store */
  function createMemoryStore(persist) {
    const cols = {};
    const c = n => cols[n] || (cols[n] = new Map());
    return {
      all: n => Array.from(c(n).values()),
      get: (n, id) => c(n).get(id) || null,
      put(n, obj, silent) { c(n).set(obj.id, obj); if (!silent && persist) persist(n, "put", obj); return obj; },
      remove(n, id, silent) { const o = c(n).get(id); c(n).delete(id); if (!silent && persist && o) persist(n, "del", o); },
      load(n, list) { list.forEach(o => c(n).set(o.id, o)); },
      size: n => c(n).size,
    };
  }

  /* ------------------------------------------------- TOTP (RFC 6238) */
  function sha1(bytes) {
    const ml = bytes.length * 8, withPad = ((bytes.length + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
    m.set(bytes); m[bytes.length] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(withPad - 4, ml >>> 0); dv.setUint32(withPad - 8, Math.floor(ml / 4294967296));
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0; const w = new Uint32Array(80);
    for (let i = 0; i < withPad; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 80; t++) { const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let t = 0; t < 80; t++) {
        const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0; e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20), o = new DataView(out.buffer); [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h)); return out;
  }
  function hmacSha1(key, msg) {
    if (key.length > 64) key = sha1(key);
    const k = new Uint8Array(64); k.set(key); const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(84);
    for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; } ip.set(msg, 64); op.set(sha1(ip), 64); return sha1(op);
  }
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  function base32Encode(bytes) { let bits = 0, val = 0, out = ""; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; }
  function base32Decode(s) { s = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, ""); let bits = 0, val = 0; const out = []; for (const ch of s) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
  function totpCode(secret, ms, step = 0) {
    const counter = Math.floor(ms / 30000) + step, msg = new Uint8Array(8); let c = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
    const h = hmacSha1(base32Decode(secret), msg), off = h[19] & 15;
    const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return String(bin % 1000000).padStart(6, "0");
  }
  function totpVerify(secret, code, ms) { code = String(code || "").replace(/\s/g, ""); if (!secret || !/^\d{6}$/.test(code)) return false; return [-1, 0, 1].some(st => totpCode(secret, ms, st) === code); }

  /* ================================================================ CRM */
  function createCRM(opts) {
    const store = opts.store;
    const nowFn = opts.now || (() => new Date());
    const onQueue = opts.onQueue || (() => {});
    const nowIso = () => nowFn().toISOString();
    const nowMs = () => nowFn().getTime();
    const SYSTEM = { id: "system", role: "system", name: "System" };

    const settings = () => {
      const s = store.get("settings", "main") || store.put("settings", clone(DEFAULT_SETTINGS));
      for (const k of Object.keys(DEFAULT_SETTINGS)) if (s[k] === undefined) s[k] = clone(DEFAULT_SETTINGS[k]); // older databases
      return s;
    };
    const tz = () => Number(settings().tz_offset_min) || 0;
    const localDay = iso => (iso ? new Date(Date.parse(iso) + tz() * 60000).toISOString().slice(0, 10) : "");
    const localHourDow = iso => { const d = new Date(Date.parse(iso) + tz() * 60000); return [d.getUTCHours(), d.getUTCDay()]; };
    let seq = 0;
    const newId = p => p + nowMs().toString(36) + (seq++ % 1679616).toString(36).padStart(4, "0") + rand(3);
    const refCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s; do { s = "AG-"; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; } while (store.all("leads").some(l => l.reference === s)); return s; };

    /* ---------- permissions ---------- */
    const isAdmin = u => u.role === "admin" || u.role === "system";
    const isMgr = u => isAdmin(u) || u.role === "manager";                       // sales management
    const isMktMgr = u => isAdmin(u) || u.role === "marketing_manager";
    const isMkt = u => isMktMgr(u) || u.role === "marketing";                    // marketing workspace
    const isSales = u => isMgr(u) || u.role === "agent";                         // can work leads (call, notes, stages)
    const seesAll = u => isMgr(u) || isMkt(u);
    const canComm = u => isMgr(u) || isMktMgr(u);                                // edit automations, see all messages
    const isSalesRole = r => r === "agent" || r === "manager";
    function need(u, check, msg) { if (!u || !check(u)) throw new CrmError(msg || "You don't have access to this.", 403); }
    const canSee = (u, l) => l && (seesAll(u) || isKyc(u) || l.owner_id === u.id);
    function leadFor(u, id, write) {
      const l = store.get("leads", id); if (!canSee(u, l)) throw new CrmError("Lead not found.", 404);
      if (write && !isSales(u)) throw new CrmError("Marketing accounts can view leads but only the sales team can work them.", 403);
      return l;
    }
    const userName = id => (store.get("users", id) || {}).name || (id === "system" ? "System" : id === "client" ? "Client (client area)" : id ? "Former user" : "Unassigned");

    /* ---------- records ---------- */
    function activity(lead, user, type, data, at) {
      const a = { id: newId("A"), lead_id: lead.id, user_id: user ? user.id : "system", type, data: data || {}, created_at: at || nowIso() };
      store.put("activities", a);
      if (type !== "system") { lead.last_activity_at = a.created_at; }
      return a;
    }
    function notify(userId, text, leadId, kind) {
      if (!userId || userId === "system") return;
      store.put("notifications", { id: newId("N"), user_id: userId, text, lead_id: leadId || null, kind: kind || "info", read: false, created_at: nowIso() });
    }
    function saveLead(l) { l.updated_at = nowIso(); rescore(l); store.put("leads", l); return l; }

    /* ---------- scoring ---------- */
    function rescore(l) {
      const p = l.profile || {};
      let s = 0;
      s += { "Under $500": 4, "$500–2k": 12, "$2k–10k": 22, "$10k–50k": 30, "$50k+": 35 }[p.capital] || 0;
      s += { Today: 20, "This week": 14, "This month": 7, Later: 1 }[p.timeline] || 0;
      s += { None: 2, "Under 1 year": 5, "1–3 years": 8, "3+ years": 10 }[p.experience || l.experience] || 0;
      if (Number(p.expected_deposit) >= 1000) s += 8; else if (Number(p.expected_deposit) >= 250) s += 4;
      if (l.connected_calls > 0) s += 8;
      if (l.last_outcome === "interested") s += 10;
      if (l.last_outcome === "not_interested") s -= 20;
      if (l.last_inbound_at) s += 6;
      s += { qualified: 8, registered: 18, kyc: 24, funded: 100 }[l.stage] || 0;
      if (l.attempts >= 4 && !l.connected_calls) s -= 10;
      l.score = Math.max(0, Math.min(100, s));
      l.temperature = !OPEN.has(l.stage) && l.stage !== "funded" ? "cold" : l.score >= 55 ? "hot" : l.score >= 25 ? "warm" : "cold";
    }

    /* ---------- assignment ---------- */
    const openLeadsOf = uid => store.all("leads").filter(l => l.owner_id === uid && OPEN.has(l.stage)).length;
    const eligible = u => u && u.active !== false && u.accepts_leads !== false && isSalesRole(u.role) && !onBreak(u.id);
    const attKey = (uid, iso) => uid + "_" + localDay(iso || nowIso());
    const onBreak = uid => { const a = store.get("attendance", attKey(uid)); return !!(a && arr(a.breaks).some(b => !b.end)); };
    const lastSeen = uid => { const a = store.get("attendance", attKey(uid)); return a ? a.last_at : null; };
    const isOnline = uid => { const t = lastSeen(uid); return !!t && nowMs() - Date.parse(t) < 5 * 60000; };
    function ruleMatches(m, l) {
      m = m || {};
      const chk = (list, val) => !arr(list).length || arr(list).map(lc).includes(lc(val));
      return chk(m.countries, l.country) && chk(m.cities, l.city) && chk(m.areas, l.area) &&
        chk(m.sources, l.utm_source || "direct") && chk(m.interests, l.interest) && chk(m.languages, l.language);
    }
    function choose(agents, method, holder) {
      if (method === "least_loaded") {
        const loads = agents.map(a => [a, openLeadsOf(a.id)]); const min = Math.min(...loads.map(x => x[1]));
        const tied = loads.filter(x => x[1] === min).map(x => x[0]);
        const i = (holder.cursor || 0) % tied.length; holder.cursor = (holder.cursor || 0) + 1; return tied[i];
      }
      const i = (holder.cursor || 0) % agents.length; holder.cursor = i + 1; return agents[i];
    }
    // exclude: user ids to skip (SLA reassignment and recycling hand the lead to someone new); needOnline: only people signed in now
    function pickOwner(l, exclude, needOnline) {
      const ex = new Set(arr(exclude)), ok = u => eligible(u) && !ex.has(u.id) && (!needOnline || isOnline(u.id));
      const rules = store.all("rules").filter(r => r.active !== false).sort((a, b) => (a.priority || 0) - (b.priority || 0));
      for (const r of rules) {
        if (!ruleMatches(r.match, l)) continue;
        const agents = arr(r.agents).map(id => store.get("users", id)).filter(ok);
        if (!agents.length) continue;
        const a = choose(agents, r.method, r); store.put("rules", r);
        return { owner: a, via: "Territory: " + r.name };
      }
      const st = settings();
      if (st.fallback === "round_robin_all" || ex.size) {
        const agents = store.all("users").filter(u => ok(u) && u.role === "agent").sort((a, b) => a.name.localeCompare(b.name));
        if (ex.size && st.fallback !== "round_robin_all") return { owner: null, via: "No other agent available in this territory" };
        if (agents.length) { const h = { cursor: st.fallback_cursor || 0 }; const a = choose(agents, "round_robin", h); st.fallback_cursor = h.cursor; store.put("settings", st); return { owner: a, via: "Round robin (no territory matched)" }; }
      }
      return { owner: null, via: "Unassigned pool (no territory matched)" };
    }
    function setOwner(l, owner, by, via) {
      const prev = l.owner_id;
      l.owner_id = owner ? owner.id : null; l.assigned_at = nowIso();
      activity(l, by, "assign", { from: prev || null, to: l.owner_id, via: via || "" });
      if (owner) notify(owner.id, `New lead assigned: ${l.first_name} ${l.last_name} (${l.country})`, l.id, "lead");
      // move open tasks with the lead
      store.all("tasks").filter(t => t.lead_id === l.id && !t.done_at).forEach(t => { t.owner_id = l.owner_id; store.put("tasks", t); });
    }

    /* ---------- leads ---------- */
    function normalize(d) {
      const u = d.utm || {};
      return {
        first_name: clean(d.first_name ?? d.firstName, 80), last_name: clean(d.last_name ?? d.lastName, 80),
        email: lc(clean(d.email, 160)), dial_code: clean(d.dial_code ?? d.dialCode, 8), phone: clean(d.phone, 30).replace(/[^\d\s-]/g, ""),
        country: clean(d.country, 80), city: clean(d.city, 80), area: clean(d.area, 80), language: clean(d.language, 40),
        interest: clean(d.interest, 80), experience: clean(d.experience, 40), form: clean(d.form, 20) || "manual",
        page_url: clean(d.page_url ?? d.page, 500),
        utm_source: lc(d.utm_source ?? u.utm_source), utm_medium: lc(d.utm_medium ?? u.utm_medium), utm_campaign: clean(d.utm_campaign ?? u.utm_campaign, 160),
        utm_content: clean(d.utm_content ?? u.utm_content, 160), utm_term: clean(d.utm_term ?? u.utm_term, 160),
        gclid: clean(d.gclid ?? u.gclid, 200), fbclid: clean(d.fbclid ?? u.fbclid, 200), ref_code: clean(d.ref_code ?? u.ref, 60),
        ip: clean(d.ip, 64), user_agent: clean(d.user_agent, 300),
      };
    }
    function validate(f, { requireEmail = true } = {}) {
      const e = {};
      if (!f.first_name) e.firstName = "Enter a first name";
      if (!f.last_name) e.lastName = "Enter a last name";
      if (requireEmail && !EMAIL_RE.test(f.email)) e.email = "Enter a valid email";
      if (!requireEmail && f.email && !EMAIL_RE.test(f.email)) e.email = "Enter a valid email";
      const dg = digits(f.phone); if (dg.length < 6 || dg.length > 14) e.phone = "Enter a valid phone number";
      if (!f.country) e.country = "Select a country";
      if (Object.keys(e).length) throw new CrmError("Please check the highlighted fields.", 422, e);
    }
    const phoneKey = (dial, phone) => digits(String(dial || "") + String(phone || "")).slice(-9);

    function createLead(u, data, o = {}) {
      u = u || SYSTEM;
      if (u !== SYSTEM && u.role === "agent" && !o.allowAgent) need(u, isMgr);
      const f = normalize(data); validate(f, { requireEmail: o.requireEmail !== false });
      const at = o.at || nowIso();
      const l = Object.assign(f, {
        id: newId("L"), reference: data.reference && /^AG-[A-Z0-9]{4,8}$/.test(data.reference) && !store.all("leads").some(x => x.reference === data.reference) ? data.reference : refCode(),
        source_type: o.source || "web", stage: "new", owner_id: null, created_at: at, updated_at: at, last_activity_at: at,
        attempts: 0, connected_calls: 0, first_contact_at: null, first_connected_at: null, last_outcome: null,
        reached: {}, profile: {}, tags: arr(data.tags).map(t => clean(t, 30)), dnc: false, consent: data.consent !== false,
        deposit_amount: 0, account_id: "", lost_reason: "", score: 0, temperature: "warm", phone_key: phoneKey(f.dial_code, f.phone),
        sample: !!data.sample, unsubscribed: { email: false, whatsapp: false }, checklist: {}, stage_at: at,
      });
      if (dncMatch(l)) l.dnc = true;
      if (f.experience) l.profile.experience = { "New to trading": "None", "Under 1 year": "Under 1 year", "1–3 years": "1–3 years", "3+ years": "3+ years" }[f.experience] || undefined;
      const dup = store.all("leads").find(x => (l.email && x.email === l.email) || (l.phone_key.length >= 7 && x.phone_key === l.phone_key));
      if (dup) l.duplicate_of = dup.id;
      store.put("leads", l);
      activity(l, u, "created", { source: l.source_type, form: l.form, duplicate_of: l.duplicate_of || null }, at);
      const ibCode = data.ib || data.partner || data.partner_code || (data.utm || {}).ib; // a duplicate keeps its first attribution
      if (ibCode && !l.duplicate_of) ibAttributeLead(l, ibCode, o.source === "portal" ? "registration" : o.source || "link");
      if (o.owner_id !== undefined && (isMgr(u))) {
        setOwner(l, o.owner_id ? store.get("users", o.owner_id) : null, u, "Manual");
      } else if (dup && dup.owner_id && eligible(store.get("users", dup.owner_id))) {
        setOwner(l, store.get("users", dup.owner_id), SYSTEM, "Same owner as earlier lead " + dup.reference);
      } else {
        const p = pickOwner(l); setOwner(l, p.owner, SYSTEM, p.via);
      }
      saveLead(l);
      fire("lead_created", l);
      if (l.owner_id) fire("lead_assigned", l);
      return l;
    }

    // Lead added by hand inside the CRM (walk-in, referral, phone enquiry)
    function addLead(u, data) {
      const owner = u.role === "agent" ? u.id : data.owner_id || undefined;
      const l = createLead(isMgr(u) ? u : SYSTEM, Object.assign({ form: "manual" }, data, { sample: false }), { source: "manual", requireEmail: false, owner_id: owner === undefined ? undefined : owner });
      if (u.role === "agent" && l.owner_id !== u.id) { setOwner(l, store.get("users", u.id), u, "Added by agent"); saveLead(l); }
      return l;
    }

    const EDITABLE = ["first_name", "last_name", "email", "dial_code", "phone", "country", "city", "area", "language", "interest", "account_id", "dnc", "tags", "consent"];
    const MKT_EDITABLE = ["dnc", "consent"];
    function updateLead(u, id, patch) {
      const l = leadFor(u, id), changes = [];
      const keys = isSales(u) ? EDITABLE : MKT_EDITABLE;
      if (!isSales(u) && (Object.keys(patch).some(k => !MKT_EDITABLE.includes(k) && k !== "unsubscribed") || patch.profile)) throw new CrmError("Marketing accounts can only change contact permissions.", 403);
      for (const k of keys) if (patch[k] !== undefined) {
        let v = patch[k];
        if (k === "dnc" || k === "consent") v = !!v;
        else if (k === "tags") v = arr(v).map(t => clean(t, 30)).filter(Boolean); else v = k === "email" ? lc(v) : clean(v, 160);
        if (JSON.stringify(v) !== JSON.stringify(l[k])) { changes.push({ field: k, from: l[k] === undefined ? "" : l[k], to: v }); l[k] = v; }
      }
      if (patch.unsubscribed) {
        l.unsubscribed = l.unsubscribed || {};
        for (const ch of ["email", "whatsapp"]) if (patch.unsubscribed[ch] !== undefined && !!patch.unsubscribed[ch] !== !!l.unsubscribed[ch]) { changes.push({ field: "unsubscribed." + ch, from: !!l.unsubscribed[ch], to: !!patch.unsubscribed[ch] }); l.unsubscribed[ch] = !!patch.unsubscribed[ch]; }
      }
      if (patch.profile) mergeProfile(l, patch.profile);
      if (changes.some(c => c.field === "email") && l.email && !EMAIL_RE.test(l.email)) throw new CrmError("Enter a valid email.", 422, { email: "Enter a valid email" });
      l.phone_key = phoneKey(l.dial_code, l.phone);
      const dncChange = changes.find(c => c.field === "dnc");
      if (dncChange) { if (l.dnc) addDncFor(l, u, "Marked on lead " + l.reference); else removeDncFor(l); }
      if (changes.length) activity(l, u, "edit", { fields: changes.map(c => c.field), changes: changes.map(c => ({ field: c.field, from: String(c.from).slice(0, 120), to: String(c.to).slice(0, 120) })) });
      return saveLead(l);
    }
    function mergeProfile(l, p) {
      l.profile = l.profile || {};
      for (const f of QA_FIELDS) {
        const v = p[f.id]; if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
        l.profile[f.id] = f.type === "multi" ? arr(v).map(x => clean(x, 60)) : f.type === "number" ? Number(v) || 0 : clean(v, f.type === "textarea" ? 2000 : 160);
      }
      if (l.profile.language && !l.language) l.language = l.profile.language;
    }

    function setStage(l, u, stage, o = {}) {
      if (!STAGE_IDX.hasOwnProperty(stage)) throw new CrmError("Unknown stage.");
      const from = l.stage; if (from === stage) return false;
      if (stage === "lost" && !o.lost_reason) throw new CrmError("Choose a lost reason.", 422, { lost_reason: "Required" });
      // A first deposit only counts once a manager verifies it (Settings → deposit approval)
      if (stage === "funded" && !o.fromDeposit && u.id !== "system" && u.role !== "system") {
        if (settings().deposit_approval && !isMgr(u)) throw new CrmError("Submit the first deposit for verification instead. A manager confirms it before the lead counts as funded.", 403);
        const amt = Math.max(0, Number(o.deposit_amount) || 0);
        const dep = makeDeposit(l, u, { amount: amt, method: o.deposit_method || "", tx_ref: o.tx_ref || "", deposited_at: o.at, note: "Recorded by a manager when moving the stage" });
        dep.status = "verified"; dep.verified_by = u.id; dep.verified_at = nowIso(); store.put("deposits", dep);
        o = Object.assign({}, o, { deposit_amount: amt });
      }
      l.stage = stage; const at = o.at || nowIso(); l.stage_at = at;
      if (STAGES[STAGE_IDX[stage]].open || stage === "funded") {
        for (const m of MILESTONES) if (STAGE_IDX[m] <= STAGE_IDX[stage] && !l.reached[m]) l.reached[m] = at;
      }
      l.checklist = l.checklist || {};
      CHECKLIST.filter(c => c.stage && STAGE_IDX[c.stage] <= STAGE_IDX[stage] && (STAGES[STAGE_IDX[stage]].open || stage === "funded") && !l.checklist[c.id]).forEach(c => { l.checklist[c.id] = { at, by: u.id }; });
      if (stage === "lost") l.lost_reason = clean(o.lost_reason, 80);
      if (stage === "funded") { if (o.deposit_amount) l.deposit_amount = Math.max(0, Number(o.deposit_amount) || 0); l.funded_at = l.funded_at || at; l.checklist.funded = l.checklist.funded || { at, by: u.id }; l.deposit_pending = false; }
      if (stage === "registered" && o.account_id) { l.account_id = clean(o.account_id, 40); l.checklist.account_opened.value = l.account_id; }
      if (!OPEN.has(stage)) store.all("tasks").filter(t => t.lead_id === l.id && !t.done_at).forEach(t => { t.done_at = at; t.outcome = "cancelled"; store.put("tasks", t); });
      activity(l, u, "stage", { from, to: stage, reason: l.lost_reason && stage === "lost" ? l.lost_reason : "", deposit: stage === "funded" ? l.deposit_amount : undefined, note: clean(o.note, 500) }, at);
      if (stage === "funded" && l.owner_id && u.id !== l.owner_id) notify(l.owner_id, `🎉 ${l.first_name} ${l.last_name} funded`, l.id, "win");
      if (stage === "funded") convertBonuses(l);
      return from;
    }
    function changeStage(u, id, stage, o = {}) {
      const l = leadFor(u, id, true); const from = setStage(l, u, stage, o);
      saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: stage });
      return l;
    }

    function assignLeads(u, ids, ownerId) {
      need(u, isMgr, "Only managers can reassign leads.");
      const owner = ownerId ? store.get("users", ownerId) : null;
      if (ownerId && (!owner || owner.active === false)) throw new CrmError("Choose an active team member.");
      let n = 0;
      for (const id of arr(ids)) { const l = store.get("leads", id); if (!l || l.owner_id === (owner ? owner.id : null)) continue; setOwner(l, owner, u, "Manual"); saveLead(l); if (owner) fire("lead_assigned", l); n++; }
      return { updated: n };
    }
    function reassignPool(u) {
      need(u, isMgr);
      let n = 0;
      store.all("leads").filter(l => !l.owner_id && OPEN.has(l.stage)).forEach(l => { const p = pickOwner(l); if (p.owner) { setOwner(l, p.owner, u, p.via); saveLead(l); fire("lead_assigned", l); n++; } });
      return { assigned: n };
    }
    function bulkStage(u, ids, stage, o) { need(u, isMgr); let n = 0; for (const id of arr(ids)) { try { changeStage(u, id, stage, o); n++; } catch (e) { if (e.code !== 404) throw e; } } return { updated: n }; }
    function deleteLeads(u, ids) {
      need(u, isAdmin, "Only admins can delete leads.");
      for (const id of arr(ids)) {
        ["activities", "tasks", "messages", "jobs", "notifications", "deposits", "files", "reviews", "callevents"].forEach(c => store.all(c).filter(x => x.lead_id === id).forEach(x => store.remove(c, x.id)));
        store.remove("leads", id);
      }
      return { deleted: arr(ids).length };
    }

    /* ---------- calls ---------- */
    function logCall(u, id, c) {
      const l = leadFor(u, id, true), o = OUTCOME[c.outcome];
      if (!o) throw new CrmError("Choose a call outcome.", 422, { outcome: "Required" });
      const at = c.at || nowIso();
      const qa = {}; if (c.qa) { const tmp = { profile: {} }; mergeProfile(tmp, c.qa); Object.assign(qa, tmp.profile); }
      // An agent closing a deposit on the call submits it for verification instead of moving the stage
      let depositReq = null;
      if (c.stage === "funded" && settings().deposit_approval && !isMgr(u)) { depositReq = { amount: c.deposit_amount, method: c.deposit_method, tx_ref: c.tx_ref, account_id: c.account_id, proof_file_id: c.proof_file_id, note: "Submitted from a call" }; c = Object.assign({}, c, { stage: undefined }); }
      if (depositReq && !(Number(depositReq.amount) > 0)) throw new CrmError("Enter the deposit amount.", 422, { deposit_amount: "Required" });
      const callAct = activity(l, u, "call", { outcome: o.id, connected: !!o.connected, duration_sec: Math.max(0, Math.min(36000, Number(c.duration_sec) || 0)), notes: clean(c.notes, 3000), qa, direction: "out" }, at);
      attachCallEvent(callAct, l, u);
      l.attempts = (l.attempts || 0) + 1; l.last_outcome = o.id; l.last_call_at = at;
      if (!l.first_contact_at) l.first_contact_at = at;
      if (o.connected) { l.connected_calls = (l.connected_calls || 0) + 1; if (!l.first_connected_at) l.first_connected_at = at; }
      mergeProfile(l, qa);
      // close the call task this call answers
      const open = store.all("tasks").filter(t => t.lead_id === l.id && !t.done_at && t.type === "call").sort((a, b) => a.due_at.localeCompare(b.due_at));
      if (open[0] && Date.parse(open[0].due_at) <= Date.parse(at) + 12 * 3600e3) { open[0].done_at = at; open[0].outcome = o.id; store.put("tasks", open[0]); }
      // automatic stage movement
      let from = false;
      const st = settings();
      if (c.stage && c.stage !== l.stage) from = setStage(l, u, c.stage, { lost_reason: c.lost_reason, deposit_amount: c.deposit_amount, account_id: c.account_id, at });
      else if (o.id === "wrong_number") from = setStage(l, u, "invalid", { at });
      else if (o.id === "not_interested") from = setStage(l, u, "lost", { lost_reason: c.lost_reason || "Not interested", at });
      else if (o.id === "interested" && STAGE_IDX[l.stage] < STAGE_IDX.qualified) from = setStage(l, u, "qualified", { at });
      else if (o.connected && STAGE_IDX[l.stage] < STAGE_IDX.contacted) from = setStage(l, u, "contacted", { at });
      else if (!o.connected && l.stage === "new") from = setStage(l, u, "attempting", { at });
      // next step
      if (c.next && c.next.due_at) createTaskFor(l, u, { type: c.next.type || "call", title: c.next.title || (o.id === "callback" ? "Call back" : "Follow up"), due_at: c.next.due_at, note: c.next.note });
      else if (!o.connected && OPEN.has(l.stage) && !l.connected_calls) {
        const sched = arr(st.retry_hours).map(Number).filter(n => n > 0);
        if (l.attempts < (st.max_attempts || 6) && sched.length) {
          const h = sched[Math.min(l.attempts - 1, sched.length - 1)];
          createTaskFor(l, SYSTEM, { type: "call", title: `Retry call (attempt ${l.attempts + 1})`, due_at: new Date(Date.parse(at) + h * 3600e3).toISOString(), auto: true });
        } else if (l.attempts >= (st.max_attempts || 6) && l.owner_id) notify(l.owner_id, `${l.first_name} ${l.last_name}: ${l.attempts} attempts without answer. Consider marking as lost.`, l.id, "warn");
      }
      saveLead(l);
      if (from !== false) fire("stage_changed", l, { from, to: l.stage });
      fire("call_logged", l, { outcome: o.id });
      if (depositReq) submitDeposit(u, l.id, depositReq);
      return l;
    }
    function addNote(u, id, text) {
      const l = leadFor(u, id, true); const t = clean(text, 3000); if (!t) throw new CrmError("Write a note first.");
      activity(l, u, "note", { text: t }); saveLead(l); return l;
    }

    /* ---------- tasks ---------- */
    function createTaskFor(l, u, t) {
      const due = Date.parse(t.due_at); if (isNaN(due)) throw new CrmError("Choose a valid date and time.", 422, { due_at: "Invalid" });
      const task = { id: newId("T"), lead_id: l.id, owner_id: l.owner_id, type: ["call", "whatsapp", "email", "meeting"].includes(t.type) ? t.type : "call", title: clean(t.title, 120) || "Follow up", note: clean(t.note, 500), due_at: new Date(due).toISOString(), done_at: null, outcome: "", created_by: u.id, created_at: nowIso(), auto: !!t.auto };
      store.put("tasks", task);
      l.next_follow_up_at = nextDue(l.id);
      return task;
    }
    const nextDue = leadId => { const t = store.all("tasks").filter(x => x.lead_id === leadId && !x.done_at).sort((a, b) => a.due_at.localeCompare(b.due_at))[0]; return t ? t.due_at : null; };
    function createTask(u, leadId, t) { const l = leadFor(u, leadId, true); const task = createTaskFor(l, u, t); activity(l, u, "task", { title: task.title, due_at: task.due_at, type: task.type }); saveLead(l); return task; }
    function completeTask(u, taskId, outcome) {
      const t = store.get("tasks", taskId); if (!t) throw new CrmError("Task not found.", 404);
      const l = leadFor(u, t.lead_id, true); t.done_at = nowIso(); t.outcome = clean(outcome, 60) || "done"; store.put("tasks", t);
      l.next_follow_up_at = nextDue(l.id); saveLead(l); return t;
    }
    function rescheduleTask(u, taskId, dueAt) {
      const t = store.get("tasks", taskId); if (!t) throw new CrmError("Task not found.", 404); const l = leadFor(u, t.lead_id, true);
      const d = Date.parse(dueAt); if (isNaN(d)) throw new CrmError("Choose a valid date and time."); t.due_at = new Date(d).toISOString(); store.put("tasks", t);
      l.next_follow_up_at = nextDue(l.id); saveLead(l); return t;
    }
    function listTasks(u, f = {}) {
      const now = nowIso(), today = localDay(now);
      let rows = store.all("tasks").filter(t => { const l = store.get("leads", t.lead_id); return l && canSee(u, l); });
      if (f.owner === "me" || u.role === "agent") rows = rows.filter(t => t.owner_id === u.id);
      else if (f.owner) rows = rows.filter(t => t.owner_id === f.owner);
      if (f.status === "done") rows = rows.filter(t => t.done_at); else rows = rows.filter(t => !t.done_at);
      if (f.status === "overdue") rows = rows.filter(t => t.due_at < now);
      if (f.status === "today") rows = rows.filter(t => localDay(t.due_at) === today);
      rows.sort((a, b) => (f.status === "done" ? b.done_at.localeCompare(a.done_at) : a.due_at.localeCompare(b.due_at)));
      return rows.slice(0, 500).map(t => { const l = store.get("leads", t.lead_id); return Object.assign({}, t, { lead: brief(l), owner_name: userName(t.owner_id), overdue: !t.done_at && t.due_at < now }); });
    }
    const stageSince = l => l.stage_at || (l.reached && l.reached[l.stage]) || l.created_at;
    const brief = l => l && { id: l.id, reference: l.reference, name: l.first_name + " " + l.last_name, dial_code: l.dial_code, phone: l.phone, country: l.country, city: l.city, stage: l.stage, temperature: l.temperature, score: l.score, interest: l.interest };

    /* ---------- work queue ---------- */
    function queue(u) {
      const now = nowIso(), today = localDay(now), mine = l => l.owner_id === u.id && OPEN.has(l.stage);
      const leads = store.all("leads").filter(mine);
      const tasks = store.all("tasks").filter(t => !t.done_at && t.owner_id === u.id);
      const taskRow = t => Object.assign({}, t, { lead: brief(store.get("leads", t.lead_id)) });
      const overdue = tasks.filter(t => t.due_at < now).sort((a, b) => a.due_at.localeCompare(b.due_at)).map(taskRow).filter(t => t.lead);
      const dueToday = tasks.filter(t => t.due_at >= now && localDay(t.due_at) === today).sort((a, b) => a.due_at.localeCompare(b.due_at)).map(taskRow).filter(t => t.lead);
      const fresh = leads.filter(l => !l.attempts).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(l => Object.assign(brief(l), { created_at: l.created_at, wait_min: Math.round((nowMs() - Date.parse(l.created_at)) / 60000) }));
      const withTask = new Set(tasks.map(t => t.lead_id));
      const hot = leads.filter(l => l.temperature === "hot" && !withTask.has(l.id)).sort((a, b) => b.score - a.score).slice(0, 20).map(l => Object.assign(brief(l), { last_activity_at: l.last_activity_at }));
      const replies = leads.filter(l => l.last_inbound_at && (!l.last_call_at || l.last_inbound_at > l.last_call_at)).map(l => Object.assign(brief(l), { last_inbound_at: l.last_inbound_at }));
      const jq = journeyQueue(u);
      const order = [].concat(overdue.map(t => ({ lead_id: t.lead_id, why: "Overdue: " + t.title, task_id: t.id })), fresh.map(l => ({ lead_id: l.id, why: "New lead waiting " + l.wait_min + " min" })),
        jq.bonus_profit.map(l => ({ lead_id: l.id, why: l.why })), jq.bonus_expiring.map(l => ({ lead_id: l.id, why: l.why })),
        replies.map(l => ({ lead_id: l.id, why: "Replied on WhatsApp" })), dueToday.filter(t => Date.parse(t.due_at) <= nowMs() + 30 * 60000).map(t => ({ lead_id: t.lead_id, why: t.title, task_id: t.id })), hot.map(l => ({ lead_id: l.id, why: "Hot lead" })), jq.demo_idle.map(l => ({ lead_id: l.id, why: l.why })));
      const seen = new Set(), dial = order.filter(x => !seen.has(x.lead_id) && seen.add(x.lead_id));
      const calls = store.all("activities").filter(a => a.user_id === u.id && a.type === "call" && localDay(a.created_at) === today);
      return {
        overdue, today: dueToday, fresh, hot, replies, dial, journey: jq,
        stats: { calls: calls.length, connected: calls.filter(a => a.data.connected).length, talk_min: Math.round(sum(calls.map(a => a.data.duration_sec)) / 60), open_leads: leads.length, sla_minutes: settings().sla_minutes },
      };
    }

    /* ---------- lead list / detail ---------- */
    function listLeads(u, f = {}) {
      const now = nowIso(), q = lc(f.q);
      let rows = store.all("leads").filter(l => canSee(u, l));
      if (f.owner === "me") rows = rows.filter(l => l.owner_id === u.id);
      else if (f.owner === "none") rows = rows.filter(l => !l.owner_id);
      else if (f.owner && isMgr(u)) rows = rows.filter(l => l.owner_id === f.owner);
      if (f.stage === "open") rows = rows.filter(l => OPEN.has(l.stage)); else if (f.stage) rows = rows.filter(l => arr(f.stage).includes(l.stage));
      if (f.country) rows = rows.filter(l => l.country === f.country);
      if (f.city) rows = rows.filter(l => lc(l.city) === lc(f.city));
      if (f.source) rows = rows.filter(l => (l.utm_source || "direct") === f.source);
      if (f.temperature) rows = rows.filter(l => l.temperature === f.temperature);
      if (f.interest) rows = rows.filter(l => l.interest === f.interest);
      if (f.from) rows = rows.filter(l => localDay(l.created_at) >= f.from);
      if (f.to) rows = rows.filter(l => localDay(l.created_at) <= f.to);
      if (f.untouched) rows = rows.filter(l => !l.attempts && OPEN.has(l.stage));
      if (f.overdue) { const od = new Set(store.all("tasks").filter(t => !t.done_at && t.due_at < now).map(t => t.lead_id)); rows = rows.filter(l => od.has(l.id)); }
      if (q) rows = rows.filter(l => [l.first_name + " " + l.last_name, l.email, l.dial_code + l.phone, l.phone, l.reference, l.city, l.account_id].join(" ").toLowerCase().includes(q) || (digits(q).length >= 5 && l.phone_key.includes(digits(q).slice(-9))));
      const key = { created: "created_at", name: "first_name", score: "score", activity: "last_activity_at", followup: "next_follow_up_at", stage: "stage" }[f.sort] || "created_at";
      const dir = f.dir === "asc" ? 1 : -1;
      rows.sort((a, b) => { const x = a[key] ?? "", y = b[key] ?? ""; if (key === "stage") return (STAGE_IDX[x] - STAGE_IDX[y]) * dir; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir || b.created_at.localeCompare(a.created_at); });
      const size = Math.min(200, Math.max(10, Number(f.pageSize) || 50)), page = Math.max(1, Number(f.page) || 1);
      return {
        total: rows.length, page, pageSize: size,
        rows: rows.slice((page - 1) * size, page * size).map(l => ({ id: l.id, reference: l.reference, first_name: l.first_name, last_name: l.last_name, email: l.email, dial_code: l.dial_code, phone: l.phone, country: l.country, city: l.city, interest: l.interest, stage: l.stage, temperature: l.temperature, score: l.score, owner_id: l.owner_id, owner_name: userName(l.owner_id), utm_source: l.utm_source || "direct", utm_campaign: l.utm_campaign, created_at: l.created_at, last_activity_at: l.last_activity_at, next_follow_up_at: l.next_follow_up_at, attempts: l.attempts, duplicate_of: l.duplicate_of || null, dnc: l.dnc, sample: l.sample, client: !!l.client_id, lifecycle: lifecycleOf(l) })),
      };
    }
    function getLead(u, id) {
      const l = leadFor(u, id);
      const acts = store.all("activities").filter(a => a.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map(a => Object.assign({}, a, { user_name: userName(a.user_id) }));
      const msgs = store.all("messages").filter(m => m.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const tasks = store.all("tasks").filter(t => t.lead_id === id).sort((a, b) => (a.done_at ? 1 : 0) - (b.done_at ? 1 : 0) || a.due_at.localeCompare(b.due_at));
      const dups = store.all("leads").filter(x => x.id !== l.id && ((l.email && x.email === l.email) || (l.phone_key.length >= 7 && x.phone_key === l.phone_key))).map(x => Object.assign(brief(x), { visible: canSee(u, x) }));
      const owner = store.get("users", l.owner_id);
      const waOpen = l.last_inbound_at && nowMs() - Date.parse(l.last_inbound_at) < 24 * 3600e3;
      const deposits = store.all("deposits").filter(d => d.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(depositRow);
      const files = store.all("files").filter(f => f.lead_id === id).map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, kind: f.kind, created_at: f.created_at, by: userName(f.created_by) }));
      if (unreadLead(l) && l.owner_id === u.id) { l.inbox_seen_at = nowIso(); store.put("leads", l); }
      return { lead: clone(l), owner: owner ? { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email } : null, activities: acts, messages: msgs, tasks, duplicates: dups, whatsapp_window_open: !!waOpen, deposits, files, can_work: isSales(u), next_step: nextStep(l), bonuses: bonusForLead(id), bonus_eligibility: isSales(u) && l.stage !== "funded" ? bonusEligibility(u, id) : null, journey: journeyFlags(l), bonus_settings: bonusCfg(), portal: portalSummaryForLead(l), lifecycle: lifecycleForLead(l), stage_days: Math.round((nowMs() - Date.parse(stageSince(l))) / 864e5 * 10) / 10 };
    }

    /* ---------- messages ---------- */
    function vars(l) {
      const s = settings(), o = store.get("users", l.owner_id) || {};
      return { first_name: l.first_name, last_name: l.last_name, full_name: (l.first_name + " " + l.last_name).trim(), reference: l.reference, interest: l.interest, country: l.country, city: l.city, agent_name: o.name || "Your account specialist", agent_phone: o.phone || "+" + s.whatsapp_number, agent_email: o.email || s.support_email, company: s.company, register_url: s.register_url, login_url: s.login_url, whatsapp_number: "+" + s.whatsapp_number, unsubscribe_url: opts.unsubscribeUrl ? opts.unsubscribeUrl(l) : (s.site_url || "") + "/unsubscribe" };
    }
    const render = (txt, v) => String(txt || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (v[k] != null ? String(v[k]) : ""));
    function queueMessage(l, by, t, extra = {}) {
      const v = vars(l), ch = t ? t.channel : extra.channel;
      const m = {
        id: newId("M"), lead_id: l.id, channel: ch, direction: "out", template_id: t ? t.id : null, rule_id: extra.rule_id || null, user_id: by.id,
        to: ch === "email" ? l.email : "+" + digits(l.dial_code + l.phone), subject: t ? render(t.subject, v) : clean(extra.subject, 200), body: t ? render(t.body, v) : clean(extra.text, 4000),
        wa_template: t && ch === "whatsapp" ? { name: t.wa_template_name || "", language: t.wa_language || "en", params: arr(t.wa_params).map(k => v[k] != null ? String(v[k]) : "") } : null,
        status: "queued", error: "", provider_id: "", created_at: nowIso(), sent_at: null, broadcast_id: extra.broadcast_id || null,
      };
      // Marketing emails always carry an unsubscribe line
      if (extra.broadcast_id && ch === "email" && !/unsubscribe/i.test(m.body)) m.body += "\n\n—\nDon't want these emails? Unsubscribe: " + v.unsubscribe_url;
      const unsub = (l.unsubscribed || {})[ch];
      if (l.dnc && !extra.transactional) { m.status = "blocked"; m.error = "Lead is marked Do not contact"; }
      else if (extra.transactional && ch === "email" && EMAIL_RE.test(l.email || "")) { /* account notices always go */ }
      else if (unsub && !extra.manual) { m.status = "blocked"; m.error = "Client unsubscribed from " + (ch === "email" ? "email" : "WhatsApp") + " messages"; }
      else if (ch === "email" && !EMAIL_RE.test(l.email || "")) { m.status = "blocked"; m.error = "Lead has no valid email"; }
      else if (ch === "whatsapp" && t && !t.wa_template_name && !(l.last_inbound_at && nowMs() - Date.parse(l.last_inbound_at) < 24 * 3600e3)) { m.status = "blocked"; m.error = "WhatsApp needs an approved template outside the 24-hour reply window"; }
      store.put("messages", m);
      activity(l, by, "message", { message_id: m.id, channel: ch, subject: m.subject, preview: m.body.slice(0, 160), status: m.status, rule_id: m.rule_id, template: t ? t.name : "", transactional: !!extra.transactional, broadcast: !!extra.broadcast_id });
      if (m.status === "queued") onQueue(clone(m));
      return m;
    }
    function sendMessage(u, leadId, p) {
      const l = leadFor(u, leadId, true);
      if (!["email", "whatsapp"].includes(p.channel)) throw new CrmError("Choose email or WhatsApp.");
      let t = null;
      if (p.template_id) { t = store.get("templates", p.template_id); if (!t || t.channel !== p.channel) throw new CrmError("Template not found."); }
      else {
        if (!clean(p.text)) throw new CrmError("Write a message or choose a template.");
        if (p.channel === "whatsapp" && !(l.last_inbound_at && nowMs() - Date.parse(l.last_inbound_at) < 24 * 3600e3)) throw new CrmError("Free-text WhatsApp is only allowed within 24 hours of the client's last message. Use an approved template.");
      }
      const m = queueMessage(l, u, t, { channel: p.channel, subject: p.subject, text: p.text, manual: true });
      saveLead(l); return m;
    }
    function markMessage(id, status, extra = {}) {
      const m = store.get("messages", id) || store.all("messages").find(x => x.provider_id && x.provider_id === extra.provider_id);
      if (!m) return null;
      const order = ["queued", "sent", "simulated", "delivered", "read"];
      if (status !== "failed" && order.indexOf(status) >= 0 && order.indexOf(m.status) > order.indexOf(status)) return m;
      m.status = status; if (extra.provider_id) m.provider_id = extra.provider_id; if (extra.error) m.error = clean(extra.error, 300);
      if (["sent", "simulated"].includes(status)) m.sent_at = nowIso();
      store.put("messages", m);
      const a = store.all("activities").find(x => x.type === "message" && x.data.message_id === m.id); if (a) { a.data.status = status; store.put("activities", a); }
      return m;
    }
    function recordInbound(p) {
      const key = digits(p.phone).slice(-9);
      let l = store.all("leads").filter(x => x.phone_key === key).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!l) l = createLead(SYSTEM, { first_name: p.name || "WhatsApp", last_name: "contact", phone: digits(p.phone), dial_code: "+", country: p.country || "Unknown", form: "whatsapp", utm: { utm_source: "whatsapp" } }, { requireEmail: false, source: "whatsapp" });
      const m = { id: newId("M"), lead_id: l.id, channel: p.channel || "whatsapp", direction: "in", to: "", subject: "", body: clean(p.text, 4000), status: "received", provider_id: clean(p.provider_id, 120), created_at: nowIso(), user_id: "system" };
      store.put("messages", m);
      l.last_inbound_at = m.created_at;
      activity(l, SYSTEM, "message", { message_id: m.id, channel: m.channel, direction: "in", preview: m.body.slice(0, 160), status: "received" });
      if (/^\s*(stop|unsubscribe|stop all|توقف|بند)\s*[.!]*\s*$/i.test(m.body)) {
        l.unsubscribed = Object.assign({}, l.unsubscribed, { [m.channel]: true });
        activity(l, SYSTEM, "edit", { fields: ["unsubscribed." + m.channel], changes: [{ field: "unsubscribed." + m.channel, from: "false", to: "true (client replied STOP)" }] });
      }
      notify(l.owner_id, `💬 ${l.first_name} ${l.last_name} replied on WhatsApp: "${m.body.slice(0, 60)}"`, l.id, "reply");
      saveLead(l); fire("whatsapp_reply", l);
      return { lead_id: l.id, message_id: m.id };
    }
    function listMessages(u, f = {}) {
      need(u, u2 => canComm(u2) || isMkt(u2));
      if (f.broadcast_id) return store.all("messages").filter(m => m.broadcast_id === f.broadcast_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300).map(m => Object.assign({}, m, { lead: brief(store.get("leads", m.lead_id)) }));
      let rows = store.all("messages");
      if (f.channel) rows = rows.filter(m => m.channel === f.channel);
      if (f.status) rows = rows.filter(m => m.status === f.status);
      if (f.direction) rows = rows.filter(m => m.direction === f.direction);
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return rows.slice(0, 300).map(m => Object.assign({}, m, { lead: brief(store.get("leads", m.lead_id)), rule_name: m.rule_id ? (store.get("automations", m.rule_id) || {}).name || "" : "" }));
    }

    /* ---------- automation engine ---------- */
    function conditionsOk(c, l) {
      c = c || {};
      const chk = (list, val) => !arr(list).length || arr(list).map(lc).includes(lc(val));
      return chk(c.stages, l.stage) && chk(c.countries, l.country) && chk(c.interests, l.interest) && chk(c.sources, l.utm_source || "direct") && chk(c.temperatures, l.temperature) && (!c.no_owner_only || !l.owner_id);
    }
    function triggerOk(r, l, ev) {
      const t = r.trigger || {};
      if (t.type === "stage_changed") return !arr(t.stages).length || arr(t.stages).includes(ev ? ev.to : l.stage);
      if (t.type === "call_logged") return !arr(t.outcomes).length || arr(t.outcomes).includes(ev ? ev.outcome : l.last_outcome);
      if (t.type === "no_contact") return OPEN.has(l.stage) && !l.connected_calls && nowMs() - Date.parse(l.created_at) >= (Number(t.hours) || 24) * 3600e3;
      if (t.type === "inactive") return OPEN.has(l.stage) && nowMs() - Date.parse(l.last_activity_at || l.created_at) >= (Number(t.days) || 7) * 864e5;
      if (t.type === "stage_stuck") return OPEN.has(l.stage) && !l.deposit_pending && (!arr(t.stages).length || arr(t.stages).includes(l.stage)) && nowMs() - Date.parse(stageSince(l)) >= (Number(t.days) || 2) * 864e5;
      if (t.type === "demo_idle") return OPEN.has(l.stage) && !!(l.demo && l.demo.given_at && !l.demo.first_trade_at) && nowMs() - Date.parse(l.demo.given_at) >= (Number(t.days) || 2) * 864e5;
      if (t.type === "registration_incomplete") { const x = l.client_id && store.get("clients", l.client_id); return !!x && lifecycleOf(l) === "registered" && nowMs() - Date.parse(x.created_at) >= (Number(t.hours) || 24) * 3600e3; }
      if (t.type === "funded_not_trading") { if (lifecycleOf(l) !== "funded") return false; const f = clientFacts(l), first = f.deps.map(p => p.completed_at).sort()[0] || l.funded_at; return !!first && nowMs() - Date.parse(first) >= (Number(t.days) || 3) * 864e5; }
      if (t.type === "client_dormant") return lifecycleOf(l) === "dormant";
      if (t.type === "bonus_expiring") return OPEN.has(l.stage) && store.all("bonuses").some(b => b.lead_id === l.id && ["credited", "traded"].includes(b.status) && Date.parse(b.expires_at) - nowMs() <= (Number(t.days) || 5) * 864e5);
      return true;
    }
    function inQuiet(ms) {
      const q = settings().quiet; if (!q || !q.enabled) return 0;
      const toMin = s => { const [h, m] = String(s).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
      const d = new Date(ms + tz() * 60000), cur = d.getUTCHours() * 60 + d.getUTCMinutes(), st = toMin(q.start), en = toMin(q.end);
      const quiet = st > en ? cur >= st || cur < en : cur >= st && cur < en;
      if (!quiet) return 0;
      let wait = en - cur; if (wait < 0) wait += 1440; return wait * 60000;
    }
    function schedule(r, l, ev) {
      if (r.once_per_lead !== false && store.all("jobs").some(j => j.rule_id === r.id && j.lead_id === l.id)) return null;
      let run = nowMs() + (Number(r.delay_minutes) || 0) * 60000;
      if (arr(r.actions).some(a => a.type === "send_email" || a.type === "send_whatsapp")) run += inQuiet(run);
      const j = { id: newId("J"), rule_id: r.id, lead_id: l.id, event: r.trigger.type, ev: ev || null, run_at: new Date(run).toISOString(), status: "pending", result: "", created_at: nowIso(), done_at: null };
      store.put("jobs", j); return j;
    }
    function fire(type, l, ev) {
      for (const r of store.all("automations")) {
        if (r.active === false || !r.trigger || r.trigger.type !== type) continue;
        if (!triggerOk(r, l, ev) || !conditionsOk(r.conditions, l)) continue;
        schedule(r, l, ev);
      }
    }
    function runJob(j) {
      const r = store.get("automations", j.rule_id), l = store.get("leads", j.lead_id);
      const done = (status, result) => { j.status = status; j.result = result; j.done_at = nowIso(); store.put("jobs", j); };
      if (!r || !l) return done("cancelled", "Rule or lead no longer exists");
      if (r.active === false) return done("cancelled", "Rule switched off");
      if (!conditionsOk(r.conditions, l)) return done("skipped", "Conditions no longer match");
      if (TIME_TRIGGERS.has(r.trigger.type) && !triggerOk(r, l)) return done("skipped", "Trigger no longer true");
      const out = [];
      for (const a of arr(r.actions)) {
        try {
          if (a.type === "send_email" || a.type === "send_whatsapp") {
            const t = store.get("templates", a.template_id);
            if (!t) { out.push("template missing"); continue; }
            const m = queueMessage(l, { id: "system", name: "Automation" }, t, { rule_id: r.id }); out.push(`${t.channel} ${m.status}`);
          } else if (a.type === "create_task") {
            if (!l.owner_id) { out.push("task skipped: unassigned"); continue; }
            createTaskFor(l, SYSTEM, { type: a.task_type || "call", title: a.title || r.name, due_at: new Date(nowMs() + (Number(a.due_in_hours) || 0) * 3600e3).toISOString(), auto: true }); out.push("task created");
          } else if (a.type === "notify_owner") {
            notify(l.owner_id, render(a.text || r.name, vars(l)), l.id, "auto"); out.push("owner notified");
          } else if (a.type === "notify_managers") {
            store.all("users").filter(x => x.active !== false && (x.role === "manager" || x.role === "admin")).forEach(x => notify(x.id, render(a.text || r.name, vars(l)) + ` (${l.reference})`, l.id, "auto")); out.push("managers notified");
          } else if (a.type === "change_stage") {
            if (a.stage && a.stage !== l.stage) { const from = setStage(l, { id: "system" }, a.stage, { lost_reason: a.lost_reason || "Unreachable after attempts" }); out.push("stage → " + a.stage); if (from !== false) { saveLead(l); fire("stage_changed", l, { from, to: a.stage }); } }
          } else if (a.type === "reassign") {
            const p = pickOwner(l); if (p.owner && p.owner.id !== l.owner_id) { setOwner(l, p.owner, SYSTEM, "Automation: " + r.name); out.push("reassigned"); }
          }
        } catch (e) { out.push("error: " + e.message); }
      }
      activity(l, SYSTEM, "automation", { rule_id: r.id, rule: r.name, result: out.join(", ") });
      saveLead(l); done("done", out.join(", "));
    }
    function tick() { return withFacts(tick0); }
    function tick0() {
      // 1) time-based triggers
      const timed = store.all("automations").filter(r => r.active !== false && r.trigger && TIME_TRIGGERS.has(r.trigger.type));
      if (timed.length) {
        const leads = store.all("leads").filter(l => OPEN.has(l.stage) || l.stage === "funded" || l.client_id);
        for (const r of timed) for (const l of leads) if (triggerOk(r, l) && conditionsOk(r.conditions, l)) schedule(r, l);
      }
      // 2) due jobs
      const now = nowIso(); let ran = 0;
      store.all("jobs").filter(j => j.status === "pending" && j.run_at <= now).sort((a, b) => a.run_at.localeCompare(b.run_at)).slice(0, 200).forEach(j => { runJob(j); ran++; });
      // 3) lead hygiene (SLA reassignment, recycling) and 4) broadcasts
      const hy = hygieneTick(), bc = runBroadcasts(), bx = journeyTick(); gatewayTick(); ibTick(); ibCheckCpa();
      return { ran, reassigned: hy.reassigned, recycled: hy.recycled, broadcast_sent: bc.sent, bonus_expired: bx };
    }

    /* ---------- config CRUD ---------- */
    function crud(col, perm, prep) {
      return {
        list: u => { need(u, col === "rules" ? isMgr : x => canComm(x) || isMkt(x)); return store.all(col).sort((a, b) => (a.priority || 0) - (b.priority || 0) || String(a.name).localeCompare(String(b.name))); },
        save: (u, obj) => { need(u, perm); const cur = obj.id ? store.get(col, obj.id) : null; const o = prep(Object.assign({}, cur || {}, obj), cur); o.id = cur ? cur.id : newId(col[0].toUpperCase()); o.updated_at = nowIso(); if (!cur) o.created_at = o.updated_at; return store.put(col, o); },
        remove: (u, id) => { need(u, perm); store.remove(col, id); return { ok: true }; },
      };
    }
    const listOf = v => arr(v).map(x => clean(x, 80)).filter(Boolean);
    const rulesCrud = crud("rules", isMgr, o => {
      if (!clean(o.name)) throw new CrmError("Name the territory.", 422, { name: "Required" });
      o.name = clean(o.name, 80); o.active = o.active !== false; o.priority = Number(o.priority) || 0; o.method = o.method === "least_loaded" ? "least_loaded" : "round_robin";
      o.match = { countries: listOf(o.match && o.match.countries), cities: listOf(o.match && o.match.cities), areas: listOf(o.match && o.match.areas), sources: listOf(o.match && o.match.sources).map(s => s.toLowerCase()), interests: listOf(o.match && o.match.interests), languages: listOf(o.match && o.match.languages) };
      o.agents = arr(o.agents).filter(id => store.get("users", id)); o.cursor = o.cursor || 0; return o;
    });
    const tplCrud = crud("templates", canComm, o => {
      if (!clean(o.name)) throw new CrmError("Name the template.", 422, { name: "Required" });
      if (!["email", "whatsapp"].includes(o.channel)) throw new CrmError("Choose a channel.");
      o.name = clean(o.name, 80); o.subject = clean(o.subject, 200); o.body = clean(o.body, 6000);
      if (!o.body) throw new CrmError("Write the message text.", 422, { body: "Required" });
      o.wa_template_name = clean(o.wa_template_name, 120).toLowerCase().replace(/[^a-z0-9_]/g, "_"); o.wa_language = clean(o.wa_language, 12) || "en";
      o.wa_params = arr(o.wa_params).filter(k => TEMPLATE_VARS.includes(k)); return o;
    });
    const autoCrud = crud("automations", canComm, o => {
      if (!clean(o.name)) throw new CrmError("Name the automation.", 422, { name: "Required" });
      if (!o.trigger || !TRIGGERS.includes(o.trigger.type)) throw new CrmError("Choose a trigger.");
      o.name = clean(o.name, 100); o.active = o.active !== false; o.delay_minutes = Math.max(0, Number(o.delay_minutes) || 0); o.once_per_lead = o.once_per_lead !== false;
      o.trigger = { type: o.trigger.type, stages: listOf(o.trigger.stages), outcomes: listOf(o.trigger.outcomes), hours: Number(o.trigger.hours) || 24, days: Number(o.trigger.days) || ({ stage_stuck: 2, demo_idle: 2, bonus_expiring: 5, funded_not_trading: 3, client_dormant: 30 }[o.trigger.type] || 7) };
      o.conditions = { stages: listOf(o.conditions && o.conditions.stages), countries: listOf(o.conditions && o.conditions.countries), interests: listOf(o.conditions && o.conditions.interests), sources: listOf(o.conditions && o.conditions.sources), temperatures: listOf(o.conditions && o.conditions.temperatures) };
      o.actions = arr(o.actions).filter(a => a && a.type).map(a => ({ type: a.type, template_id: a.template_id || "", task_type: a.task_type || "call", title: clean(a.title, 120), due_in_hours: Number(a.due_in_hours) || 0, text: clean(a.text, 300), stage: a.stage || "", lost_reason: clean(a.lost_reason, 80) }));
      if (!o.actions.length) throw new CrmError("Add at least one action.");
      return o;
    });

    /* ---------- users & security ---------- */
    const LOCK_AFTER = 5, LOCK_MIN = 15;
    const isLocked = x => x && x.locked_until && Date.parse(x.locked_until) > nowMs();
    const needs2fa = x => { const req = arr(settings().require_2fa_roles); return !!x && req.includes(x.role) && !x.totp_enabled; };
    const publicUser = x => ({ id: x.id, name: x.name, email: x.email, username: x.username, phone: x.phone, role: x.role, active: x.active !== false, accepts_leads: x.accepts_leads !== false, languages: x.languages || [], team: x.team || "", target_ftd: x.target_ftd || 0, target_amount: x.target_amount || 0, extension: x.extension || "", created_at: x.created_at, last_login_at: x.last_login_at || null, sample: !!x.sample,
      has_password: !!x.password_hash, must_change_password: !!x.must_change_password, totp_enabled: !!x.totp_enabled, needs_2fa_setup: needs2fa(x), locked: !!isLocked(x), locked_until: isLocked(x) ? x.locked_until : null, failed_logins: x.failed_logins || 0, password_changed_at: x.password_changed_at || null, session_ver: x.session_ver || 0 });
    function checkPassword(pw, username) {
      pw = String(pw || "");
      if (pw.length < 10) throw new CrmError("Use at least 10 characters for the password.", 422, { password: "At least 10 characters" });
      if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new CrmError("Use letters and numbers in the password.", 422, { password: "Letters and numbers" });
      if (username && pw.toLowerCase().includes(String(username).toLowerCase())) throw new CrmError("The password can't contain your username or the name part of your email.", 422, { password: "Contains your name" });
      if (/^(password|absel|qwerty|12345)/i.test(pw)) throw new CrmError("Choose a less common password.", 422, { password: "Too common" });
      return true;
    }
    function listUsers(u) {
      need(u, x => isMgr(x) || isMktMgr(x));
      return store.all("users").map(x => Object.assign(publicUser(x), { open_leads: openLeadsOf(x.id), territories: store.all("rules").filter(r => arr(r.agents).includes(x.id)).map(r => r.name) })).sort((a, b) => a.name.localeCompare(b.name));
    }
    // o.passwordHash: a hash the adapter computed (the browser prototype hashes asynchronously)
    function saveUser(u, p, o2 = {}) {
      need(u, isAdmin, "Only admins can manage users.");
      const cur = p.id ? store.get("users", p.id) : null;
      const o = Object.assign({}, cur || {});
      o.name = clean(p.name ?? o.name, 80); if (!o.name) throw new CrmError("Enter a name.", 422, { name: "Required" });
      o.email = lc(p.email ?? o.email); o.phone = clean(p.phone ?? o.phone, 30); o.team = clean(p.team ?? o.team, 60);
      o.username = lc(p.username ?? o.username).replace(/[^a-z0-9._-]/g, "");
      if (o.username.length < 3) throw new CrmError("Use at least 3 letters or numbers for the username.", 422, { username: "Too short" });
      if (store.all("users").some(x => x.username === o.username && x.id !== o.id)) throw new CrmError("That username is taken.", 422, { username: "Taken" });
      o.role = ROLES.includes(p.role) ? p.role : o.role || "agent";
      const wasActive = cur ? cur.active !== false : true;
      o.active = p.active !== undefined ? !!p.active : o.active !== false; o.accepts_leads = p.accepts_leads !== undefined ? !!p.accepts_leads : o.accepts_leads !== false;
      o.languages = p.languages !== undefined ? listOf(p.languages) : o.languages || []; o.target_ftd = Number(p.target_ftd ?? o.target_ftd) || 0; o.target_amount = Number(p.target_amount ?? o.target_amount) || 0; o.extension = clean(p.extension ?? o.extension, 20);
      if (cur && cur.id === u.id && (o.role !== "admin" || !o.active)) throw new CrmError("You can't remove your own admin access.");
      if (p.password) {
        checkPassword(p.password, o.username);
        const h = o2.passwordHash || (opts.hashPassword && opts.hashPassword(String(p.password)));
        if (!h) throw new CrmError("Passwords can't be set here.");
        o.password_hash = h; o.password_changed_at = nowIso(); o.session_ver = (o.session_ver || 0) + 1;
        o.must_change_password = u.id === o.id ? false : p.must_change_password !== false;
        o.failed_logins = 0; o.locked_until = null;
      } else if (!cur) throw new CrmError("Set a starting password for the new account.", 422, { password: "Required" });
      if (wasActive && !o.active) o.session_ver = (o.session_ver || 0) + 1; // deactivating signs them out
      o.id = cur ? cur.id : newId("U"); if (!cur) o.created_at = nowIso(); o.updated_at = nowIso();
      store.put("users", o);
      if (cur) logSecurity(u, cur.id === u.id ? "profile_updated" : "user_updated", o); else logSecurity(u, "user_created", o);
      return publicUser(o);
    }
    function logSecurity(by, event, target, meta = {}) {
      store.put("logins", { id: newId("G"), event, user_id: target ? target.id : null, username: target ? target.username : clean(meta.username, 60), by: by ? by.id : null, ip: clean(meta.ip, 64), ua: clean(meta.ua, 200), detail: clean(meta.detail, 200), created_at: nowIso() });
      const all = store.all("logins"); if (all.length > 5000) all.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, all.length - 5000).forEach(x => store.remove("logins", x.id));
    }
    // Step 1 of sign-in: find the account (the adapter then checks the password hash itself)
    function authLookup(username) {
      const x = store.all("users").find(y => y.username === lc(username));
      if (!x) return { user: null };
      return { user: { id: x.id, username: x.username, password_hash: x.password_hash || "", active: x.active !== false, locked: !!isLocked(x), locked_until: x.locked_until || null, totp_enabled: !!x.totp_enabled, session_ver: x.session_ver || 0 } };
    }
    // Step 2: record the result. outcome: ok | bad_password | bad_code | unknown | locked | inactive
    function authResult(username, outcome, meta = {}) {
      const x = store.all("users").find(y => y.username === lc(username));
      if (!x) { logSecurity(null, "login_unknown_user", null, Object.assign({ username }, meta)); return null; }
      if (outcome === "ok") {
        x.failed_logins = 0; x.locked_until = null; x.last_login_at = nowIso(); store.put("users", x);
        logSecurity(x, "login_ok", x, meta); return publicUser(x);
      }
      if (outcome === "bad_password" || outcome === "bad_code") {
        x.failed_logins = (x.failed_logins || 0) + 1;
        if (x.failed_logins >= LOCK_AFTER) { x.locked_until = new Date(nowMs() + LOCK_MIN * 60000).toISOString(); x.failed_logins = 0; logSecurity(null, "account_locked", x, meta); }
        store.put("users", x);
      }
      logSecurity(null, "login_" + outcome, x, meta);
      return null;
    }
    function changeOwnPassword(u, newPassword, o2 = {}) {
      const x = store.get("users", u.id); if (!x) throw new CrmError("User not found", 404);
      checkPassword(newPassword, x.username);
      const h = o2.passwordHash || (opts.hashPassword && opts.hashPassword(String(newPassword)));
      if (!h) throw new CrmError("Passwords can't be set here.");
      if (opts.verifyPassword && x.password_hash && opts.verifyPassword(String(newPassword), x.password_hash)) throw new CrmError("Choose a password you haven't just used.", 422, { new: "Same as current" });
      x.password_hash = h; x.password_changed_at = nowIso(); x.must_change_password = false; x.session_ver = (x.session_ver || 0) + 1;
      store.put("users", x); logSecurity(x, "password_changed", x);
      return publicUser(x);
    }
    function adminUserAction(u, userId, action) {
      need(u, isAdmin, "Only admins can do this.");
      const x = store.get("users", userId); if (!x) throw new CrmError("User not found", 404);
      if (action === "unlock") { x.locked_until = null; x.failed_logins = 0; }
      else if (action === "signout") x.session_ver = (x.session_ver || 0) + 1;
      else if (action === "reset_2fa") { if (x.id === u.id) throw new CrmError("Turn off your own two-step verification from your account menu."); x.totp_enabled = false; x.totp_secret = null; x.totp_pending = null; x.session_ver = (x.session_ver || 0) + 1; }
      else throw new CrmError("Unknown action");
      store.put("users", x); logSecurity(u, "admin_" + action, x);
      return publicUser(x);
    }
    function totpBegin(u) {
      const x = store.get("users", u.id); if (!x) throw new CrmError("User not found", 404);
      if (!opts.random) throw new CrmError("Not available here.");
      x.totp_pending = base32Encode(opts.random(20)); store.put("users", x);
      const issuer = encodeURIComponent((settings().company || "Absel") + " CRM");
      return { secret: x.totp_pending, otpauth: `otpauth://totp/${issuer}:${encodeURIComponent(x.username)}?secret=${x.totp_pending}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
    }
    function totpEnable(u, code) {
      const x = store.get("users", u.id); if (!x || !x.totp_pending) throw new CrmError("Start the setup again.");
      if (!totpVerify(x.totp_pending, code, nowMs())) throw new CrmError("That code is wrong or expired. Check your phone's clock and try the newest code.", 422, { code: "Wrong code" });
      x.totp_secret = x.totp_pending; x.totp_pending = null; x.totp_enabled = true; store.put("users", x); logSecurity(x, "2fa_enabled", x);
      return publicUser(x);
    }
    function totpDisable(u, code) {
      const x = store.get("users", u.id); if (!x || !x.totp_enabled) throw new CrmError("Two-step verification is not on.");
      if (arr(settings().require_2fa_roles).includes(x.role)) throw new CrmError("Your role requires two-step verification. Ask an admin to change this in Settings.");
      if (!totpVerify(x.totp_secret, code, nowMs())) throw new CrmError("That code is wrong or expired.", 422, { code: "Wrong code" });
      x.totp_enabled = false; x.totp_secret = null; store.put("users", x); logSecurity(x, "2fa_disabled", x);
      return publicUser(x);
    }
    const totpCheck = (userId, code) => { const x = store.get("users", userId); return !!(x && x.totp_enabled && totpVerify(x.totp_secret, code, nowMs())); };
    function listLogins(u, f = {}) {
      need(u, isAdmin, "Only admins can see sign-in activity.");
      let rows = store.all("logins"); if (f.user_id) rows = rows.filter(r => r.user_id === f.user_id);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300).map(r => Object.assign({}, r, { name: r.user_id ? userName(r.user_id) : "", by_name: r.by && r.by !== r.user_id ? userName(r.by) : "" }));
    }
    // Before a signed-in user can work: forced password change and required 2FA setup
    function gate(u) { const x = store.get("users", u.id); if (!x) return "gone"; if (x.must_change_password) return "change_password"; if (needs2fa(x)) return "setup_2fa"; return null; }
    function setTarget(u, userId, ftd, amount) {
      need(u, isMgr, "Only sales managers set targets.");
      const x = store.get("users", userId); if (!x || !isSalesRole(x.role)) throw new CrmError("Choose a sales team member.");
      x.target_ftd = Math.max(0, Math.round(Number(ftd) || 0)); x.target_amount = Math.max(0, Math.round(Number(amount) || 0)); x.updated_at = nowIso();
      store.put("users", x); return publicUser(x);
    }
    function setAvailability(u, accepts) { const x = store.get("users", u.id); if (!x) throw new CrmError("User not found", 404); x.accepts_leads = !!accepts; store.put("users", x); return publicUser(x); }
    function exportAll(u) {
      need(u, isAdmin, "Only admins can download a full backup.");
      const cols = COLLECTIONS;
      logSecurity(u, "backup_downloaded", u);
      return { format: "absel-crm-backup", version: 1, exported_at: nowIso(), collections: Object.fromEntries(cols.map(c => [c, clone(store.all(c))])) };
    }

    /* ---------- notifications ---------- */
    function listNotifications(u) { return store.all("notifications").filter(n => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50); }
    function markRead(u, ids) { store.all("notifications").filter(n => n.user_id === u.id && !n.read && (!ids || arr(ids).includes(n.id))).forEach(n => { n.read = true; store.put("notifications", n); }); return { ok: true }; }

    /* ---------- settings ---------- */
    function getSettings() { return clone(settings()); }
    function saveSettings(u, p) {
      need(u, isAdmin, "Only admins can change settings.");
      const s = settings();
      ["company", "register_url", "login_url", "support_email", "currency"].forEach(k => { if (p[k] !== undefined) s[k] = clean(p[k], 300); });
      if (p.whatsapp_number !== undefined) s.whatsapp_number = digits(p.whatsapp_number);
      ["tz_offset_min", "sla_minutes", "max_attempts"].forEach(k => { if (p[k] !== undefined) s[k] = Number(p[k]) || 0; });
      if (p.retry_hours !== undefined) s.retry_hours = arr(typeof p.retry_hours === "string" ? p.retry_hours.split(",") : p.retry_hours).map(Number).filter(n => n > 0);
      if (p.fallback !== undefined) s.fallback = p.fallback === "round_robin_all" ? "round_robin_all" : "pool";
      if (p.quiet) s.quiet = { enabled: !!p.quiet.enabled, start: /^\d{2}:\d{2}$/.test(p.quiet.start) ? p.quiet.start : "21:00", end: /^\d{2}:\d{2}$/.test(p.quiet.end) ? p.quiet.end : "09:00" };
      if (p.lost_reasons) s.lost_reasons = listOf(p.lost_reasons);
      if (p.require_2fa_roles !== undefined) s.require_2fa_roles = arr(p.require_2fa_roles).filter(r => ROLES.includes(r));
      if (p.site_url !== undefined) s.site_url = clean(p.site_url, 300).replace(/\/+$/, "");
      if (p.deposit_approval !== undefined) s.deposit_approval = !!p.deposit_approval;
      if (p.stuck_days) s.stuck_days = { qualified: Math.max(1, Number(p.stuck_days.qualified) || 3), registered: Math.max(1, Number(p.stuck_days.registered) || 2), kyc: Math.max(1, Number(p.stuck_days.kyc) || 2) };
      if (p.sla_reassign) s.sla_reassign = { enabled: !!p.sla_reassign.enabled, minutes: Math.max(5, Number(p.sla_reassign.minutes) || 30), max: Math.max(1, Math.min(5, Number(p.sla_reassign.max) || 2)) };
      if (p.recycle) s.recycle = { enabled: !!p.recycle.enabled, days: Math.max(1, Number(p.recycle.days) || 30), max: Math.max(1, Math.min(5, Number(p.recycle.max) || 1)), reasons: p.recycle.reasons !== undefined ? listOf(p.recycle.reasons) : s.recycle.reasons };
      ["broadcast_rate_per_min", "broadcast_cap_days"].forEach(k => { if (p[k] !== undefined) s[k] = Math.max(0, Number(p[k]) || 0); });
      if (p.broadcast_approval !== undefined) s.broadcast_approval = !!p.broadcast_approval;
      if (p.mis_email) s.mis_email = { enabled: !!p.mis_email.enabled, recipients: arr(typeof p.mis_email.recipients === "string" ? p.mis_email.recipients.split(/[,\s]+/) : p.mis_email.recipients).map(lc).filter(e => EMAIL_RE.test(e)).slice(0, 20), hour: Math.max(0, Math.min(23, Number(p.mis_email.hour) || 0)) };
      if (p.portal) {
        const c = Object.assign(clone(DEFAULT_SETTINGS.portal), s.portal || {}), q = p.portal;
        ["brand", "legal_line", "risk_warning", "support_email", "default_server"].forEach(k => { if (q[k] !== undefined) c[k] = clean(q[k], k === "legal_line" || k === "risk_warning" ? 800 : 120); });
        if (q.enabled !== undefined) c.enabled = !!q.enabled; if (q.require_kyc_for_live !== undefined) c.require_kyc_for_live = !!q.require_kyc_for_live;
        if (q.second_approval_over !== undefined) c.second_approval_over = Math.max(0, Number(q.second_approval_over) || 0);
        if (Array.isArray(q.account_types)) c.account_types = q.account_types.filter(t => t && clean(t.name)).slice(0, 12).map((t, i) => ({ id: clean(t.id, 20).toLowerCase().replace(/[^a-z0-9_]/g, "") || "acc" + i, name: clean(t.name, 40), desc: clean(t.desc, 120), min_deposit: Math.max(0, Number(t.min_deposit) || 0), leverages: arr(typeof t.leverages === "string" ? t.leverages.split(/[,\s]+/) : t.leverages).map(Number).filter(n => n > 0).slice(0, 10), currencies: arr(typeof t.currencies === "string" ? t.currencies.split(/[,\s]+/) : t.currencies).map(x => clean(x, 5).toUpperCase()).filter(Boolean).slice(0, 5), mt5_group: clean(t.mt5_group, 80), mt5_demo_group: clean(t.mt5_demo_group, 80) }));
        if (Array.isArray(q.methods)) c.methods = q.methods.filter(m => m && clean(m.name)).slice(0, 20).map((m, i) => ({ id: clean(m.id, 20).toLowerCase().replace(/[^a-z0-9_]/g, "") || "m" + i, name: clean(m.name, 40), kind: ["bank", "card", "crypto", "ewallet", "other"].includes(m.kind) ? m.kind : "other", deposit: m.deposit !== false, withdraw: m.withdraw !== false, enabled: m.enabled !== false, min: Math.max(0, Number(m.min) || 0), max: Math.max(0, Number(m.max) || 0), eta: clean(m.eta, 60), instructions: clean(m.instructions, 1500), link: /^https:\/\//.test(m.link || "") ? clean(m.link, 400) : "", gateway: ["b2binpay", "cyrafa"].includes(m.gateway) ? m.gateway : "", gateway_wallet: clean(m.gateway_wallet, 40) }));
        if (q.platform_links) c.platform_links = Object.fromEntries(["windows", "ios", "android", "web"].map(k => [k, /^https:\/\//.test(q.platform_links[k] || "") ? clean(q.platform_links[k], 400) : c.platform_links[k]]));
        s.portal = c;
      }
      if (p.lifecycle) s.lifecycle = { dormant_days: Math.max(7, Number(p.lifecycle.dormant_days) || 30) };
      if (p.ib) { const c = ibCfg(), q = p.ib; s.ib = Object.assign({}, settings().ib || {}, { enabled: q.enabled !== undefined ? !!q.enabled : c.enabled, payout_min: q.payout_min !== undefined ? Math.max(1, Number(q.payout_min) || 50) : c.payout_min, click_days: q.click_days !== undefined ? Math.max(30, Math.min(730, Number(q.click_days) || 180)) : c.click_days,
          agreement_version: q.agreement_version !== undefined ? clean(q.agreement_version, 20) || c.agreement_version : c.agreement_version, agreement_text: q.agreement_text !== undefined ? String(q.agreement_text || "").replace(/\u0000/g, "").slice(0, 20000) : c.agreement_text,
          symbol_groups: Array.isArray(q.symbol_groups) ? q.symbol_groups.filter(g => g && SYMBOL_GROUPS.includes(g.group) && clean(g.pattern, 200) && (() => { try { new RegExp(g.pattern); return true; } catch (e) { return false; } })()).map(g => ({ group: g.group, pattern: clean(g.pattern, 200) })).slice(0, 30) : c.symbol_groups }); }
      if (p.mt5) { const before = !!(s.mt5 || {}).account_creation_enabled; s.mt5 = Object.assign({}, DEFAULT_SETTINGS.mt5, s.mt5);
        if (p.mt5.account_creation_enabled !== undefined) s.mt5.account_creation_enabled = !!p.mt5.account_creation_enabled;
        if (p.mt5.auto_demo !== undefined) s.mt5.auto_demo = !!p.mt5.auto_demo;
        if (p.mt5.match_after_hours !== undefined) s.mt5.match_after_hours = Math.max(0.25, Math.min(168, Number(p.mt5.match_after_hours) || 2));
        delete s.mt5.writes_enabled; // the old switch also moved money in MT5; it no longer exists
        if (before !== s.mt5.account_creation_enabled) logSecurity(u, s.mt5.account_creation_enabled ? "mt5_accounts_on" : "mt5_accounts_off", null, { detail: `MT5 account creation switched ${s.mt5.account_creation_enabled ? "on" : "off"} (before: ${before ? "on" : "off"})` }); }
      if (p.bonus) { const b = Object.assign({}, DEFAULT_SETTINGS.bonus, s.bonus), n = (v, d, min = 0) => v === undefined ? d : Math.max(min, Number(v) || 0);
        s.bonus = { enabled: p.bonus.enabled !== undefined ? !!p.bonus.enabled : b.enabled, amount: n(p.bonus.amount, b.amount, 1), require_kyc: p.bonus.require_kyc !== undefined ? !!p.bonus.require_kyc : b.require_kyc, expiry_days: n(p.bonus.expiry_days, b.expiry_days, 1),
          min_lots: n(p.bonus.min_lots, b.min_lots), max_profit: n(p.bonus.max_profit, b.max_profit), monthly_cap: n(p.bonus.monthly_cap, b.monthly_cap), withdraw_needs_deposit: p.bonus.withdraw_needs_deposit !== undefined ? !!p.bonus.withdraw_needs_deposit : b.withdraw_needs_deposit }; }
      store.put("settings", s); return clone(s);
    }

    /* ---------- import / export ---------- */
    function importLeads(u, rows, o = {}) {
      need(u, x => isMgr(x) || isMktMgr(x), "Only managers can import leads.");
      const res = { created: 0, failed: [] };
      arr(rows).slice(0, 5000).forEach((r, i) => {
        try { createLead(u, Object.assign({ form: "import" }, r), { source: "import", requireEmail: false, owner_id: o.owner_id || undefined }); res.created++; }
        catch (e) { res.failed.push({ row: i + 2, error: e.fields ? Object.values(e.fields).join(", ") : e.message }); }
      });
      return res;
    }
    function exportLeads(u, f) {
      need(u, x => isMgr(x) || isMktMgr(x), "Only managers can export leads.");
      const keep = []; let p = 1;
      for (;;) { const pg = listLeads(u, Object.assign({}, f, { pageSize: 200, page: p })); pg.rows.forEach(r => keep.push(r.id)); if (p * 200 >= pg.total) break; p++; }
      const cols = ["reference", "created_at", "stage", "temperature", "score", "owner", "first_name", "last_name", "email", "dial_code", "phone", "country", "city", "area", "interest", "experience", "capital", "expected_deposit", "deposit_amount", "account_id", "attempts", "connected_calls", "first_contact_at", "lost_reason", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref_code", "gclid", "fbclid"];
      const rows = keep.map(id => store.get("leads", id)).map(l => Object.assign({}, l, { owner: userName(l.owner_id), capital: (l.profile || {}).capital || "", expected_deposit: (l.profile || {}).expected_deposit || "" }));
      return { columns: cols, rows: rows.map(r => cols.map(c => r[c] == null ? "" : r[c])) };
    }

    /* ---------- reports ---------- */
    function scope(u, f) {
      f = Object.assign({}, f || {});
      const today = localDay(nowIso());
      if (!f.to) f.to = today;
      if (!f.from) f.from = localDay(new Date(nowMs() - 29 * 864e5).toISOString());
      if (u.role === "agent") f.agent = u.id;
      const inR = iso => { const d = localDay(iso); return d && d >= f.from && d <= f.to; };
      const leadOk = l => (!f.agent || l.owner_id === f.agent) && (!f.source || (l.utm_source || "direct") === f.source) && (!f.country || l.country === f.country) && !(f.exclude_samples && l.sample);
      const leads = store.all("leads").filter(leadOk);
      const leadIds = new Set(leads.map(l => l.id));
      const acts = store.all("activities").filter(a => leadIds.has(a.lead_id) && (!f.agent || a.user_id === f.agent || a.type === "message"));
      return { f, inR, leads, acts, cohort: leads.filter(l => inR(l.created_at)), leadIds };
    }
    function metricsFor(cohort) {
      const n = cohort.length, reached = k => cohort.filter(l => l.reached && l.reached[k]).length;
      const stl = cohort.filter(l => l.first_contact_at).map(l => (Date.parse(l.first_contact_at) - Date.parse(l.created_at)) / 60000);
      const funded = cohort.filter(l => l.reached && l.reached.funded);
      return { leads: n, contacted: cohort.filter(l => l.first_contact_at).length, connected: cohort.filter(l => l.first_connected_at).length, qualified: reached("qualified"), registered: reached("registered"), kyc: reached("kyc"), funded: funded.length, ftd_amount: sum(funded.map(l => l.deposit_amount)), conversion: pct(funded.length, n), median_speed_min: stl.length ? Math.round(median(stl)) : null, within_sla: pct(stl.filter(m => m <= settings().sla_minutes).length, n) };
    }
    function days(f) { const out = []; let d = Date.parse(f.from + "T00:00:00Z"); const e = Date.parse(f.to + "T00:00:00Z"); while (d <= e && out.length < 400) { out.push(new Date(d).toISOString().slice(0, 10)); d += 864e5; } return out; }
    function groupBy(list, key) { const m = new Map(); list.forEach(x => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; }

    const REPORTS = {
      dashboard(u, s) {
        const { f, inR, leads, acts, cohort } = s, now = nowIso();
        const calls = acts.filter(a => a.type === "call" && inR(a.created_at));
        const wonInRange = leads.filter(l => l.funded_at && inR(l.funded_at));
        const regInRange = leads.filter(l => l.reached && l.reached.registered && inR(l.reached.registered));
        const openTasks = store.all("tasks").filter(t => !t.done_at && s.leadIds.has(t.lead_id) && (!f.agent || t.owner_id === f.agent));
        const m = metricsFor(cohort);
        const series = days(f).map(d => ({ d, leads: cohort.filter(l => localDay(l.created_at) === d).length, calls: calls.filter(a => localDay(a.created_at) === d).length, funded: wonInRange.filter(l => localDay(l.funded_at) === d).length }));
        const pipeline = STAGES.map(st => ({ k: st.id, label: st.label, n: leads.filter(l => l.stage === st.id).length }));
        const sources = [...groupBy(cohort, l => l.utm_source || "direct")].map(([k, v]) => ({ k, n: v.length, funded: v.filter(l => l.reached.funded).length })).sort((a, b) => b.n - a.n).slice(0, 6);
        const agents = isMgr(u) ? REPORTS.agents(u, s).rows.slice(0, 6) : [];
        return {
          range: f, kpis: Object.assign(m, {
            calls: calls.length, connected_calls: calls.filter(a => a.data.connected).length, talk_hours: Math.round(sum(calls.map(a => a.data.duration_sec)) / 360) / 10,
            registered_in_range: regInRange.length, funded_in_range: wonInRange.length, ftd_in_range: sum(wonInRange.map(l => l.deposit_amount)),
            uncontacted_now: leads.filter(l => OPEN.has(l.stage) && !l.attempts).length, overdue_now: openTasks.filter(t => t.due_at < now).length,
            unassigned_now: isMgr(u) ? leads.filter(l => !l.owner_id && OPEN.has(l.stage)).length : 0, hot_now: leads.filter(l => OPEN.has(l.stage) && l.temperature === "hot").length,
          }), series, pipeline, sources, agents,
        };
      },
      funnel(u, s) {
        const m = metricsFor(s.cohort);
        const steps = [["leads", "Leads"], ["contacted", "Call attempted"], ["connected", "Spoke to client"], ["qualified", "Qualified"], ["registered", "Registered"], ["kyc", "KYC verified"], ["funded", "Funded (FTD)"]];
        return { range: s.f, steps: steps.map(([k, label], i) => ({ k, label, n: m[k], of_total: pct(m[k], m.leads), of_prev: i ? pct(m[k], m[steps[i - 1][0]]) : 100 })), metrics: m };
      },
      agents(u, s) {
        const { inR } = s, now = nowIso();
        const team = store.all("users").filter(x => x.role === "agent" || s.leads.some(l => l.owner_id === x.id)).filter(x => !s.f.agent || x.id === s.f.agent);
        const rows = team.map(x => {
          const mine = s.leads.filter(l => l.owner_id === x.id), cohort = mine.filter(l => inR(l.assigned_at || l.created_at));
          const calls = s.acts.filter(a => a.type === "call" && a.user_id === x.id && inR(a.created_at));
          const con = calls.filter(a => a.data.connected);
          const wonAll = mine.filter(l => l.funded_at && inR(l.funded_at)), won = wonAll.filter(l => !l.ib_client); // IB-referred FTDs are counted apart
          const reg = mine.filter(l => l.reached.registered && inR(l.reached.registered));
          const stl = cohort.filter(l => l.first_contact_at).map(l => (Date.parse(l.first_contact_at) - Date.parse(l.assigned_at || l.created_at)) / 60000).filter(v => v >= 0);
          const tasks = store.all("tasks").filter(t => t.owner_id === x.id);
          const workDays = new Set(calls.map(a => localDay(a.created_at))).size || 0;
          return {
            id: x.id, name: x.name, role: x.role, team: x.team || "", active: x.active !== false,
            assigned: cohort.length, open_leads: mine.filter(l => OPEN.has(l.stage)).length,
            contacted_pct: pct(cohort.filter(l => l.first_contact_at).length, cohort.length),
            calls: calls.length, connected: con.length, connect_rate: pct(con.length, calls.length), calls_per_day: workDays ? Math.round(calls.length / workDays) : 0,
            talk_min: Math.round(sum(calls.map(a => a.data.duration_sec)) / 60), avg_call_sec: con.length ? Math.round(sum(con.map(a => a.data.duration_sec)) / con.length) : 0,
            median_speed_min: stl.length ? Math.round(median(stl)) : null,
            notes: s.acts.filter(a => a.type === "note" && a.user_id === x.id && inR(a.created_at)).length,
            messages: s.acts.filter(a => a.type === "message" && a.user_id === x.id && inR(a.created_at)).length,
            tasks_done: tasks.filter(t => t.done_at && inR(t.done_at) && t.outcome !== "cancelled").length, overdue_now: tasks.filter(t => !t.done_at && t.due_at < now).length,
            registered: reg.length, funded: won.length, ib_ftd: wonAll.length - won.length, conversion: pct(cohort.filter(l => l.reached.funded).length, cohort.length), ftd_amount: sum(won.map(l => l.deposit_amount)),
            target_ftd: x.target_ftd || 0, target_pct: x.target_ftd ? pct(won.length, x.target_ftd) : null,
          };
        }).sort((a, b) => b.funded - a.funded || b.ftd_amount - a.ftd_amount || b.connected - a.connected);
        return { range: s.f, rows };
      },
      sources(u, s) {
        const by = (k) => [...groupBy(s.cohort, k)].map(([key, list]) => Object.assign({ key }, metricsFor(list))).sort((a, b) => b.leads - a.leads);
        return { range: s.f, sources: by(l => l.utm_source || "direct"), campaigns: by(l => (l.utm_source || "direct") + " / " + (l.utm_campaign || "(none)")), interests: by(l => l.interest || "(not set)") };
      },
      geo(u, s) {
        const owners = list => [...new Set(list.map(l => userName(l.owner_id)))].slice(0, 4).join(", ");
        const countries = [...groupBy(s.cohort, l => l.country || "(unknown)")].map(([key, list]) => Object.assign({ key, agents: owners(list) }, metricsFor(list))).sort((a, b) => b.leads - a.leads);
        const cities = [...groupBy(s.cohort, l => (l.city || "(no city)") + ", " + (l.country || ""))].map(([key, list]) => Object.assign({ key, agents: owners(list) }, metricsFor(list))).sort((a, b) => b.leads - a.leads).slice(0, 50);
        const territories = store.all("rules").map(r => { const list = s.cohort.filter(l => ruleMatches(r.match, l)); return Object.assign({ key: r.name, agents: arr(r.agents).map(userName).join(", ") }, metricsFor(list)); });
        return { range: s.f, countries, cities, territories };
      },
      calls(u, s) {
        const calls = s.acts.filter(a => a.type === "call" && s.inR(a.created_at));
        const outcomes = OUTCOMES.map(o => ({ k: o.id, label: o.label, connected: !!o.connected, n: calls.filter(a => a.data.outcome === o.id).length }));
        const heat = Array.from({ length: 7 }, () => Array(24).fill(0)), heatCon = Array.from({ length: 7 }, () => Array(24).fill(0));
        calls.forEach(a => { const [h, d] = localHourDow(a.created_at); heat[d][h]++; if (a.data.connected) heatCon[d][h]++; });
        const daily = days(s.f).map(d => { const c = calls.filter(a => localDay(a.created_at) === d); return { d, calls: c.length, connected: c.filter(a => a.data.connected).length, talk_min: Math.round(sum(c.map(a => a.data.duration_sec)) / 60) }; });
        const con = calls.filter(a => a.data.connected);
        return { range: s.f, total: calls.length, connected: con.length, connect_rate: pct(con.length, calls.length), avg_talk_sec: con.length ? Math.round(sum(con.map(a => a.data.duration_sec)) / con.length) : 0, outcomes, heat, heat_connected: heatCon, daily,
          recent: calls.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40).map(a => ({ at: a.created_at, agent: userName(a.user_id), lead: brief(store.get("leads", a.lead_id)), outcome: a.data.outcome, duration_sec: a.data.duration_sec, notes: a.data.notes })) };
      },
      discovery(u, s) {
        const calls = s.acts.filter(a => a.type === "call" && s.inR(a.created_at) && a.data.qa);
        const count = (field) => { const m = {}; calls.forEach(a => arr(a.data.qa[field]).forEach(v => (m[v] = (m[v] || 0) + 1))); return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
        const prof = (field) => { const m = {}; s.cohort.forEach(l => { const v = (l.profile || {})[field]; arr(v).forEach(x => (m[x] = (m[x] || 0) + 1)); }); return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
        const objWon = {}; s.cohort.forEach(l => arr((l.profile || {}).objections).forEach(o => { objWon[o] = objWon[o] || { n: 0, won: 0 }; objWon[o].n++; if (l.reached.funded) objWon[o].won++; }));
        return { range: s.f, objections: count("objections").map(o => Object.assign(o, { converted_pct: objWon[o.k] ? pct(objWon[o.k].won, objWon[o.k].n) : 0 })), capital: prof("capital"), instruments: prof("instruments"), timeline: prof("timeline"), account_type: prof("account_type"), experience: prof("experience"), brokers: prof("current_broker").slice(0, 12),
          questions: calls.filter(a => a.data.qa.questions).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40).map(a => ({ at: a.created_at, agent: userName(a.user_id), lead: brief(store.get("leads", a.lead_id)), text: a.data.qa.questions })) };
      },
      lost(u, s) {
        const lost = s.leads.filter(l => l.stage === "lost" && s.acts.some(a => a.lead_id === l.id && a.type === "stage" && a.data.to === "lost" && s.inR(a.created_at)));
        const reasons = [...groupBy(lost, l => l.lost_reason || "(none)")].map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n);
        const byAgent = [...groupBy(lost, l => userName(l.owner_id))].map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n);
        return { range: s.f, total: lost.length, reasons, by_agent: byAgent, invalid: s.leads.filter(l => l.stage === "invalid").length };
      },
      mis(u, s) {
        const g = s.f.group || "day";
        const bucket = iso => { const d = localDay(iso); if (g === "month") return d.slice(0, 7); if (g === "week") { const t = new Date(d + "T00:00:00Z"); const dow = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - dow * 864e5).toISOString().slice(0, 10); } return d; };
        const keys = [...new Set(days(s.f).map(d => bucket(d + "T12:00:00Z")))];
        const calls = s.acts.filter(a => a.type === "call" && s.inR(a.created_at)), msgs = s.acts.filter(a => a.type === "message" && s.inR(a.created_at) && a.data.direction !== "in");
        const rows = keys.map(k => {
          const c = calls.filter(a => bucket(a.created_at) === k), cohort = s.cohort.filter(l => bucket(l.created_at) === k);
          const reg = s.leads.filter(l => l.reached.registered && s.inR(l.reached.registered) && bucket(l.reached.registered) === k);
          const won = s.leads.filter(l => l.funded_at && s.inR(l.funded_at) && bucket(l.funded_at) === k);
          return { period: k, new_leads: cohort.length, contacted: s.leads.filter(l => l.first_contact_at && s.inR(l.first_contact_at) && bucket(l.first_contact_at) === k).length, calls: c.length, connected: c.filter(a => a.data.connected).length, talk_min: Math.round(sum(c.map(a => a.data.duration_sec)) / 60), qualified: s.leads.filter(l => l.reached.qualified && s.inR(l.reached.qualified) && bucket(l.reached.qualified) === k).length, registered: reg.length, funded: won.length, ftd_amount: sum(won.map(l => l.deposit_amount)), messages: msgs.filter(a => bucket(a.created_at) === k).length };
        });
        const total = rows.reduce((t, r) => { Object.keys(r).forEach(k => { if (k !== "period") t[k] = (t[k] || 0) + r[k]; }); return t; }, { period: "Total" });
        return { range: s.f, group: g, rows, total };
      },
      automation(u, s) {
        const jobs = store.all("jobs").filter(j => s.leadIds.has(j.lead_id) && s.inR(j.created_at));
        const msgs = store.all("messages").filter(m => s.leadIds.has(m.lead_id) && s.inR(m.created_at));
        const rules = store.all("automations").map(r => { const j = jobs.filter(x => x.rule_id === r.id), m = msgs.filter(x => x.rule_id === r.id); return { id: r.id, name: r.name, active: r.active !== false, scheduled: j.length, done: j.filter(x => x.status === "done").length, skipped: j.filter(x => x.status === "skipped" || x.status === "cancelled").length, pending: j.filter(x => x.status === "pending").length, sent: m.filter(x => ["sent", "delivered", "read", "simulated"].includes(x.status)).length, failed: m.filter(x => x.status === "failed" || x.status === "blocked").length }; });
        const channels = ["email", "whatsapp"].map(c => { const m = msgs.filter(x => x.channel === c && x.direction === "out"); return { k: c, total: m.length, sent: m.filter(x => ["sent", "simulated"].includes(x.status)).length, delivered: m.filter(x => x.status === "delivered").length, read: m.filter(x => x.status === "read").length, failed: m.filter(x => x.status === "failed" || x.status === "blocked").length, replies: msgs.filter(x => x.channel === c && x.direction === "in").length }; });
        return { range: s.f, rules, channels };
      },
    };
    function report(u, type, f) {
      if (!REPORTS[type]) throw new CrmError("Unknown report.");
      if (u.role === "agent" && !["dashboard", "funnel", "calls", "agents", "discovery", "mis", "deposits", "qa", "activity", "journey"].includes(type)) need(u, isMgr);
      if (!isSales(u) && ["agents", "calls", "qa", "activity", "discovery"].includes(type)) need(u, isMgr, "That report is for the sales team.");
      return REPORTS[type](u, scope(u, f));
    }

    /* =====================================================================
       SALES: verified first deposits
       ===================================================================== */
    function makeDeposit(l, u, d) {
      const dep = {
        id: newId("D"), lead_id: l.id, owner_id: l.owner_id, amount: Math.round((Number(d.amount) || 0) * 100) / 100, currency: settings().currency || "USD",
        method: clean(d.method, 40), tx_ref: clean(d.tx_ref, 80), account_id: clean(d.account_id || l.account_id, 40),
        deposited_at: d.deposited_at && !isNaN(Date.parse(d.deposited_at)) ? new Date(Date.parse(d.deposited_at)).toISOString() : nowIso(),
        proof_file_id: d.proof_file_id || null, note: clean(d.note, 500), status: "pending", is_ftd: true,
        created_by: u.id, created_at: nowIso(), verified_by: null, verified_at: null, reject_reason: "",
      };
      store.put("deposits", dep); return dep;
    }
    function submitDeposit(u, leadId, d = {}) {
      const l = leadFor(u, leadId, true);
      if (l.stage === "funded") throw new CrmError("This client is already funded. Only the first deposit is tracked here.");
      if (store.all("deposits").some(x => x.lead_id === l.id && x.status === "pending")) throw new CrmError("A deposit for this client is already waiting for verification.");
      const amount = Number(d.amount);
      if (!(amount > 0)) throw new CrmError("Enter the deposit amount.", 422, { amount: "Required", deposit_amount: "Required" });
      if (d.deposited_at && Date.parse(d.deposited_at) > nowMs() + 3600e3) throw new CrmError("The deposit date can't be in the future.", 422, { deposited_at: "In the future" });
      if (d.proof_file_id) { const f = store.get("files", d.proof_file_id); if (!f || f.lead_id !== l.id) throw new CrmError("Upload the proof again."); }
      const dep = makeDeposit(l, u, Object.assign({}, d, { amount }));
      if (d.account_id && !l.account_id) l.account_id = clean(d.account_id, 40);
      l.deposit_pending = true;
      activity(l, u, "deposit", { status: "submitted", deposit_id: dep.id, amount: dep.amount, method: dep.method, tx_ref: dep.tx_ref });
      saveLead(l);
      if (!settings().deposit_approval || (isMgr(u) && d.verify)) return verifyDeposit(isMgr(u) ? u : SYSTEM, dep.id, true);
      store.all("users").filter(x => x.active !== false && (x.role === "manager" || x.role === "admin")).forEach(x => notify(x.id, `💰 FTD to verify: ${l.first_name} ${l.last_name} · $${dep.amount.toLocaleString()} (${userName(l.owner_id)})`, l.id, "deposit"));
      fire("deposit_submitted", l);
      return dep;
    }
    function applyVerifiedDeposit(l, dep, u) {
      dep.status = "verified"; dep.verified_by = u.id; dep.verified_at = nowIso(); store.put("deposits", dep);
      const from = setStage(l, u, "funded", { fromDeposit: true, deposit_amount: dep.amount, at: dep.deposited_at });
      l.deposit_amount = dep.amount; l.funded_at = dep.deposited_at; l.deposit_pending = false;
      if (dep.account_id && !l.account_id) l.account_id = dep.account_id;
      activity(l, u, "deposit", { status: "verified", deposit_id: dep.id, amount: dep.amount });
      if (dep.owner_id && dep.owner_id !== u.id) notify(dep.owner_id, `🎉 FTD verified: ${l.first_name} ${l.last_name} · $${dep.amount.toLocaleString()}`, l.id, "win");
      saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: "funded" });
    }
    function verifyDeposit(u, id, approve, reason) {
      need(u, isMgr, "Only sales managers can verify deposits.");
      const dep = store.get("deposits", id); if (!dep) throw new CrmError("Deposit not found.", 404);
      if (dep.status !== "pending") throw new CrmError("This deposit was already " + dep.status + ".");
      const l = store.get("leads", dep.lead_id); if (!l) throw new CrmError("Lead not found.", 404);
      if (approve) {
        applyVerifiedDeposit(l, dep, u);
      } else {
        const why = clean(reason, 300); if (!why) throw new CrmError("Say why the deposit is rejected so the agent can fix it.", 422, { reason: "Required" });
        dep.status = "rejected"; dep.verified_by = u.id; dep.verified_at = nowIso(); dep.reject_reason = why; store.put("deposits", dep);
        l.deposit_pending = false;
        activity(l, u, "deposit", { status: "rejected", deposit_id: dep.id, amount: dep.amount, reason: why });
        [dep.owner_id, dep.created_by].filter((x, i, a) => x && a.indexOf(x) === i && x !== u.id).forEach(x => notify(x, `Deposit not verified for ${l.first_name} ${l.last_name}: ${why}`, l.id, "warn"));
        saveLead(l);
      }
      return Object.assign({}, dep);
    }
    function depositRow(d) {
      const l = store.get("leads", d.lead_id);
      return Object.assign({}, d, { lead: brief(l), owner_name: userName(d.owner_id), created_by_name: userName(d.created_by), verified_by_name: d.verified_by ? userName(d.verified_by) : "", source: l ? l.utm_source || "direct" : "", campaign: l ? l.utm_campaign || "" : "" });
    }
    function listDeposits(u, f = {}) {
      let rows = store.all("deposits").filter(d => { const l = store.get("leads", d.lead_id); return l && canSee(u, l) && (seesAll(u) || d.owner_id === u.id || d.created_by === u.id); });
      if (f.status) rows = rows.filter(d => d.status === f.status);
      if (f.owner && seesAll(u)) rows = rows.filter(d => d.owner_id === f.owner);
      rows.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.created_at.localeCompare(a.created_at));
      return rows.slice(0, 500).map(depositRow);
    }

    /* ---------- files (deposit proof, documents) ---------- */
    const FILE_RE = /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;
    function uploadFile(u, leadId, f = {}) {
      const l = leadFor(u, leadId, true);
      const data = String(f.data || "");
      if (!FILE_RE.test(data)) throw new CrmError("Upload a JPG, PNG, WebP image or a PDF.");
      if (data.length > 3.2e6) throw new CrmError("That file is too big. Keep it under 2 MB (a phone screenshot is fine).");
      const rec = { id: newId("F"), lead_id: l.id, kind: clean(f.kind, 30) || "document", name: clean(f.name, 120) || "file", type: data.slice(5, data.indexOf(";")), size: Math.round(data.length * 0.75), data, created_by: u.id, created_at: nowIso() };
      store.put("files", rec);
      activity(l, u, "file", { file_id: rec.id, name: rec.name, kind: rec.kind }); saveLead(l);
      return { id: rec.id, name: rec.name, type: rec.type, size: rec.size };
    }
    function getFile(u, id) { const f = store.get("files", id); if (!f) throw new CrmError("File not found.", 404); leadFor(u, f.lead_id); return Object.assign({}, f); }

    /* =====================================================================
       SALES: pre-deposit checklist and pipeline
       ===================================================================== */
    function setChecklist(u, leadId, key, done, value) {
      const l = leadFor(u, leadId, true), item = CHECKLIST.find(c => c.id === key);
      if (!item || item.auto) throw new CrmError("That step is ticked automatically.");
      l.checklist = l.checklist || {};
      let from = false;
      if (done) {
        const entry = { at: nowIso(), by: u.id };
        if (item.input === "account_id") { const v = clean(value, 40); if (v) { entry.value = v; l.account_id = v; } }
        if (item.input === "method") { const v = clean(value, 40); if (!v) throw new CrmError("Choose the deposit method.", 422, { value: "Required" }); entry.value = v; }
        if (item.input === "promise") {
          const amount = Number(value && value.amount) || 0, at = value && Date.parse(value.date);
          if (!(amount > 0) || !at) throw new CrmError("Enter the promised amount and date.", 422, { value: "Required" });
          entry.value = { amount, date: new Date(at).toISOString() };
          l.promised_amount = amount; l.promised_at = entry.value.date;
          createTaskFor(l, u, { type: "call", title: `Deposit promised: $${amount.toLocaleString()}. Check it arrived`, due_at: entry.value.date });
        }
        l.checklist[key] = entry;
        activity(l, u, "checklist", { item: item.label, done: true, value: typeof entry.value === "object" ? `$${entry.value.amount} on ${entry.value.date.slice(0, 10)}` : entry.value || "" });
        if (item.stage && OPEN.has(l.stage) && STAGE_IDX[l.stage] < STAGE_IDX[item.stage]) from = setStage(l, u, item.stage, { account_id: entry.value });
      } else {
        if (!l.checklist[key]) return clone(l);
        delete l.checklist[key];
        activity(l, u, "checklist", { item: item.label, done: false });
      }
      saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: l.stage });
      return clone(l);
    }
    function nextStep(l) {
      if (l.deposit_pending) return "Deposit waiting for verification";
      const c = l.checklist || {}, it = CHECKLIST.find(x => !x.auto && !c[x.id]);
      return it ? it.label : "Get the deposit and submit it";
    }
    function listPipeline(u, f = {}) {
      const st = settings(), now = nowMs();
      let rows = store.all("leads").filter(l => canSee(u, l) && ["qualified", "registered", "kyc"].includes(l.stage));
      if (u.role === "agent" || f.owner === "me") rows = rows.filter(l => l.owner_id === u.id); else if (f.owner && seesAll(u)) rows = rows.filter(l => l.owner_id === f.owner);
      const out = rows.map(l => {
        const days = (now - Date.parse(stageSince(l))) / 864e5, lim = (st.stuck_days || {})[l.stage] || 3;
        const done = CHECKLIST.filter(c => (l.checklist || {})[c.id]).length;
        return Object.assign(brief(l), { journey: journeyFlags(l), owner_id: l.owner_id, owner_name: userName(l.owner_id), checklist: l.checklist || {}, done, steps: CHECKLIST.length, next: nextStep(l), days_in_stage: Math.round(days * 10) / 10, stuck: !l.deposit_pending && days >= lim, deposit_pending: !!l.deposit_pending, promised_amount: l.promised_amount || 0, promised_at: l.promised_at || null, expected_deposit: (l.profile || {}).expected_deposit || 0, next_follow_up_at: l.next_follow_up_at, last_activity_at: l.last_activity_at });
      }).sort((a, b) => (b.deposit_pending - a.deposit_pending) || (b.stuck - a.stuck) || b.days_in_stage - a.days_in_stage);
      const by = k => out.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {});
      return { rows: out, by_next: by("next"), by_stage: by("stage"), stuck: out.filter(r => r.stuck).length, pending: out.filter(r => r.deposit_pending).length, promised_total: sum(out.map(r => r.promised_amount)), expected_total: sum(out.map(r => r.expected_deposit)) };
    }

    /* =====================================================================
       SALES: monthly targets and leaderboard
       ===================================================================== */
    function targets(u, f = {}) {
      const today = localDay(nowIso()), month = /^\d{4}-\d{2}$/.test(f.month || "") ? f.month : today.slice(0, 7);
      const [y, mo] = month.split("-").map(Number), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const elapsed = month < today.slice(0, 7) ? dim : month > today.slice(0, 7) ? 0 : Number(today.slice(8, 10));
      const inMonth = iso => iso && localDay(iso).slice(0, 7) === month;
      const isIb = d => !!(store.get("leads", d.lead_id) || {}).ib_client;
      const allDeps = store.all("deposits").filter(d => d.status === "verified" && inMonth(d.deposited_at)), deps = allDeps.filter(d => !isIb(d)), ibDeps = allDeps.filter(isIb);
      const pend = store.all("deposits").filter(d => d.status === "pending" && !isIb(d));
      const calls = store.all("activities").filter(a => a.type === "call" && inMonth(a.created_at));
      const people = store.all("users").filter(x => isSalesRole(x.role) && (x.active !== false || deps.some(d => d.owner_id === x.id)) && (x.role === "agent" || x.target_ftd || deps.some(d => d.owner_id === x.id)));
      const rows = people.map(x => {
        const mine = deps.filter(d => d.owner_id === x.id), n = mine.length, amt = sum(mine.map(d => d.amount));
        return { id: x.id, name: x.name, team: x.team || "", role: x.role, ftd: n, amount: amt, pending: pend.filter(d => d.owner_id === x.id).length, pending_amount: sum(pend.filter(d => d.owner_id === x.id).map(d => d.amount)),
          calls: calls.filter(a => a.user_id === x.id).length, target_ftd: x.target_ftd || 0, target_amount: x.target_amount || 0,
          pct: x.target_ftd ? pct(n, x.target_ftd) : null, amount_pct: x.target_amount ? pct(amt, x.target_amount) : null,
          projection: elapsed ? Math.round((n / elapsed) * dim * 10) / 10 : 0, me: x.id === u.id, ib_ftd: ibDeps.filter(d => d.owner_id === x.id).length };
      }).sort((a, b) => b.ftd - a.ftd || b.amount - a.amount || b.calls - a.calls);
      rows.forEach((r, i) => (r.rank = i + 1));
      const teams = [...groupBy(rows, r => r.team || "No team")].map(([team, list]) => ({ team, people: list.length, ftd: sum(list.map(r => r.ftd)), amount: sum(list.map(r => r.amount)), target_ftd: sum(list.map(r => r.target_ftd)), target_amount: sum(list.map(r => r.target_amount)), pending: sum(list.map(r => r.pending)) })).map(t => Object.assign(t, { pct: t.target_ftd ? pct(t.ftd, t.target_ftd) : null })).sort((a, b) => b.ftd - a.ftd);
      const total = { ftd: sum(rows.map(r => r.ftd)), amount: sum(rows.map(r => r.amount)), target_ftd: sum(rows.map(r => r.target_ftd)), target_amount: sum(rows.map(r => r.target_amount)), pending: sum(rows.map(r => r.pending)) };
      total.ib_ftd = ibDeps.length; total.ib_ftd_amount = sum(ibDeps.map(d => d.amount));
      total.pct = total.target_ftd ? pct(total.ftd, total.target_ftd) : null; total.projection = elapsed ? Math.round((total.ftd / elapsed) * dim) : 0;
      return { month, days_in_month: dim, elapsed, expected_pct: Math.round((elapsed / dim) * 100), rows, teams, total };
    }

    /* =====================================================================
       SALES: lead hygiene — do-not-contact list, duplicates, recycling, SLA
       ===================================================================== */
    const dncMatch = l => store.all("dnc").some(d => (d.phone_key && l.phone_key && l.phone_key.length >= 7 && d.phone_key === l.phone_key) || (d.email && l.email && d.email === l.email));
    function addDncFor(l, u, reason) {
      if (dncMatch(l)) return;
      store.put("dnc", { id: newId("X"), phone_key: l.phone_key || "", phone: "+" + digits(l.dial_code + l.phone), email: l.email || "", name: (l.first_name + " " + l.last_name).trim(), reason: clean(reason, 200), source: "lead", lead_id: l.id, created_by: u.id, created_at: nowIso() });
    }
    function removeDncFor(l) { store.all("dnc").filter(d => (d.phone_key && d.phone_key === l.phone_key) || (d.email && l.email && d.email === l.email)).forEach(d => store.remove("dnc", d.id)); }
    const dncPerm = u => isMgr(u) || isMktMgr(u);
    function listDnc(u) { need(u, x => dncPerm(x) || isMkt(x)); return store.all("dnc").sort((a, b) => b.created_at.localeCompare(a.created_at)).map(d => Object.assign({}, d, { by_name: userName(d.created_by) })); }
    function addDnc(u, p = {}) {
      need(u, dncPerm, "Only managers can change the do-not-contact list.");
      const key = phoneKey(p.dial_code, p.phone), email = lc(p.email);
      if (key.length < 7 && !EMAIL_RE.test(email)) throw new CrmError("Enter a phone number or an email.", 422, { phone: "Required" });
      const d = { id: newId("X"), phone_key: key.length >= 7 ? key : "", phone: key.length >= 7 ? "+" + digits(String(p.dial_code || "") + p.phone) : "", email: EMAIL_RE.test(email) ? email : "", name: clean(p.name, 80), reason: clean(p.reason, 200) || "Asked not to be contacted", source: "manual", created_by: u.id, created_at: nowIso() };
      store.put("dnc", d);
      let n = 0;
      store.all("leads").filter(l => !l.dnc && ((d.phone_key && l.phone_key === d.phone_key) || (d.email && l.email === d.email))).forEach(l => { l.dnc = true; activity(l, u, "edit", { fields: ["dnc"], changes: [{ field: "dnc", from: "false", to: "true (do-not-contact list)" }] }); saveLead(l); n++; });
      return { id: d.id, leads_updated: n };
    }
    function removeDnc(u, id) {
      need(u, dncPerm, "Only managers can change the do-not-contact list.");
      const d = store.get("dnc", id); if (!d) return { ok: true };
      store.remove("dnc", id);
      store.all("leads").filter(l => l.dnc && ((d.phone_key && l.phone_key === d.phone_key) || (d.email && l.email === d.email)) && !dncMatch(l)).forEach(l => { l.dnc = false; activity(l, u, "edit", { fields: ["dnc"], changes: [{ field: "dnc", from: "true", to: "false (removed from list)" }] }); saveLead(l); });
      return { ok: true };
    }
    function listOptOuts(u) {
      need(u, x => dncPerm(x) || isMkt(x));
      return store.all("leads").filter(l => l.unsubscribed && (l.unsubscribed.email || l.unsubscribed.whatsapp)).map(l => Object.assign(brief(l), { email: l.email, unsubscribed: l.unsubscribed, updated_at: l.updated_at, owner_name: userName(l.owner_id) })).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 500);
    }

    function duplicateGroups(u) {
      need(u, isMgr, "Only sales managers can merge leads.");
      const leads = store.all("leads"), parent = {}, find = x => (parent[x] === x || parent[x] === undefined ? (parent[x] = x) : (parent[x] = find(parent[x])));
      const join = (a, b) => { parent[find(a)] = find(b); };
      const byKey = {};
      leads.forEach(l => { [l.phone_key && l.phone_key.length >= 7 ? "p" + l.phone_key : null, l.email ? "e" + l.email : null].filter(Boolean).forEach(k => { if (byKey[k]) join(l.id, byKey[k]); else byKey[k] = l.id; }); });
      const groups = [...groupBy(leads, l => find(l.id))].map(([, list]) => list).filter(g => g.length > 1);
      return groups.map(g => g.sort((a, b) => STAGE_RANK(b.stage) - STAGE_RANK(a.stage) || a.created_at.localeCompare(b.created_at)).map(l => Object.assign(brief(l), { email: l.email, created_at: l.created_at, owner_name: userName(l.owner_id), attempts: l.attempts, source: l.utm_source || "direct", sample: !!l.sample })))
        .sort((a, b) => Math.max(...b.map(x => Date.parse(x.created_at))) - Math.max(...a.map(x => Date.parse(x.created_at)))).slice(0, 200);
    }
    const STAGE_RANK = st => ({ funded: 9, kyc: 8, registered: 7, qualified: 6, contacted: 5, attempting: 4, new: 3, lost: 2, invalid: 1 }[st] || 0);
    function mergeLeads(u, keepId, ids) {
      need(u, isMgr, "Only sales managers can merge leads.");
      const keep = store.get("leads", keepId); if (!keep) throw new CrmError("Lead not found.", 404);
      const others = arr(ids).filter(id => id !== keepId).map(id => store.get("leads", id)).filter(Boolean);
      if (!others.length) throw new CrmError("Choose at least one other lead to merge.");
      const minIso = (a, b) => (!a ? b : !b ? a : a < b ? a : b), maxIso = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
      for (const o of others) {
        ["activities", "tasks", "messages", "jobs", "notifications", "deposits", "files", "reviews", "callevents", "bonuses", "clients", "accounts", "payments"].forEach(c => store.all(c).filter(x => x.lead_id === o.id).forEach(x => { x.lead_id = keep.id; store.put(c, x); }));
        if (!keep.client_id && o.client_id) keep.client_id = o.client_id;
        if (o.demo && o.demo.given_at && !(keep.demo && keep.demo.given_at)) keep.demo = o.demo;
        if (o.bonus_status && !keep.bonus_status) keep.bonus_status = o.bonus_status;
        ["email", "city", "area", "language", "interest", "account_id", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ref_code"].forEach(k => { if (!keep[k] && o[k]) keep[k] = o[k]; });
        keep.profile = Object.assign({}, o.profile || {}, keep.profile || {});
        keep.checklist = Object.assign({}, o.checklist || {}, keep.checklist || {});
        keep.reached = keep.reached || {}; Object.keys(o.reached || {}).forEach(k => { keep.reached[k] = minIso(keep.reached[k], o.reached[k]); });
        keep.attempts = (keep.attempts || 0) + (o.attempts || 0); keep.connected_calls = (keep.connected_calls || 0) + (o.connected_calls || 0);
        keep.first_contact_at = minIso(keep.first_contact_at, o.first_contact_at); keep.first_connected_at = minIso(keep.first_connected_at, o.first_connected_at);
        keep.last_inbound_at = maxIso(keep.last_inbound_at, o.last_inbound_at); keep.last_call_at = maxIso(keep.last_call_at, o.last_call_at); keep.last_activity_at = maxIso(keep.last_activity_at, o.last_activity_at);
        keep.created_at = minIso(keep.created_at, o.created_at);
        if (STAGE_RANK(o.stage) > STAGE_RANK(keep.stage)) { keep.stage = o.stage; keep.stage_at = o.stage_at; keep.lost_reason = o.lost_reason; if (o.funded_at) { keep.funded_at = o.funded_at; keep.deposit_amount = o.deposit_amount; } }
        keep.dnc = keep.dnc || o.dnc; keep.tags = [...new Set(arr(keep.tags).concat(arr(o.tags)))];
        keep.unsubscribed = { email: !!((keep.unsubscribed || {}).email || (o.unsubscribed || {}).email), whatsapp: !!((keep.unsubscribed || {}).whatsapp || (o.unsubscribed || {}).whatsapp) };
        keep.deposit_pending = !!(keep.deposit_pending || o.deposit_pending);
        store.all("leads").filter(x => x.duplicate_of === o.id).forEach(x => { x.duplicate_of = x.id === keep.id ? null : keep.id; store.put("leads", x); });
        store.remove("leads", o.id);
      }
      if (keep.duplicate_of && others.some(o => o.id === keep.duplicate_of)) keep.duplicate_of = null;
      store.all("tasks").filter(t => t.lead_id === keep.id && !t.done_at).forEach(t => { t.owner_id = keep.owner_id; store.put("tasks", t); });
      keep.next_follow_up_at = nextDue(keep.id);
      activity(keep, u, "merge", { merged: others.map(o => o.reference), names: others.map(o => o.first_name + " " + o.last_name) });
      saveLead(keep);
      return clone(keep);
    }

    const recycleOk = (l, st) => l.stage === "lost" && arr(st.recycle.reasons).map(lc).includes(lc(l.lost_reason)) && (l.recycled || 0) < (st.recycle.max || 1) && !l.dnc;
    function listRecycle(u) {
      need(u, isMgr);
      const st = settings(), now = nowMs();
      return { settings: st.recycle, rows: store.all("leads").filter(l => recycleOk(l, st)).map(l => Object.assign(brief(l), { lost_reason: l.lost_reason, lost_days: Math.floor((now - Date.parse(stageSince(l))) / 864e5), owner_name: userName(l.owner_id), recycled: l.recycled || 0, connected_calls: l.connected_calls })).filter(r => r.lost_days >= 0).sort((a, b) => b.lost_days - a.lost_days).slice(0, 500) };
    }
    function recycleOne(l, by, why) {
      const prev = l.owner_id, p = pickOwner(l, prev ? [prev] : []);
      const from = setStage(l, by, l.connected_calls ? "contacted" : "new", { note: why });
      l.recycled = (l.recycled || 0) + 1; l.lost_reason = ""; l.tags = [...new Set(arr(l.tags).concat(["Recycled"]))];
      setOwner(l, p.owner, by, `${why}${prev ? " (was " + userName(prev) + ")" : ""}`);
      saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: l.stage }); if (l.owner_id) fire("lead_assigned", l);
      return !!p.owner;
    }
    function recycleLeads(u, ids) {
      need(u, isMgr, "Only sales managers can recycle leads.");
      let n = 0; arr(ids).forEach(id => { const l = store.get("leads", id); if (l && l.stage === "lost") { recycleOne(l, u, "Recycled by " + u.name); n++; } });
      return { recycled: n };
    }
    let lastRecycleRun = 0;
    function hygieneTick() {
      const st = settings(), now = nowMs(); let reassigned = 0, recycled = 0;
      const sla = st.sla_reassign || {};
      if (sla.enabled) {
        store.all("leads").filter(l => l.stage === "new" && !l.attempts && l.owner_id && (l.sla_reassigns || 0) < (sla.max || 2) && now - Date.parse(l.assigned_at || l.created_at) >= (sla.minutes || 30) * 60000).forEach(l => {
          const prev = l.owner_id, p = pickOwner(l, arr(l.sla_prev).concat([prev]), true);
          if (!p.owner) { if (!l.sla_alerted) { l.sla_alerted = true; store.put("leads", l); store.all("users").filter(x => x.active !== false && (x.role === "manager" || x.role === "admin")).forEach(x => notify(x.id, `⏱ ${l.first_name} ${l.last_name} not called in ${sla.minutes} min and nobody else is online to take it`, l.id, "warn")); } return; }
          l.sla_prev = arr(l.sla_prev).concat([prev]); l.sla_reassigns = (l.sla_reassigns || 0) + 1;
          setOwner(l, p.owner, SYSTEM, `Not called within ${sla.minutes} min by ${userName(prev)}`);
          notify(prev, `${l.first_name} ${l.last_name} moved to ${p.owner.name}: not called within ${sla.minutes} minutes`, l.id, "warn");
          saveLead(l); fire("lead_assigned", l); reassigned++;
        });
      }
      if (st.recycle && st.recycle.enabled && now - lastRecycleRun > 3600e3) {
        lastRecycleRun = now;
        store.all("leads").filter(l => recycleOk(l, st) && now - Date.parse(stageSince(l)) >= st.recycle.days * 864e5).slice(0, 200).forEach(l => { recycleOne(l, SYSTEM, `Recycled automatically after ${st.recycle.days} days lost`); recycled++; });
      }
      return { reassigned, recycled };
    }

    /* =====================================================================
       SALES: WhatsApp / email inbox
       ===================================================================== */
    const unreadLead = l => !!(l.last_inbound_at && (!l.inbox_seen_at || l.last_inbound_at > l.inbox_seen_at));
    const windowOpen = l => !!(l.last_inbound_at && nowMs() - Date.parse(l.last_inbound_at) < 24 * 3600e3);
    function listConversations(u, f = {}) {
      const byLead = new Map();
      store.all("messages").forEach(m => { const x = byLead.get(m.lead_id); if (!x) byLead.set(m.lead_id, { last: m, n: 1, inbound: m.direction === "in" ? 1 : 0 }); else { x.n++; if (m.direction === "in") x.inbound++; if (m.created_at > x.last.created_at) x.last = m; } });
      const q = lc(f.q);
      let rows = [];
      byLead.forEach((x, id) => {
        const l = store.get("leads", id); if (!l || !canSee(u, l)) return;
        if (u.role === "agent" && l.owner_id !== u.id) return;
        if (f.owner === "me" && l.owner_id !== u.id) return; if (f.owner && f.owner !== "me" && seesAll(u) && l.owner_id !== (f.owner === "none" ? null : f.owner)) return;
        const box = f.box || "replies";
        if (box === "unread" && !unreadLead(l)) return; if (box === "replies" && !x.inbound) return; if (box === "open" && !windowOpen(l)) return;
        if (q && ![l.first_name + " " + l.last_name, l.phone, l.email, l.reference].join(" ").toLowerCase().includes(q)) return;
        rows.push({ lead: Object.assign(brief(l), { owner_id: l.owner_id }), owner_name: userName(l.owner_id), count: x.n, inbound: x.inbound, unread: unreadLead(l), window_open: windowOpen(l), last: { direction: x.last.direction, channel: x.last.channel, body: String(x.last.body || "").slice(0, 120), status: x.last.status, created_at: x.last.created_at } });
      });
      rows.sort((a, b) => (b.unread - a.unread) || b.last.created_at.localeCompare(a.last.created_at));
      return rows.slice(0, 300);
    }
    function getConversation(u, leadId) {
      const l = leadFor(u, leadId);
      const msgs = store.all("messages").filter(m => m.lead_id === l.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => Object.assign({}, m, { user_name: m.direction === "in" ? "" : m.rule_id ? "Automation" : m.broadcast_id ? "Broadcast" : userName(m.user_id) }));
      if (unreadLead(l) && (l.owner_id === u.id || isMgr(u) || (!l.owner_id && seesAll(u)))) { l.inbox_seen_at = nowIso(); store.put("leads", l); }
      return { lead: Object.assign(brief(l), { email: l.email, owner_id: l.owner_id, dnc: l.dnc, unsubscribed: l.unsubscribed || {} }), owner: userName(l.owner_id), messages: msgs, window_open: windowOpen(l), can_reply: isSales(u) };
    }
    const inboxUnread = u => store.all("leads").filter(l => unreadLead(l) && (l.owner_id === u.id || (isMgr(u) && !l.owner_id))).length;
    function unsubscribeLead(leadId, channel, how) {
      const l = store.get("leads", leadId); if (!l || !["email", "whatsapp"].includes(channel)) return false;
      if ((l.unsubscribed || {})[channel]) return true;
      l.unsubscribed = Object.assign({}, l.unsubscribed, { [channel]: true });
      activity(l, SYSTEM, "edit", { fields: ["unsubscribed." + channel], changes: [{ field: "unsubscribed." + channel, from: "false", to: "true (" + clean(how, 60) + ")" }] });
      saveLead(l); return true;
    }
    function simulateInbound(u, leadId, text) { const l = leadFor(u, leadId); return recordInbound({ phone: digits(l.dial_code + l.phone), text: clean(text, 500) || "Hi, I have a question", provider_id: "sim-" + newId("") , channel: "whatsapp" }); }

    /* =====================================================================
       SALES: call quality reviews (QA scorecards)
       ===================================================================== */
    function listCallsForReview(u, f = {}) {
      need(u, isMgr, "Only sales managers review calls.");
      const to = f.to || localDay(nowIso()), from = f.from || localDay(new Date(nowMs() - 6 * 864e5).toISOString());
      const reviews = new Map(store.all("reviews").map(r => [r.activity_id, r]));
      let rows = store.all("activities").filter(a => a.type === "call" && a.data.connected && localDay(a.created_at) >= from && localDay(a.created_at) <= to);
      if (f.agent) rows = rows.filter(a => a.user_id === f.agent);
      if ((f.status || "unreviewed") === "unreviewed") rows = rows.filter(a => !reviews.has(a.id)); else if (f.status === "reviewed") rows = rows.filter(a => reviews.has(a.id));
      if (f.min_sec) rows = rows.filter(a => (a.data.duration_sec || 0) >= Number(f.min_sec));
      return { from, to, rows: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map(a => ({ activity_id: a.id, at: a.created_at, agent_id: a.user_id, agent: userName(a.user_id), lead: brief(store.get("leads", a.lead_id)), outcome: a.data.outcome, duration_sec: a.data.duration_sec, notes: a.data.notes, qa: a.data.qa, recording_url: a.data.recording_url || "", review: reviews.get(a.id) || null })) };
    }
    function saveReview(u, p = {}) {
      need(u, isMgr, "Only sales managers review calls.");
      const a = store.get("activities", p.activity_id); if (!a || a.type !== "call") throw new CrmError("Call not found.", 404);
      const scores = {};
      for (const c of QA_CRITERIA) { const v = Number((p.scores || {})[c.id]); if (!(v >= 1 && v <= 5)) throw new CrmError("Score every line from 1 to 5.", 422, { ["scores." + c.id]: "1–5" }); scores[c.id] = Math.round(v); }
      const ok = p.compliance_ok !== false && p.compliance_ok !== "false";
      const total = ok ? Math.round((sum(Object.values(scores)) / (QA_CRITERIA.length * 5)) * 100) : 0;
      const cur = store.all("reviews").find(r => r.activity_id === a.id);
      const r = Object.assign(cur || { id: newId("R"), created_at: nowIso() }, { activity_id: a.id, lead_id: a.lead_id, agent_id: a.user_id, reviewer_id: u.id, scores, compliance_ok: ok, total, strengths: clean(p.strengths, 1000), improve: clean(p.improve, 1000), updated_at: nowIso(), acknowledged_at: cur ? cur.acknowledged_at : null });
      store.put("reviews", r);
      const l = store.get("leads", a.lead_id);
      if (a.user_id !== u.id) notify(a.user_id, `📋 Your call with ${l ? l.first_name + " " + l.last_name : "a client"} was reviewed: ${total}%${ok ? "" : " (compliance issue)"}`, null, "review");
      return Object.assign({}, r);
    }
    function listReviews(u, f = {}) {
      let rows = store.all("reviews");
      if (!isMgr(u)) rows = rows.filter(r => r.agent_id === u.id); else if (f.agent) rows = rows.filter(r => r.agent_id === f.agent);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map(r => { const a = store.get("activities", r.activity_id) || { data: {} }; return Object.assign({}, r, { agent: userName(r.agent_id), reviewer: userName(r.reviewer_id), lead: brief(store.get("leads", r.lead_id)), call: { at: a.created_at, outcome: a.data.outcome, duration_sec: a.data.duration_sec, notes: a.data.notes, recording_url: a.data.recording_url || "" } }); });
    }
    function ackReview(u, id) { const r = store.get("reviews", id); if (!r || r.agent_id !== u.id) throw new CrmError("Review not found.", 404); r.acknowledged_at = nowIso(); store.put("reviews", r); return Object.assign({}, r); }

    /* =====================================================================
       SALES: attendance, breaks and the live team board
       ===================================================================== */
    function heartbeat(u) {
      if (!u || u.role === "system" || !store.get("users", u.id)) return;
      const key = attKey(u.id), now = nowIso(), a = store.get("attendance", key);
      if (!a) { store.put("attendance", { id: key, user_id: u.id, day: localDay(now), first_at: now, last_at: now, online_min: 0, breaks: [] }); return; }
      const gap = nowMs() - Date.parse(a.last_at);
      if (gap < 45000) return; // at most one write a minute
      if (gap <= 5 * 60000) a.online_min = Math.round((a.online_min + gap / 60000) * 10) / 10;
      a.last_at = now; store.put("attendance", a);
    }
    function attFor(uid) { const key = attKey(uid); return store.get("attendance", key) || { id: key, user_id: uid, day: localDay(nowIso()), first_at: nowIso(), last_at: nowIso(), online_min: 0, breaks: [] }; }
    function setBreak(u, reason) {
      const a = attFor(u.id), open = arr(a.breaks).find(b => !b.end);
      if (reason) { if (open) throw new CrmError("You're already on a break."); a.breaks = arr(a.breaks).concat([{ start: nowIso(), reason: clean(reason, 40) }]); }
      else { if (!open) return myStatus(u); open.end = nowIso(); }
      store.put("attendance", a); return myStatus(u);
    }
    function myStatus(u) { const a = store.get("attendance", attKey(u.id)), open = a && arr(a.breaks).find(b => !b.end); return { on_break: !!open, break_reason: open ? open.reason : "", break_since: open ? open.start : null }; }
    const breakMin = (a, endIso) => Math.round(sum(arr(a.breaks).map(b => (Date.parse(b.end || endIso || a.last_at) - Date.parse(b.start)) / 60000).filter(x => x > 0)));
    function liveBoard(u) {
      need(u, isMgr);
      const today = localDay(nowIso()), now = nowIso();
      const calls = store.all("activities").filter(a => a.type === "call" && localDay(a.created_at) === today);
      const open = store.all("leads").filter(l => OPEN.has(l.stage));
      const tasks = store.all("tasks").filter(t => !t.done_at && t.due_at < now);
      return store.all("users").filter(x => x.active !== false && isSalesRole(x.role)).map(x => {
        const a = store.get("attendance", attKey(x.id)), br = a && arr(a.breaks).find(b => !b.end), mine = calls.filter(c => c.user_id === x.id);
        const online = a && nowMs() - Date.parse(a.last_at) < 5 * 60000;
        const last = mine.sort((p, q) => q.created_at.localeCompare(p.created_at))[0];
        return { id: x.id, name: x.name, role: x.role, team: x.team || "", status: br ? "break" : online ? "online" : "offline", break_reason: br ? br.reason : "", since: br ? br.start : a ? (online ? a.first_at : a.last_at) : null,
          first_at: a ? a.first_at : null, online_min: a ? Math.round(a.online_min) : 0, break_min: a ? breakMin(a, now) : 0, calls: mine.length, connected: mine.filter(c => c.data.connected).length, talk_min: Math.round(sum(mine.map(c => c.data.duration_sec)) / 60),
          last_call_at: last ? last.created_at : null, open_leads: open.filter(l => l.owner_id === x.id).length, waiting_new: open.filter(l => l.owner_id === x.id && !l.attempts).length, overdue: tasks.filter(t => t.owner_id === x.id).length };
      }).sort((a, b) => ({ online: 0, break: 1, offline: 2 }[a.status] - { online: 0, break: 1, offline: 2 }[b.status]) || b.calls - a.calls);
    }

    /* =====================================================================
       SALES: phone system (click-to-call, recordings, missed calls)
       ===================================================================== */
    function dialInfo(u, leadId) {
      const l = leadFor(u, leadId, true);
      if (l.dnc) throw new CrmError("This client is marked Do not contact.", 403);
      const me = store.get("users", u.id) || {};
      return { lead_id: l.id, number: "+" + digits(l.dial_code + l.phone), extension: me.extension || "" };
    }
    function recordCallEvent(p = {}) {
      const direction = p.direction === "in" ? "in" : "out", phone = digits(p.phone || (direction === "in" ? p.from : p.to)), ext = clean(p.extension || p.agent_ext, 20);
      if (phone.length < 6) throw new CrmError("Missing phone number.");
      const at = p.started_at && !isNaN(Date.parse(p.started_at)) ? new Date(Date.parse(p.started_at)).toISOString() : nowIso();
      const rec = /^https?:\/\//i.test(String(p.recording_url || "")) ? clean(p.recording_url, 600) : "";
      const status = clean(p.status, 20).toLowerCase() || "answered", dur = Math.max(0, Math.min(36000, Number(p.duration_sec) || 0));
      const agent = ext ? store.all("users").find(x => x.extension && x.extension === ext) : null;
      let l = store.all("leads").filter(x => x.phone_key === phone.slice(-9)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const callId = clean(p.call_id, 120);
      let ev = callId ? store.all("callevents").find(e => e.call_id === callId) : null;
      if (ev) { if (rec) ev.recording_url = rec; if (dur) ev.duration_sec = dur; ev.status = status; store.put("callevents", ev); if (ev.matched_activity_id) { const act = store.get("activities", ev.matched_activity_id); if (act) { act.data.recording_url = ev.recording_url; act.data.pbx_duration_sec = ev.duration_sec; store.put("activities", act); } } return { ok: true, updated: true, lead_id: ev.lead_id }; }
      if (!l && direction === "in") l = createLead(SYSTEM, { first_name: "Caller", last_name: phone.slice(-4), dial_code: "+", phone, country: "Unknown", form: "phone", utm: { utm_source: "phone" } }, { requireEmail: false, source: "phone" });
      ev = { id: newId("E"), call_id: callId, direction, phone, extension: ext, agent_id: agent ? agent.id : null, lead_id: l ? l.id : null, status, duration_sec: dur, recording_url: rec, at, matched_activity_id: null, created_at: nowIso() };
      if (l && direction === "out" && agent) {
        const act = store.all("activities").filter(a => a.type === "call" && a.lead_id === l.id && a.user_id === agent.id && !a.data.call_id && Math.abs(Date.parse(a.created_at) - Date.parse(at)) < 3 * 3600e3).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (act) linkCall(act, ev);
      }
      if (l && direction === "in") {
        const missed = /miss|no.?answer|busy|abandon|fail/.test(status);
        activity(l, agent || SYSTEM, "pbx", { direction: "in", status: missed ? "missed" : "answered", duration_sec: dur, recording_url: rec, call_id: callId }, at);
        if (missed) { l.last_missed_call_at = at; notify(l.owner_id, `📞 Missed call from ${l.first_name} ${l.last_name}`, l.id, "call"); if (l.owner_id && OPEN.has(l.stage)) createTaskFor(l, SYSTEM, { type: "call", title: "Call back: missed incoming call", due_at: nowIso(), auto: true }); }
        saveLead(l);
      }
      store.put("callevents", ev);
      return { ok: true, lead_id: l ? l.id : null, matched: !!ev.matched_activity_id };
    }
    function linkCall(act, ev) {
      act.data.call_id = ev.call_id || ev.id; act.data.recording_url = ev.recording_url; act.data.pbx_duration_sec = ev.duration_sec;
      if (!act.data.duration_sec && ev.duration_sec) act.data.duration_sec = ev.duration_sec;
      store.put("activities", act); ev.matched_activity_id = act.id;
    }
    function attachCallEvent(act, l, u) {
      const ev = store.all("callevents").filter(e => e.lead_id === l.id && e.agent_id === u.id && e.direction === "out" && !e.matched_activity_id && Math.abs(Date.parse(e.at) - Date.parse(act.created_at)) < 3 * 3600e3).sort((a, b) => b.at.localeCompare(a.at))[0];
      if (ev) { linkCall(act, ev); store.put("callevents", ev); }
    }

    /* =====================================================================
       MARKETING: campaigns and ad spend
       ===================================================================== */
    const CAMPAIGN_STATUS = ["planned", "active", "paused", "ended"];
    const dayOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
    const campCrud = crud("campaigns", isMkt, o => {
      if (!clean(o.name)) throw new CrmError("Name the campaign.", 422, { name: "Required" });
      o.name = clean(o.name, 100); o.channel = clean(o.channel, 40) || "Other"; o.utm_source = lc(o.utm_source).replace(/\s+/g, "-"); o.utm_medium = lc(o.utm_medium); o.utm_campaign = clean(o.utm_campaign, 120).replace(/\s+/g, "-");
      if (!o.utm_campaign) throw new CrmError("Set the utm_campaign value used in the ad links.", 422, { utm_campaign: "Required" });
      if (store.all("campaigns").some(c => c.id !== o.id && lc(c.utm_campaign) === lc(o.utm_campaign) && (c.utm_source || "") === (o.utm_source || ""))) throw new CrmError("Another campaign already uses this source and utm_campaign.", 422, { utm_campaign: "Already used" });
      o.budget = Math.max(0, Number(o.budget) || 0); o.start_date = dayOk(o.start_date) ? o.start_date : ""; o.end_date = dayOk(o.end_date) ? o.end_date : "";
      o.status = CAMPAIGN_STATUS.includes(o.status) ? o.status : "active"; o.landing_url = clean(o.landing_url, 300); o.notes = clean(o.notes, 1000);
      o.target_cpl = Math.max(0, Number(o.target_cpl) || 0); o.target_cpa = Math.max(0, Number(o.target_cpa) || 0);
      return o;
    });
    function deleteCampaign(u, id) { need(u, isMktMgr, "Only marketing managers can delete campaigns."); store.all("spend").filter(s => s.campaign_id === id).forEach(s => store.remove("spend", s.id)); store.remove("campaigns", id); return { ok: true }; }
    function campaignMatcher() {
      const idx = new Map(); store.all("campaigns").forEach(c => { const k = lc(c.utm_campaign); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); });
      return l => { const list = idx.get(lc(l.utm_campaign)); if (!list) return null; return list.find(c => c.utm_source && c.utm_source === (l.utm_source || "")) || list.find(c => !c.utm_source) || null; };
    }
    function addSpend(u, p = {}) {
      need(u, isMkt);
      const c = store.get("campaigns", p.campaign_id); if (!c) throw new CrmError("Choose a campaign.", 422, { campaign_id: "Required" });
      if (!dayOk(p.date)) throw new CrmError("Choose the date.", 422, { date: "Required" });
      const amount = Number(p.amount); if (!(amount >= 0)) throw new CrmError("Enter the amount spent.", 422, { amount: "Required" });
      const cur = store.all("spend").find(s => s.campaign_id === c.id && s.date === p.date);
      const s = Object.assign(cur || { id: newId("S"), created_at: nowIso() }, { campaign_id: c.id, date: p.date, amount: Math.round(amount * 100) / 100, note: clean(p.note, 200), created_by: u.id, updated_at: nowIso() });
      store.put("spend", s); return Object.assign({}, s);
    }
    function importSpend(u, rows) {
      need(u, isMkt);
      const camps = store.all("campaigns"), res = { saved: 0, failed: [] };
      arr(rows).slice(0, 5000).forEach((r, i) => {
        const key = lc(r.campaign); const c = camps.find(x => lc(x.name) === key || lc(x.utm_campaign) === key);
        let d = String(r.date || "").trim(); if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) { const [a, b, y] = d.split("/"); d = `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`; }
        if (!c) return res.failed.push({ row: i + 2, error: `No campaign named "${clean(r.campaign, 60)}"` });
        try { addSpend(u, { campaign_id: c.id, date: d, amount: String(r.amount).replace(/[^\d.]/g, "") }); res.saved++; } catch (e) { res.failed.push({ row: i + 2, error: e.message }); }
      });
      return res;
    }
    function deleteSpend(u, id) { need(u, isMkt); store.remove("spend", id); return { ok: true }; }
    function listSpend(u, campaignId) { need(u, x => isMkt(x) || isMgr(x)); return store.all("spend").filter(s => !campaignId || s.campaign_id === campaignId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1000); }
    function campaignStats(s) {
      const match = campaignMatcher(), spend = store.all("spend").filter(x => x.date >= s.f.from && x.date <= s.f.to);
      const mk = (key, list, sp, extra) => {
        const m = metricsFor(list), inv = list.filter(l => l.stage === "invalid").length, spent = sum(sp.map(x => x.amount));
        return Object.assign({ key, spend: spent, cpl: m.leads ? Math.round((spent / m.leads) * 100) / 100 : null, cost_per_registered: m.registered ? Math.round(spent / m.registered) : null, cost_per_ftd: m.funded ? Math.round(spent / m.funded) : null, roas: spent ? Math.round((m.ftd_amount / spent) * 100) / 100 : null, invalid_pct: pct(inv, m.leads), connected_pct: pct(m.connected, m.leads), qualified_pct: pct(m.qualified, m.leads) }, m, extra || {});
      };
      const rows = store.all("campaigns").map(c => mk(c.name, s.cohort.filter(l => { const x = match(l); return x && x.id === c.id; }), spend.filter(x => x.campaign_id === c.id), { id: c.id, channel: c.channel, status: c.status, utm_source: c.utm_source, utm_campaign: c.utm_campaign, budget: c.budget, target_cpl: c.target_cpl, target_cpa: c.target_cpa, start_date: c.start_date, end_date: c.end_date, landing_url: c.landing_url }));
      const untracked = [...groupBy(s.cohort.filter(l => !match(l)), l => (l.utm_source || "direct") + " / " + (l.utm_campaign || "(none)"))].map(([k, list]) => mk(k, list, [], { utm_source: list[0].utm_source || "", utm_campaign: list[0].utm_campaign || "" })).sort((a, b) => b.leads - a.leads);
      const all = mk("Total", s.cohort, spend);
      const byChannel = [...groupBy(rows, r => r.channel)].map(([k, list]) => ({ key: k, spend: sum(list.map(r => r.spend)), leads: sum(list.map(r => r.leads)), funded: sum(list.map(r => r.funded)), ftd_amount: sum(list.map(r => r.ftd_amount)) })).map(x => Object.assign(x, { cpl: x.leads ? Math.round(x.spend / x.leads * 100) / 100 : null, cost_per_ftd: x.funded ? Math.round(x.spend / x.funded) : null })).sort((a, b) => b.spend - a.spend);
      const daily = days(s.f).map(d => ({ d, spend: sum(spend.filter(x => x.date === d).map(x => x.amount)), leads: s.cohort.filter(l => localDay(l.created_at) === d).length }));
      return { range: s.f, rows: rows.sort((a, b) => b.spend - a.spend || b.leads - a.leads), untracked, total: all, by_channel: byChannel, daily };
    }

    /* =====================================================================
       MARKETING: broadcasts (bulk WhatsApp / email to a segment)
       ===================================================================== */
    function normSegment(g = {}) {
      return { stages: listOf(g.stages), countries: listOf(g.countries), cities: listOf(g.cities), sources: listOf(g.sources).map(x => x.toLowerCase()), campaigns: listOf(g.campaigns), temperatures: listOf(g.temperatures), interests: listOf(g.interests), created_from: dayOk(g.created_from) ? g.created_from : "", created_to: dayOk(g.created_to) ? g.created_to : "", inactive_days: Math.max(0, Number(g.inactive_days) || 0), never_funded: g.never_funded !== false, journey: ["demo_not_traded", "demo_any", "bonus_expired", "bonus_active", "no_demo"].includes(g.journey) ? g.journey : "" };
    }
    function segmentLeads(g, channel, skipCap) {
      g = normSegment(g);
      const st = settings(), capMs = (st.broadcast_cap_days || 0) * 864e5, now = nowMs();
      const recent = new Set(capMs && !skipCap ? store.all("messages").filter(m => m.broadcast_id && now - Date.parse(m.created_at) < capMs).map(m => m.lead_id) : []);
      const has = (list, v) => !list.length || list.map(lc).includes(lc(v));
      const ex = { dnc: 0, unsubscribed: 0, no_address: 0, recently_messaged: 0 };
      const out = [];
      for (const l of store.all("leads")) {
        if (l.stage === "invalid") continue;
        if (g.stages.length ? !g.stages.includes(l.stage) : (g.never_funded && l.stage === "funded")) continue;
        if (!has(g.countries, l.country) || !has(g.cities, l.city) || !has(g.sources, l.utm_source || "direct") || !has(g.campaigns, l.utm_campaign) || !has(g.temperatures, l.temperature) || !has(g.interests, l.interest)) continue;
        if (g.created_from && localDay(l.created_at) < g.created_from) continue; if (g.created_to && localDay(l.created_at) > g.created_to) continue;
        if (g.inactive_days && now - Date.parse(l.last_activity_at || l.created_at) < g.inactive_days * 864e5) continue;
        if (g.journey) { const d = l.demo || {}, bs = l.bonus_status || ""; const ok = { demo_not_traded: d.given_at && !d.first_trade_at, demo_any: !!d.given_at, no_demo: !d.given_at, bonus_expired: ["expired", "used_up"].includes(bs), bonus_active: ["credited", "traded"].includes(bs) }[g.journey]; if (!ok) continue; }
        if (l.dnc) { ex.dnc++; continue; }
        if ((l.unsubscribed || {})[channel]) { ex.unsubscribed++; continue; }
        if (channel === "email" ? !EMAIL_RE.test(l.email || "") : digits(l.dial_code + l.phone).length < 7) { ex.no_address++; continue; }
        if (recent.has(l.id)) { ex.recently_messaged++; continue; }
        out.push(l);
      }
      return { leads: out, excluded: ex };
    }
    function previewSegment(u, g, channel) {
      need(u, isMkt);
      const r = segmentLeads(g, channel === "email" ? "email" : "whatsapp");
      return { count: r.leads.length, excluded: r.excluded, sample: r.leads.slice(0, 8).map(l => Object.assign(brief(l), { email: l.email, source: l.utm_source || "direct" })), by_stage: [...groupBy(r.leads, l => l.stage)].map(([k, v]) => ({ k, n: v.length })) };
    }
    function bcastCheck(b) {
      const t = store.get("templates", b.template_id);
      if (!t || t.channel !== b.channel) throw new CrmError("Choose a " + (b.channel === "email" ? "email" : "WhatsApp") + " template.", 422, { template_id: "Required" });
      if (b.channel === "whatsapp" && !t.wa_template_name) throw new CrmError("WhatsApp broadcasts need a Meta-approved template. Add its approved name to the template first.", 422, { template_id: "Needs approved Meta template" });
      return t;
    }
    function saveBroadcast(u, p = {}) {
      need(u, isMkt);
      const cur = p.id ? store.get("broadcasts", p.id) : null;
      if (cur && !["draft", "pending_approval"].includes(cur.status)) throw new CrmError("This broadcast has started and can't be edited. Duplicate it instead.");
      const b = Object.assign({}, cur || { id: newId("B"), created_by: u.id, created_at: nowIso(), status: "draft" });
      b.name = clean(p.name, 100); if (!b.name) throw new CrmError("Name the broadcast.", 422, { name: "Required" });
      b.channel = p.channel === "email" ? "email" : "whatsapp"; b.template_id = p.template_id || ""; b.segment = normSegment(p.segment || {}); b.note = clean(p.note, 500);
      b.scheduled_at = p.scheduled_at && !isNaN(Date.parse(p.scheduled_at)) ? new Date(Date.parse(p.scheduled_at)).toISOString() : null;
      if (cur && cur.status === "pending_approval") b.status = "draft";
      b.updated_at = nowIso(); store.put("broadcasts", b); return Object.assign({}, b);
    }
    function submitBroadcast(u, id) {
      need(u, isMkt);
      const b = store.get("broadcasts", id); if (!b) throw new CrmError("Broadcast not found.", 404);
      if (b.status !== "draft") throw new CrmError("Only drafts can be sent.");
      bcastCheck(b);
      const n = segmentLeads(b.segment, b.channel).leads.length; if (!n) throw new CrmError("No clients match this audience.");
      b.estimated = n; b.submitted_by = u.id; b.submitted_at = nowIso(); b.reject_reason = "";
      if (settings().broadcast_approval && !isMktMgr(u)) {
        b.status = "pending_approval"; store.put("broadcasts", b);
        store.all("users").filter(x => x.active !== false && (x.role === "marketing_manager" || x.role === "admin")).forEach(x => notify(x.id, `📣 Broadcast to approve: "${b.name}" (${n} clients by ${b.channel})`, null, "broadcast"));
      } else { b.status = "scheduled"; b.approved_by = u.id; b.approved_at = nowIso(); if (!b.scheduled_at) b.scheduled_at = nowIso(); store.put("broadcasts", b); }
      return Object.assign({}, b);
    }
    function approveBroadcast(u, id, approve, reason) {
      need(u, isMktMgr, "Only marketing managers approve broadcasts.");
      const b = store.get("broadcasts", id); if (!b || b.status !== "pending_approval") throw new CrmError("Nothing to approve.");
      if (approve) { bcastCheck(b); b.status = "scheduled"; b.approved_by = u.id; b.approved_at = nowIso(); if (!b.scheduled_at || Date.parse(b.scheduled_at) < nowMs()) b.scheduled_at = nowIso(); notify(b.created_by, `✅ Broadcast "${b.name}" approved`, null, "broadcast"); }
      else { const why = clean(reason, 300); if (!why) throw new CrmError("Say what needs changing.", 422, { reason: "Required" }); b.status = "draft"; b.reject_reason = why; notify(b.created_by, `Broadcast "${b.name}" sent back: ${why}`, null, "broadcast"); }
      store.put("broadcasts", b); return Object.assign({}, b);
    }
    function cancelBroadcast(u, id) {
      need(u, isMkt); const b = store.get("broadcasts", id); if (!b) throw new CrmError("Broadcast not found.", 404);
      if (!isMktMgr(u) && b.created_by !== u.id) throw new CrmError("Only the creator or a marketing manager can stop it.", 403);
      if (["done", "cancelled"].includes(b.status)) return Object.assign({}, b);
      if (b.status === "draft") { store.remove("broadcasts", id); return { deleted: true }; }
      b.status = "cancelled"; b.cancelled_by = u.id; b.done_at = nowIso(); store.put("broadcasts", b); return Object.assign({}, b);
    }
    function runBroadcasts() {
      const now = nowMs(), st = settings(); let sent = 0;
      for (const b of store.all("broadcasts")) {
        if (b.status === "scheduled" && Date.parse(b.scheduled_at || 0) <= now) {
          const seg = segmentLeads(b.segment, b.channel); b.lead_ids = seg.leads.map(l => l.id); b.total = b.lead_ids.length; b.excluded = seg.excluded;
          b.cursor = 0; b.sent_count = 0; b.skipped = 0; b.status = "sending"; b.started_at = nowIso(); b.last_batch_at = new Date(now - 60000).toISOString(); store.put("broadcasts", b);
        }
        if (b.status !== "sending" || inQuiet(now)) continue;
        const t = store.get("templates", b.template_id); if (!t) { b.status = "cancelled"; b.error = "Template deleted"; store.put("broadcasts", b); continue; }
        const rate = Number(st.broadcast_rate_per_min) || 0, allow = rate ? Math.min(500, Math.floor(((now - Date.parse(b.last_batch_at)) / 60000) * rate)) : 500;
        if (allow < 1) continue;
        let n = 0;
        while (n < allow && b.cursor < b.lead_ids.length) {
          const l = store.get("leads", b.lead_ids[b.cursor++]); n++;
          if (!l || l.dnc || (l.unsubscribed || {})[b.channel]) { b.skipped++; continue; }
          queueMessage(l, { id: "system", name: "Broadcast" }, t, { broadcast_id: b.id }); b.sent_count++; sent++; saveLead(l);
        }
        b.last_batch_at = new Date(now).toISOString();
        if (b.cursor >= b.lead_ids.length) { b.status = "done"; b.done_at = nowIso(); }
        store.put("broadcasts", b);
      }
      return { sent };
    }
    function broadcastStats(list) {
      const ids = new Set(list.map(b => b.id)), msgs = store.all("messages").filter(m => m.broadcast_id && ids.has(m.broadcast_id));
      const inbound = new Map(); store.all("messages").filter(m => m.direction === "in").forEach(m => { if (!inbound.has(m.lead_id)) inbound.set(m.lead_id, []); inbound.get(m.lead_id).push(m.created_at); });
      return list.map(b => {
        const m = msgs.filter(x => x.broadcast_id === b.id), first = new Map(); m.forEach(x => { if (!first.has(x.lead_id) || x.created_at < first.get(x.lead_id)) first.set(x.lead_id, x.created_at); });
        let replies = 0, registered = 0, funded = 0, unsub = 0;
        first.forEach((at, lid) => {
          const t0 = Date.parse(at), l = store.get("leads", lid); if (arr(inbound.get(lid)).some(x => Date.parse(x) > t0 && Date.parse(x) - t0 < 72 * 3600e3)) replies++;
          if (!l) return; const after = iso => iso && Date.parse(iso) > t0 && Date.parse(iso) - t0 < 14 * 864e5;
          if (after(l.reached && l.reached.registered)) registered++; if (after(l.funded_at)) funded++; if ((l.unsubscribed || {})[b.channel]) unsub++;
        });
        const t = store.get("templates", b.template_id);
        return Object.assign({}, b, { lead_ids: undefined, template_name: t ? t.name : "(deleted)", created_by_name: userName(b.created_by), approved_by_name: b.approved_by ? userName(b.approved_by) : "",
          stats: { queued: m.length, sent: m.filter(x => ["sent", "simulated", "delivered", "read"].includes(x.status)).length, delivered: m.filter(x => ["delivered", "read"].includes(x.status)).length, read: m.filter(x => x.status === "read").length, failed: m.filter(x => ["failed", "blocked", "skipped"].includes(x.status)).length, replies, registered, funded, unsubscribed: unsub } });
      });
    }
    function listBroadcasts(u) { need(u, x => isMkt(x) || canComm(x)); return broadcastStats(store.all("broadcasts").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)); }
    function getBroadcast(u, id) { need(u, x => isMkt(x) || canComm(x)); const b = store.get("broadcasts", id); if (!b) throw new CrmError("Broadcast not found.", 404); return broadcastStats([b])[0]; }

    /* =====================================================================
       Reports added for the split workspaces
       ===================================================================== */
    Object.assign(REPORTS, {
      deposits(u, s) {
        const { inR } = s, leadIds = s.leadIds;
        const all = store.all("deposits").filter(d => leadIds.has(d.lead_id) && (!s.f.agent || d.owner_id === s.f.agent));
        const ver = all.filter(d => d.status === "verified" && inR(d.deposited_at));
        const lead = d => store.get("leads", d.lead_id) || {};
        const grp = key => [...groupBy(ver, key)].map(([k, v]) => ({ k, n: v.length, amount: sum(v.map(d => d.amount)), avg: Math.round(sum(v.map(d => d.amount)) / v.length) })).sort((a, b) => b.amount - a.amount);
        const lag = ver.map(d => (Date.parse(d.deposited_at) - Date.parse(lead(d).created_at)) / 864e5).filter(x => x >= 0);
        const m = metricsFor(s.cohort);
        return { range: s.f, count: ver.length, amount: sum(ver.map(d => d.amount)), avg: ver.length ? Math.round(sum(ver.map(d => d.amount)) / ver.length) : 0,
          median_days: lag.length ? Math.round(median(lag) * 10) / 10 : null, avg_days: lag.length ? Math.round((sum(lag) / lag.length) * 10) / 10 : null, conversion: m.conversion, cohort_leads: m.leads, cohort_funded: m.funded,
          pending: all.filter(d => d.status === "pending").length, pending_amount: sum(all.filter(d => d.status === "pending").map(d => d.amount)), rejected: all.filter(d => d.status === "rejected" && inR(d.verified_at)).length,
          by_agent: grp(d => userName(d.owner_id)), by_team: grp(d => (store.get("users", d.owner_id) || {}).team || "No team"), by_source: grp(d => lead(d).utm_source || "direct"), by_campaign: grp(d => (lead(d).utm_source || "direct") + " / " + (lead(d).utm_campaign || "(none)")),
          by_country: grp(d => lead(d).country || "(unknown)"), by_city: grp(d => (lead(d).city || "(no city)") + ", " + (lead(d).country || "")).slice(0, 30), by_method: grp(d => d.method || "(not set)"),
          buckets: [["Under $250", 0, 250], ["$250–999", 250, 1000], ["$1k–4,999", 1000, 5000], ["$5k+", 5000, 1e12]].map(([k, a, b]) => ({ k, n: ver.filter(d => d.amount >= a && d.amount < b).length })),
          daily: days(s.f).map(d => { const v = ver.filter(x => localDay(x.deposited_at) === d); return { d, n: v.length, amount: sum(v.map(x => x.amount)) }; }),
          rows: ver.sort((a, b) => b.deposited_at.localeCompare(a.deposited_at)).slice(0, 200).map(depositRow) };
      },
      qa(u, s) {
        const rv = store.all("reviews").filter(r => s.inR(r.created_at) && (!s.f.agent || r.agent_id === s.f.agent));
        const crit = QA_CRITERIA.map(c => ({ k: c.id, label: c.label, avg: rv.length ? Math.round((sum(rv.map(r => r.scores[c.id])) / rv.length) * 10) / 10 : null }));
        const agents = [...groupBy(rv, r => r.agent_id)].map(([id, list]) => ({ id, name: userName(id), reviews: list.length, avg: Math.round(sum(list.map(r => r.total)) / list.length), compliance_fails: list.filter(r => !r.compliance_ok).length, weakest: QA_CRITERIA.map(c => [c.label, sum(list.map(r => r.scores[c.id])) / list.length]).sort((a, b) => a[1] - b[1])[0][0] })).sort((a, b) => b.avg - a.avg);
        return { range: s.f, count: rv.length, avg: rv.length ? Math.round(sum(rv.map(r => r.total)) / rv.length) : null, compliance_fails: rv.filter(r => !r.compliance_ok).length, criteria: crit, agents };
      },
      activity(u, s) {
        const att = store.all("attendance").filter(a => a.day >= s.f.from && a.day <= s.f.to && (!s.f.agent || a.user_id === s.f.agent) && (store.get("users", a.user_id) || {}).role !== "admin");
        const calls = store.all("activities").filter(a => a.type === "call" && s.inR(a.created_at) && (!s.f.agent || a.user_id === s.f.agent));
        const rows = att.map(a => {
          const c = calls.filter(x => x.user_id === a.user_id && localDay(x.created_at) === a.day), talk = sum(c.map(x => x.data.duration_sec)) / 60, br = breakMin(a), on = a.online_min || 0;
          return { day: a.day, user_id: a.user_id, name: userName(a.user_id), first_at: a.first_at, last_at: a.last_at, online_min: Math.round(on), break_min: br, calls: c.length, connected: c.filter(x => x.data.connected).length, talk_min: Math.round(talk), calls_per_hour: on >= 30 ? Math.round((c.length / (on / 60)) * 10) / 10 : null, talk_pct: on ? pct(Math.round(talk), Math.round(on)) : null, idle_min: Math.max(0, Math.round(on - talk - br)), breaks: arr(a.breaks).length };
        }).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
        const agents = [...groupBy(rows, r => r.user_id)].map(([id, list]) => { const on = sum(list.map(r => r.online_min)), talk = sum(list.map(r => r.talk_min)); return { id, name: userName(id), days: list.length, online_h: Math.round(on / 6) / 10, break_h: Math.round(sum(list.map(r => r.break_min)) / 6) / 10, calls: sum(list.map(r => r.calls)), talk_h: Math.round(talk / 6) / 10, calls_per_hour: on >= 30 ? Math.round((sum(list.map(r => r.calls)) / (on / 60)) * 10) / 10 : null, talk_pct: on ? pct(talk, on) : null, avg_start: list.length ? list.map(r => r.first_at).sort()[Math.floor(list.length / 2)] : null }; }).sort((a, b) => b.online_h - a.online_h);
        return { range: s.f, rows, agents };
      },
      campaigns(u, s) { need(u, x => isMkt(x) || isMgr(x)); return campaignStats(s); },
      quality(u, s) {
        const by = (key) => [...groupBy(s.cohort, key)].map(([k, list]) => { const n = list.length; return { key: k, leads: n, invalid_pct: pct(list.filter(l => l.stage === "invalid").length, n), duplicate_pct: pct(list.filter(l => l.duplicate_of).length, n), unreached_pct: pct(list.filter(l => l.attempts >= 3 && !l.connected_calls).length, n), connected_pct: pct(list.filter(l => l.first_connected_at).length, n), qualified_pct: pct(list.filter(l => l.reached && l.reached.qualified).length, n), funded_pct: pct(list.filter(l => l.reached && l.reached.funded).length, n), avg_score: n ? Math.round(sum(list.map(l => l.score)) / n) : 0, top_lost: ([...groupBy(list.filter(l => l.stage === "lost"), l => l.lost_reason)].sort((a, b) => b[1].length - a[1].length)[0] || [""])[0] }; }).sort((a, b) => b.leads - a.leads);
        return { range: s.f, sources: by(l => l.utm_source || "direct"), campaigns: by(l => (l.utm_source || "direct") + " / " + (l.utm_campaign || "(none)")).slice(0, 40), countries: by(l => l.country || "(unknown)").slice(0, 30) };
      },
      broadcasts(u, s) { need(u, x => isMkt(x) || canComm(x)); const list = broadcastStats(store.all("broadcasts").filter(b => s.inR(b.started_at || b.created_at))); return { range: s.f, rows: list, total: { sent: sum(list.map(b => b.stats.sent)), replies: sum(list.map(b => b.stats.replies)), registered: sum(list.map(b => b.stats.registered)), funded: sum(list.map(b => b.stats.funded)), unsubscribed: sum(list.map(b => b.stats.unsubscribed)) } }; },
    });

    /* ---------- daily MIS email text (the server sends it) ---------- */
    function misSummary(day) {
      const f = { from: day, to: day }, adm = SYSTEM;
      const d = REPORTS.dashboard(adm, scope(adm, f)).kpis, ag = REPORTS.agents(adm, scope(adm, f)).rows, dep = REPORTS.deposits(adm, scope(adm, f));
      const lines = [`${settings().company} CRM: daily summary for ${day}`, "", `New leads: ${d.leads}   Calls: ${d.calls} (${d.connected_calls} connected, ${d.talk_hours} h talk)`, `Registered: ${d.registered_in_range}   Verified FTDs: ${d.funded_in_range} ($${Math.round(d.ftd_in_range).toLocaleString()})`, `Speed to lead (median): ${d.median_speed_min == null ? "–" : d.median_speed_min + " min"}   Within SLA: ${d.within_sla}%`, `Right now: ${d.uncontacted_now} never called · ${d.overdue_now} overdue follow-ups · ${d.unassigned_now} unassigned · ${dep.pending} deposits waiting for verification`, "", "Agents (calls / connected / FTD / amount):"];
      ag.filter(a => a.calls || a.funded).forEach(a => lines.push(`  ${a.name.padEnd(22)} ${String(a.calls).padStart(4)} ${String(a.connected).padStart(5)} ${String(a.funded).padStart(4)}  $${Math.round(a.ftd_amount).toLocaleString()}`));
      return { subject: `${settings().company} CRM · ${day}: ${d.leads} leads, ${d.funded_in_range} FTDs`, text: lines.join("\n") };
    }

    /* =====================================================================
       SALES: optional journey — demo account and company-funded $100 account
       The goal stays a verified deposit of the client's own money (FTD).
       ===================================================================== */
    const bonusCfg = () => Object.assign({}, DEFAULT_SETTINGS.bonus, settings().bonus || {});
    const BONUS_LIVE = ["credited", "traded"];
    const BONUS_OPEN = ["requested", "credited", "traded"];
    const demoOf = l => l.demo || {};
    function setDemo(u, leadId, action, d = {}) {
      const l = leadFor(u, leadId, true), at = nowIso();
      if (!["give", "walkthrough", "traded", "active", "feedback", "undo"].includes(action)) throw new CrmError("Unknown demo step.");
      l.demo = Object.assign({}, l.demo); l.reached = l.reached || {};
      let label = "";
      if (action === "give") {
        if (!clean(d.login, 40)) throw new CrmError("Enter the demo login (account number).", 422, { login: "Required" });
        Object.assign(l.demo, { login: clean(d.login, 40), server: clean(d.server, 60), platform: clean(d.platform, 30) || "MT5", given_at: at, given_by: u.id });
        l.reached.demo = l.reached.demo || at; label = "Demo account given";
      } else {
        if (!l.demo.given_at) throw new CrmError("Give the demo account first.");
        if (action === "walkthrough") { l.demo.walkthrough_at = at; label = "Demo walkthrough done"; }
        if (action === "traded") { l.demo.first_trade_at = l.demo.first_trade_at || at; label = "First demo trade"; }
        if (action === "active") { l.demo.first_trade_at = l.demo.first_trade_at || at; l.demo.active_at = at; l.reached.demo_active = l.reached.demo_active || at; label = "Demo active (trading regularly)"; }
        if (action === "feedback") { l.demo.feedback = clean(d.feedback, 1000); label = "Demo feedback"; }
        if (action === "undo") { l.demo = {}; delete l.reached.demo; delete l.reached.demo_active; label = "Demo record cleared"; }
      }
      activity(l, u, "demo", { action, label, login: l.demo.login || "", feedback: action === "feedback" ? l.demo.feedback : "" });
      saveLead(l);
      if (action === "give") fire("demo_given", l);
      return clone(l);
    }

    // Each check: id, label, ok. The CRM refuses a request while any check fails.
    function bonusEligibility(u, leadId) {
      const l = leadFor(u, leadId), cfg = bonusCfg(), month = localDay(nowIso()).slice(0, 7);
      const same = store.all("leads").filter(x => x.id === l.id || (l.phone_key && l.phone_key.length >= 7 && x.phone_key === l.phone_key) || (l.email && x.email === l.email)).map(x => x.id);
      const prev = store.all("bonuses").filter(b => same.includes(b.lead_id) && b.status !== "rejected" && b.status !== "cancelled");
      const issued = store.all("bonuses").filter(b => b.status !== "rejected" && b.status !== "cancelled" && localDay(b.created_at).slice(0, 7) === month).length;
      const kycOk = STAGE_IDX[l.stage] >= STAGE_IDX.kyc && l.stage !== "lost" && l.stage !== "invalid" || !!(l.checklist || {}).kyc_approved;
      const checks = [
        { id: "enabled", label: "The $" + cfg.amount + " programme is switched on", ok: !!cfg.enabled },
        { id: "not_funded", label: "Client hasn't deposited yet (the $" + cfg.amount + " is for new clients)", ok: l.stage !== "funded" },
        { id: "kyc", label: cfg.require_kyc ? "KYC verified" : "KYC (not required by settings)", ok: !cfg.require_kyc || kycOk },
        { id: "first", label: "No earlier $" + cfg.amount + " account for this phone or email", ok: !prev.length, detail: prev.length ? "Already given on " + prev.map(b => (store.get("leads", b.lead_id) || {}).reference).join(", ") : "" },
        { id: "contact", label: "Not on the do-not-contact list", ok: !l.dnc },
        { id: "open", label: "Lead is open (not lost or invalid)", ok: l.stage !== "lost" && l.stage !== "invalid" },
        { id: "cap", label: cfg.monthly_cap ? `Monthly limit: ${issued} of ${cfg.monthly_cap} used` : "No monthly limit", ok: !cfg.monthly_cap || issued < cfg.monthly_cap },
      ];
      return { ok: checks.every(c => c.ok), checks, terms: bonusTerms(), existing: prev.map(bonusRow) };
    }
    function bonusTerms() {
      const c = bonusCfg();
      return [`The $${c.amount} is credited by ${settings().company} to a trading account in the client's own name.`, `The $${c.amount} itself can never be withdrawn.`, `It expires ${c.expiry_days} days after it is credited.`,
        `Profit can be withdrawn after trading at least ${c.min_lots} lots, up to $${c.max_profit} in total${c.withdraw_needs_deposit ? ", and only after the client makes their own first deposit" : ""}.`, "One per person, household, phone number and email. Abuse or duplicate accounts cancel the offer.", "CFDs are leveraged products and carry a high risk of losing money."];
    }
    function bonusRow(b) {
      const l = store.get("leads", b.lead_id), paid = sum(arr(b.withdrawals).filter(w => w.status === "paid").map(w => w.amount));
      return Object.assign({}, b, { lead: brief(l), owner_name: userName(b.owner_id), requested_by_name: userName(b.requested_by), approved_by_name: b.approved_by ? userName(b.approved_by) : "", paid_out: paid,
        days_left: b.expires_at && BONUS_LIVE.includes(b.status) ? Math.ceil((Date.parse(b.expires_at) - nowMs()) / 864e5) : null, source: l ? l.utm_source || "direct" : "", campaign: l ? l.utm_campaign || "" : "",
        mt5_match: b.status === "requested" ? bonusMatch(b) : null }); // api mode: the BONUS <id> deal Absel Markets made in MT5 Manager
    }
    function requestBonus(u, leadId, p = {}) {
      const l = leadFor(u, leadId, true), el = bonusEligibility(u, leadId);
      if (!el.ok) throw new CrmError("Not eligible yet: " + el.checks.filter(c => !c.ok).map(c => c.label).join("; ") + ".", 422);
      if (!p.terms_accepted) throw new CrmError("Confirm the client accepted the terms.", 422, { terms_accepted: "Required" });
      const cfg = bonusCfg();
      const b = { id: newId("BN"), lead_id: l.id, owner_id: l.owner_id, amount: cfg.amount, status: "requested", account_id: clean(p.account_id || l.account_id, 40), note: clean(p.note, 500),
        terms_accepted_at: nowIso(), terms: el.terms, requested_by: u.id, created_at: nowIso(), approved_by: null, credited_at: null, expires_at: null, lots: 0, profit: 0, balance: 0, withdrawals: [], ended_at: null, converted_at: null, reject_reason: "" };
      store.put("bonuses", b); l.bonus_status = "requested";
      activity(l, u, "bonus", { action: "requested", amount: b.amount, label: `$${b.amount} account requested` });
      saveLead(l);
      if (isMgr(u) && p.approve && mt5Mode() !== "api") return decideBonus(u, b.id, true, { account_id: b.account_id }); // api mode: confirmed once MT5 shows the credit
      store.all("users").filter(x => x.active !== false && (x.role === "manager" || x.role === "admin")).forEach(x => notify(x.id, `🎁 $${b.amount} account to approve: ${l.first_name} ${l.last_name} (${userName(l.owner_id)})`, l.id, "bonus"));
      return bonusRow(b);
    }
    function decideBonus(u, id, approve, p = {}) {
      need(u, isMgr, "Only sales managers approve the $100 accounts.");
      const b = store.get("bonuses", id); if (!b) throw new CrmError("Not found.", 404);
      if (b.status !== "requested") throw new CrmError("This request was already " + b.status + ".");
      const l = store.get("leads", b.lead_id);
      if (approve) {
        // api mode: Absel Markets credits it in MT5 Manager with BONUS <id>; confirm the matched deal, or say why there is none
        const m = bonusMatch(b); let rec = null;
        if (m && p.mt5_ticket) { if (!m.ok || String(p.mt5_ticket) !== String(m.tickets[0])) throw new CrmError("The MT5 deal doesn’t match this request any more. Reload and check the warning."); rec = { matched: true, ticket: m.tickets[0], by: u.id, at: nowIso() }; p.account_id = m.legs[0].deals[0].login; }
        else if (m) { const why = clean(p.no_match_reason, 300); if (!why) throw new CrmError(m.seen ? "The MT5 deal doesn’t match (" + m.warn.join("; ") + "). Say why you confirm it anyway." : "No MT5 deal with “" + m.comment + "” was found. Say why you confirm without it.", 422, { no_match_reason: "Required" }); rec = { matched: false, reason: why, warn: m.warn, by: u.id, at: nowIso() }; }
        const acc = clean(p.account_id || b.account_id, 40); if (!acc) throw new CrmError("Enter the trading account number the $" + b.amount + " was credited to.", 422, { account_id: "Required" });
        if (rec) b.mt5 = rec;
        const now = nowIso(), cfg = bonusCfg();
        Object.assign(b, { status: "credited", account_id: acc, approved_by: u.id, credited_at: now, expires_at: new Date(nowMs() + cfg.expiry_days * 864e5).toISOString(), balance: b.amount });
        if (l) { l.bonus_status = "credited"; l.reached = l.reached || {}; l.reached.bonus = l.reached.bonus || now; if (!l.account_id) l.account_id = acc; activity(l, u, "bonus", { action: "credited", amount: b.amount, label: `${b.amount} credited to account ${acc}${b.mt5 ? (b.mt5.matched ? " (seen in MT5, deal #" + b.mt5.ticket + ")" : " (confirmed without an MT5 match: " + b.mt5.reason + ")") : ""}, expires ${b.expires_at.slice(0, 10)}` }); saveLead(l); }
        store.put("bonuses", b);
        if (b.owner_id && b.owner_id !== u.id) notify(b.owner_id, `🎁 $${b.amount} credited for ${l ? l.first_name + " " + l.last_name : "your client"}. Call them to start trading`, b.lead_id, "bonus");
        if (l) fire("bonus_credited", l);
      } else {
        const why = clean(p.reason, 300); if (!why) throw new CrmError("Say why it's rejected.", 422, { reason: "Required" });
        Object.assign(b, { status: "rejected", approved_by: u.id, reject_reason: why, ended_at: nowIso() }); store.put("bonuses", b);
        if (l) { l.bonus_status = "rejected"; activity(l, u, "bonus", { action: "rejected", amount: b.amount, label: "$" + b.amount + " request rejected: " + why }); saveLead(l); }
        if (b.requested_by !== u.id) notify(b.requested_by, `$${b.amount} request rejected for ${l ? l.first_name + " " + l.last_name : "a client"}: ${why}`, b.lead_id, "warn");
      }
      return bonusRow(b);
    }
    function endBonus(b, status, by) {
      b.status = status; b.ended_at = nowIso(); store.put("bonuses", b);
      const l = store.get("leads", b.lead_id); if (!l) return;
      l.bonus_status = status;
      activity(l, by || SYSTEM, "bonus", { action: status, amount: b.amount, label: { expired: `$${b.amount} account expired`, used_up: `$${b.amount} account used up`, converted: "Converted: client deposited own money", cancelled: `$${b.amount} account cancelled` }[status] || status });
      saveLead(l);
      if (status === "expired" || status === "used_up") fire("bonus_ended", l);
    }
    // Agents or back-office record progress from the trading platform (no MT5 link yet)
    function updateBonus(u, id, p = {}) {
      const b = store.get("bonuses", id); if (!b) throw new CrmError("Not found.", 404);
      const l = leadFor(u, b.lead_id, true);
      if (!BONUS_LIVE.includes(b.status)) throw new CrmError("Only active $" + b.amount + " accounts can be updated.");
      const num = (v, min) => { const n = Number(v); return isNaN(n) ? undefined : Math.max(min, Math.round(n * 100) / 100); };
      const lots = num(p.lots, 0), profit = num(p.profit, -1e9), balance = num(p.balance, 0);
      if (lots !== undefined) b.lots = lots; if (profit !== undefined) b.profit = profit; if (balance !== undefined) b.balance = balance;
      if (b.lots > 0 && b.status === "credited") { b.status = "traded"; l.bonus_status = "traded"; l.reached = l.reached || {}; l.reached.bonus_traded = l.reached.bonus_traded || nowIso(); }
      b.updated_at = nowIso(); store.put("bonuses", b);
      activity(l, u, "bonus", { action: "progress", amount: b.amount, label: `$${b.amount} account: ${b.lots} lots, profit $${b.profit}, balance $${b.balance}` });
      saveLead(l);
      if (p.end === "used_up") endBonus(b, "used_up", u);
      return bonusRow(b);
    }
    function requestBonusWithdrawal(u, id, amount) {
      const b = store.get("bonuses", id); if (!b) throw new CrmError("Not found.", 404);
      const l = leadFor(u, b.lead_id, true), cfg = bonusCfg(), a = Math.round(Number(amount) * 100) / 100;
      if (!BONUS_LIVE.includes(b.status) && b.status !== "converted") throw new CrmError("This account is no longer active.");
      if (!(a > 0)) throw new CrmError("Enter the amount.", 422, { amount: "Required" });
      if (b.lots < cfg.min_lots) throw new CrmError(`The client must trade at least ${cfg.min_lots} lots first (now ${b.lots}).`);
      if (cfg.withdraw_needs_deposit && l.stage !== "funded") throw new CrmError("Profit can be withdrawn only after the client's own first deposit.");
      const taken = sum(arr(b.withdrawals).filter(w => w.status !== "rejected").map(w => w.amount));
      if (a > b.profit - taken + 0.001) throw new CrmError(`Only profit can be withdrawn: $${Math.max(0, b.profit - taken)} available.`);
      if (taken + a > cfg.max_profit + 0.001) throw new CrmError(`Maximum withdrawable profit is $${cfg.max_profit} (already $${taken}).`);
      b.withdrawals = arr(b.withdrawals).concat([{ id: newId("W"), amount: a, status: "requested", requested_by: u.id, requested_at: nowIso() }]); store.put("bonuses", b);
      activity(l, u, "bonus", { action: "withdrawal_requested", amount: a, label: `Profit withdrawal requested: $${a}` }); saveLead(l);
      store.all("users").filter(x => x.active !== false && (x.role === "manager" || x.role === "admin")).forEach(x => notify(x.id, `💸 Profit withdrawal to approve: $${a} for ${l.first_name} ${l.last_name}`, l.id, "bonus"));
      return bonusRow(b);
    }
    function decideBonusWithdrawal(u, id, wid, approve, reason) {
      need(u, isMgr, "Only sales managers approve withdrawals.");
      const b = store.get("bonuses", id); if (!b) throw new CrmError("Not found.", 404);
      const w = arr(b.withdrawals).find(x => x.id === wid); if (!w || w.status !== "requested") throw new CrmError("Nothing to approve.");
      if (!approve && !clean(reason)) throw new CrmError("Say why.", 422, { reason: "Required" });
      Object.assign(w, { status: approve ? "paid" : "rejected", decided_by: u.id, decided_at: nowIso(), reason: clean(reason, 300) }); store.put("bonuses", b);
      const l = store.get("leads", b.lead_id);
      if (l) { activity(l, u, "bonus", { action: approve ? "withdrawal_paid" : "withdrawal_rejected", amount: w.amount, label: approve ? `Profit paid out: $${w.amount}` : `Profit withdrawal rejected: ${w.reason}` }); saveLead(l); }
      if (w.requested_by !== u.id) notify(w.requested_by, approve ? `Profit of $${w.amount} paid to ${l ? l.first_name : "client"}. Good moment to ask for a deposit` : `Withdrawal rejected: ${w.reason}`, b.lead_id, approve ? "win" : "warn");
      return bonusRow(b);
    }
    function cancelBonus(u, id, reason) {
      const b = store.get("bonuses", id); if (!b) throw new CrmError("Not found.", 404);
      if (b.status === "requested" && (b.requested_by === u.id || isMgr(u))) { leadFor(u, b.lead_id, true); endBonus(b, "cancelled", u); return bonusRow(b); }
      need(u, isMgr, "Only sales managers can cancel an active account.");
      if (!BONUS_LIVE.includes(b.status)) throw new CrmError("Already ended.");
      b.reject_reason = clean(reason, 300); endBonus(b, "cancelled", u); return bonusRow(b);
    }
    function listBonuses(u, f = {}) {
      let rows = store.all("bonuses").filter(b => { const l = store.get("leads", b.lead_id); return l && canSee(u, l) && (seesAll(u) || b.owner_id === u.id || b.requested_by === u.id); });
      if (f.status === "withdrawals") rows = rows.filter(b => arr(b.withdrawals).some(w => w.status === "requested"));
      else if (f.status === "active") rows = rows.filter(b => BONUS_LIVE.includes(b.status));
      else if (f.status === "ended") rows = rows.filter(b => ["expired", "used_up", "cancelled", "rejected"].includes(b.status));
      else if (f.status) rows = rows.filter(b => b.status === f.status);
      if (f.owner && seesAll(u)) rows = rows.filter(b => b.owner_id === f.owner);
      rows.sort((a, b) => (a.status === "requested" ? 0 : 1) - (b.status === "requested" ? 0 : 1) || b.created_at.localeCompare(a.created_at));
      return rows.slice(0, 500).map(bonusRow);
    }
    function bonusForLead(leadId) { return store.all("bonuses").filter(b => b.lead_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(bonusRow); }
    // FTD verified → the $100 track converted; expired accounts end automatically
    function convertBonuses(l) { store.all("bonuses").filter(b => b.lead_id === l.id && ["credited", "traded", "expired", "used_up"].includes(b.status)).forEach(b => { b.converted_at = nowIso(); endBonus(b, "converted"); }); }
    function journeyTick() {
      let n = 0; const now = nowIso();
      store.all("bonuses").filter(b => BONUS_LIVE.includes(b.status) && b.expires_at && b.expires_at <= now).forEach(b => { endBonus(b, "expired"); n++; });
      return n;
    }
    function journeyFlags(l) {
      const b = store.all("bonuses").filter(x => x.lead_id === l.id).sort((a, c) => c.created_at.localeCompare(a.created_at))[0];
      return { demo: l.demo && l.demo.given_at ? (l.demo.active_at ? "active" : l.demo.first_trade_at ? "traded" : "given") : "", bonus: b ? b.status : "", bonus_profit: b ? b.profit : 0, bonus_days_left: b && b.expires_at && BONUS_LIVE.includes(b.status) ? Math.ceil((Date.parse(b.expires_at) - nowMs()) / 864e5) : null };
    }
    function journeyQueue(u) {
      const mine = store.all("leads").filter(l => l.owner_id === u.id && OPEN.has(l.stage)), now = nowMs();
      const demoIdle = mine.filter(l => l.demo && l.demo.given_at && !l.demo.first_trade_at && now - Date.parse(l.demo.given_at) > 2 * 864e5).map(l => Object.assign(brief(l), { why: "Demo given " + Math.floor((now - Date.parse(l.demo.given_at)) / 864e5) + " days ago, no trade yet" }));
      const live = store.all("bonuses").filter(b => b.owner_id === u.id && BONUS_LIVE.includes(b.status));
      const expiring = live.filter(b => Date.parse(b.expires_at) - now < 3 * 864e5).map(b => Object.assign(brief(store.get("leads", b.lead_id)), { why: `$${b.amount} expires in ${Math.max(0, Math.ceil((Date.parse(b.expires_at) - now) / 864e5))} days` }));
      const profit = live.filter(b => b.profit > 0).map(b => Object.assign(brief(store.get("leads", b.lead_id)), { why: `In profit: $${b.profit} on the $${b.amount} account. Ask for a deposit` }));
      return { demo_idle: demoIdle.filter(x => x.id), bonus_expiring: expiring.filter(x => x.id), bonus_profit: profit.filter(x => x.id) };
    }

    Object.assign(REPORTS, {
      journey(u, s) {
        const c = s.cohort, n = c.length, has = k => l => l.reached && l.reached[k];
        const funded = l => l.reached && l.reached.funded;
        const step = (label, list) => ({ label, n: list.length, of_total: pct(list.length, n) });
        const steps = [step("Leads", c), step("Spoke to client", c.filter(l => l.first_connected_at)), step("Demo given", c.filter(has("demo"))), step("Demo active", c.filter(has("demo_active"))), step("Registered", c.filter(has("registered"))), step("KYC verified", c.filter(has("kyc"))),
          step("$" + bonusCfg().amount + " credited", c.filter(has("bonus"))), step("$" + bonusCfg().amount + " traded", c.filter(has("bonus_traded"))), step("Funded with own money (FTD)", c.filter(funded))];
        const route = (label, list) => ({ label, leads: list.length, funded: list.filter(funded).length, conversion: pct(list.filter(funded).length, list.length), ftd_amount: sum(list.filter(funded).map(l => l.deposit_amount)) });
        const routes = [route("Direct (no demo, no $" + bonusCfg().amount + ")", c.filter(l => !has("demo")(l) && !has("bonus")(l))), route("Demo only", c.filter(l => has("demo")(l) && !has("bonus")(l))), route("$" + bonusCfg().amount + " account (with or without demo)", c.filter(has("bonus")))];
        const bs = store.all("bonuses").filter(b => s.leadIds.has(b.lead_id) && s.inR(b.created_at) && (!s.f.agent || b.owner_id === s.f.agent));
        const credited = bs.filter(b => b.credited_at), conv = credited.filter(b => b.status === "converted");
        const paid = sum(credited.flatMap(b => arr(b.withdrawals).filter(w => w.status === "paid").map(w => w.amount)));
        const issuedCost = sum(credited.map(b => b.amount)), cost = issuedCost + paid;
        const days = conv.map(b => (Date.parse(b.converted_at) - Date.parse(b.credited_at)) / 864e5).filter(x => x >= 0);
        const ftdFromBonus = sum(conv.map(b => (store.get("leads", b.lead_id) || {}).deposit_amount || 0));
        const grp = key => [...groupBy(credited, key)].map(([k, list]) => { const cv = list.filter(b => b.status === "converted"); const pd = sum(list.flatMap(b => arr(b.withdrawals).filter(w => w.status === "paid").map(w => w.amount))); return { k, credited: list.length, converted: cv.length, conversion: pct(cv.length, list.length), cost: sum(list.map(b => b.amount)) + pd, ftd_amount: sum(cv.map(b => (store.get("leads", b.lead_id) || {}).deposit_amount || 0)) }; }).map(x => Object.assign(x, { cost_per_ftd: x.converted ? Math.round(x.cost / x.converted) : null })).sort((a, b) => b.credited - a.credited);
        const lead = b => store.get("leads", b.lead_id) || {};
        return { range: s.f, steps, routes, programme: { requested: bs.length, credited: credited.length, rejected: bs.filter(b => b.status === "rejected").length, active: credited.filter(b => BONUS_LIVE.includes(b.status)).length, traded: credited.filter(b => b.lots > 0).length,
          expired: credited.filter(b => ["expired", "used_up"].includes(b.status)).length, converted: conv.length, conversion: pct(conv.length, credited.length), issued_cost: issuedCost, profit_paid: paid, total_cost: cost, cost_per_ftd: conv.length ? Math.round(cost / conv.length) : null, ftd_amount: ftdFromBonus, median_days: days.length ? Math.round(median(days) * 10) / 10 : null },
          by_agent: grp(b => userName(b.owner_id)), by_source: grp(b => (lead(b).utm_source || "direct") + " / " + (lead(b).utm_campaign || "(none)")), by_country: grp(b => lead(b).country || "(unknown)") };
      },
    });

    /* =====================================================================
       CLIENT PORTAL (Absel Global client area) + OPERATIONS back office
       Clients only ever see Absel Global. Accounts and money are handled at the licensed
       broker by the operations team, who record each step here.
       ===================================================================== */
    const OPEN_PAY = ["pending", "first_approved", "approved", "paid"]; // paid = received by the payment gateway, waiting to be credited in MT5 (by operations, in MT5 Manager)
    const isOps = u => isAdmin(u) || u.role === "operations";
    const isKyc = u => isOps(u) || u.role === "compliance";
    const portalCfg = () => { const d = clone(DEFAULT_SETTINGS.portal), s = settings().portal || {}; return Object.assign(d, s, { account_types: arr(s.account_types).length ? s.account_types : d.account_types, methods: arr(s.methods).length ? s.methods : d.methods }); };
    const hashToken = t => (opts.hashToken ? opts.hashToken(String(t)) : "h:" + String(t));
    const randToken = () => (opts.random ? base32Encode(opts.random(20)) : rand(32)).toLowerCase();
    const money2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const KYC_KINDS = [{ id: "kyc_id", label: "ID document (passport, ID card or driving licence)", required: true }, { id: "kyc_id_back", label: "Back of ID card (if it has one)" }, { id: "kyc_address", label: "Proof of address (utility bill or bank statement, last 3 months)", required: true }, { id: "kyc_selfie", label: "Selfie holding your ID" }];
    const ACC_OPEN = ["open"];
    const clientOf = c => { const x = store.get("clients", c && c.id); if (!x || x.status === "closed") throw new CrmError("Please sign in again.", 401); return x; };
    const opsUsers = (kyc) => store.all("users").filter(x => x.active !== false && (x.role === "admin" || x.role === "operations" || (kyc && x.role === "compliance")));
    const leadOfClient = x => x && x.lead_id ? store.get("leads", x.lead_id) : null;
    function portalLog(x, label, extra = {}) {
      const l = leadOfClient(x); if (!l) return;
      activity(l, extra.by || SYSTEM, "portal", Object.assign({ label }, extra.data || {})); saveLead(l);
    }
    function clientMail(x, tplId, extraVars = {}) {
      const l = leadOfClient(x), t = store.get("templates", tplId); if (!l || !t || t.active === false) return null;
      const t2 = Object.assign({}, t, { subject: renderVars(t.subject, extraVars), body: renderVars(t.body, extraVars) });
      return queueMessage(l, SYSTEM, t2, { transactional: true });
    }
    const renderVars = (s, v) => String(s || "").replace(/\{\{\s*(amount|account|login|server|reason|reference|method|account_type|code|link|period)\s*\}\}/g, (m, k) => v[k] != null ? String(v[k]) : m);
    const pubAccount = a => { const o = Object.assign({}, a); o.has_password = !!o.pw_once; delete o.pw_once; return o; };
    const clientGateway = g => g ? { provider: g.provider, status: g.status, address: g.address || "", network: g.network || "", currency: g.currency || "", payment_page: g.payment_page || "", expires_at: g.expires_at || null, target: g.target || "", rate: g.rate || null, paid: g.paid || "0", txid: g.txid || "" } : undefined;
    const clientPayment = p => { const o = Object.assign(pubPayment(p), { gateway: clientGateway(p.gateway) }); delete o.mt5; delete o.manual; return o; };
    const pubPayment = p => Object.assign({}, p, { account: p.account_id ? (store.get("accounts", p.account_id) || {}).login || "" : "", to_account: p.to_account_id ? (store.get("accounts", p.to_account_id) || {}).login || "" : "" });
    function pubClient(x) {
      const o = {}; ["id", "email", "first_name", "last_name", "dial_code", "phone", "country", "city", "address", "postcode", "dob", "nationality", "status", "created_at", "email_verified_at", "last_login_at", "ref_code", "lead_id", "terms_accepted_at"].forEach(k => o[k] = x[k] == null ? "" : x[k]);
      o.kyc = Object.assign({ status: "none" }, x.kyc || {}); o.totp_enabled = !!x.totp_enabled; o.locked = !!(x.locked_until && Date.parse(x.locked_until) > nowMs());
      return o;
    }

    /* ---------- sign-up, sign-in, email verification, password reset ---------- */
    function portalRegister(data = {}, meta = {}) {
      const cfg = portalCfg(); if (!cfg.enabled) throw new CrmError("Registration is closed right now.");
      const email = lc(data.email).slice(0, 160);
      const f = { first_name: clean(data.first_name, 60), last_name: clean(data.last_name, 60), email, dial_code: "+" + digits(data.dial_code).slice(0, 4), phone: digits(data.phone).slice(0, 15), country: clean(data.country, 80) };
      const e = {};
      if (!f.first_name) e.first_name = "Enter your first name"; if (!f.last_name) e.last_name = "Enter your last name";
      if (!EMAIL_RE.test(email)) e.email = "Enter a valid email"; if (f.phone.length < 6) e.phone = "Enter a valid phone number"; if (!f.country) e.country = "Select your country";
      if (!data.terms) e.terms = "Accept the terms to continue";
      if (Object.keys(e).length) throw new CrmError("Please check the highlighted fields.", 422, e);
      if (store.all("clients").some(x => x.email === email)) throw new CrmError("There's already an account with this email. Sign in or reset your password.", 422, { email: "Already registered" });
      checkPassword(data.password, email.split("@")[0]);
      if (!opts.hashPassword) throw new CrmError("Registration isn't available here.");
      // Link to the lead the sales team already works, or create one
      // Every registration is a lead: link to the person sales already knows (same email, else same phone), never a second copy
      const key = phoneKey(f.dial_code, f.phone), rank = x => (x.email === email ? 0 : 2) + (OPEN.has(x.stage) || x.stage === "funded" ? 0 : 1);
      const att = { utm_source: lc(data.utm_source).slice(0, 60), utm_medium: lc(data.utm_medium).slice(0, 60), utm_campaign: clean(data.utm_campaign, 160), utm_content: clean(data.utm_content, 160), utm_term: clean(data.utm_term, 160), gclid: clean(data.gclid, 200), fbclid: clean(data.fbclid, 200), ref_code: clean(data.ref, 60), page_url: clean(data.landing, 500) };
      let l = store.all("leads").filter(x => !x.client_id && (x.email === email || (key.length >= 7 && x.phone_key === key))).sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))[0];
      let linked = false;
      const ibCode = clean(data.ib || data.partner_code, 12).toUpperCase();
      if (!l) l = createLead(SYSTEM, Object.assign({ firstName: f.first_name, lastName: f.last_name, email, dialCode: f.dial_code, phone: f.phone, country: f.country, form: "client area", ip: meta.ip, user_agent: meta.ua, consent: true, ib: ibCode }, att, { utm_source: att.utm_source || "client-area" }), { source: "portal" });
      else {
        linked = true;
        if (!l.email) l.email = email;
        Object.keys(att).forEach(k => { if (att[k] && !l[k]) l[k] = att[k]; }); // first touch wins; later touches go to the timeline
        if (att.utm_source || att.utm_campaign) activity(l, SYSTEM, "portal", { label: `Came back via ${att.utm_source || "direct"}${att.utm_campaign ? " / " + att.utm_campaign : ""}` });
        if (l.stage === "lost" || l.stage === "invalid") { const from = setStage(l, SYSTEM, l.connected_calls ? "contacted" : "new", { note: "Reopened: registered in the client area" }); l.lost_reason = ""; if (from !== false) fire("stage_changed", l, { from, to: l.stage }); }
        const ow = l.owner_id && store.get("users", l.owner_id);
        if (!ow || ow.active === false) { const pk = pickOwner(l); if (pk.owner) setOwner(l, pk.owner, SYSTEM, "Client-area registration"); }
        if (ibCode) ibAttributeLead(l, ibCode, "registration");
      }
      const x = Object.assign(f, { id: newId("C"), lead_id: l.id, password_hash: opts.hashPassword(String(data.password)), status: "active", kyc: { status: "none" }, created_at: nowIso(), last_login_at: nowIso(), terms_accepted_at: nowIso(), session_ver: 0, failed_logins: 0, locked_until: null, logins: [], ref_code: "R" + rand(6).toUpperCase(), referred_by: clean(data.ref, 60), city: "", address: "", postcode: "", dob: "", nationality: "" });
      const tok = randToken(); x.verify_hash = hashToken(tok); x.verify_exp = new Date(nowMs() + 48 * 3600e3).toISOString();
      x.signup_ip = clean(meta.ip, 64);
      store.put("clients", x);
      l.client_id = x.id; l.tags = [...new Set(arr(l.tags).concat(["Client area"]))];
      ibAttachClient(x, l);
      l.reached = l.reached || {}; l.reached.client_area = l.reached.client_area || nowIso();
      activity(l, SYSTEM, "portal", { label: linked ? "Registered in the client area (matched to this lead)" : "Registered in the client area" }); saveLead(l);
      if (l.owner_id) notify(l.owner_id, `🧾 ${f.first_name} ${f.last_name} registered in the client area. Call to help with documents and the first deposit`, l.id, "portal");
      fire("client_registered", l);
      return { client: pubClient(x), verify_token: tok };
    }
    function portalResendVerify(c) {
      const x = clientOf(c); if (x.email_verified_at) throw new CrmError("Your email is already verified.");
      const tok = randToken(); x.verify_hash = hashToken(tok); x.verify_exp = new Date(nowMs() + 48 * 3600e3).toISOString(); store.put("clients", x);
      return { email: x.email, first_name: x.first_name, verify_token: tok };
    }
    function portalVerifyEmail(token) {
      const h = hashToken(clean(token, 100)), x = store.all("clients").find(y => y.verify_hash && y.verify_hash === h);
      if (!x || Date.parse(x.verify_exp) < nowMs()) throw new CrmError("This link has expired. Sign in and ask for a new one.");
      x.email_verified_at = nowIso(); x.verify_hash = null; store.put("clients", x); portalLog(x, "Email verified");
      return { ok: true, email: x.email };
    }
    function portalAuthLookup(email) {
      const x = store.all("clients").find(y => y.email === lc(email)); if (!x) return { client: null };
      return { client: { id: x.id, password_hash: x.password_hash, active: x.status === "active", locked: !!(x.locked_until && Date.parse(x.locked_until) > nowMs()), locked_until: x.locked_until, totp_enabled: !!x.totp_enabled, session_ver: x.session_ver || 0 } };
    }
    function portalAuthResult(email, outcome, meta = {}) {
      const x = store.all("clients").find(y => y.email === lc(email)); if (!x) return null;
      x.logins = arr(x.logins).concat([{ at: nowIso(), outcome, ip: clean(meta.ip, 64), ua: clean(meta.ua, 160) }]).slice(-20);
      if (outcome === "ok") { x.failed_logins = 0; x.locked_until = null; x.last_login_at = nowIso(); }
      else if (outcome === "bad_password" || outcome === "bad_code") { x.failed_logins = (x.failed_logins || 0) + 1; if (x.failed_logins >= LOCK_AFTER) { x.locked_until = new Date(nowMs() + LOCK_MIN * 60000).toISOString(); x.failed_logins = 0; } }
      store.put("clients", x);
      return outcome === "ok" ? { id: x.id, session_ver: x.session_ver || 0 } : null;
    }
    const portalTotpCheck = (id, code) => { const x = store.get("clients", id); return !!(x && x.totp_enabled && totpVerify(x.totp_secret, code, nowMs())); };
    function portalForgot(email) {
      const x = store.all("clients").find(y => y.email === lc(email)); if (!x || x.status !== "active") return null;
      const tok = randToken(); x.reset_hash = hashToken(tok); x.reset_exp = new Date(nowMs() + 3600e3).toISOString(); store.put("clients", x);
      return { email: x.email, first_name: x.first_name, reset_token: tok };
    }
    function portalReset(token, password) {
      const h = hashToken(clean(token, 100)), x = store.all("clients").find(y => y.reset_hash && y.reset_hash === h);
      if (!x || Date.parse(x.reset_exp) < nowMs()) throw new CrmError("This reset link has expired. Ask for a new one.");
      checkPassword(password, x.email.split("@")[0]);
      x.password_hash = opts.hashPassword(String(password)); x.reset_hash = null; x.session_ver = (x.session_ver || 0) + 1; x.failed_logins = 0; x.locked_until = null;
      if (!x.email_verified_at) x.email_verified_at = nowIso(); // the link proved they own the email
      store.put("clients", x); portalLog(x, "Password reset by the client");
      return { ok: true };
    }
    function portalSetPassword(c, newPassword, passwordHash) {
      const x = clientOf(c); checkPassword(newPassword, x.email.split("@")[0]);
      x.password_hash = passwordHash || opts.hashPassword(String(newPassword)); x.session_ver = (x.session_ver || 0) + 1; store.put("clients", x);
      portalLog(x, "Password changed by the client"); return { session_ver: x.session_ver };
    }
    function portalTotpBegin(c) {
      const x = clientOf(c); x.totp_pending = opts.random ? base32Encode(opts.random(20)) : rand(32).toUpperCase().replace(/[^A-Z2-7]/g, "A"); store.put("clients", x);
      const issuer = encodeURIComponent(portalCfg().brand);
      return { secret: x.totp_pending, otpauth: `otpauth://totp/${issuer}:${encodeURIComponent(x.email)}?secret=${x.totp_pending}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
    }
    function portalTotpEnable(c, code) {
      const x = clientOf(c); if (!x.totp_pending || !totpVerify(x.totp_pending, code, nowMs())) throw new CrmError("That code is wrong or expired. Try the newest code.", 422, { code: "Wrong code" });
      x.totp_secret = x.totp_pending; x.totp_pending = null; x.totp_enabled = true; store.put("clients", x); portalLog(x, "Two-step login turned on"); return pubClient(x);
    }
    function portalTotpDisable(c, code) {
      const x = clientOf(c); if (!x.totp_enabled || !totpVerify(x.totp_secret, code, nowMs())) throw new CrmError("That code is wrong or expired.", 422, { code: "Wrong code" });
      x.totp_enabled = false; x.totp_secret = null; store.put("clients", x); portalLog(x, "Two-step login turned off"); return pubClient(x);
    }

    /* ---------- client area ---------- */
    function portalMe(c) {
      const x = clientOf(c), cfg = portalCfg(), l = leadOfClient(x);
      const accounts = store.all("accounts").filter(a => a.client_id === x.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(pubAccount);
      const pays = store.all("payments").filter(p => p.client_id === x.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const docs = store.all("files").filter(f => f.client_id === x.id).map(f => ({ id: f.id, kind: f.kind, name: f.name, size: f.size, created_at: f.created_at, status: f.review || "pending" }));
      const owner = l ? store.get("users", l.owner_id) : null;
      const b = l ? store.all("bonuses").filter(z => z.lead_id === l.id && z.status !== "rejected" && z.status !== "cancelled").sort((p, q) => q.created_at.localeCompare(p.created_at))[0] : null;
      return {
        client: pubClient(x), accounts, payments: pays.slice(0, 50).map(clientPayment), docs, kyc_kinds: KYC_KINDS,
        totals: { deposits: sum(pays.filter(p => p.type === "deposit" && p.status === "completed").map(p => p.amount)), withdrawals: sum(pays.filter(p => p.type === "withdrawal" && p.status === "completed").map(p => p.amount)), pending: pays.filter(p => OPEN_PAY.includes(p.status)).length, balance: sum(accounts.filter(a => a.kind === "live" && a.status === "open").map(a => Number(a.balance) || 0)) },
        manager: owner ? { name: owner.name, phone: owner.phone || "", email: owner.email || "" } : null,
        ib: (() => { const pt = partnerOfClient(x.id); return pt ? { status: pt.status, code: pt.code || "" } : { status: "none", can_apply: ibCfg().enabled && (x.kyc || {}).status === "approved" }; })(),
        bonus: b ? { amount: b.amount, status: b.status, account_id: b.account_id, lots: b.lots, profit: b.profit, expires_at: b.expires_at, min_lots: bonusCfg().min_lots, max_profit: bonusCfg().max_profit } : null,
        config: { brand: cfg.brand, legal_line: cfg.legal_line, risk_warning: cfg.risk_warning, support_email: cfg.support_email || settings().support_email, whatsapp: settings().whatsapp_number, account_types: cfg.account_types, methods: cfg.methods.filter(m => m.enabled !== false), require_kyc_for_live: cfg.require_kyc_for_live, mt5_api: mt5Mode() === "api", platform_links: cfg.platform_links },
      };
    }
    function portalUpdateProfile(c, p = {}) {
      const x = clientOf(c), locked = x.kyc && x.kyc.status === "approved";
      const allowed = ["address", "city", "postcode", "dob", "nationality"].concat(locked ? [] : ["first_name", "last_name"]);
      const ch = [];
      allowed.forEach(k => { if (p[k] === undefined) return; const v = clean(p[k], k === "address" ? 200 : 80); if (v !== (x[k] || "")) { ch.push(k); x[k] = v; } });
      if (p.dob && !/^\d{4}-\d{2}-\d{2}$/.test(x.dob)) throw new CrmError("Enter your date of birth.", 422, { dob: "YYYY-MM-DD" });
      store.put("clients", x);
      const l = leadOfClient(x); if (l && ch.length) { if (x.city && !l.city) l.city = x.city; portalLog(x, "Profile updated: " + ch.join(", ")); }
      return pubClient(x);
    }
    function portalUploadKyc(c, f = {}) {
      if (IB_DOC_KINDS.some(k => k.id === f.kind)) return ibUploadDoc(c, f);
      const x = clientOf(c), kind = KYC_KINDS.some(k => k.id === f.kind) ? f.kind : null;
      if (!kind) throw new CrmError("Choose the document type.");
      if (x.kyc && x.kyc.status === "approved") throw new CrmError("Your documents are already approved. Contact support to update them.");
      const data = String(f.data || "");
      if (!FILE_RE.test(data)) throw new CrmError("Upload a JPG, PNG, WebP image or a PDF.");
      if (data.length > 6.5e6) throw new CrmError("That file is too big. Keep it under 4 MB.");
      const l = leadOfClient(x);
      const rec = { id: newId("F"), lead_id: l ? l.id : "", client_id: x.id, kind, name: clean(f.name, 120) || kind, type: data.slice(5, data.indexOf(";")), size: Math.round(data.length * 0.75), data, created_by: "client", created_at: nowIso(), review: "pending" };
      store.put("files", rec);
      const have = new Set(store.all("files").filter(z => z.client_id === x.id && z.review !== "rejected").map(z => z.kind));
      const complete = KYC_KINDS.filter(k => k.required).every(k => have.has(k.id));
      if (complete && ["none", "rejected", "resubmit"].includes((x.kyc || {}).status)) {
        x.kyc = { status: "pending", submitted_at: nowIso() }; store.put("clients", x);
        opsUsers(true).forEach(u => notify(u.id, `🪪 Documents to review: ${x.first_name} ${x.last_name}`, l ? l.id : null, "ops"));
      }
      if (l) { activity(l, SYSTEM, "file", { file_id: rec.id, name: rec.name, kind }); if (!(l.checklist || {}).docs_uploaded && complete) { l.checklist = l.checklist || {}; l.checklist.docs_uploaded = { at: nowIso(), by: "client" }; } saveLead(l); }
      return { id: rec.id, kind, kyc: x.kyc };
    }
    function portalGetFile(c, id) { const x = clientOf(c), f = store.get("files", id); if (!f || f.client_id !== x.id) throw new CrmError("File not found.", 404); return { name: f.name, type: f.type, data: f.data }; }
    function portalRequestAccount(c, p = {}) {
      const x = clientOf(c), cfg = portalCfg(), kind = p.kind === "demo" ? "demo" : "live";
      const t = cfg.account_types.find(a => a.id === p.type); if (!t) throw new CrmError("Choose an account type.", 422, { type: "Required" });
      if (!x.email_verified_at) throw new CrmError("Verify your email first. We sent you a link.");
      if (kind === "live" && cfg.require_kyc_for_live && (x.kyc || {}).status !== "approved") throw new CrmError("Upload your documents first. A live account is opened once they're approved.");
      const mine = store.all("accounts").filter(a => a.client_id === x.id);
      if (mine.filter(a => ["requested", "creating"].includes(a.status)).length >= 2) throw new CrmError("You already have account requests waiting. We'll open them shortly.");
      if (mine.filter(a => a.kind === kind && a.status !== "rejected").length >= (kind === "demo" ? 3 : 5)) throw new CrmError("You've reached the maximum number of " + kind + " accounts.");
      const lev = Number(p.leverage) || arr(t.leverages)[0] || 100; if (arr(t.leverages).length && !t.leverages.map(Number).includes(lev)) throw new CrmError("Choose a leverage.", 422, { leverage: "Required" });
      const cur = arr(t.currencies).includes(p.currency) ? p.currency : arr(t.currencies)[0] || "USD";
      const a = { id: newId("T"), client_id: x.id, lead_id: x.lead_id, kind, type: t.id, type_name: t.name, platform: "MT5", leverage: lev, currency: cur, status: "requested", login: "", server: "", group: "", balance: kind === "demo" && mt5Mode() !== "api" ? Number(p.demo_balance) || 10000 : 0 /* api mode: MT5 holds the balance; we never fund demo accounts */, equity: null, balance_at: null, created_at: nowIso(), opened_at: null, opened_by: null, reject_reason: "" };
      store.put("accounts", a);
      portalLog(x, `Requested a ${kind} ${t.name} account (1:${lev}, ${cur})`);
      opsUsers().forEach(u => notify(u.id, `🏦 ${kind === "live" ? "Live" : "Demo"} account to open: ${x.first_name} ${x.last_name} · ${t.name}`, x.lead_id, "ops"));
      return pubAccount(a);
    }
    function portalRevealPassword(c, accountId) {
      const x = clientOf(c), a = store.get("accounts", accountId); if (!a || a.client_id !== x.id) throw new CrmError("Account not found.", 404);
      if (!a.pw_once) throw new CrmError("The first password was already shown. Use “Forgot password” in MT5 or ask support to reset it.");
      const pw = a.pw_once; a.pw_once = null; a.pw_shown_at = nowIso(); store.put("accounts", a);
      portalLog(x, "Viewed the first MT5 password for " + a.login);
      return { login: a.login, server: a.server, password: pw };
    }
    const liveAcc = (x, id) => { const a = store.get("accounts", id); if (!a || a.client_id !== x.id) throw new CrmError("Choose an account.", 422, { account_id: "Required" }); if (a.kind !== "live" || a.status !== "open") throw new CrmError("Choose an open live account."); return a; };
    // Held against the balance while a withdrawal or transfer is open (not once MT5 has already debited it: the synced balance shows that)
    const reserved = a => { const open = store.all("payments").filter(p => p.account_id === a.id && ["withdrawal", "transfer"].includes(p.type) && OPEN_PAY.includes(p.status)); if (!open.length) return 0;
      const idx = mt5Mode() === "api" && a.mt5_seen_at ? balanceDealIndex() : null; return sum(open.filter(p => !(idx && debitSeen(p, idx))).map(p => p.amount)); };
    function newPayment(x, type, d) {
      const p = Object.assign({ id: newId("P"), reference: (type === "deposit" ? "D" : type === "withdrawal" ? "W" : "X") + "-" + rand(6).toUpperCase(), client_id: x.id, lead_id: x.lead_id, type, status: "pending", currency: "USD", created_at: nowIso(), approvals: [], completed_at: null, completed_by: null, ext_reference: "", reject_reason: "", note: "" }, d);
      store.put("payments", p); return p;
    }
    function portalDeposit(c, d = {}) {
      const x = clientOf(c), cfg = portalCfg(), a = liveAcc(x, d.account_id), m = cfg.methods.find(z => z.id === d.method && z.deposit !== false && z.enabled !== false);
      if (!m) throw new CrmError("Choose a payment method.", 422, { method: "Required" });
      const amount = money2(d.amount), t = cfg.account_types.find(z => z.id === a.type) || {};
      const first = !store.all("payments").some(p => p.account_id === a.id && p.type === "deposit" && p.status === "completed");
      const min = Math.max(Number(m.min) || 0, first ? Number(t.min_deposit) || 0 : 0);
      if (!(amount > 0)) throw new CrmError("Enter the amount.", 422, { amount: "Required" });
      if (amount < min) throw new CrmError(`The minimum ${first ? "first " : ""}deposit is $${min}.`, 422, { amount: "Minimum $" + min });
      if (m.max && amount > Number(m.max)) throw new CrmError(`The maximum for ${m.name} is $${m.max}.`, 422, { amount: "Maximum $" + m.max });
      let proof = null;
      if (d.proof && d.proof.data) {
        const data = String(d.proof.data); if (!FILE_RE.test(data) || data.length > 6.5e6) throw new CrmError("Upload the receipt as a JPG, PNG or PDF under 4 MB.");
        proof = { id: newId("F"), lead_id: x.lead_id, client_id: x.id, kind: "deposit_proof", name: clean(d.proof.name, 120) || "receipt", type: data.slice(5, data.indexOf(";")), size: Math.round(data.length * 0.75), data, created_by: "client", created_at: nowIso(), review: "n/a" };
        store.put("files", proof);
      }
      const p = newPayment(x, "deposit", { account_id: a.id, method: m.id, method_name: m.name, amount, proof_file_id: proof ? proof.id : null, note: clean(d.note, 300), first_deposit: first && !store.all("payments").some(q => q.client_id === x.id && q.type === "deposit" && q.status === "completed") });
      if (m.gateway === "cyrafa") { // card checkout needs a billing address; it's saved to the profile for next time
        const bAddr = clean((d.billing || {}).address1 || x.address, 200), bCity = clean((d.billing || {}).city || x.city, 80), bPost = clean((d.billing || {}).postcode || x.postcode, 20);
        if (!bAddr || !bCity) { store.remove("payments", p.id); if (proof) store.remove("files", proof.id); throw new CrmError("Enter your billing address and city for the card payment.", 422, { address1: bAddr ? "" : "Required", city: bCity ? "" : "Required" }); }
        if (bAddr !== x.address || bCity !== x.city || bPost !== (x.postcode || "")) { x.address = bAddr; x.city = bCity; x.postcode = bPost; store.put("clients", x); }
      }
      if (m.gateway) { // paid through a payment gateway: operations is only told once the money arrives
        p.gateway = { provider: m.gateway, wallet: m.gateway_wallet || "", status: "creating", created_at: nowIso() }; store.put("payments", p);
        portalLog(x, `Deposit ${p.reference} started: $${amount} by ${m.name} (${m.gateway})`);
        return clientPayment(p);
      }
      portalLog(x, `Deposit request ${p.reference}: $${amount} by ${m.name} to ${a.login}`);
      opsUsers().forEach(u => notify(u.id, `💵 Deposit to confirm: $${amount} · ${x.first_name} ${x.last_name} (${m.name})`, x.lead_id, "ops"));
      const l = leadOfClient(x); if (l && l.owner_id && p.first_deposit) notify(l.owner_id, `💵 ${x.first_name} sent a first deposit request: $${amount} by ${m.name}`, l.id, "win");
      return pubPayment(p);
    }

    /* ---------- payment gateways (B2BINPAY crypto, card providers): the server talks to the provider, the core keeps the state ---------- */
    const gwPay = id => { const p = store.get("payments", id); if (!p || !p.gateway) throw new CrmError("Payment not found.", 404); return p; };
    // After the provider created its invoice: address, payment page, expiry
    function gatewayAttach(id, info = {}) {
      const p = gwPay(id);
      Object.assign(p.gateway, { status: "waiting", ext_id: clean(info.ext_id, 80), address: clean(info.address, 200), network: clean(info.network, 40), currency: clean(info.currency, 20), payment_page: /^https:\/\//.test(info.payment_page || "") ? clean(info.payment_page, 1000) : "", expires_at: info.expires_at || null, target: info.target != null ? String(info.target) : String(p.amount), rate: info.rate || null, paid: "0", events: [] });
      store.put("payments", p); return clientPayment(p);
    }
    function gatewayFailed(id, reason) {
      const p = gwPay(id); p.gateway.status = "error"; p.gateway.error = clean(reason, 300);
      Object.assign(p, { status: "cancelled", reject_reason: "The payment service is unavailable. Please try again or choose another method.", completed_at: nowIso() }); store.put("payments", p); return pubPayment(p);
    }
    // Provider says something changed. state: waiting | partial | paid | expired | review ; amount = total received so far (in USD/USDT)
    function gatewayEvent(ref, ev = {}) {
      const p = store.all("payments").find(z => z.gateway && (z.id === ref || (ev.ext_id && z.gateway.ext_id === String(ev.ext_id))));
      if (!p) return { ok: false, reason: "unknown payment" };
      const g = p.gateway, x = store.get("clients", p.client_id), l = x && leadOfClient(x), paid = money2(ev.amount), prevState = g.status;
      const key = [ev.state, ev.amount, ev.txid, ev.transfer_status].join("|");
      if (arr(g.events).some(e => e.key === key)) return { ok: true, duplicate: true };              // providers retry callbacks
      g.events = arr(g.events).concat([{ key, at: nowIso(), state: ev.state, amount: paid, txid: clean(ev.txid, 140), transfer_status: ev.transfer_status, risk: ev.risk == null ? null : Number(ev.risk), note: clean(ev.note, 200) }]).slice(-30);
      if (ev.txid) g.txid = clean(ev.txid, 140); if (ev.risk != null) g.risk = Number(ev.risk); if (paid > 0) g.paid = String(paid);
      if (ev.amount_local) g.paid_local = String(ev.amount_local); if (ev.amount_after_fees) g.net_local = String(ev.amount_after_fees);
      if (["completed", "rejected"].includes(p.status)) { if (ev.state !== prevState) { g.status = ev.state === "paid" || ev.state === "partial" ? "review" : g.status; g.review = "Payment received after this request was closed: check and refund or credit by hand."; store.put("payments", p); opsUsers().forEach(u => notify(u.id, `⚠️ Late crypto payment on ${p.reference}: ${g.paid} received`, p.lead_id, "ops")); } else store.put("payments", p); return { ok: true }; }
      g.status = ev.state || g.status; g.updated_at = nowIso();
      if (ev.state === "paid" || (ev.state === "review" && paid > 0) || (ev.state === "partial" && paid > 0)) {
        if (p.status === "pending" || p.status === "cancelled") {
          if (p.status === "cancelled") { p.reject_reason = ""; p.completed_at = null; }
          p.status = ev.state === "paid" ? "paid" : "pending";
          if (ev.state !== "paid") g.review = ev.state === "partial" ? `Only ${paid} received of ${g.target}.` : clean(ev.note, 200) || "The payment service needs a decision (late, overpaid or AML check).";
          else g.review = "";
        }
        if (prevState !== ev.state) {
          if (ev.state === "paid") {
            portalLog(x, `Deposit ${p.reference}: ${paid} received${g.txid ? " (tx " + g.txid.slice(0, 12) + "…)" : ""}`);
            opsUsers().forEach(u => notify(u.id, `💰 Paid by ${p.method_name}: $${paid} · ${x ? x.first_name + " " + x.last_name : ""}. Credit MT5 and confirm`, p.lead_id, "ops"));
            if (l && l.owner_id && p.first_deposit) notify(l.owner_id, `💰 ${x.first_name} paid their first deposit: $${paid} by ${p.method_name}`, l.id, "win");
          } else opsUsers(true).forEach(u => notify(u.id, `⚠️ ${p.method_name} payment ${p.reference} needs a decision: ${g.review}`, p.lead_id, "ops"));
        }
      } else if (ev.state === "expired" && p.status === "pending" && !(Number(g.paid) > 0)) {
        Object.assign(p, { status: "cancelled", reject_reason: "No payment arrived before the payment window closed.", completed_at: nowIso() });
        portalLog(x, `Deposit ${p.reference}: payment window closed, nothing received`);
      } else if (ev.state === "failed" && p.status === "pending") {
        Object.assign(p, { status: "cancelled", reject_reason: "Card payment not completed" + (ev.note ? ": " + clean(ev.note, 160) : "") + ". You can try again.", completed_at: nowIso() });
        portalLog(x, `Deposit ${p.reference}: card payment failed${ev.note ? " (" + clean(ev.note, 160) + ")" : ""}`);
      }
      store.put("payments", p);
      return { ok: true, status: p.status, gateway: g.status };
    }
    // The client came back from the provider's page. Only a hint (redirects can be faked); the provider's notification decides.
    function portalGatewayReturn(c, id, result) {
      const x = clientOf(c), p = store.get("payments", id); if (!p || p.client_id !== x.id || !p.gateway) throw new CrmError("Payment not found.", 404);
      if (!p.gateway.returned) { p.gateway.returned = result === "success" ? "success" : "cancel"; p.gateway.returned_at = nowIso(); store.put("payments", p); }
      return clientPayment(p);
    }
    // Payments the client started but never paid: close them once the provider's window has passed.
    // A card payment whose client came back "successful" but without a notification (Cyrafa sends it once) goes to operations instead.
    function gatewayTick() {
      let n = 0; const now = nowMs();
      store.all("payments").filter(p => p.gateway && p.status === "pending" && !(Number(p.gateway.paid) > 0) && !p.gateway.review && Date.parse(p.gateway.expires_at || p.created_at) + (p.gateway.expires_at ? (p.gateway.provider === "cyrafa" ? 30 * 60e3 : 3600e3) : 48 * 3600e3) < now)
        .forEach(p => {
          if (p.gateway.provider === "cyrafa" && p.gateway.returned === "success") {
            p.gateway.status = "review"; p.gateway.review = "The client came back from a successful card payment but Cyrafa didn't notify us. Check the Cyrafa dashboard, then confirm or reject.";
            store.put("payments", p); opsUsers().forEach(u => notify(u.id, `⚠️ Card payment ${p.reference} needs checking in the Cyrafa dashboard`, p.lead_id, "ops")); return;
          }
          Object.assign(p, { status: "cancelled", reject_reason: p.gateway.provider === "cyrafa" ? "The card payment wasn't completed." : "No payment arrived before the payment window closed.", completed_at: nowIso() }); p.gateway.status = "expired"; store.put("payments", p); n++;
        });
      return n;
    }
    const gatewayPayments = () => store.all("payments").filter(p => p.gateway && ["pending", "paid"].includes(p.status) && p.gateway.ext_id).map(p => ({ id: p.id, ext_id: p.gateway.ext_id, provider: p.gateway.provider }));
    function portalWithdraw(c, d = {}) {
      const x = clientOf(c), cfg = portalCfg(), a = liveAcc(x, d.account_id), m = cfg.methods.find(z => z.id === d.method && z.withdraw !== false && z.enabled !== false);
      if ((x.kyc || {}).status !== "approved") throw new CrmError("Your documents must be approved before you can withdraw.");
      if (!m) throw new CrmError("Choose how you want to be paid.", 422, { method: "Required" });
      const amount = money2(d.amount); if (!(amount > 0)) throw new CrmError("Enter the amount.", 422, { amount: "Required" });
      if (a.balance_at && amount > money2((Number(a.balance) || 0) - reserved(a))) throw new CrmError(`The available balance on ${a.login} is $${money2((Number(a.balance) || 0) - reserved(a))}. Close open trades or lower the amount.`, 422, { amount: "Too high" });
      const details = clean(d.details, 400); if (!details) throw new CrmError("Enter where we should send the money.", 422, { details: "Required" });
      const p = newPayment(x, "withdrawal", { account_id: a.id, method: m.id, method_name: m.name, amount, payout_details: details, note: clean(d.note, 300) });
      portalLog(x, `Withdrawal request ${p.reference}: $${amount} from ${a.login} by ${m.name}`);
      opsUsers().forEach(u => notify(u.id, `💸 Withdrawal to check: $${amount} · ${x.first_name} ${x.last_name}`, x.lead_id, "ops"));
      return pubPayment(p);
    }
    function portalTransfer(c, d = {}) {
      const x = clientOf(c), a = liveAcc(x, d.account_id), b = liveAcc(x, d.to_account_id);
      if (a.id === b.id) throw new CrmError("Choose two different accounts.");
      const amount = money2(d.amount); if (!(amount > 0)) throw new CrmError("Enter the amount.", 422, { amount: "Required" });
      if (a.balance_at && amount > money2((Number(a.balance) || 0) - reserved(a))) throw new CrmError(`The available balance on ${a.login} is $${money2((Number(a.balance) || 0) - reserved(a))}.`, 422, { amount: "Too high" });
      const p = newPayment(x, "transfer", { account_id: a.id, to_account_id: b.id, amount });
      portalLog(x, `Transfer request ${p.reference}: $${amount} from ${a.login} to ${b.login}`);
      opsUsers().forEach(u => notify(u.id, `🔁 Transfer to do: $${amount} · ${x.first_name} ${x.last_name}`, x.lead_id, "ops"));
      return pubPayment(p);
    }
    function portalCancel(c, id) {
      const x = clientOf(c), p = store.get("payments", id); if (!p || p.client_id !== x.id) throw new CrmError("Not found.", 404);
      if (p.status !== "pending" || arr(p.approvals).length || (p.gateway && Number(p.gateway.paid) > 0)) throw new CrmError("This request is already being processed. Contact support to stop it.");
      p.status = "cancelled"; p.cancelled_by = "client"; p.completed_at = nowIso(); store.put("payments", p); portalLog(x, `Cancelled request ${p.reference}`);
      return pubPayment(p);
    }
    // Top of the deposit funnel: the client opened the deposit page (counted once per 30 minutes, last 60 kept)
    function portalTrack(c, ev) {
      const x = clientOf(c); if (ev !== "deposit_view") return { ok: true };
      const v = arr(x.deposit_views), last = v[v.length - 1];
      if (!last || nowMs() - Date.parse(last) > 30 * 60e3) { x.deposit_views = v.concat([nowIso()]).slice(-60); store.put("clients", x); }
      return { ok: true };
    }
    function portalHistory(c, f = {}) {
      const x = clientOf(c); let rows = store.all("payments").filter(p => p.client_id === x.id);
      if (f.type) rows = rows.filter(p => p.type === f.type); if (f.account_id) rows = rows.filter(p => p.account_id === f.account_id || p.to_account_id === f.account_id);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300).map(clientPayment);
    }

    /* ---------- operations back office ---------- */
    const ibTag = id => { const pt = id && store.get("partners", id); return pt ? { id: pt.id, code: pt.code || "(applied)" } : null; };
    const clientRow = x => { const l = leadOfClient(x), accs = store.all("accounts").filter(a => a.client_id === x.id); return Object.assign(pubClient(x), { name: x.first_name + " " + x.last_name, owner_name: l ? userName(l.owner_id) : "", stage: l ? l.stage : "", reference: l ? l.reference : "", accounts_open: accs.filter(a => a.status === "open" && a.kind === "live").length, balance: sum(accs.filter(a => a.status === "open" && a.kind === "live").map(a => Number(a.balance) || 0)), deposits: sum(store.all("payments").filter(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed").map(p => p.amount)), ib: ibTag(x.partner_id), is_partner: (partnerOfClient(x.id) || {}).code || "" }); };
    const canSeeClient = (u, x) => { if (isKyc(u)) return true; if (u.role === "partnerships" && (x.partner_id || partnerOfClient(x.id))) return true; const l = leadOfClient(x); return !!(l && canSee(u, l)); };
    function listClients(u, f = {}) {
      need(u, x => isKyc(x) || isSales(x));
      let rows = store.all("clients").filter(x => canSeeClient(u, x));
      const q = lc(f.q); if (q) rows = rows.filter(x => (x.first_name + " " + x.last_name + " " + x.email + " " + x.phone).toLowerCase().includes(q) || store.all("accounts").some(a => a.client_id === x.id && a.login === q));
      if (f.kyc) rows = rows.filter(x => (x.kyc || {}).status === f.kyc);
      if (f.funded === "yes") rows = rows.filter(x => store.all("payments").some(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed"));
      if (f.funded === "no") rows = rows.filter(x => !store.all("payments").some(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed"));
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500).map(clientRow);
    }
    function getClient(u, id) {
      const x = store.get("clients", id); if (!x || !canSeeClient(u, x)) throw new CrmError("Client not found.", 404);
      return { client: clientRow(x), logins: isKyc(u) ? arr(x.logins).slice().reverse() : [], accounts: store.all("accounts").filter(a => a.client_id === x.id).map(pubAccount), payments: store.all("payments").filter(p => p.client_id === x.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(pubPayment),
        docs: store.all("files").filter(f => f.client_id === x.id).map(f => ({ id: f.id, kind: f.kind, name: f.name, type: f.type, size: f.size, created_at: f.created_at, review: f.review || "" })), kyc_kinds: KYC_KINDS, can_ops: isOps(u), can_kyc: isKyc(u) };
    }
    function getClientFile(u, id) { need(u, isKyc); const f = store.get("files", id); if (!f || !f.client_id) throw new CrmError("File not found.", 404); return Object.assign({}, f); }
    function setClientStatus(u, id, status, reason) {
      need(u, isOps, "Only operations can block or unblock clients.");
      const x = store.get("clients", id); if (!x) throw new CrmError("Client not found.", 404);
      if (!["active", "blocked"].includes(status)) throw new CrmError("Unknown status.");
      x.status = status; x.session_ver = (x.session_ver || 0) + 1; if (status === "active") { x.locked_until = null; x.failed_logins = 0; }
      store.put("clients", x); portalLog(x, status === "blocked" ? "Client area blocked: " + clean(reason, 200) : "Client area unblocked", { by: u });
      return clientRow(x);
    }
    function listKyc(u, f = {}) {
      need(u, isKyc);
      const st = f.status || "pending";
      return store.all("clients").filter(x => ((x.kyc || {}).status || "none") === st).sort((a, b) => String((a.kyc || {}).submitted_at || a.created_at).localeCompare(String((b.kyc || {}).submitted_at || b.created_at))).slice(0, 300)
        .map(x => Object.assign(clientRow(x), { docs: store.all("files").filter(z => z.client_id === x.id && z.kind.startsWith("kyc")).map(z => ({ id: z.id, kind: z.kind, name: z.name, type: z.type, review: z.review })), waiting_h: (x.kyc || {}).submitted_at ? Math.round((nowMs() - Date.parse(x.kyc.submitted_at)) / 36e5 * 10) / 10 : null }));
    }
    function decideKyc(u, id, decision, reason) {
      need(u, isKyc, "Only compliance or operations can review documents.");
      const x = store.get("clients", id); if (!x) throw new CrmError("Client not found.", 404);
      if (!["approved", "rejected", "resubmit"].includes(decision)) throw new CrmError("Unknown decision.");
      const why = clean(reason, 300); if (decision !== "approved" && !why) throw new CrmError("Tell the client what's wrong.", 422, { reason: "Required" });
      x.kyc = Object.assign({}, x.kyc, { status: decision, decided_at: nowIso(), decided_by: u.id, reason: why }); store.put("clients", x);
      store.all("files").filter(f => f.client_id === x.id && f.kind.startsWith("kyc") && f.review === "pending").forEach(f => { f.review = decision === "approved" ? "approved" : "rejected"; store.put("files", f); });
      const l = leadOfClient(x);
      if (l) {
        activity(l, u, "portal", { label: decision === "approved" ? "KYC approved" : "KYC " + (decision === "rejected" ? "rejected" : "needs new documents") + ": " + why });
        if (decision === "approved") { l.checklist = l.checklist || {}; l.checklist.kyc_approved = { at: nowIso(), by: u.id }; l.checklist.docs_uploaded = l.checklist.docs_uploaded || { at: nowIso(), by: "client" }; }
        let from = false; if (decision === "approved" && OPEN.has(l.stage) && STAGE_IDX[l.stage] < STAGE_IDX.kyc) from = setStage(l, Object.assign({}, u, { role: "system" }), "kyc", {});
        saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: "kyc" });
        fire(decision === "approved" ? "kyc_approved" : "kyc_rejected", l);
        if (l.owner_id) notify(l.owner_id, decision === "approved" ? `✅ KYC approved for ${x.first_name} ${x.last_name}. Time for the first deposit` : `KYC ${decision} for ${x.first_name}: ${why}`, l.id, decision === "approved" ? "win" : "warn");
      }
      clientMail(x, decision === "approved" ? "tpl_portal_kyc_ok" : "tpl_portal_kyc_fix", { reason: why });
      return clientRow(x);
    }
    function listAccountRequests(u, f = {}) {
      need(u, x => isOps(x) || isKyc(x));
      let rows = store.all("accounts"); if (f.status) rows = rows.filter(a => a.status === f.status || (f.status === "requested" && a.status === "creating")); if (f.kind) rows = rows.filter(a => a.kind === f.kind);
      if (f.q) { const q = lc(f.q); rows = rows.filter(a => a.login.includes(q) || (() => { const x = store.get("clients", a.client_id); return x && (x.first_name + " " + x.last_name + " " + x.email).toLowerCase().includes(q); })()); }
      return rows.sort((a, b) => (f.status === "requested" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))).slice(0, 500).map(a => { const x = store.get("clients", a.client_id); return Object.assign(pubAccount(a), { client: x ? { id: x.id, name: x.first_name + " " + x.last_name, email: x.email, country: x.country, kyc: (x.kyc || {}).status || "none" } : null, opened_by_name: a.opened_by ? userName(a.opened_by) : "", waiting_h: a.status === "requested" ? Math.round((nowMs() - Date.parse(a.created_at)) / 36e5 * 10) / 10 : null }); });
    }
    function openAccount(u, id, d = {}) {
      need(u, isOps, "Only operations can open accounts.");
      const a = store.get("accounts", id); if (!a) throw new CrmError("Account not found.", 404);
      if (a.status !== "requested") throw new CrmError("This request was already handled.");
      const login = digits(d.login).slice(0, 12); if (login.length < 4) throw new CrmError("Enter the MT5 login.", 422, { login: "Required" });
      if (store.all("accounts").some(z => z.login === login && z.id !== a.id && z.status !== "rejected")) throw new CrmError("That login is already linked to another account.", 422, { login: "Already used" });
      const pw = String(d.password || "").slice(0, 60);
      Object.assign(a, { status: "open", login, server: clean(d.server, 60) || portalCfg().default_server, group: clean(d.group, 80), leverage: Number(d.leverage) || a.leverage, opened_at: nowIso(), opened_by: u.id, pw_once: pw || null, pw_set_at: pw ? nowIso() : null });
      store.put("accounts", a);
      return accountOpened(u, a, { mail: true });
    }
    // After an account is open (recorded by hand, created in MT5, or linked from MT5): lead stage, demo record, owner told, client emailed
    function accountOpened(u, a, o = {}) {
      const login = a.login, x = store.get("clients", a.client_id), l = leadOfClient(x);
      if (l) {
        if (a.kind === "live") {
          l.checklist = l.checklist || {}; if (!l.account_id) l.account_id = login; l.checklist.account_opened = l.checklist.account_opened || { at: nowIso(), by: u.id, value: login };
          let from = false; if (OPEN.has(l.stage) && STAGE_IDX[l.stage] < STAGE_IDX.registered) from = setStage(l, Object.assign({}, u, { role: "system" }), "registered", { account_id: login });
          activity(l, u, "portal", { label: `Live ${a.type_name} account opened: ${login}` }); saveLead(l); if (from !== false) fire("stage_changed", l, { from, to: "registered" });
        } else {
          l.demo = Object.assign({}, l.demo); if (!l.demo.given_at) { Object.assign(l.demo, { login, server: a.server, platform: "MT5", given_at: nowIso(), given_by: u.id }); l.reached = l.reached || {}; l.reached.demo = l.reached.demo || nowIso(); }
          activity(l, u, "demo", { action: "give", label: "Demo account opened from the client area", login }); saveLead(l); fire("demo_given", l);
        }
        if (l.owner_id) notify(l.owner_id, `${a.kind === "live" ? "🏦 Live" : "Demo"} account ${login} opened for ${x.first_name} ${x.last_name}`, l.id, "portal");
      }
      if (o.mail) clientMail(x, "tpl_portal_account", { login, server: a.server, account_type: a.type_name + (a.kind === "demo" ? " (demo)" : "") });
      return pubAccount(a);
    }
    function rejectAccount(u, id, reason) {
      need(u, isOps); const a = store.get("accounts", id); if (!a || a.status !== "requested") throw new CrmError("Nothing to reject.");
      const why = clean(reason, 300); if (!why) throw new CrmError("Tell the client why.", 422, { reason: "Required" });
      a.status = "rejected"; a.reject_reason = why; a.opened_by = u.id; a.opened_at = nowIso(); store.put("accounts", a);
      const x = store.get("clients", a.client_id); portalLog(x, "Account request declined: " + why, { by: u }); clientMail(x, "tpl_portal_declined", { reason: why, reference: a.type_name + " account" });
      return pubAccount(a);
    }
    function setAccountPassword(u, id, password) {
      need(u, isOps); const a = store.get("accounts", id); if (!a || a.status !== "open") throw new CrmError("Account not found.", 404);
      a.pw_once = String(password || "").slice(0, 60) || null; a.pw_set_at = nowIso(); store.put("accounts", a);
      const x = store.get("clients", a.client_id); portalLog(x, "New MT5 password ready for " + a.login + " (shown once in the client area)", { by: u });
      return pubAccount(a);
    }
    function updateAccount(u, id, d = {}) {
      need(u, isOps); const a = store.get("accounts", id); if (!a) throw new CrmError("Account not found.", 404);
      if (d.balance !== undefined) { a.balance = money2(d.balance); a.balance_at = nowIso(); }
      if (d.equity !== undefined) a.equity = money2(d.equity);
      if (d.leverage && Number(d.leverage) !== Number(a.leverage)) { const before = a.leverage; a.leverage = Number(d.leverage) || a.leverage; portalLog(store.get("clients", a.client_id), `Leverage on ${a.login} changed from 1:${before} to 1:${a.leverage} (recorded by operations)`, { by: u }); }
      if (d.group !== undefined) a.group = clean(d.group, 80);
      if (d.status === "closed" || d.status === "open") a.status = d.status;
      store.put("accounts", a); return pubAccount(a);
    }
    function listPayments(u, f = {}) {
      need(u, x => isOps(x) || isMgr(x));
      let rows = store.all("payments");
      if (f.type) rows = rows.filter(p => p.type === f.type);
      if (f.status === "open") rows = rows.filter(p => OPEN_PAY.includes(p.status)); else if (f.status) rows = rows.filter(p => p.status === f.status);
      if (f.client_id) rows = rows.filter(p => p.client_id === f.client_id);
      const lim = Number(settings().portal && settings().portal.second_approval_over) || portalCfg().second_approval_over;
      const idx = mt5Mode() === "api" ? balanceDealIndex() : null;
      return rows.sort((a, b) => (OPEN_PAY.includes(f.status) || f.status === "open" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))).slice(0, 500).map(p => {
        const x = store.get("clients", p.client_id), a = store.get("accounts", p.account_id);
        return Object.assign(pubPayment(p), { client: x ? { id: x.id, name: x.first_name + " " + x.last_name, email: x.email, kyc: (x.kyc || {}).status } : null, balance: a ? a.balance : null, balance_at: a ? a.balance_at : null,
          margin_free: a && a.margin_free != null ? a.margin_free : null, equity: a && a.equity != null ? a.equity : null, positions_open: a ? a.positions_open || 0 : 0, mt5_seen_at: a ? a.mt5_seen_at || null : null, // live from the MT5 sync (informational)
          needs_two: p.type === "withdrawal" && p.amount > lim, approvals_named: arr(p.approvals).map(z => ({ name: userName(z.by), at: z.at })), completed_by_name: p.completed_by ? userName(p.completed_by) : "",
          mt5_match: idx && OPEN_PAY.includes(p.status) ? payMatch(p, idx) : null, mt5_done: p.mt5 ? Object.assign({}, p.mt5, { by_name: userName(p.mt5.by) }) : null, waiting_h: OPEN_PAY.includes(p.status) ? Math.round((nowMs() - Date.parse(p.created_at)) / 36e5 * 10) / 10 : null });
      });
    }
    // Deposits: complete or reject. Withdrawals: approve (twice above the limit, by two people) → complete with the payment reference.
    function decidePayment(u, id, action, d = {}) {
      need(u, isOps, "Only operations can process client money.");
      const p = store.get("payments", id); if (!p) throw new CrmError("Request not found.", 404);
      if (!OPEN_PAY.includes(p.status)) throw new CrmError("This request was already " + p.status + ".");
      const x = store.get("clients", p.client_id), a = store.get("accounts", p.account_id), lim = portalCfg().second_approval_over;
      if (action === "reject") {
        const why = clean(d.reason, 300); if (!why) throw new CrmError("Tell the client why.", 422, { reason: "Required" });
        const m = payMatch(p); // money already moved in MT5 Manager for a request we now reject: operations must undo it there
        Object.assign(p, { status: "rejected", reject_reason: why, completed_at: nowIso(), completed_by: u.id }); store.put("payments", p); ibPayoutClosed(p, u);
        portalLog(x, `${cap(p.type)} ${p.reference} rejected: ${why}`, { by: u }); clientMail(x, "tpl_portal_declined", { reason: why, reference: `${p.type} ${p.reference} ($${p.amount})` });
        if (m && m.seen) opsUsers().forEach(z => notify(z.id, `⚠️ ${p.reference} was rejected, but MT5 already has ${m.legs.filter(l => l.deals.length).map(l => l.comment + " (deal #" + l.deals.map(d => d.ticket).join(", #") + ")").join(" and ")}. Reverse it in MT5 Manager`, p.lead_id, "ops"));
        return pubPayment(p);
      }
      if (action === "approve") {
        if (p.type !== "withdrawal" && p.type !== "ib_payout") throw new CrmError("Only withdrawals and partner payouts need approval. Use Complete.");
        if (arr(p.approvals).some(z => z.by === u.id)) throw new CrmError("You already approved this. A second person must approve it.");
        p.approvals = arr(p.approvals).concat([{ by: u.id, at: nowIso() }]);
        p.status = p.amount > lim && p.approvals.length < 2 ? "first_approved" : "approved"; store.put("payments", p);
        portalLog(x, `${p.type === "ib_payout" ? "Partner payout" : "Withdrawal"} ${p.reference} ${p.status === "approved" ? "approved" : "approved once (needs a second approval)"}`, { by: u });
        if (p.type === "ib_payout") { const pt = store.get("partners", (p.ib || {}).partner_id); if (pt) { ibAudit(pt, u, "payout_approved", null, { payment: p.reference, status: p.status }, ""); store.put("partners", pt); } }
        if (p.status === "first_approved") opsUsers().filter(z => z.id !== u.id).forEach(z => notify(z.id, `✍️ Second approval needed: ${p.type === "ib_payout" ? "partner payout" : "withdrawal"} $${p.amount} · ${x.first_name} ${x.last_name}`, x.lead_id, "ops"));
        return pubPayment(p);
      }
      if (action !== "complete") throw new CrmError("Unknown action.");
      if (["withdrawal", "ib_payout"].includes(p.type) && p.status !== "approved") throw new CrmError(p.amount > lim ? "Withdrawals over $" + lim + " need two approvals first." : "Approve the withdrawal first.");
      // api mode: the money was moved by hand in MT5 Manager; confirm the matched MT5 deal, or say why there is none (logged)
      const mt = mt5Confirm(u, p, d);
      const pays = ["withdrawal", "ib_payout"].includes(p.type) && !(p.type === "ib_payout" && p.method === "mt5"); // the client is paid outside MT5 (bank or USDT)
      const amt = mt && mt.matched && p.type !== "transfer" ? mt.amount : ["withdrawal", "ib_payout"].includes(p.type) ? p.amount : d.amount !== undefined && d.amount !== "" ? money2(d.amount) : p.gateway && Number(p.gateway.paid) > 0 ? money2(p.gateway.paid) : p.amount; if (!(amt > 0)) throw new CrmError("Enter the amount.", 422, { amount: "Required" });
      const deal = mt && mt.matched ? "MT5 deal" + (mt.tickets.length > 1 ? "s #" : " #") + mt.tickets.join(" / #") : "";
      const given = clean(d.reference, 120) || (p.gateway ? clean(p.gateway.txid || p.gateway.ext_id, 120) : "");
      const ref = pays ? given : [deal, given].filter(Boolean).join(" · ");
      if (p.type !== "transfer" && !ref) throw new CrmError(pays ? "Enter the payout reference (bank or USDT transaction)." : "Enter the payment or back-office reference.", 422, { reference: "Required" });
      if (p.type !== "transfer" && !(mt && mt.matched)) p.manual = { by: u.id, at: nowIso() }; // recorded by hand (done in MT5 Manager)
      if (mt) p.mt5 = mt.record;
      const l = leadOfClient(x);
      if (l && mt) { activity(l, u, "portal", { label: mt.matched ? `${cap(p.type === "ib_payout" ? "partner payout" : p.type)} ${p.reference} confirmed: seen in MT5 (${deal})` : `${cap(p.type === "ib_payout" ? "partner payout" : p.type)} ${p.reference} confirmed without an MT5 match: ${mt.reason}` }); saveLead(l); }
      return completePayment(u, p, amt, ref, clean(d.note, 300));
    }
    // The money is where it should be: close the request, move the shown balance (unless MT5 already did), FTD, emails
    function completePayment(u, p, amt, ref, note) {
      const x = store.get("clients", p.client_id), a = store.get("accounts", p.account_id);
      Object.assign(p, { status: "completed", amount_requested: p.amount_requested || p.amount, amount: amt, ext_reference: ref, completed_at: nowIso(), completed_by: u.id, note: note || p.note });
      store.put("payments", p);
      // the shown balance moves here, except on accounts the MT5 sync reads (their balance comes from MT5, which already has it)
      const adj = (acc, delta) => { if (acc && acc.kind === "live" && !(mt5Mode() === "api" && acc.mt5_seen_at)) { acc.balance = money2((Number(acc.balance) || 0) + delta); acc.balance_at = acc.balance_at || nowIso(); store.put("accounts", acc); } };
      if (p.type === "deposit") adj(a, amt); else if (p.type === "withdrawal") adj(a, -amt); else if (p.type === "transfer") { adj(a, -amt); adj(store.get("accounts", p.to_account_id), amt); }
      const l = leadOfClient(x);
      if (p.type === "deposit" && l) {
        activity(l, u, "portal", { label: `Deposit ${p.reference} received: $${amt} by ${p.method_name}` });
        if (l.stage !== "funded") { // first deposit of the client's own money → verified FTD
          let dep = store.all("deposits").find(z => z.lead_id === l.id && z.status === "pending");
          if (!dep) dep = makeDeposit(l, u, { amount: amt, method: p.method_name, tx_ref: ref || p.reference, account_id: a ? a.login : "", note: "Client area deposit " + p.reference });
          Object.assign(dep, { amount: amt, method: dep.method || p.method_name, tx_ref: dep.tx_ref || ref, proof_file_id: dep.proof_file_id || p.proof_file_id || null });
          applyVerifiedDeposit(l, dep, u);
        } else saveLead(l);
        fire("deposit_received", l, { amount: amt });
      } else if (l) { activity(l, u, "portal", { label: `${cap(p.type)} ${p.reference} done: $${amt}` }); saveLead(l); }
      ibPayoutClosed(p, u);
      clientMail(x, p.type === "deposit" ? "tpl_portal_deposit" : p.type === "withdrawal" ? "tpl_portal_withdrawal" : p.type === "ib_payout" ? "tpl_ib_payout" : "tpl_portal_transfer", { amount: "$" + amt.toLocaleString(), account: a ? a.login : "", reference: p.reference, method: p.method_name || "" });
      return pubPayment(p);
    }
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    // Daily balance file exported from the broker back office: login, balance, equity
    function importBalances(u, rows) {
      need(u, isOps, "Only operations can import balances.");
      const res = { updated: 0, unknown: [], changed: [] }, at = nowIso();
      arr(rows).slice(0, 20000).forEach(r => {
        const login = digits(r.login || r.Login || r.account || r.Account); if (!login) return;
        const a = store.all("accounts").find(z => z.login === login && z.status !== "rejected");
        if (!a) { // accounts opened by sales before the client area: matched by the trading account on the lead
          const l = store.all("leads").find(z => z.account_id === login);
          if (!l) { res.unknown.push(login); return; }
          const prev = l.trading || {}, lots = r.lots ?? r.Lots ?? r.volume ?? r.Volume, lastT = r.last_trade ?? r.LastTrade ?? r["last trade"], eq = r.equity ?? r.Equity, bal = money2(r.balance ?? r.Balance);
          const t = { balance: bal, equity: eq !== undefined && eq !== "" ? money2(eq) : null, lots: lots !== undefined && lots !== "" && !isNaN(Number(lots)) ? Number(lots) : prev.lots || 0, last_trade_at: lastT && !isNaN(Date.parse(lastT)) ? new Date(Date.parse(lastT)).toISOString() : prev.last_trade_at || null, at };
          if (t.lots > (prev.lots || 0) && !lastT) t.last_trade_at = at;
          if (!t.last_trade_at && t.equity != null && Math.abs(t.equity - bal) >= 0.01) t.last_trade_at = at;
          l.trading = t; if (t.last_trade_at) { l.reached = l.reached || {}; if (!l.reached.trading) { l.reached.trading = t.last_trade_at; activity(l, u, "portal", { label: `Trading started on ${login}` }); } res.trading = (res.trading || 0) + 1; }
          saveLead(l); res.updated++; res.leads = (res.leads || 0) + 1; return;
        }
        const bal = money2(r.balance ?? r.Balance), eq = r.equity ?? r.Equity, lots = r.lots ?? r.Lots ?? r.volume ?? r.Volume, lastT = r.last_trade ?? r.LastTrade ?? r["last trade"];
        if (a.balance_at && Math.abs((Number(a.balance) || 0) - bal) >= 0.01) res.changed.push({ login, before: Number(a.balance) || 0, after: bal });
        a.balance = bal; if (eq !== undefined && eq !== "") a.equity = money2(eq); a.balance_at = at;
        // Trading activity: more lots than last time, a last-trade date, or open positions (equity differs from balance)
        let traded = null;
        if (lots !== undefined && lots !== "" && !isNaN(Number(lots))) { const n = Math.round(Number(lots) * 100) / 100; if (n > (Number(a.lots_total) || 0)) traded = at; a.lots_total = n; }
        if (lastT && !isNaN(Date.parse(lastT))) traded = new Date(Date.parse(lastT)).toISOString();
        if (!traded && a.equity != null && Math.abs(a.equity - bal) >= 0.01 && eq !== undefined && eq !== "") traded = at;
        store.put("accounts", a); res.updated++;
        if (traded) { recordTrading(a, traded, u); res.trading = (res.trading || 0) + 1; }
      });
      const s = settings(); s.portal = Object.assign({}, s.portal, { last_balance_import: at }); store.put("settings", s);
      res.changed = res.changed.slice(0, 200); res.unknown = res.unknown.slice(0, 200);
      return res;
    }
    function opsOverview(u) {
      need(u, x => isKyc(x) || isMgr(x));
      const pays = store.all("payments"), open = OPEN_PAY, today = localDay(nowIso()), month = today.slice(0, 7);
      const oldest = list => list.length ? Math.round((nowMs() - Math.min(...list.map(z => Date.parse(z.created_at || z.submitted_at)))) / 36e5 * 10) / 10 : null;
      const done = pays.filter(p => p.status === "completed");
      const sumBy = (type, pred) => sum(done.filter(p => p.type === type && pred(localDay(p.completed_at))).map(p => p.amount));
      const kycWait = store.all("clients").filter(x => (x.kyc || {}).status === "pending");
      const accWait = store.all("accounts").filter(a => ["requested", "creating"].includes(a.status));
      const q = t => pays.filter(p => p.type === t && open.includes(p.status));
      return {
        queues: { kyc: kycWait.length, kyc_oldest_h: oldest(kycWait.map(x => ({ created_at: x.kyc.submitted_at }))), accounts: accWait.length, accounts_oldest_h: oldest(accWait), deposits: q("deposit").length, deposits_oldest_h: oldest(q("deposit")), withdrawals: q("withdrawal").length, withdrawals_oldest_h: oldest(q("withdrawal")), transfers: q("transfer").length, second_approval: pays.filter(p => p.status === "first_approved").length },
        money: { dep_today: sumBy("deposit", d => d === today), wd_today: sumBy("withdrawal", d => d === today), dep_month: sumBy("deposit", d => d.slice(0, 7) === month), wd_month: sumBy("withdrawal", d => d.slice(0, 7) === month), pending_wd: sum(q("withdrawal").map(p => p.amount)) },
        clients: { total: store.size("clients"), today: store.all("clients").filter(x => localDay(x.created_at) === today).length, verified: store.all("clients").filter(x => (x.kyc || {}).status === "approved").length, funded: new Set(done.filter(p => p.type === "deposit").map(p => p.client_id)).size },
        accounts: { live: store.all("accounts").filter(a => a.kind === "live" && a.status === "open").length, demo: store.all("accounts").filter(a => a.kind === "demo" && a.status === "open").length },
        last_balance_import: (settings().portal || {}).last_balance_import || null,
        mt5: (() => { const st = mt5State(), api = mt5Mode() === "api", idx = api ? balanceDealIndex() : null, ms = api ? pays.filter(p => OPEN_PAY.includes(p.status)).map(p => ({ p, m: payMatch(p, idx) })).filter(z => z.m) : [];
          return { mode: mt5Mode(), account_creation: mt5Accounts(), last_ok_at: st.last_ok_at, last_error: st.last_error, failing_since: st.failing_since, unlinked: store.all("mt5_unlinked").filter(x => x.status === "open").length,
            accounts_failed: store.all("accounts").filter(a => a.status === "requested" && a.mt5_error).length,
            // operations moved the money in MT5 Manager: what's seen and waiting for a click, what's wrong, what's late
            seen: ms.filter(z => z.m.ok).length, mismatch: ms.filter(z => z.m.seen && !z.m.ok).length, late: ms.filter(z => z.m.late).length, unknown_refs: api ? mt5UnknownRefs(7).length : 0 }; })(),
      };
    }
    // Lead page: what the client has done in the client area
    function portalSummaryForLead(l) {
      const x = l.client_id ? store.get("clients", l.client_id) : store.all("clients").find(y => y.lead_id === l.id);
      if (!x) return null;
      const accs = store.all("accounts").filter(a => a.client_id === x.id), pays = store.all("payments").filter(p => p.client_id === x.id);
      return { client_id: x.id, email_verified: !!x.email_verified_at, kyc: (x.kyc || {}).status || "none", kyc_reason: (x.kyc || {}).reason || "", created_at: x.created_at, last_login_at: x.last_login_at || null,
        accounts: accs.map(a => ({ kind: a.kind, type_name: a.type_name, login: a.login, status: a.status, balance: a.balance, balance_at: a.balance_at })),
        open_requests: pays.filter(p => OPEN_PAY.includes(p.status)).map(p => ({ type: p.type, amount: p.amount, status: p.status, created_at: p.created_at })),
        deposited: sum(pays.filter(p => p.type === "deposit" && p.status === "completed").map(p => p.amount)), withdrawn: sum(pays.filter(p => p.type === "withdrawal" && p.status === "completed").map(p => p.amount)) };
    }

    /* =====================================================================
       CLIENT LIFECYCLE: one view of every person from first contact to active trader.
       The lead is the master record; the client-area account, trading accounts and money link to it.
       ===================================================================== */
    const LIFECYCLE = [
      { id: "lead_new", label: "New lead", group: "lead" }, { id: "lead_working", label: "Lead in progress", group: "lead" },
      { id: "registered", label: "Registered, onboarding incomplete", group: "onboarding" }, { id: "kyc_pending", label: "KYC under review", group: "onboarding" },
      { id: "kyc_rejected", label: "KYC needs attention", group: "onboarding" }, { id: "verified", label: "Verified, no account", group: "onboarding" },
      { id: "account_open", label: "Account open, not funded", group: "conversion" }, { id: "funded", label: "Funded, not trading", group: "client" },
      { id: "trading", label: "Active trader", group: "client" }, { id: "dormant", label: "Dormant client", group: "client" }, { id: "closed", label: "Lost / invalid", group: "closed" },
    ];
    const LC = Object.fromEntries(LIFECYCLE.map(x => [x.id, x]));
    const DORMANT_DAYS = () => Number((settings().lifecycle || {}).dormant_days) || 30;
    // While a list, report or tick runs, accounts and payments are indexed once instead of scanned per lead
    let FX = null;
    function withFacts(fn) { if (FX) return fn(); const by = (col, key) => { const m = new Map(); store.all(col).forEach(o => { const k = o[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(o); }); return m; }; FX = { acc: by("accounts", "client_id"), pay: by("payments", "client_id") }; try { return fn(); } finally { FX = null; } }
    function clientFacts(l) {
      const x = l.client_id ? store.get("clients", l.client_id) : null;
      const accs = x ? (FX ? FX.acc.get(x.id) || [] : store.all("accounts").filter(a => a.client_id === x.id)) : [], live = accs.filter(a => a.kind === "live");
      const deps = x ? (FX ? FX.pay.get(x.id) || [] : store.all("payments").filter(p => p.client_id === x.id)).filter(p => p.type === "deposit" && p.status === "completed") : [];
      const lastDep = deps.map(p => p.completed_at).sort().pop() || l.funded_at || null;
      const lastTrade = live.map(a => a.last_trade_at).filter(Boolean).sort().pop() || (l.trading && l.trading.last_trade_at) || null;
      const tradingStarted = (x && x.trading_started_at) || live.map(a => a.trading_started_at).filter(Boolean).sort()[0] || (l.reached && l.reached.trading) || null;
      return { x, accs, live, deps, lastDep, lastTrade, tradingStarted, funded: l.stage === "funded" || deps.length > 0 };
    }
    function lifecycleOf(l, facts) {
      const f = facts || clientFacts(l), x = f.x, k = x ? (x.kyc || {}).status || "none" : "none", now = nowMs();
      if (f.funded) {
        const last = [f.lastTrade, f.lastDep].filter(Boolean).sort().pop();
        if (!f.tradingStarted) return "funded";
        return last && now - Date.parse(last) > DORMANT_DAYS() * 864e5 ? "dormant" : "trading";
      }
      if (l.stage === "lost" || l.stage === "invalid") return x ? (k === "approved" ? "verified" : "registered") : "closed";
      if (f.live.some(a => a.status === "open")) return "account_open";
      if (x) { if (k === "approved") return "verified"; if (k === "pending") return "kyc_pending"; if (k === "rejected" || k === "resubmit") return "kyc_rejected"; return "registered"; }
      if (l.stage === "kyc") return "verified";
      if (l.stage === "registered") return "account_open";
      return l.stage === "new" || l.stage === "attempting" ? (l.connected_calls ? "lead_working" : "lead_new") : "lead_working";
    }
    // Work lists: the people who need someone to act now
    const SEGMENTS = [
      { id: "uncontacted", label: "Not reached yet", hint: "Open leads nobody has spoken to" },
      { id: "incomplete", label: "Registration incomplete", hint: "Signed up in the client area but email or documents missing" },
      { id: "kyc_pending", label: "KYC pending", hint: "Documents waiting for compliance" },
      { id: "kyc_rejected", label: "KYC needs attention", hint: "Documents rejected or new ones requested" },
      { id: "verified_unfunded", label: "Verified, not funded", hint: "KYC approved or account open, no deposit yet" },
      { id: "funded_not_trading", label: "Funded, not trading", hint: "Deposited but no trading activity recorded" },
      { id: "dormant", label: "Dormant", hint: `Funded clients with no deposit or trade for ${30} days` },
      { id: "active", label: "Active traders", hint: "Traded or deposited recently" },
    ];
    function segmentOf(l, lc, f) {
      const out = [];
      if (OPEN.has(l.stage) && !l.connected_calls && !l.client_id && !l.dnc) out.push("uncontacted");
      if (lc === "registered") out.push("incomplete");
      if (lc === "kyc_pending") out.push("kyc_pending");
      if (lc === "kyc_rejected") out.push("kyc_rejected");
      if (lc === "verified" || lc === "account_open") out.push("verified_unfunded");
      if (lc === "funded") out.push("funded_not_trading");
      if (lc === "dormant") out.push("dormant");
      if (lc === "trading") out.push("active");
      return out;
    }
    const daysSince = iso => iso ? Math.max(0, Math.floor((nowMs() - Date.parse(iso)) / 864e5)) : null;
    function lifecycleRow(l, lc, f) {
      const x = f.x, t = store.all("tasks").filter(z => z.lead_id === l.id && !z.done_at).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
      const since = { registered: x && x.created_at, kyc_pending: x && x.kyc && x.kyc.submitted_at, kyc_rejected: x && x.kyc && x.kyc.decided_at, verified: x && x.kyc && x.kyc.decided_at, account_open: f.live.map(a => a.opened_at).filter(Boolean).sort()[0], funded: f.deps.map(p => p.completed_at).sort()[0] || l.funded_at, trading: f.lastTrade || f.lastDep, dormant: [f.lastTrade, f.lastDep].filter(Boolean).sort().pop() }[lc] || l.stage_at || l.created_at;
      return Object.assign(brief(l), { owner_id: l.owner_id, owner_name: userName(l.owner_id), lifecycle: lc, lifecycle_label: LC[lc].label, days: daysSince(since), source: l.utm_source || "direct", campaign: l.utm_campaign || "",
        email: l.email, client_id: x ? x.id : null, email_verified: !!(x && x.email_verified_at), kyc: x ? (x.kyc || {}).status || "none" : null, deposited: sum(f.deps.map(p => p.amount)) || l.deposit_amount || 0,
        balance: sum(f.live.filter(a => a.status === "open").map(a => Number(a.balance) || 0)), last_contact_at: l.last_call_at || l.last_activity_at, next_task: t ? { title: t.title, due_at: t.due_at } : null, created_at: l.created_at, last_trade_at: f.lastTrade });
    }
    function listLifecycle(u, f = {}) { return withFacts(() => listLifecycle0(u, f)); }
    function listLifecycle0(u, f) {
      need(u, x => isSales(x) || isKyc(x) || isMktMgr(x));
      const mine = u.role === "agent" || f.owner === "me";
      const counts = Object.fromEntries(SEGMENTS.map(s => [s.id, 0])), rows = [];
      for (const l of store.all("leads")) {
        if (mine && l.owner_id !== u.id) continue; if (!mine && f.owner && l.owner_id !== f.owner) continue;
        if (!canSee(u, l)) continue;
        const facts = clientFacts(l), lc = lifecycleOf(l, facts), segs = segmentOf(l, lc, facts);
        segs.forEach(s => counts[s]++);
        if (segs.includes(f.segment || "uncontacted") && rows.length < 2000) rows.push(lifecycleRow(l, lc, facts));
      }
      rows.sort((a, b) => (b.days || 0) - (a.days || 0));
      return { segments: SEGMENTS.map(s => Object.assign({}, s, { n: counts[s.id], hint: s.id === "dormant" ? `Funded clients with no deposit or trade for ${DORMANT_DAYS()} days` : s.hint })), rows: rows.slice(0, 500), total: rows.length };
    }
    function lifecycleForLead(l) { const facts = clientFacts(l), lc = lifecycleOf(l, facts); return { id: lc, label: LC[lc].label, group: LC[lc].group, trading_started_at: facts.tradingStarted, last_trade_at: facts.lastTrade, deposits: facts.deps.length, deposited: sum(facts.deps.map(p => p.amount)) }; }
    // Trading activity has no live MT5 link: operations records it, or the daily import detects it
    function markTradingStarted(u, accountId) {
      need(u, x => isOps(x) || isMgr(x), "Only operations or sales managers can record trading activity.");
      const a = store.get("accounts", accountId); if (!a || a.kind !== "live" || a.status !== "open") throw new CrmError("Choose an open live account.");
      recordTrading(a, nowIso(), u); return pubAccount(store.get("accounts", a.id));
    }
    function recordTrading(a, at, by) {
      a.last_trade_at = a.last_trade_at && a.last_trade_at > at ? a.last_trade_at : at;
      const first = !a.trading_started_at; if (first) a.trading_started_at = at; store.put("accounts", a);
      const x = store.get("clients", a.client_id); if (!x) return;
      if (!x.trading_started_at) { x.trading_started_at = at; store.put("clients", x); }
      const l = leadOfClient(x);
      if (l && first) { l.reached = l.reached || {}; l.reached.trading = l.reached.trading || at; activity(l, by || SYSTEM, "portal", { label: `Trading started on ${a.login}` }); saveLead(l); if (l.owner_id) notify(l.owner_id, `📈 ${x.first_name} ${x.last_name} started trading on ${a.login}`, l.id, "win"); }
    }
    function listTradingAccounts(u, f = {}) {
      need(u, x => isOps(x) || isMgr(x) || x.role === "compliance");
      let rows = store.all("accounts").filter(a => a.kind === (f.kind || "live") && (f.status ? a.status === f.status : a.status === "open"));
      if (f.q) { const q = lc(f.q); rows = rows.filter(a => a.login.includes(q) || (() => { const x = store.get("clients", a.client_id); return x && (x.first_name + " " + x.last_name + " " + x.email).toLowerCase().includes(q); })()); }
      const dd = DORMANT_DAYS() * 864e5, now = nowMs();
      let out = rows.map(a => {
        const x = store.get("clients", a.client_id), l = x ? leadOfClient(x) : null, deps = store.all("payments").filter(p => p.account_id === a.id && p.status === "completed");
        const dep = sum(deps.filter(p => p.type === "deposit").map(p => p.amount)), wd = sum(deps.filter(p => p.type === "withdrawal").map(p => p.amount));
        const status = !dep ? "unfunded" : !a.trading_started_at ? "not_trading" : a.last_trade_at && now - Date.parse(a.last_trade_at) > dd ? "dormant" : "active";
        return Object.assign(pubAccount(a), { client: x ? { id: x.id, name: x.first_name + " " + x.last_name, email: x.email, country: x.country } : null, owner_name: l ? userName(l.owner_id) : "", lead_id: l ? l.id : null, deposits: dep, withdrawals: wd, net: dep - wd, activity: status });
      });
      if (f.activity) out = out.filter(r => r.activity === f.activity);
      out.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      return { rows: out.slice(0, 1000), totals: { accounts: out.length, balance: sum(out.map(r => Number(r.balance) || 0)), equity: sum(out.map(r => Number(r.equity == null ? r.balance : r.equity) || 0)), deposits: sum(out.map(r => r.deposits)), withdrawals: sum(out.map(r => r.withdrawals)), lots: sum(out.map(r => Number(r.lots_total) || 0)) }, by_activity: ["unfunded", "not_trading", "active", "dormant"].map(k => ({ k, n: out.filter(r => r.activity === k).length })) };
    }

    /* =====================================================================
       MT5 WEB API (read-only sync). The server reads MT5 and hands the rows to these functions;
       the core never talks to the network. Unknown logins are listed for operations, never linked automatically.
       ===================================================================== */
    const mt5Mode = () => (opts.mt5Mode ? opts.mt5Mode() : "manual") === "api" ? "api" : "manual";
    const mt5Cfg = () => Object.assign({}, DEFAULT_SETTINGS.mt5, settings().mt5 || {});
    const mt5State = () => store.get("mt5_state", "sync") || { id: "sync", last_deal_time: null, last_sync_at: null, last_ok_at: null, last_error: null, failing_since: null, groups_found: [], counts: {}, alerts: [] };
    const accByLogin = login => store.all("accounts").find(a => a.login === String(login) && a.status !== "rejected") || null;
    const TRADE_ACTIONS = [0, 1], CLOSING_ENTRIES = [1, 2, 3]; // deal actions buy/sell; entries out, in/out, out-by
    // MT5 groups come only from Client area settings (account type → live group / demo group)
    const mt5Groups = () => { const out = []; portalCfg().account_types.forEach(t => { if (t.mt5_group) out.push({ group: t.mt5_group, type: t.id, kind: "live" }); if (t.mt5_demo_group) out.push({ group: t.mt5_demo_group, type: t.id, kind: "demo" }); }); return out; };
    function mt5Alert(text) {
      const st = mt5State(); st.alerts = arr(st.alerts).concat([{ at: nowIso(), text: clean(text, 300) }]).slice(-50); store.put("mt5_state", st);
      opsUsers().forEach(u => notify(u.id, "⚠️ " + clean(text, 300), null, "ops"));
    }
    // What the next sync should read: our groups, the logins we know, deals since the last one (10 minutes overlap)
    function mt5SyncPlan() {
      const st = mt5State(), groups = [...new Set(mt5Groups().map(g => g.group))];
      const logins = [...new Set(store.all("accounts").filter(a => a.login && ["open", "closed"].includes(a.status)).map(a => a.login))];
      const from = st.last_deal_time ? new Date(Date.parse(st.last_deal_time) - 10 * 60000).toISOString() : new Date(nowMs() - 30 * 864e5).toISOString();
      return { groups, logins, deals_from: from, deals_to: new Date(nowMs() + 864e5).toISOString() };
    }
    const outOfRange = (login, range) => range && range.from && range.to && !(Number(login) >= range.from && Number(login) <= range.to);
    // Balances and account details. rows: { login, group, name, email, country, leverage, balance, equity, margin, margin_free, margin_level }
    function mt5IngestAccounts(rows, meta = {}) {
      const at = nowIso(), res = { updated: 0, unchanged: 0, unlinked: 0, new_unlinked: 0, legacy: 0, refused: 0 };
      const m2 = v => v == null || v === "" || isNaN(Number(v)) ? null : money2(v);
      arr(rows).forEach(r => {
        const login = digits(r.login); if (!login) return;
        if (outOfRange(login, meta.range)) { res.refused++; return; }
        const a = accByLogin(login);
        if (a) {
          const next = { balance: m2(r.balance) ?? a.balance, equity: m2(r.equity) ?? a.equity, margin: m2(r.margin), margin_free: m2(r.margin_free), margin_level: m2(r.margin_level), leverage: Number(r.leverage) || a.leverage, group: clean(r.group, 80) || a.group };
          const changed = Object.keys(next).some(k => next[k] !== a[k]);
          if (!changed && a.mt5_seen_at && nowMs() - Date.parse(a.mt5_seen_at) < 15 * 60000) { res.unchanged++; return; }
          if (a.balance_at && next.balance !== a.balance) a.balance_prev = a.balance;
          Object.assign(a, next, { balance_at: at, mt5_seen_at: at }); store.put("accounts", a); res.updated++; return;
        }
        // accounts sales opened before the client area: matched by the trading account on the lead
        const l = store.all("leads").find(z => z.account_id === login);
        if (l) {
          const t = Object.assign({}, l.trading), bal = m2(r.balance), eq = m2(r.equity);
          if (t.balance !== bal || t.equity !== eq || !t.at || nowMs() - Date.parse(t.at) > 6 * 3600e3) { l.trading = Object.assign(t, { balance: bal, equity: eq, at }); saveLead(l); }
          res.legacy++; return;
        }
        const id = "UL" + login, cur = store.get("mt5_unlinked", id), u = cur || { id, login, status: "open", first_seen_at: at };
        if (u.status === "linked" && accByLogin(login)) return;
        Object.assign(u, { group: clean(r.group, 80), name: clean(r.name, 120), email: clean(r.email, 160), country: clean(r.country, 80), leverage: Number(r.leverage) || null, balance: m2(r.balance), equity: m2(r.equity), registered_at: r.registered_at || null, last_seen_at: at });
        store.put("mt5_unlinked", u);
        if (u.status === "open") { res.unlinked++; if (!cur) { res.new_unlinked++; } }
      });
      if (res.new_unlinked) opsUsers().forEach(x => notify(x.id, `🔗 ${res.new_unlinked} MT5 account${res.new_unlinked > 1 ? "s" : ""} not linked to a client. Link them in Trading → Unlinked MT5 accounts`, null, "ops"));
      const st = mt5State(); st.last_accounts_at = at; if (meta.groups_found) st.groups_found = arr(meta.groups_found).slice(0, 50);
      st.counts = Object.assign({}, st.counts, { accounts_updated: res.updated, unlinked: store.all("mt5_unlinked").filter(u => u.status === "open").length, legacy: res.legacy, refused: res.refused });
      store.put("mt5_state", st);
      return res;
    }
    // Deals since the last sync (overlapping), deduplicated by ticket. Trading deals feed the existing activity logic.
    // seen = { from, to, logins }: the window and logins this sync read in full; our deals there that MT5 no longer returns are marked missing
    function mt5IngestDeals(rows, seen) {
      const res = { new: 0, duplicate: 0, changed: 0, trading: 0, balance: 0, missing: 0 }, st = mt5State(), newBalance = []; let maxT = st.last_deal_time;
      const accs = new Map(store.all("accounts").filter(a => a.login && a.status !== "rejected").map(a => [a.login, a])), touched = new Map(), legacy = new Map();
      arr(rows).forEach(r => {
        const ticket = digits(r.ticket); if (!ticket || !r.time || isNaN(Date.parse(r.time))) return;
        const id = "MD" + ticket, cur = store.get("mt5_deals", id), login = digits(r.login), a = accs.get(login) || null;
        const d = { id, ticket, login, account_id: a ? a.id : null, client_id: a ? a.client_id : null, time: new Date(Date.parse(r.time)).toISOString(), action: Number(r.action), entry: Number(r.entry) || 0, symbol: clean(r.symbol, 32), lots: Math.round((Number(r.lots) || 0) * 10000) / 10000, price: Number(r.price) || 0, profit: money2(r.profit), commission: money2(r.commission), swap: money2(r.swap), position_id: clean(r.position_id, 24), comment: clean(r.comment, 64) };
        if (!maxT || d.time > maxT) maxT = d.time;
        if (cur) { // the overlap brings deals back; MT5 can correct a deal but never reuses a ticket
          if (cur.missing_at) { delete cur.missing_at; store.put("mt5_deals", cur); mt5Alert(`MT5 deal #${ticket} is back after it was missing. Its reversed commission lines stay reversed; adjust them in the partner's ledger if needed.`); }
          if (["login", "time", "action", "entry", "symbol", "lots", "profit", "commission", "swap", "comment", "position_id"].every(k => cur[k] === d[k]) && cur.account_id === d.account_id) { res.duplicate++; return; }
          const lotsChanged = cur.lots !== d.lots || cur.symbol !== d.symbol || cur.login !== d.login;
          store.put("mt5_deals", Object.assign(cur, d, { changed_at: nowIso() })); res.changed++; if (lotsChanged) ibDealChanged(cur, "Deal changed in MT5"); return;
        }
        store.put("mt5_deals", Object.assign(d, { synced_at: nowIso() })); res.new++;
        if (d.action === 2) { res.balance++; newBalance.push(d); }
        if (!TRADE_ACTIONS.includes(d.action)) return;
        res.trading++;
        if (a && a.kind === "live") {
          if (CLOSING_ENTRIES.includes(d.entry)) a.lots_total = Math.round(((Number(a.lots_total) || 0) + d.lots) * 100) / 100;
          if (!touched.has(a.id) || d.time > touched.get(a.id)) touched.set(a.id, d.time);
        } else if (!a) { const l = store.all("leads").find(z => z.account_id === login); if (l) { const g = legacy.get(l.id) || { l, at: d.time, lots: 0 }; if (d.time > g.at) g.at = d.time; if (CLOSING_ENTRIES.includes(d.entry)) g.lots += d.lots; legacy.set(l.id, g); } }
      });
      touched.forEach((at, id) => recordTrading(store.get("accounts", id), at, SYSTEM));
      legacy.forEach(({ l, at, lots }) => {
        const t = Object.assign({}, l.trading); t.lots = Math.round(((Number(t.lots) || 0) + lots) * 100) / 100; if (!t.last_trade_at || at > t.last_trade_at) t.last_trade_at = at; t.at = nowIso(); l.trading = t;
        l.reached = l.reached || {}; if (!l.reached.trading) { l.reached.trading = at; activity(l, SYSTEM, "portal", { label: `Trading started on ${l.account_id}` }); } saveLead(l);
      });
      if (newBalance.length) res.seen = mt5NoticeBalance(newBalance); // operations is told; nothing is confirmed automatically
      if (seen && seen.from && seen.to && arr(seen.logins).length) { // a deal MT5 removed: kept, marked missing, its commission reversed (never deleted)
        const got = new Set(arr(rows).map(r => digits(r.ticket))), logins = new Set(arr(seen.logins).map(String)), from = new Date(Date.parse(seen.from)).toISOString(), to = new Date(Date.parse(seen.to)).toISOString();
        store.all("mt5_deals").filter(d => !d.missing_at && d.time >= from && d.time <= to && logins.has(d.login) && !got.has(d.ticket)).forEach(d => {
          d.missing_at = nowIso(); store.put("mt5_deals", d); res.missing++;
          if (store.all("commissions").some(l => l.deal_ticket === d.ticket && l.status !== "reversed")) ibDealChanged(d, "Deal no longer in MT5");
        });
        if (res.missing) mt5Alert(`${res.missing} MT5 deal${res.missing > 1 ? "s" : ""} we had synced ${res.missing > 1 ? "are" : "is"} no longer in MT5. Kept and marked missing; any commission on ${res.missing > 1 ? "them" : "it"} was reversed.`);
      }
      res.ib_lines = ibProcessDeals();
      st.last_deal_time = maxT; st.last_deals_at = nowIso(); st.counts = Object.assign({}, st.counts, { deals: store.size("mt5_deals"), deals_new: res.new }); store.put("mt5_state", st);
      return res;
    }
    // Open positions: a snapshot per account (logins = the accounts this snapshot covers; their other positions were closed)
    function mt5IngestPositions(rows, logins) {
      const covered = new Set(arr(logins).map(String)), seen = new Set(), per = new Map(), at = nowIso();
      arr(rows).forEach(r => {
        const pid = digits(r.position_id), login = digits(r.login); if (!pid || !login) return;
        covered.add(login); const a = accByLogin(login), id = "MP" + pid, cur = store.get("mt5_positions", id);
        const p = { id, position_id: pid, login, account_id: a ? a.id : null, client_id: a ? a.client_id : null, symbol: clean(r.symbol, 32), action: Number(r.action), lots: Number(r.lots) || 0, price_open: Number(r.price_open) || 0, price_current: Number(r.price_current) || 0, profit: money2(r.profit), swap: money2(r.swap), opened_at: r.opened_at || null };
        if (!cur || ["lots", "price_current", "profit", "swap", "account_id"].some(k => cur[k] !== p[k])) store.put("mt5_positions", Object.assign(p, { synced_at: at }));
        seen.add(id); const g = per.get(login) || { n: 0, profit: 0, first: null }; g.n++; g.profit += p.profit; if (p.opened_at && (!g.first || p.opened_at < g.first)) g.first = p.opened_at; per.set(login, g);
      });
      let closed = 0; store.all("mt5_positions").filter(p => covered.has(p.login) && !seen.has(p.id)).forEach(p => { store.remove("mt5_positions", p.id); closed++; });
      covered.forEach(login => {
        const a = accByLogin(login); if (!a) return; const g = per.get(login) || { n: 0, profit: 0, first: null };
        if ((a.positions_open || 0) !== g.n || money2(a.floating || 0) !== money2(g.profit)) { a.positions_open = g.n; a.floating = money2(g.profit); store.put("accounts", a); }
        if (g.n && a.kind === "live" && a.status === "open" && (!a.trading_started_at || (g.first && (!a.last_trade_at || g.first > a.last_trade_at)))) recordTrading(a, g.first || at, SYSTEM);
      });
      return { open: seen.size, closed };
    }
    function mt5SyncDone(r = {}) {
      const st = mt5State(), at = nowIso(); st.last_sync_at = at;
      if (r.ok) { if (st.failing_since) mt5Alert("MT5 sync is working again"); Object.assign(st, { last_ok_at: at, last_error: null, failing_since: null, last_result: r.summary || null }); }
      else {
        st.last_error = clean(r.error, 300);
        if (!st.failing_since) { st.failing_since = at; store.put("mt5_state", st); mt5Alert("MT5 sync failed: " + st.last_error + ". Balances and trades are not updating."); return mt5State(); }
      }
      store.put("mt5_state", st); return st;
    }
    // The MT5 call log (mt5_ops): calls a person started (or tied to an account action, or refused) get one row with every call;
    // the timer's routine reads are summed per hour (count and last retcode per command, failed calls in full). No secrets:
    // lib/mt5.js masks passwords and the sign-in answers before they get here.
    function mt5LogCalls(calls, by, opId) {
      const list = arr(calls).filter(c => c && c.command).slice(0, 500); if (!list.length) return null;
      const who = by && by.id ? by.id : SYSTEM.id, at = nowIso();
      const row = c => ({ command: clean(c.command, 60), params: c.params && typeof c.params === "object" ? c.params : {}, retcode: clean(c.retcode, 80) || null, error: clean(c.error, 300) || null, refused: !!c.refused, at: c.at || at, ms: Number(c.ms) || 0 });
      if (who !== SYSTEM.id || opId || list.some(c => c.refused)) {
        const o = { id: newId("MC"), kind: "calls", command: [...new Set(list.map(c => c.command))].join(", ").slice(0, 300), status: list.some(c => c.error || c.refused) ? "failed" : "done", op_id: opId || null, by: who, calls: list.slice(0, 60).map(row), calls_total: list.length, created_at: list[0].at || at, finished_at: at };
        store.put("mt5_ops", o); return o;
      }
      const id = "MCH" + at.slice(0, 13).replace(/\D/g, ""), cur = store.get("mt5_ops", id), o = cur || { id, kind: "sync_reads", by: SYSTEM.id, counts: {}, errors: [], created_at: list[0].at || at };
      list.forEach(c => { const g = o.counts[c.command] || { n: 0, failed: 0, retcode: null }; g.n++; if (c.error) { g.failed++; o.errors = arr(o.errors).concat([row(c)]).slice(-20); } else g.retcode = clean(c.retcode, 80); o.counts[c.command] = g; });
      Object.assign(o, { command: Object.keys(o.counts).join(", "), status: o.errors.length ? "failed" : "done", calls_total: sum(Object.values(o.counts).map(g => g.n)), finished_at: at });
      store.put("mt5_ops", o);
      if (!cur) { const old = new Date(nowMs() - 90 * 864e5).toISOString(); store.all("mt5_ops").filter(z => z.kind === "sync_reads" && z.created_at < old).forEach(z => store.remove("mt5_ops", z.id)); } // keep 90 days
      return o;
    }
    function mt5Status(u) {
      need(u, x => isOps(x) || isKyc(x) || isMgr(x));
      const st = mt5State();
      return { mode: mt5Mode(), account_creation_enabled: !!mt5Cfg().account_creation_enabled, auto_demo: !!mt5Cfg().auto_demo, match_after_hours: matchHours(), groups: mt5Groups(), sync: { last_sync_at: st.last_sync_at, last_ok_at: st.last_ok_at, last_error: st.last_error, failing_since: st.failing_since, last_deal_time: st.last_deal_time, groups_found: st.groups_found, counts: st.counts, last_result: st.last_result || null },
        alerts: arr(st.alerts).slice(-10).reverse(), unlinked: store.all("mt5_unlinked").filter(x => x.status === "open").length, deals: store.size("mt5_deals"), positions: store.size("mt5_positions") };
    }
    // Operations links an MT5 account to a client (never automatic)
    function listMt5Unlinked(u, f = {}) {
      need(u, isOps, "Only operations can link MT5 accounts.");
      const st = f.status || "open", q = lc(f.q);
      return store.all("mt5_unlinked").filter(x => x.status === st && (!q || (x.login + " " + x.name + " " + x.email).toLowerCase().includes(q))).sort((a, b) => String(b.first_seen_at).localeCompare(String(a.first_seen_at))).slice(0, 500)
        .map(x => Object.assign({}, x, { linked_by_name: x.linked_by ? userName(x.linked_by) : "", suggest: (() => { const c = x.email && store.all("clients").find(y => y.email === lc(x.email)); return c ? { id: c.id, name: c.first_name + " " + c.last_name, email: c.email } : null; })() }));
    }
    function mt5LinkAccount(u, id, d = {}) {
      need(u, isOps, "Only operations can link MT5 accounts.");
      const x0 = store.get("mt5_unlinked", id); if (!x0 || x0.status !== "open") throw new CrmError("This MT5 account isn't waiting to be linked.");
      const x = store.get("clients", d.client_id); if (!x) throw new CrmError("Choose the client.", 422, { client_id: "Required" });
      if (accByLogin(x0.login)) throw new CrmError("That login is already linked to another account.");
      const map = mt5Groups().find(g => g.group === x0.group), types = portalCfg().account_types;
      const t = types.find(z => z.id === d.type) || (map && types.find(z => z.id === map.type)); if (!t) throw new CrmError("Choose the account type.", 422, { type: "Required" });
      const kind = d.kind === "demo" || d.kind === "live" ? d.kind : map ? map.kind : "live";
      const a = { id: newId("T"), client_id: x.id, lead_id: x.lead_id, kind, type: t.id, type_name: t.name, platform: "MT5", leverage: x0.leverage || arr(t.leverages)[0] || 100, currency: arr(t.currencies)[0] || "USD", status: "open", login: x0.login, server: portalCfg().default_server, group: x0.group, balance: x0.balance || 0, equity: x0.equity, balance_at: nowIso(), mt5_seen_at: x0.last_seen_at, created_at: nowIso(), opened_at: nowIso(), opened_by: u.id, reject_reason: "", linked_from_mt5: true };
      store.put("accounts", a);
      Object.assign(x0, { status: "linked", linked_at: nowIso(), linked_by: u.id, account_id: a.id, client_id: x.id }); store.put("mt5_unlinked", x0);
      // deals already synced for this login now belong to the client
      store.all("mt5_deals").filter(z => z.login === a.login && !z.account_id).forEach(z => { z.account_id = a.id; z.client_id = x.id; store.put("mt5_deals", z); });
      portalLog(x, `MT5 account ${a.login} linked by operations (${kind} ${t.name})`, { by: u });
      return accountOpened(u, a, { mail: false });
    }
    function mt5IgnoreUnlinked(u, id, reason) {
      need(u, isOps, "Only operations can do this.");
      const x0 = store.get("mt5_unlinked", id); if (!x0) throw new CrmError("Not found.", 404);
      const why = clean(reason, 200); if (!why) throw new CrmError("Say why it isn't a client account.", 422, { reason: "Required" });
      Object.assign(x0, { status: "ignored", ignored_reason: why, ignored_by: u.id, ignored_at: nowIso() }); store.put("mt5_unlinked", x0); return x0;
    }
    // Our completed money movements per login against MT5 balance deals. A deal whose comment has our reference matches
    // (for display: confirming a request is always a person's click); any other balance deal was made outside the system.
    function mt5Reconcile(u, f = {}) {
      need(u, isOps, "The MT5 reconciliation is for operations.");
      const to = /^\d{4}-\d{2}-\d{2}$/.test(f.to || "") ? f.to : localDay(nowIso()), from = /^\d{4}-\d{2}-\d{2}$/.test(f.from || "") ? f.from : localDay(new Date(nowMs() - 30 * 864e5).toISOString());
      const inR = iso => { const d = localDay(iso); return d >= from && d <= to; }, loginOf = id => (store.get("accounts", id) || {}).login || "";
      const ours = [];
      store.all("payments").filter(p => p.status === "completed" && inR(p.completed_at)).forEach(p => {
        if (p.type === "deposit" || (p.type === "ib_payout" && p.method === "mt5")) ours.push({ login: loginOf(p.account_id), amount: p.amount, ref: p.reference, payment_id: p.id, type: p.type === "deposit" ? p.type : "partner payout", at: p.completed_at });
        else if (p.type === "withdrawal") ours.push({ login: loginOf(p.account_id), amount: -p.amount, ref: p.reference, payment_id: p.id, type: p.type, at: p.completed_at });
        else if (p.type === "transfer") { ours.push({ login: loginOf(p.account_id), amount: -p.amount, ref: p.reference, payment_id: p.id, type: "transfer out", at: p.completed_at }); ours.push({ login: loginOf(p.to_account_id), amount: p.amount, ref: p.reference, payment_id: p.id, type: "transfer in", at: p.completed_at }); }
      });
      // company-funded $100 accounts, credited by Absel Markets with comment BONUS <id>
      store.all("bonuses").filter(b => b.credited_at && inR(b.credited_at) && digits(b.account_id)).forEach(b => ours.push({ login: digits(b.account_id), amount: b.amount, ref: b.id, bonus_id: b.id, type: "bonus", at: b.credited_at }));
      const deals = store.all("mt5_deals").filter(d => d.action === 2 && inR(d.time)), used = new Set(), by = new Map();
      const row = login => { if (!by.has(login)) { const a = accByLogin(login), x = a && store.get("clients", a.client_id); by.set(login, { login, account_id: a ? a.id : null, client: x ? { id: x.id, name: x.first_name + " " + x.last_name } : null, ours_in: 0, ours_out: 0, mt5_in: 0, mt5_out: 0, matched: 0, ours_unmatched: [], outside: [] }); } return by.get(login); };
      ours.forEach(o => {
        const r = row(o.login); if (o.amount > 0) r.ours_in += o.amount; else r.ours_out -= o.amount;
        const d = deals.find(z => !used.has(z.id) && z.login === o.login && o.ref && z.comment.includes(o.ref) && Math.sign(z.profit) === Math.sign(o.amount));
        if (d) { used.add(d.id); r.matched++; if (money2(d.profit) !== money2(o.amount)) r.ours_unmatched.push(Object.assign({}, o, { why: `MT5 deal #${d.ticket} has ${money2(d.profit)}` })); } else r.ours_unmatched.push(Object.assign({}, o, { why: "No MT5 balance deal with this reference" }));
      });
      deals.forEach(d => { const r = row(d.login); if (d.profit > 0) r.mt5_in += d.profit; else r.mt5_out -= d.profit; if (!used.has(d.id)) { const hint = r.ours_unmatched.find(o => money2(o.amount) === money2(d.profit)); r.outside.push({ ticket: d.ticket, amount: d.profit, comment: d.comment, time: d.time, possible: hint ? hint.ref : null }); } });
      const rows = [...by.values()].map(r => Object.assign(r, { ours_in: money2(r.ours_in), ours_out: money2(r.ours_out), mt5_in: money2(r.mt5_in), mt5_out: money2(r.mt5_out), diff: money2((r.mt5_in - r.mt5_out) - (r.ours_in - r.ours_out)) }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.outside.length - a.outside.length || String(a.login).localeCompare(String(b.login)));
      const sync = mt5State();
      return { from, to, rows, totals: { logins: rows.length, ours_in: money2(sum(rows.map(r => r.ours_in))), ours_out: money2(sum(rows.map(r => r.ours_out))), mt5_in: money2(sum(rows.map(r => r.mt5_in))), mt5_out: money2(sum(rows.map(r => r.mt5_out))), matched: sum(rows.map(r => r.matched)), unmatched: sum(rows.map(r => r.ours_unmatched.length)), outside: sum(rows.map(r => r.outside.length)), with_difference: rows.filter(r => r.diff).length }, mode: mt5Mode(), last_deal_time: sync.last_deal_time, last_ok_at: sync.last_ok_at };
    }

    /* =====================================================================
       MT5: ACCOUNTS (the only writes) AND MATCHING MANUAL MONEY OPERATIONS.
       Our system never moves money in MT5. Operations credits and debits in MT5 Manager with our reference in the comment
       (DEP, WD, TRF-OUT / TRF-IN, IB or BONUS followed by the reference); the sync reads those balance deals and they are
       matched here for display. A match is only ever confirmed by a person's click.
       Account creation and leverage changes need MT5 account creation switched on; each attempt is a line in mt5_ops.
       ===================================================================== */
    const mt5Accounts = () => mt5Mode() === "api" && !!mt5Cfg().account_creation_enabled;
    const needAccounts = () => { if (!mt5Accounts()) throw new CrmError(mt5Mode() !== "api" ? "MT5 is in manual mode. Open the account in MT5 Manager and record it." : "MT5 account creation is switched off (Client area settings → MT5). Open the account in MT5 Manager and record it."); };
    const loginOk = login => /^\d{3,12}$/.test(String(login || ""));
    // logins the client already has: a "find the account MT5 created" check must never pick one of these
    const takenLogins = accId => { const a = store.get("accounts", accId); return a ? store.all("accounts").filter(z => z.client_id === a.client_id && z.login && z.id !== a.id && z.status !== "rejected").map(z => z.login) : []; };
    const opRequest = op => op && ({ op_id: op.id, kind: op.kind, login: op.login, check_first: !!op.check_first, taken: op.kind === "create_account" ? takenLogins(op.account_id) : undefined, since: new Date(Date.parse(op.created_at) - 3600e3).toISOString(), group: op.group, leverage: op.leverage, name: op.name, email: op.email, country: op.country, city: op.city, phone: op.phone, comment: op.comment, account_id: op.account_id });
    // The server's answer for one account action. res: { ok, retcode, error, unknown, found_existing, login, group }
    function mt5OpResult(opId, res = {}, secret) {
      const op = store.get("mt5_ops", opId); if (!op) throw new CrmError("MT5 operation not found.", 404);
      if (op.status === "done") return { ok: true, op, already: true };
      const by = store.get("users", op.by) || SYSTEM;
      Object.assign(op, { finished_at: nowIso(), retcode: res.retcode != null ? String(res.retcode) : op.retcode || null, response: { ok: !!res.ok, login: res.login || null, group: res.group || null, found_existing: !!res.found_existing, error: clean(res.error, 300) || null } });
      if (res.ok) { op.status = "done"; op.found_existing = !!res.found_existing; op.error = null; }
      else if (res.unknown) { op.status = "unknown"; op.error = clean(res.error, 300) || "MT5 didn't answer"; }
      else { op.status = "failed"; op.error = clean(res.error, 300) || "MT5 refused the operation"; }
      store.put("mt5_ops", op);
      if (op.kind === "create_account") return Object.assign({ op }, accountCreated(op, res, secret, by));
      if (op.kind === "leverage") return Object.assign({ op }, leverageDone(op, res, by));
      return { ok: false, op };
    }
    // "Check MT5 again" for a request left in "Being opened" (MT5 or the server stopped mid-call): the server looks for the
    // account by its comment "ABSEL <request id>" before anything is created again
    function mt5OpToCheck(u, id) {
      need(u, isOps, "Only operations can do this.");
      const op = store.get("mt5_ops", id) || store.all("mt5_ops").filter(o => o.kind === "create_account" && o.account_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!op || op.kind !== "create_account" || !["unknown", "sending"].includes(op.status)) throw new CrmError("Nothing waiting for MT5 here.");
      return Object.assign(opRequest(op), { check_only: true });
    }
    // The check found nothing: the account was never created. The request goes back so operations can try again.
    function mt5OpNotFound(opId) {
      const op = store.get("mt5_ops", opId); if (!op || !["unknown", "sending"].includes(op.status)) return null;
      return mt5OpResult(opId, { ok: false, error: `Checked: no account with comment “${op.comment || "ABSEL " + op.account_id}” is in MT5, so none was created. You can retry.` });
    }
    // Requests still "Being opened" after a few minutes (the server stopped during the call): checked again when the server starts
    function mt5StuckCreations(minutes = 2) {
      return store.all("mt5_ops").filter(o => o.kind === "create_account" && ["sending", "unknown"].includes(o.status) && nowMs() - Date.parse(o.created_at) > minutes * 60000).map(o => Object.assign(opRequest(o), { check_only: true }));
    }
    // Demo requests are approved straight away only with both switches on (Client area settings → MT5)
    const mt5AutoDemo = () => mt5Accounts() && !!mt5Cfg().auto_demo;
    // Approve and create in MT5 (operations or admin; demo also automatically). The account starts empty: we never fund it.
    // The request is locked as "creating" in the same transaction, so a double click or a second person can't create it twice.
    function mt5AccountCreate(u, id) {
      need(u, isOps, "Only operations or an admin can approve accounts."); needAccounts();
      const a = store.get("accounts", id); if (!a) throw new CrmError("Account request not found.", 404);
      if (a.status === "creating") throw new CrmError("This account is already being opened in MT5.");
      if (a.status !== "requested") throw new CrmError("This request was already handled.");
      const x = store.get("clients", a.client_id);
      if (a.kind === "live" && (!x || (x.kyc || {}).status !== "approved")) throw new CrmError("The client's KYC is no longer approved, so a live account can't be opened. Reject the request or wait for new documents.");
      const t = portalCfg().account_types.find(z => z.id === a.type), group = t && (a.kind === "demo" ? t.mt5_demo_group : t.mt5_group);
      if (!group) throw new CrmError(`Set the MT5 ${a.kind === "demo" ? "demo " : ""}group for ${a.type_name} in settings (Client area settings → Account types).`);
      if (t.leverages && t.leverages.length && !t.leverages.map(Number).includes(Number(a.leverage))) throw new CrmError("The requested leverage isn't allowed for this account type.");
      const prior = store.all("mt5_ops").filter(o => o.kind === "create_account" && o.account_id === a.id), now = nowIso();
      const op = { id: newId("MO"), kind: "create_account", command: "user/add", account_id: a.id, login: "", comment: "ABSEL " + a.id, group, leverage: Number(a.leverage) || 100,
        name: x ? (x.first_name + " " + x.last_name).trim() : "", email: x ? x.email : "", country: x ? x.country : "", city: x ? x.city || "" : "", phone: x ? (x.dial_code || "") + (x.phone || "") : "",
        status: "sending", attempt: prior.length + 1, check_first: prior.length > 0, by: u.id, request: { group, leverage: Number(a.leverage) || 100, kind: a.kind, comment: "ABSEL " + a.id }, created_at: now, finished_at: null };
      Object.assign(a, { status: "creating", approved_by: u.id, approved_at: now, mt5_error: "", mt5_error_at: null });
      store.put("accounts", a); store.put("mt5_ops", op);
      return { account: pubAccount(a), op: opRequest(op) };
    }
    // secret = the main password the server generated (shown once to the client, then erased). The investor password is never kept.
    function accountCreated(op, res, secret, by) {
      const a = store.get("accounts", op.account_id);
      const failed = msg => { if (a.status === "creating") a.status = "requested"; a.mt5_error = msg; a.mt5_error_at = nowIso(); store.put("accounts", a);
        opsUsers().forEach(z => notify(z.id, `⚠️ MT5 ${a.kind} account for ${op.name} not created: ${msg}`, a.lead_id, "ops")); return { ok: false, account: pubAccount(a) }; };
      if (op.status !== "done") return failed(op.status === "unknown" ? (op.error || "MT5 didn't confirm the new account.") + " Retry looks for it in MT5 before creating another." : op.error);
      if (!["creating", "requested"].includes(a.status)) return { ok: true, account: pubAccount(a) };
      const login = String(res.login || "");
      if (store.all("accounts").some(z => z.login === login && z.id !== a.id && z.status !== "rejected")) return failed(`MT5 returned login ${login}, which is already linked to another account. Check MT5 Manager.`);
      op.login = login; store.put("mt5_ops", op);
      Object.assign(a, { status: "open", login, server: portalCfg().default_server, group: clean(res.group || op.group, 80), leverage: op.leverage, opened_at: nowIso(), opened_by: op.by, pw_once: secret ? String(secret).slice(0, 60) : null, pw_set_at: secret ? nowIso() : null,
        mt5_created: { op_id: op.id, at: nowIso(), comment: op.comment, found_existing: !!res.found_existing }, mt5_error: "", mt5_error_at: null, balance: 0, balance_at: null }); // starts empty; the sync shows what MT5 holds
      store.put("accounts", a);
      if (!secret) opsUsers().forEach(z => notify(z.id, `🔑 MT5 account ${login} was found already created. Reset its password in MT5 Manager and give the client a new one (New password).`, a.lead_id, "ops"));
      portalLog(store.get("clients", a.client_id), `${a.kind === "live" ? "Live" : "Demo"} account ${login} created in MT5 (${a.group})`, { by });
      return Object.assign({ ok: true }, { account: accountOpened(by, a, { mail: true }) });
    }
    // Leverage change on an open account: an operations action, checked against the type's list, with an audit entry
    function mt5Leverage(u, id, leverage) {
      need(u, isOps, "Only operations can change leverage.");
      const a = store.get("accounts", id); if (!a || a.status !== "open") throw new CrmError("Choose an open account.");
      const t = portalCfg().account_types.find(z => z.id === a.type) || {}, lev = Number(leverage);
      if (!arr(t.leverages).map(Number).includes(lev)) throw new CrmError("Choose one of the leverages allowed for " + (t.name || "this account type") + ": " + arr(t.leverages).map(v => "1:" + v).join(", "), 422, { leverage: "Not allowed" });
      if (lev === Number(a.leverage)) throw new CrmError("It's already 1:" + lev + ".");
      if (!mt5Accounts()) { const before = a.leverage; a.leverage = lev; store.put("accounts", a); portalLog(store.get("clients", a.client_id), `Leverage on ${a.login} changed from 1:${before} to 1:${lev} (recorded; done in MT5 Manager)`, { by: u }); return { account: pubAccount(a), op: null }; }
      if (!loginOk(a.login)) throw new CrmError("This account has no MT5 login.");
      const op = { id: newId("MO"), kind: "leverage", command: "user/update", account_id: a.id, login: a.login, leverage: lev, before: a.leverage, status: "sending", attempt: 1, by: u.id, request: { login: a.login, leverage: lev }, created_at: nowIso(), finished_at: null };
      store.put("mt5_ops", op); return { account: pubAccount(a), op: opRequest(op) };
    }
    function leverageDone(op, res, by) {
      const a = store.get("accounts", op.account_id); if (op.status !== "done") return { ok: false, account: pubAccount(a), error: op.error };
      a.leverage = op.leverage; store.put("accounts", a);
      portalLog(store.get("clients", a.client_id), `Leverage on ${a.login} changed in MT5 from 1:${op.before} to 1:${op.leverage}`, { by });
      return { ok: true, account: pubAccount(a) };
    }
    function listMt5Ops(u, f = {}) {
      need(u, x => isOps(x) || isMgr(x));
      let rows = store.all("mt5_ops"); if (f.account_id) rows = rows.filter(o => o.account_id === f.account_id); if (f.kind) rows = rows.filter(o => o.kind === f.kind); if (f.status) rows = rows.filter(o => o.status === f.status);
      return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 300).map(o => Object.assign({}, o, { by_name: o.by === SYSTEM.id ? "System" : userName(o.by) }));
    }

    /* ---------- matching: MT5 balance deals made in MT5 Manager ↔ our requests ---------- */
    const REF_PREFIX = { deposit: "DEP", withdrawal: "WD", transfer_out: "TRF-OUT", transfer_in: "TRF-IN", ib_payout: "IB", bonus: "BONUS" };
    const matchHours = () => Math.max(0.25, Number(mt5Cfg().match_after_hours) || 2);
    const usd = v => (v < 0 ? "−$" : "$") + Math.abs(money2(v)).toLocaleString("en-US");
    // Balance deals by the references in their comments ("DEP D-H920NU" → key "DEP D-H920NU"). Comments are typed by people,
    // so the prefix can sit anywhere in the comment and be followed by a space, # or colon.
    function balanceDealIndex() {
      const idx = new Map();
      store.all("mt5_deals").forEach(d => {
        if (d.action !== 2 || !d.comment) return;
        const re = /(?:^|[^A-Za-z0-9])(TRF-OUT|TRF-IN|DEP|WD|IB|BONUS)[\s#:]+([A-Za-z0-9][A-Za-z0-9_-]{2,})/gi; let m;
        while ((m = re.exec(d.comment))) { const k = m[1].toUpperCase() + " " + m[2].toUpperCase(); if (!idx.has(k)) idx.set(k, []); if (!idx.get(k).includes(d)) idx.get(k).push(d); }
      });
      return idx;
    }
    // One expected balance deal. state: match | amount | login | duplicate | missing | late
    function matchLeg(idx, ref, l, since) {
      const comment = REF_PREFIX[l.leg] + " " + ref, deals = idx.get(comment.toUpperCase()) || [];
      const out = { leg: l.leg, comment, login: l.login || "", amount: money2(l.amount), deals: deals.map(d => ({ ticket: d.ticket, login: d.login, amount: d.profit, time: d.time, comment: d.comment })), state: "missing", warn: "", ticket: null };
      if (!deals.length) { const h = since ? (nowMs() - Date.parse(since)) / 36e5 : 0; if (since && h >= matchHours()) { out.state = "late"; out.warn = `No MT5 deal with “${comment}” after ${Math.floor(h)} h`; } return out; }
      if (deals.length > 1) { out.state = "duplicate"; out.warn = `${deals.length} MT5 deals have “${comment}” (#${deals.map(d => d.ticket).join(", #")}). Check MT5 Manager: one may be a mistake`; return out; }
      const d = deals[0]; out.ticket = d.ticket;
      if (l.login && d.login !== l.login) { out.state = "login"; out.warn = `MT5 deal #${d.ticket} is on ${d.login}, not on ${l.login}`; }
      else if (money2(d.profit) !== money2(l.amount)) { out.state = "amount"; out.warn = `MT5 deal #${d.ticket} is ${usd(d.profit)}, the request is ${usd(l.amount)}`; }
      else out.state = "match";
      return out;
    }
    // What MT5 should show for a request: deposit +, withdrawal −, transfer − then +, partner payout to MT5 +
    function payLegs(p) {
      const lo = id => (store.get("accounts", id) || {}).login || "", got = p.gateway && Number(p.gateway.paid) > 0 ? money2(p.gateway.paid) : p.amount;
      if (p.type === "deposit") return [{ leg: "deposit", login: lo(p.account_id), amount: got }];
      if (p.type === "withdrawal") return [{ leg: "withdrawal", login: lo(p.account_id), amount: -p.amount }];
      if (p.type === "transfer") return [{ leg: "transfer_out", login: lo(p.account_id), amount: -p.amount }, { leg: "transfer_in", login: lo(p.to_account_id), amount: p.amount }];
      if (p.type === "ib_payout" && p.method === "mt5") return [{ leg: "ib_payout", login: lo(p.account_id), amount: p.amount }];
      return [];
    }
    // api mode only. ok = every leg is seen exactly once, on the right login, for the right amount: "Seen in MT5", one-click confirm.
    function payMatch(p, idx) {
      if (mt5Mode() !== "api") return null;
      const legs = payLegs(p); if (!legs.length) return null;
      idx = idx || balanceDealIndex();
      const lastApproval = arr(p.approvals).map(z => z.at).sort().pop() || null, open = OPEN_PAY.includes(p.status);
      // the clock for "nothing in MT5 after X hours" starts when operations can act: deposits once the money is there, withdrawals and payouts once approved
      const since = !open ? null : ["withdrawal", "ib_payout"].includes(p.type) ? (p.status === "approved" ? lastApproval : null) : p.gateway && !(Number(p.gateway.paid) > 0) ? null : p.created_at;
      const out = legs.map(l => matchLeg(idx, p.reference, l, since)), seen = out.filter(x => x.deals.length).length;
      const warn = out.map(x => x.warn).filter(Boolean);
      if (open && seen && ["withdrawal", "ib_payout"].includes(p.type) && p.status !== "approved") warn.unshift(`Already ${p.type === "withdrawal" ? "debited" : "credited"} in MT5 before the approval was complete`);
      const ok = out.every(x => x.state === "match");
      return { legs: out, ok, seen, tickets: ok ? out.map(x => x.ticket) : [], warn, late: out.some(x => x.state === "late") };
    }
    // Withdrawals and transfers already debited in MT5 no longer hold the client's balance: the synced balance shows the debit
    const debitSeen = (p, idx) => { const m = payMatch(p, idx); return !!(m && m.legs[0] && m.legs[0].amount < 0 && m.legs[0].deals.some(d => d.login === m.legs[0].login && d.amount < 0)); };
    // Confirming a request in api mode: the matched deal(s), or the reason there is none (logged). Manual mode and bank/USDT payouts: null.
    function mt5Confirm(u, p, d) {
      const m = payMatch(p); if (!m) return null;
      const comments = m.legs.map(x => "“" + x.comment + "”").join(" and ");
      if (d.mt5_ticket) {
        if (!m.ok) throw new CrmError("The MT5 deal no longer matches this request. Check the warnings, or confirm without a match and give the reason.");
        const want = String(d.mt5_ticket).split(/[\s,/#]+/).filter(Boolean).sort().join(), have = m.tickets.slice().sort().join();
        if (want !== have) throw new CrmError("That isn't the MT5 deal matched to this request. Reload and try again.");
        return { matched: true, tickets: m.tickets, amount: Math.abs(m.legs[0].amount), record: { matched: true, tickets: m.tickets, legs: m.legs.map(x => ({ leg: x.leg, ticket: x.ticket, login: x.login, amount: x.amount })), by: u.id, at: nowIso() } };
      }
      const why = clean(d.no_match_reason, 300);
      if (!why) throw new CrmError(m.seen ? `The MT5 deal doesn't match this request exactly (${m.warn.join("; ")}). Say why you confirm it anyway.` : `No MT5 deal with ${comments} was found. Say why you confirm without it (e.g. the MT5 comment is missing).`, 422, { no_match_reason: "Required" });
      return { matched: false, reason: why, record: { matched: false, reason: why, warn: m.warn.slice(0, 5), deals: m.legs.flatMap(x => x.deals.map(z => z.ticket)), by: u.id, at: nowIso() } };
    }
    // Balance deals with one of our prefixes but a reference we don't know (a typo in MT5 Manager, or an operation outside the system)
    function mt5UnknownRefs(days = 30) {
      const since = new Date(nowMs() - days * 864e5).toISOString(), refs = new Set(store.all("payments").map(p => String(p.reference || "").toUpperCase()).concat(store.all("bonuses").map(b => String(b.id).toUpperCase())));
      const out = [];
      balanceDealIndex().forEach((deals, key) => { const ref = key.slice(key.indexOf(" ") + 1); if (refs.has(ref)) return; deals.filter(d => d.time >= since).forEach(d => out.push({ ticket: d.ticket, login: d.login, amount: d.profit, time: d.time, comment: d.comment, ref: key })); });
      return out.sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 200);
    }
    // During the sync: tell operations what just appeared in MT5 (nothing is confirmed here)
    function mt5NoticeBalance(deals) {
      const idx = balanceDealIndex(), keys = new Set(), out = { seen: 0, unknown: 0 };
      deals.forEach(d => { const re = /(?:^|[^A-Za-z0-9])(TRF-OUT|TRF-IN|DEP|WD|IB|BONUS)[\s#:]+([A-Za-z0-9][A-Za-z0-9_-]{2,})/gi; let m; while ((m = re.exec(d.comment || ""))) keys.add(m[1].toUpperCase() + " " + m[2].toUpperCase()); });
      keys.forEach(key => {
        const ref = key.slice(key.indexOf(" ") + 1), p = store.all("payments").find(z => String(z.reference || "").toUpperCase() === ref), b = !p && store.all("bonuses").find(z => String(z.id).toUpperCase() === ref);
        if (p) { if (!OPEN_PAY.includes(p.status)) return; const m = payMatch(p, idx); out.seen++; const x = store.get("clients", p.client_id);
          opsUsers().forEach(z => notify(z.id, `${m && m.ok ? "👀 Seen in MT5" : "⚠️ Check in MT5"}: ${key} · ${x ? x.first_name + " " + x.last_name : ""}${m && !m.ok && m.warn.length ? " · " + m.warn[0] : ". Confirm it in Client money"}`, p.lead_id, "ops")); return; }
        if (b) { if (b.status !== "requested") return; out.seen++; store.all("users").filter(z => z.active !== false && (z.role === "manager" || z.role === "admin")).forEach(z => notify(z.id, `👀 Seen in MT5: ${key}. Confirm the $${b.amount} account`, b.lead_id, "bonus")); return; }
        out.unknown++; opsUsers().forEach(z => notify(z.id, `⚠️ MT5 balance deal with “${key}”, a reference we don't know. Check it in MT5 reconciliation`, null, "ops"));
      });
      return out;
    }
    // The $100 account: Absel Markets credits it in MT5 Manager with BONUS <id>
    function bonusMatch(b, idx) {
      if (mt5Mode() !== "api") return null;
      const m = matchLeg(idx || balanceDealIndex(), b.id, { leg: "bonus", login: digits(b.account_id), amount: b.amount }, b.status === "requested" ? b.created_at : null);
      return { legs: [m], ok: m.state === "match", seen: m.deals.length ? 1 : 0, tickets: m.state === "match" ? [m.ticket] : [], warn: m.warn ? [m.warn] : [], comment: m.comment };
    }

    /* =====================================================================
       IB / PARTNER PROGRAMME. An approved client becomes a partner with a code and links. Clients who register with the
       code are attributed for good (only partnerships can move them). Commission comes from real MT5 deals synced into
       mt5_deals: per lot for the client's IB (level 1) and an override for the IB's master (level 2), plus an optional CPA.
       Lines are never deleted: they are held, released, reversed or adjusted with a reason. Payouts are payments of type
       ib_payout with the same approval rules as withdrawals. Partners only ever see their clients masked.
       ===================================================================== */
    const isPartnerships = u => isAdmin(u) || u.role === "partnerships";
    const ibCfg = () => { const d = clone(DEFAULT_SETTINGS.ib), s = settings().ib || {}; return Object.assign(d, s, { symbol_groups: arr(s.symbol_groups).length ? s.symbol_groups : d.symbol_groups }); };
    const IB_DOC_KINDS = [{ id: "ib_company_reg", label: "Company registration certificate" }, { id: "ib_company_directors", label: "Register of directors and shareholders" }, { id: "ib_company_address", label: "Company proof of address" }];
    const SYMBOL_GROUPS = ["forex", "metals", "indices", "energy", "crypto", "other"];
    const IB_HOLD = { short: m => `Trade closed in under ${m}`, own: () => "Own trading (not paid)", fingerprint: () => "Under review: the client shares details with the partner", holdback: d => `CPA on hold until ${d} (holdback period)`, withdrawal: () => "CPA on hold: the client withdrew after the first deposit", manual: r => r || "On hold by the partnerships team" };
    const partnerOfClient = cid => store.all("partners").find(p => p.client_id === cid) || null;
    const ibByCode = code => { const c = clean(code, 12).toUpperCase(); return c ? store.all("partners").find(p => p.code === c) || null : null; };
    const maskName = x => x ? (clean(x.first_name, 40) + (x.last_name ? " " + clean(x.last_name, 40).charAt(0).toUpperCase() + "." : "")).trim() : "Client";
    const symbolGroup = sym => { for (const g of arr(ibCfg().symbol_groups)) { try { if (new RegExp(g.pattern).test(String(sym || ""))) return SYMBOL_GROUPS.includes(g.group) ? g.group : "other"; } catch (e) {} } return "other"; };
    const periodOf = iso => localDay(iso).slice(0, 7);
    const thisPeriod = () => periodOf(nowIso());
    function ibAudit(pt, u, action, before, after, note) { pt.audit = arr(pt.audit).concat([{ at: nowIso(), by: u ? u.id : "system", action, before: before === undefined ? null : before, after: after === undefined ? null : after, note: clean(note, 300) }]).slice(-500); }
    function genIbCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c; do { c = ""; for (let i = 0; i < 7; i++) c += a[Math.floor(Math.random() * a.length)]; } while (store.all("partners").some(p => p.code === c)); return c; }
    const partnerUsers = () => store.all("users").filter(x => x.active !== false && (x.role === "admin" || x.role === "partnerships"));
    const ibClientMail = (pt, tpl, vars) => { const x = store.get("clients", pt.client_id); if (x) clientMail(x, tpl, Object.assign({ code: pt.code || "" }, vars || {})); };

    /* ---------- plans ---------- */
    const rateFor = (plan, type, grp) => { const r = arr(plan && plan.rates); const hit = r.find(z => z.account_type === type && z.symbol_group === grp) || r.find(z => (z.account_type === "*" || !z.account_type) && z.symbol_group === grp); return hit ? Number(hit.per_lot) || 0 : 0; };
    const overrideFor = (plan, grp) => { const hit = arr(plan && plan.override_per_lot).find(z => z.symbol_group === grp); return hit ? Number(hit.per_lot) || 0 : 0; };
    function listIbPlans(u) { need(u, x => isPartnerships(x) || isOps(x)); return store.all("ib_plans").sort((a, b) => String(a.name).localeCompare(String(b.name))).map(p => Object.assign({}, p, { partners: store.all("partners").filter(z => z.plan_id === p.id && z.status === "approved").length })); }
    function saveIbPlan(u, p = {}) {
      need(u, isPartnerships, "Only the partnerships team can change commission plans.");
      const cur = p.id ? store.get("ib_plans", p.id) : null; if (p.id && !cur) throw new CrmError("Plan not found.", 404);
      const name = clean(p.name, 60); if (!name) throw new CrmError("Name the plan.", 422, { name: "Required" });
      const types = ["*"].concat(portalCfg().account_types.map(t => t.id)), num = (v, max = 1e6) => Math.max(0, Math.min(max, Math.round((Number(v) || 0) * 100) / 100));
      const rates = arr(p.rates).filter(r => r && SYMBOL_GROUPS.includes(r.symbol_group)).map(r => ({ account_type: types.includes(r.account_type) ? r.account_type : "*", symbol_group: r.symbol_group, per_lot: num(r.per_lot, 1000) })).slice(0, 60);
      const override_per_lot = arr(p.override_per_lot).filter(r => r && SYMBOL_GROUPS.includes(r.symbol_group)).map(r => ({ symbol_group: r.symbol_group, per_lot: num(r.per_lot, 1000) }));
      const c = p.cpa || {}, cpa = { enabled: !!c.enabled, amount: num(c.amount, 100000), min_deposit: num(c.min_deposit), min_lots: num(c.min_lots, 10000), within_days: Math.max(1, Math.min(365, Number(c.within_days) || 30)) };
      const plan = Object.assign(cur || { id: newId("PL"), created_at: nowIso() }, { name, active: p.active !== false, rates, override_per_lot, cpa, min_hold_seconds: Math.max(0, Math.min(86400, Number(p.min_hold_seconds ?? 120) || 0)), holdback_days: Math.max(0, Math.min(365, Number(p.holdback_days ?? 30) || 0)), updated_at: nowIso(), updated_by: u.id });
      const before = cur ? clone(cur) : null; store.put("ib_plans", plan);
      store.all("partners").filter(z => z.plan_id === plan.id).forEach(z => { ibAudit(z, u, "plan_changed", before && { rates: before.rates, override_per_lot: before.override_per_lot, cpa: before.cpa }, { rates, override_per_lot, cpa }, "Plan " + name + " edited"); store.put("partners", z); });
      return plan;
    }
    // "A 1-lot EURUSD trade pays $X to the IB and $Y to the master"
    function ibPlanPreview(u, planId, symbol, lots, type, masterPlanId) {
      need(u, x => isPartnerships(x) || isOps(x));
      const plan = store.get("ib_plans", planId), mp = masterPlanId ? store.get("ib_plans", masterPlanId) : plan, grp = symbolGroup(symbol), n = Number(lots) || 1;
      return { symbol: clean(symbol, 20), symbol_group: grp, lots: n, ib: money2(n * rateFor(plan, type || "*", grp)), master: money2(n * overrideFor(mp, grp)), cpa: plan && plan.cpa && plan.cpa.enabled ? plan.cpa.amount : 0 };
    }

    /* ---------- becoming an IB ---------- */
    function ibUploadDoc(c, f = {}) {
      const x = clientOf(c), kind = f.kind, pt = partnerOfClient(x.id);
      if (!pt || pt.kind !== "company") throw new CrmError("Company documents are for company partner applications.");
      const data = String(f.data || ""); if (!FILE_RE.test(data)) throw new CrmError("Upload a JPG, PNG, WebP image or a PDF."); if (data.length > 6.5e6) throw new CrmError("That file is too big. Keep it under 4 MB.");
      const rec = { id: newId("F"), lead_id: x.lead_id, client_id: x.id, partner_id: pt.id, kind, name: clean(f.name, 120) || kind, type: data.slice(5, data.indexOf(";")), size: Math.round(data.length * 0.75), data, created_by: "client", created_at: nowIso(), review: "pending" };
      store.put("files", rec);
      if (pt.compliance && pt.compliance.status !== "approved") { pt.compliance = Object.assign({}, pt.compliance, { status: "pending", updated_at: nowIso() }); store.put("partners", pt); }
      store.all("users").filter(z => z.active !== false && (z.role === "compliance" || z.role === "admin")).forEach(z => notify(z.id, `🏢 Company document for partner application: ${x.first_name} ${x.last_name}`, x.lead_id, "ops"));
      return { id: rec.id, kind };
    }
    function portalIbApply(c, d = {}, meta = {}) {
      const x = clientOf(c), cfg = ibCfg(); if (!cfg.enabled) throw new CrmError("The partner programme is closed right now.");
      if ((x.kyc || {}).status !== "approved") throw new CrmError("Your own documents must be approved before you apply. Upload them under Documents.");
      const cur = partnerOfClient(x.id); if (cur && cur.status !== "rejected") throw new CrmError(cur.status === "applied" ? "Your application is being reviewed." : "You're already a partner.");
      const kind = d.kind === "company" ? "company" : "individual", e = {};
      const company = kind === "company" ? { name: clean((d.company || {}).name, 120), reg_no: clean((d.company || {}).reg_no, 60), country: clean((d.company || {}).country, 80) } : null;
      if (company && !company.name) e.company_name = "Enter the company name"; if (company && !company.reg_no) e.reg_no = "Enter the registration number";
      const promotion = clean(d.promotion, 600); if (promotion.length < 10) e.promotion = "Tell us how you'll find clients";
      if (!d.accept) e.accept = "Accept the partner agreement";
      if (Object.keys(e).length) throw new CrmError("Please check the highlighted fields.", 422, e);
      const pt = Object.assign(cur || { id: newId("IB"), client_id: x.id, code: null, created_at: nowIso(), audit: [], notes: "" }, {
        status: "applied", kind, company, plan_id: null, parent_id: null, can_recruit: false, manager_id: null,
        application: { promotion, expected_clients: Math.max(0, Math.min(100000, Number(d.expected_clients) || 0)), website: clean(d.website, 200), applied_at: nowIso() },
        agreement: { version: cfg.agreement_version, accepted_at: nowIso(), ip: clean(meta.ip, 64) }, payout: { method: "mt5", account_id: "", details: "" },
        compliance: { status: kind === "company" ? "waiting" : "not_needed" }, reject_reason: "", approved_at: null, approved_by: null,
        referred_by_partner: (() => { const r = ibByCode(d.via); return r && r.status === "approved" && r.can_recruit ? r.id : null; })() });
      ibAudit(pt, null, cur ? "reapplied" : "applied", null, { kind, company }, "Applied in the client area");
      store.put("partners", pt);
      partnerUsers().forEach(z => notify(z.id, `🤝 New partner application: ${x.first_name} ${x.last_name}${company ? " (" + company.name + ")" : ""}`, x.lead_id, "partner"));
      portalLog(x, "Applied to become a partner" + (company ? " (company " + company.name + ")" : ""));
      clientMail(x, "tpl_ib_received", {});
      return ibPortalSummary(x);
    }
    const partnerRow = pt => {
      const x = store.get("clients", pt.client_id), plan = pt.plan_id ? store.get("ib_plans", pt.plan_id) : null, par = pt.parent_id ? store.get("partners", pt.parent_id) : null, parX = par && store.get("clients", par.client_id);
      const mine = store.all("clients").filter(c => c.partner_id === pt.id), month = thisPeriod(), lines = store.all("commissions").filter(l => l.partner_id === pt.id);
      return { id: pt.id, code: pt.code, status: pt.status, kind: pt.kind, company: pt.company, name: x ? x.first_name + " " + x.last_name : "", email: x ? x.email : "", country: x ? x.country : "", client_id: pt.client_id, plan_id: pt.plan_id, plan_name: plan ? plan.name : "", parent_id: pt.parent_id, parent_code: par ? par.code : "", parent_name: parX ? parX.first_name + " " + parX.last_name : "",
        can_recruit: !!pt.can_recruit, compliance: pt.compliance || {}, application: pt.application || {}, created_at: pt.created_at, approved_at: pt.approved_at, manager_id: pt.manager_id, manager_name: pt.manager_id ? userName(pt.manager_id) : "",
        clients: mine.length, ftds: mine.filter(c => store.all("payments").some(p => p.client_id === c.id && p.type === "deposit" && p.status === "completed")).length,
        lots_month: Math.round(sum(lines.filter(l => l.kind === "lot" && l.level === 1 && l.period === month && l.status !== "reversed").map(l => l.lots)) * 100) / 100,
        commission_month: money2(sum(lines.filter(l => l.period === month && l.status !== "reversed").map(l => l.amount))), subs: store.all("partners").filter(z => z.parent_id === pt.id).length, reject_reason: pt.reject_reason || "" };
    };
    function listPartners(u, f = {}) {
      need(u, x => isPartnerships(x) || isKyc(x), "The partner list is for the partnerships team.");
      let rows = store.all("partners"); const st = f.status || (isPartnerships(u) ? "" : "applied");
      if (st) rows = rows.filter(p => p.status === st); if (f.plan_id) rows = rows.filter(p => p.plan_id === f.plan_id); if (f.parent_id) rows = rows.filter(p => p.parent_id === f.parent_id);
      let out = rows.map(partnerRow); const q = lc(f.q); if (q) out = out.filter(r => (r.code + " " + r.name + " " + r.email + " " + (r.company ? r.company.name : "")).toLowerCase().includes(q));
      return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500);
    }
    function reviewPartnerDocs(u, id, ok, note) {
      need(u, isKyc, "Only compliance reviews partner documents.");
      const pt = store.get("partners", id); if (!pt) throw new CrmError("Partner not found.", 404); if (pt.kind !== "company") throw new CrmError("Only company partners need this review.");
      if (!ok && !clean(note)) throw new CrmError("Say what's missing.", 422, { note: "Required" });
      const before = clone(pt.compliance || {}); pt.compliance = { status: ok ? "approved" : "rejected", by: u.id, at: nowIso(), note: clean(note, 300) };
      store.all("files").filter(z => z.partner_id === pt.id && z.review === "pending").forEach(z => { z.review = ok ? "approved" : "rejected"; store.put("files", z); });
      ibAudit(pt, u, "compliance_" + pt.compliance.status, before, pt.compliance, note); store.put("partners", pt);
      partnerUsers().forEach(z => notify(z.id, `Compliance ${ok ? "approved" : "rejected"} the company documents of partner application ${pt.company ? pt.company.name : pt.id}`, null, "partner"));
      return partnerRow(pt);
    }
    // A master IB has no master (two levels)
    function checkParent(pt, parentId) {
      if (!parentId) return null; const par = store.get("partners", parentId);
      if (!par || par.status !== "approved") throw new CrmError("Choose an approved master IB.", 422, { parent_id: "Not approved" });
      if (par.id === pt.id) throw new CrmError("A partner can't be its own master.", 422, { parent_id: "Same partner" });
      if (par.parent_id) throw new CrmError("That partner is a sub-IB; a master must be top level (two levels only).", 422, { parent_id: "Sub-IB" });
      if (store.all("partners").some(z => z.parent_id === pt.id)) throw new CrmError("This partner has sub-IBs of its own, so it can't get a master.", 422, { parent_id: "Has sub-IBs" });
      return par.id;
    }
    function decidePartner(u, id, d = {}) {
      need(u, isPartnerships, "Only the partnerships manager approves partners.");
      const pt = store.get("partners", id); if (!pt || pt.status !== "applied") throw new CrmError("This application was already decided.");
      const x = store.get("clients", pt.client_id);
      if (d.decision === "reject") {
        const why = clean(d.reason, 300); if (!why) throw new CrmError("Say why (the applicant is told).", 422, { reason: "Required" });
        Object.assign(pt, { status: "rejected", reject_reason: why, decided_at: nowIso(), decided_by: u.id }); ibAudit(pt, u, "rejected", "applied", "rejected", why); store.put("partners", pt);
        clientMail(x, "tpl_ib_rejected", { reason: why }); return partnerRow(pt);
      }
      if (d.decision !== "approve") throw new CrmError("Unknown decision.");
      if (pt.kind === "company" && (pt.compliance || {}).status !== "approved") throw new CrmError("Compliance must approve the company documents first.");
      const plan = store.get("ib_plans", d.plan_id); if (!plan || plan.active === false) throw new CrmError("Choose an active commission plan.", 422, { plan_id: "Required" });
      const parent = checkParent(pt, d.parent_id || pt.referred_by_partner || null);
      Object.assign(pt, { status: "approved", code: pt.code || genIbCode(), plan_id: plan.id, parent_id: parent, can_recruit: !!d.can_recruit, manager_id: d.manager_id && store.get("users", d.manager_id) ? d.manager_id : u.id, approved_at: nowIso(), approved_by: u.id, reject_reason: "" });
      ibAudit(pt, u, "approved", "applied", { code: pt.code, plan: plan.name, parent_id: parent, can_recruit: pt.can_recruit }, clean(d.note, 300)); store.put("partners", pt);
      portalLog(x, `Approved as partner ${pt.code} (${plan.name})`, { by: u });
      clientMail(x, "tpl_ib_approved", { code: pt.code, link: ibLink(pt) });
      return partnerRow(pt);
    }
    function updatePartner(u, id, d = {}) {
      need(u, isPartnerships, "Only the partnerships team can change partners.");
      const pt = store.get("partners", id); if (!pt || !["approved", "suspended"].includes(pt.status)) throw new CrmError("Partner not found.", 404);
      const why = clean(d.reason, 300);
      if (d.plan_id !== undefined && d.plan_id !== pt.plan_id) { const plan = store.get("ib_plans", d.plan_id); if (!plan) throw new CrmError("Choose a plan.", 422, { plan_id: "Required" }); if (!why) throw new CrmError("Give a reason for the plan change.", 422, { reason: "Required" }); ibAudit(pt, u, "plan_changed", pt.plan_id, plan.id, why); pt.plan_id = plan.id; }
      if (d.parent_id !== undefined && (d.parent_id || null) !== (pt.parent_id || null)) { const par = checkParent(pt, d.parent_id || null); if (!why) throw new CrmError("Give a reason for the change of master.", 422, { reason: "Required" }); ibAudit(pt, u, "master_changed", pt.parent_id, par, why); pt.parent_id = par; }
      if (d.can_recruit !== undefined && !!d.can_recruit !== !!pt.can_recruit) { ibAudit(pt, u, "can_recruit", !!pt.can_recruit, !!d.can_recruit, why); pt.can_recruit = !!d.can_recruit; }
      if (d.manager_id !== undefined && d.manager_id !== pt.manager_id) { ibAudit(pt, u, "manager", pt.manager_id, d.manager_id, why); pt.manager_id = d.manager_id || null; }
      if (d.notes !== undefined) pt.notes = clean(d.notes, 2000);
      if (d.status === "suspended" || d.status === "approved") {
        if (d.status !== pt.status) { if (!why) throw new CrmError("Give a reason.", 422, { reason: "Required" }); ibAudit(pt, u, d.status === "suspended" ? "suspended" : "reactivated", pt.status, d.status, why); pt.status = d.status; }
      }
      store.put("partners", pt); return partnerRow(pt);
    }
    // Only partnerships or admin can move a client to another IB (or remove the IB), with a reason. Both IBs are told, without client details.
    function ibReassignClient(u, clientId, partnerId, reason) {
      need(u, isPartnerships, "Only the partnerships manager can reassign a referred client.");
      const x = store.get("clients", clientId); if (!x) throw new CrmError("Client not found.", 404);
      const why = clean(reason, 300); if (!why) throw new CrmError("Give a reason.", 422, { reason: "Required" });
      const to = partnerId ? store.get("partners", partnerId) : null; if (partnerId && (!to || to.status !== "approved")) throw new CrmError("Choose an approved partner.");
      if (to && to.client_id === x.id) throw new CrmError("A partner can't be attributed its own account.");
      const from = x.partner_id ? store.get("partners", x.partner_id) : null; if ((from && from.id) === (to && to.id)) throw new CrmError("That's already the partner.");
      x.partner_id = to ? to.id : null; x.partner_locked_at = nowIso(); store.put("clients", x);
      const l = leadOfClient(x); if (l) { l.partner_id = x.partner_id; l.ib_client = !!to; activity(l, u, "partner", { label: `Partner changed: ${from ? from.code : "none"} → ${to ? to.code : "none"} (${why})` }); saveLead(l); }
      const ref = "client " + x.id.slice(-5).toUpperCase();
      if (from) { ibAudit(from, u, "client_moved_out", ref, to ? to.code : null, why); store.put("partners", from); ibClientMail(from, "tpl_ib_reassigned", { reason: `A referred ${ref} was moved from your account. Reason: ${why}` }); }
      if (to) { ibAudit(to, u, "client_moved_in", from ? from.code : null, ref, why); store.put("partners", to); ibClientMail(to, "tpl_ib_reassigned", { reason: `A referred ${ref} was added to your account. Reason: ${why}` }); }
      return { client_id: x.id, from: from ? from.code : null, to: to ? to.code : null };
    }

    /* ---------- links, clicks and attribution ---------- */
    const ibLink = (pt, campaign, join) => (settings().site_url || "https://abselglobal.com").replace(/\/+$/, "") + "/r/" + pt.code + (campaign ? "/" + encodeURIComponent(campaign) : "") + (join ? "?join=partner" : "");
    // /r/CODE[/campaign]: count the click (hashed IP, once per 30 minutes) and say where to send the visitor
    function ibClick(code, campaign, ipHash) {
      const pt = ibByCode(code); if (!pt || pt.status !== "approved") return { ok: false };
      const camp = clean(campaign, 60).replace(/[^\w.-]/g, "").slice(0, 60), h = clean(ipHash, 80), since = new Date(nowMs() - 30 * 60000).toISOString();
      const recent = h && store.all("ib_clicks").some(k => k.partner_id === pt.id && k.ip_hash === h && k.at >= since);
      if (!recent) store.put("ib_clicks", { id: newId("K"), partner_id: pt.id, campaign: camp, ip_hash: h, at: nowIso() });
      return { ok: true, code: pt.code, campaign: camp, counted: !recent };
    }
    // Attribute a lead to the IB whose code came with it (website link, register form, lead API, Meta, Google).
    // Never the IB's own email or phone; a lead that already has an IB keeps it (first attribution wins).
    function ibAttributeLead(l, code, how) {
      const pt = ibByCode(code); if (!pt || pt.status !== "approved" || l.partner_id) return null;
      const ib = store.get("clients", pt.client_id);
      if (ib && ((l.email && ib.email === l.email) || (l.phone_key && l.phone_key.length >= 7 && phoneKey(ib.dial_code, ib.phone) === l.phone_key) || l.client_id === ib.id)) { activity(l, SYSTEM, "partner", { label: `Partner code ${pt.code} ignored: it's the partner's own details` }); return null; }
      l.partner_id = pt.id; l.ib_client = true; l.ib_code = pt.code;
      if (!l.utm_source || l.utm_source === "client-area") { l.utm_source = "ib"; l.utm_campaign = l.utm_campaign || pt.code; }
      l.tags = [...new Set(arr(l.tags).concat(["IB client"]))];
      activity(l, SYSTEM, "partner", { label: `Referred by partner ${pt.code} (${how})` });
      return pt;
    }
    function ibAttachClient(x, l) {
      if (!l || !l.partner_id || x.partner_id) return;
      const pt = store.get("partners", l.partner_id); if (!pt || pt.client_id === x.id) return;
      x.partner_id = pt.id; x.partner_locked_at = nowIso(); store.put("clients", x);
      ibAudit(pt, null, "client_attributed", null, "client " + x.id.slice(-5).toUpperCase(), "Registered with the partner's code"); store.put("partners", pt);
      ibClientMail(pt, "tpl_ib_referral", {});
    }

    /* ---------- commission engine (runs after each deal sync; network-free) ---------- */
    const lineId = (level, ticket, ptId) => "CM" + level + "_" + ticket + "_" + ptId;
    const ipsOf = x => new Set([x && x.signup_ip].concat(arr(x && x.logins).map(g => g.ip)).filter(ip => ip && !/^(127\.|::1|::ffff:127\.)/.test(ip)));
    function ibFingerprint(x, pt) {
      const ib = store.get("clients", pt.client_id); if (!ib || !x) return false;
      const a = ipsOf(x), b = ipsOf(ib); for (const ip of a) if (b.has(ip)) return true;
      const det = c => new Set(store.all("payments").filter(p => p.client_id === c.id && p.payout_details).map(p => lc(p.payout_details).replace(/\s+/g, "")).concat(arr(c.payout_details_seen)));
      const da = det(x), db = det(ib); for (const v of da) if (v && db.has(v)) return true;
      return false;
    }
    function ibHoldFor(d, x, pt, plan) {
      const par = pt.parent_id ? store.get("partners", pt.parent_id) : null;
      if (x.id === pt.client_id || (par && par.client_id === x.id)) return ["own", IB_HOLD.own()];
      const minS = Number(plan.min_hold_seconds ?? 120) || 0;
      if (minS && d.position_id) { const open = store.all("mt5_deals").find(z => z.position_id === d.position_id && z.login === d.login && z.entry === 0 && TRADE_ACTIONS.includes(z.action)); if (open && (Date.parse(d.time) - Date.parse(open.time)) / 1000 < minS) return ["short", IB_HOLD.short(minS >= 120 && minS % 60 === 0 ? minS / 60 + " minutes" : minS + " seconds")]; }
      if (ibFingerprint(x, pt)) return ["fingerprint", IB_HOLD.fingerprint()];
      return null;
    }
    function ibLine(pt, o) {
      const id = o.id; if (store.get("commissions", id)) return null;
      const line = Object.assign({ id, partner_id: pt.id, level: 1, kind: "lot", client_id: null, account_id: null, deal_ticket: null, symbol: "", symbol_group: "", lots: 0, rate: 0, amount: 0, period: thisPeriod(), status: "pending", hold_reason: "", hold_code: "", payout_id: null, created_at: nowIso(), decided_by: null }, o);
      store.put("commissions", line); return line;
    }
    function ibDealLines(d) {
      const x = store.get("clients", d.client_id); if (!x || !x.partner_id) return 0;
      const pt = store.get("partners", x.partner_id); if (!pt || pt.status !== "approved") return 0;   // suspended: no new lines
      if (x.partner_locked_at && d.time < x.partner_locked_at) return 0;                                // only trades after attribution
      const a = store.get("accounts", d.account_id); if (!a || a.kind !== "live") return 0;
      const plan = store.get("ib_plans", pt.plan_id); if (!plan) return 0;
      const grp = symbolGroup(d.symbol), period = periodOf(d.time), hold = ibHoldFor(d, x, pt, plan); let n = 0;
      const base = { client_id: x.id, account_id: a.id, deal_ticket: d.ticket, symbol: d.symbol, symbol_group: grp, lots: d.lots, period, status: hold ? "held" : "pending", hold_code: hold ? hold[0] : "", hold_reason: hold ? hold[1] : "", deal_time: d.time };
      const r1 = rateFor(plan, a.type, grp); if (r1 > 0 && ibLine(pt, Object.assign({ id: lineId(1, d.ticket, pt.id), level: 1, rate: r1, amount: money2(d.lots * r1) }, base))) n++;
      const par = pt.parent_id ? store.get("partners", pt.parent_id) : null;
      if (par && par.status === "approved") { const pplan = store.get("ib_plans", par.plan_id), r2 = overrideFor(pplan, grp); if (r2 > 0 && ibLine(par, Object.assign({ id: lineId(2, d.ticket, par.id), level: 2, rate: r2, amount: money2(d.lots * r2), via_partner_id: pt.id }, base))) n++; }
      if (hold && hold[0] === "fingerprint" && !x.ib_flagged) { x.ib_flagged = nowIso(); store.put("clients", x); partnerUsers().forEach(z => notify(z.id, `🚩 Possible IB abuse: a client of ${pt.code} shares sign-in IP or payout details with the partner. Commission is on hold.`, x.lead_id, "partner")); }
      return n;
    }
    // New closing trades (out, in/out, out-by) of attributed clients → commission lines. Idempotent: one line per partner, level and deal.
    function ibProcessDeals() {
      const ibClients = new Set(store.all("clients").filter(x => x.partner_id).map(x => x.id)); if (!ibClients.size) return 0;
      let n = 0;
      store.all("mt5_deals").filter(d => !d.ib_done && d.client_id && ibClients.has(d.client_id) && TRADE_ACTIONS.includes(d.action) && CLOSING_ENTRIES.includes(d.entry)).forEach(d => { n += ibDealLines(d); d.ib_done = nowIso(); store.put("mt5_deals", d); });
      return n + ibCheckCpa();
    }
    // A deal MT5 changed after we paid on it: its lines are reversed (never deleted)
    function ibDealChanged(d, why) {
      store.all("commissions").filter(l => l.deal_ticket === d.ticket && l.kind === "lot" && l.status !== "reversed").forEach(l => {
        try { ibReverseLine(l, why, SYSTEM); } // a line in an open payout can't be reversed by the sync: the partnerships team is told instead
        catch (e) { partnerUsers().forEach(z => notify(z.id, `⚠️ ${why} (deal #${d.ticket}), but commission line ${l.id} is in an open payout. Reject the payout or reverse the line by hand.`, null, "partner")); }
      });
    }
    function ibReverseLine(l, why, u) {
      if (l.status === "paid") { // already paid: claw back with a negative adjustment in the current month
        const pt = store.get("partners", l.partner_id); ibLine(pt, { id: newId("CA"), kind: "adjustment", level: l.level, client_id: l.client_id, amount: -l.amount, period: thisPeriod(), status: "pending", hold_reason: "", note: "Claw-back of " + l.id + ": " + why, reverses: l.id, decided_by: u ? u.id : "system" });
        return;
      }
      if (l.payout_id) { const p = store.get("payments", l.payout_id); if (p && OPEN_PAY.includes(p.status)) throw new CrmError("This line is in an open payout. Reject the payout first."); }
      Object.assign(l, { status: "reversed", reversed_reason: clean(why, 300), reversed_at: nowIso(), decided_by: u ? u.id : "system", payout_id: null }); store.put("commissions", l);
    }
    // CPA: first deposit ≥ min, KYC approved, ≥ min lots within the window → one line, held for the holdback period
    function ibCheckCpa() {
      let n = 0;
      store.all("clients").filter(x => x.partner_id).forEach(x => {
        const pt = store.get("partners", x.partner_id); if (!pt || pt.status !== "approved") return;
        const plan = store.get("ib_plans", pt.plan_id); if (!plan || !plan.cpa || !plan.cpa.enabled || !(plan.cpa.amount > 0)) return;
        const id = "CP_" + pt.id + "_" + x.id; if (store.get("commissions", id) || (x.kyc || {}).status !== "approved") return;
        const ftd = store.all("payments").filter(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed" && !p.chargeback).sort((a, b) => a.completed_at.localeCompare(b.completed_at))[0];
        if (!ftd || ftd.amount < (plan.cpa.min_deposit || 0)) return;
        const end = new Date(Date.parse(ftd.completed_at) + plan.cpa.within_days * 864e5).toISOString(), accs = new Set(store.all("accounts").filter(a => a.client_id === x.id && a.kind === "live").map(a => a.id));
        const lots = sum(store.all("mt5_deals").filter(d => accs.has(d.account_id) && TRADE_ACTIONS.includes(d.action) && CLOSING_ENTRIES.includes(d.entry) && d.time >= ftd.completed_at && d.time <= end).map(d => d.lots));
        if (lots < (plan.cpa.min_lots || 0)) return;
        const until = new Date(nowMs() + (plan.holdback_days || 0) * 864e5).toISOString();
        const own = x.id === pt.client_id;
        if (ibLine(pt, { id, kind: "cpa", level: 1, client_id: x.id, amount: money2(plan.cpa.amount), period: thisPeriod(), status: "held", hold_code: own ? "own" : "holdback", hold_reason: own ? IB_HOLD.own() : IB_HOLD.holdback(localDay(until)), hold_until: until, ftd_payment_id: ftd.id, lots: Math.round(lots * 100) / 100 })) n++;
      });
      return n;
    }
    // Daily: CPA past its holdback becomes payable if the first deposit is still there; old clicks are deleted
    function ibTick() {
      const now = nowIso(); let released = 0;
      store.all("commissions").filter(l => l.kind === "cpa" && l.status === "held" && l.hold_code === "holdback" && l.hold_until <= now).forEach(l => {
        const p = store.get("payments", l.ftd_payment_id);
        if (!p || p.status !== "completed" || p.chargeback) { ibReverseLine(l, "The first deposit was reversed", SYSTEM); return; }
        const wd = store.all("payments").some(w => w.client_id === p.client_id && w.type === "withdrawal" && (w.status === "completed" || (OPEN_PAY.includes(w.status) && debitSeen(w))) && w.created_at >= p.completed_at);
        if (wd) { l.hold_code = "withdrawal"; l.hold_reason = IB_HOLD.withdrawal(); store.put("commissions", l); partnerUsers().forEach(z => notify(z.id, `CPA ${l.id} kept on hold: the client withdrew after the first deposit. Release or reverse it in the partner's ledger.`, null, "partner")); return; }
        Object.assign(l, { status: "pending", hold_code: "", hold_reason: "", period: thisPeriod(), released_at: now }); store.put("commissions", l); released++;
      });
      const cut = new Date(nowMs() - (Number(ibCfg().click_days) || 180) * 864e5).toISOString();
      store.all("ib_clicks").filter(k => k.at < cut).forEach(k => store.remove("ib_clicks", k.id));
      return released;
    }
    // Chargeback or a deposit reversed at the bank: recorded by operations; the related CPA is reversed
    function markChargeback(u, id, reason) {
      need(u, isOps, "Only operations can record a chargeback.");
      const p = store.get("payments", id); if (!p || p.type !== "deposit" || p.status !== "completed") throw new CrmError("Choose a completed deposit.");
      const why = clean(reason, 300); if (!why) throw new CrmError("Give the reason.", 422, { reason: "Required" });
      p.chargeback = { at: nowIso(), by: u.id, reason: why }; store.put("payments", p);
      store.all("commissions").filter(l => l.kind === "cpa" && l.ftd_payment_id === p.id && l.status !== "reversed").forEach(l => ibReverseLine(l, "Chargeback: " + why, u));
      portalLog(store.get("clients", p.client_id), `Chargeback recorded on deposit ${p.reference}: ${why}`, { by: u });
      return pubPayment(p);
    }

    /* ---------- month close, holds, adjustments ---------- */
    function ibMonthReview(u, f = {}) {
      need(u, isPartnerships, "Month close is for the partnerships team.");
      const cur = thisPeriod(), period = /^\d{4}-\d{2}$/.test(f.period || "") ? f.period : periodOf(new Date(Date.parse(cur + "-15T12:00:00Z") - 31 * 864e5).toISOString());
      const lines = store.all("commissions").filter(l => l.period === period);
      const rows = [...groupBy(lines, l => l.partner_id)].map(([pid, list]) => { const pt = store.get("partners", pid) || {}, x = store.get("clients", pt.client_id), s2 = st => list.filter(l => l.status === st);
        return { partner_id: pid, code: pt.code, name: x ? x.first_name + " " + x.last_name : "", status: pt.status, pending: s2("pending").length, pending_amount: money2(sum(s2("pending").map(l => l.amount))), held: s2("held").length, held_amount: money2(sum(s2("held").map(l => l.amount))), approved_amount: money2(sum(s2("approved").map(l => l.amount)) + sum(s2("paid").map(l => l.amount))), reversed: s2("reversed").length, lots: Math.round(sum(list.filter(l => l.kind === "lot" && l.level === 1 && l.status !== "reversed").map(l => l.lots)) * 100) / 100 }; })
        .sort((a, b) => b.pending_amount - a.pending_amount);
      return { period, current: cur, closable: period < cur, rows, totals: { pending: money2(sum(rows.map(r => r.pending_amount))), held: money2(sum(rows.map(r => r.held_amount))), approved: money2(sum(rows.map(r => r.approved_amount))) } };
    }
    function ibApprovePeriod(u, partnerId, period) {
      need(u, isPartnerships, "Only the partnerships manager approves commission.");
      if (!/^\d{4}-\d{2}$/.test(period || "") || period >= thisPeriod()) throw new CrmError("A month can be approved once it has ended.");
      const pt = store.get("partners", partnerId); if (!pt) throw new CrmError("Partner not found.", 404);
      const lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.period <= period && l.status === "pending");
      lines.forEach(l => { l.status = "approved"; l.decided_by = u.id; l.approved_at = nowIso(); store.put("commissions", l); });
      const amt = money2(sum(lines.map(l => l.amount)));
      ibAudit(pt, u, "month_approved", null, { period, lines: lines.length, amount: amt }, ""); store.put("partners", pt);
      if (lines.length) ibClientMail(pt, "tpl_ib_statement", { period, amount: "$" + amt.toLocaleString() });
      return { approved: lines.length, amount: amt };
    }
    function ibLineAction(u, id, action, reason) {
      need(u, isPartnerships, "Only the partnerships team can change commission lines.");
      const l = store.get("commissions", id); if (!l) throw new CrmError("Line not found.", 404);
      const why = clean(reason, 300); if (!why) throw new CrmError("Give a reason.", 422, { reason: "Required" });
      const pt = store.get("partners", l.partner_id), before = l.status;
      if (l.payout_id && action !== "reverse") throw new CrmError("This line is in a payout request.");
      if (action === "hold") { if (!["pending", "approved"].includes(l.status)) throw new CrmError("Only pending or approved lines can be held."); Object.assign(l, { status: "held", hold_code: "manual", hold_reason: IB_HOLD.manual(why), decided_by: u.id }); }
      else if (action === "release") { if (l.status !== "held") throw new CrmError("Only held lines can be released."); Object.assign(l, { status: "pending", hold_code: "", hold_reason: "", released_at: nowIso(), decided_by: u.id }); }
      else if (action === "reverse") { if (l.status === "reversed") throw new CrmError("Already reversed."); ibReverseLine(l, why, u); }
      else throw new CrmError("Unknown action.");
      store.put("commissions", l); ibAudit(pt, u, "line_" + action, { id: l.id, status: before }, { id: l.id, status: l.status }, why); store.put("partners", pt);
      return l;
    }
    function ibAdjust(u, partnerId, amount, reason, period) {
      need(u, isPartnerships, "Only the partnerships team can adjust commission.");
      const pt = store.get("partners", partnerId); if (!pt) throw new CrmError("Partner not found.", 404);
      const amt = money2(amount); if (!amt) throw new CrmError("Enter the amount (negative to deduct).", 422, { amount: "Required" });
      const why = clean(reason, 300); if (!why) throw new CrmError("Give a reason.", 422, { reason: "Required" });
      const l = ibLine(pt, { id: newId("CA"), kind: "adjustment", level: 1, amount: amt, period: /^\d{4}-\d{2}$/.test(period || "") ? period : thisPeriod(), status: "pending", note: why, decided_by: u.id });
      ibAudit(pt, u, "adjustment", null, { id: l.id, amount: amt, period: l.period }, why); store.put("partners", pt);
      return l;
    }

    /* ---------- payouts: payments of type ib_payout ---------- */
    const ibBalance = pt => { const ls = store.all("commissions").filter(l => l.partner_id === pt.id), s2 = f => money2(sum(ls.filter(f).map(l => l.amount)));
      return { pending: s2(l => l.status === "pending"), held: s2(l => l.status === "held"), approved: s2(l => l.status === "approved"), paid: s2(l => l.status === "paid"), available: s2(l => l.status === "approved" && !l.payout_id), in_payout: s2(l => l.status === "approved" && l.payout_id) }; };
    function portalIbPayout(c, d = {}) {
      const x = clientOf(c), pt = partnerOfClient(x.id); if (!pt || !["approved", "suspended"].includes(pt.status)) throw new CrmError("Partner account not found.", 404);
      const lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.status === "approved" && !l.payout_id), amount = money2(sum(lines.map(l => l.amount))), min = Number(ibCfg().payout_min) || 50;
      if (amount < min) throw new CrmError(`You can request a payout from $${min}. Available now: $${amount}.`);
      const method = ["mt5", "bank", "usdt"].includes(d.method) ? d.method : null; if (!method) throw new CrmError("Choose how you want to be paid.", 422, { method: "Required" });
      let acc = null, details = "";
      if (method === "mt5") { acc = store.get("accounts", d.account_id); if (!acc || acc.client_id !== x.id || acc.kind !== "live" || acc.status !== "open") throw new CrmError("Choose one of your open live accounts.", 422, { account_id: "Required" }); }
      else { details = clean(d.details, 400); if (details.length < 6) throw new CrmError(method === "bank" ? "Enter your bank details (IBAN or account number, bank name)." : "Enter your USDT address and network.", 422, { details: "Required" }); }
      const p = newPayment(x, "ib_payout", { reference: "I-" + rand(6).toUpperCase(), account_id: acc ? acc.id : null, method, method_name: { mt5: "To my MT5 account", bank: "Bank transfer", usdt: "USDT" }[method], amount, payout_details: details, ib: { partner_id: pt.id, code: pt.code, lines: lines.length } });
      lines.forEach(l => { l.payout_id = p.id; store.put("commissions", l); });
      pt.payout = { method, account_id: acc ? acc.id : "", details }; ibAudit(pt, null, "payout_requested", null, { payment: p.reference, amount }, ""); store.put("partners", pt);
      opsUsers().concat(partnerUsers()).filter((z, i, a) => a.findIndex(y => y.id === z.id) === i).forEach(z => notify(z.id, `🤝 IB payout requested: $${amount} · ${pt.code} (${p.method_name})`, x.lead_id, "ops"));
      portalLog(x, `Partner payout request ${p.reference}: $${amount} (${p.method_name})`);
      return clientPayment(p);
    }
    // Called when a payout completes or is rejected
    function ibPayoutClosed(p, u) {
      if (p.type !== "ib_payout") return;
      const pt = store.get("partners", (p.ib || {}).partner_id), lines = store.all("commissions").filter(l => l.payout_id === p.id);
      if (p.status === "completed") { lines.forEach(l => { l.status = "paid"; l.paid_at = nowIso(); store.put("commissions", l); }); if (pt) { ibAudit(pt, u, "payout_paid", null, { payment: p.reference, amount: p.amount }, p.ext_reference); store.put("partners", pt); } }
      else { lines.forEach(l => { l.payout_id = null; store.put("commissions", l); }); if (pt) { ibAudit(pt, u, "payout_" + p.status, null, { payment: p.reference }, p.reject_reason); store.put("partners", pt); } }
    }

    /* ---------- the Partner section in the client area (masked: no email, phone, documents, login or balance) ---------- */
    function ibPortalSummary(x) {
      const pt = partnerOfClient(x.id), cfg = ibCfg();
      if (!pt) return { partner: null, can_apply: cfg.enabled && (x.kyc || {}).status === "approved", kyc: (x.kyc || {}).status || "none", agreement: { version: cfg.agreement_version, text: cfg.agreement_text }, doc_kinds: IB_DOC_KINDS };
      const plan = pt.plan_id ? store.get("ib_plans", pt.plan_id) : null;
      return { partner: { status: pt.status, code: pt.code, kind: pt.kind, company: pt.company ? { name: pt.company.name } : null, can_recruit: !!pt.can_recruit, reject_reason: pt.status === "rejected" ? pt.reject_reason : "", applied_at: (pt.application || {}).applied_at, approved_at: pt.approved_at,
          compliance: pt.kind === "company" ? (pt.compliance || {}).status : null, plan: plan ? { name: plan.name, rates: plan.rates, override_per_lot: plan.override_per_lot, cpa: plan.cpa, min_hold_seconds: plan.min_hold_seconds } : null,
          links: pt.code ? { main: ibLink(pt), recruit: pt.can_recruit ? ibLink(pt, "", true) : "", base: ibLink(pt).replace(/\/r\/.*/, "/r/" + pt.code) } : null, agreement: pt.agreement, payout: pt.payout, docs: store.all("files").filter(z => z.partner_id === pt.id).map(z => ({ id: z.id, kind: z.kind, name: z.name, status: z.review })) },
        balance: ibBalance(pt), payout_min: Number(cfg.payout_min) || 50, agreement: { version: cfg.agreement_version, text: cfg.agreement_text }, doc_kinds: IB_DOC_KINDS };
    }
    const ibOf = c => { const x = clientOf(c), pt = partnerOfClient(x.id); if (!pt || !["approved", "suspended"].includes(pt.status)) throw new CrmError("Your partner account isn't active.", 403); return { x, pt }; };
    const rangeOf = f => { const to = /^\d{4}-\d{2}-\d{2}$/.test(f.to || "") ? f.to : localDay(nowIso()), from = /^\d{4}-\d{2}-\d{2}$/.test(f.from || "") ? f.from : to.slice(0, 8) + "01"; return { from, to, inR: iso => { const d = localDay(iso); return !!iso && d >= from && d <= to; } }; };
    const clientStage = x => { const funded = store.all("payments").some(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed"), trading = store.all("accounts").some(a => a.client_id === x.id && a.kind === "live" && a.trading_started_at); return trading ? "trading" : funded ? "funded" : (x.kyc || {}).status === "approved" ? "kyc" : "signed_up"; };
    function portalIbMe(c) { return ibPortalSummary(clientOf(c)); }
    function portalIbDashboard(c, f = {}) {
      const { pt } = ibOf(c), r = rangeOf(f), cls = store.all("clients").filter(x => x.partner_id === pt.id);
      const deps = store.all("payments").filter(p => cls.some(x => x.id === p.client_id) && p.status === "completed" && ["deposit", "withdrawal"].includes(p.type) && r.inR(p.completed_at));
      const ftds = cls.filter(x => { const f1 = store.all("payments").filter(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed").sort((a, b) => a.completed_at.localeCompare(b.completed_at))[0]; return f1 && r.inR(f1.completed_at); });
      const lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.status !== "reversed"), inLines = lines.filter(l => r.inR(l.deal_time || l.created_at));
      const clicks = store.all("ib_clicks").filter(k => k.partner_id === pt.id && r.inR(k.at));
      const days = []; for (let d = new Date(r.from + "T12:00:00Z"); d.toISOString().slice(0, 10) <= r.to && days.length < 93; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
      return { range: { from: r.from, to: r.to }, clicks: clicks.length, signups: cls.filter(x => r.inR(x.created_at)).length, kyc_approved: cls.filter(x => (x.kyc || {}).status === "approved" && r.inR(x.kyc.decided_at)).length, ftd: ftds.length,
        net_deposits: money2(sum(deps.filter(p => p.type === "deposit").map(p => p.amount)) - sum(deps.filter(p => p.type === "withdrawal").map(p => p.amount))),
        lots: Math.round(sum(inLines.filter(l => l.kind === "lot" && l.level === 1).map(l => l.lots)) * 100) / 100,
        commission: { pending: money2(sum(inLines.filter(l => ["pending", "held"].includes(l.status)).map(l => l.amount))), approved: money2(sum(inLines.filter(l => l.status === "approved").map(l => l.amount))), paid: money2(sum(inLines.filter(l => l.status === "paid").map(l => l.amount))) },
        balance: ibBalance(pt), daily: days.map(d => ({ day: d, clicks: clicks.filter(k => localDay(k.at) === d).length, signups: cls.filter(x => localDay(x.created_at) === d).length, commission: money2(sum(inLines.filter(l => localDay(l.deal_time || l.created_at) === d).map(l => l.amount))) })) };
    }
    // Masked client list: first name + last initial, country, status, account type, deposits, lots and commission in the period
    function portalIbClients(c, f = {}) {
      const { pt } = ibOf(c), r = rangeOf(f), lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.level === 1 && l.status !== "reversed");
      return store.all("clients").filter(x => x.partner_id === pt.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x, i) => {
        const my = lines.filter(l => l.client_id === x.id && r.inR(l.deal_time || l.created_at)), acc = store.all("accounts").filter(a => a.client_id === x.id && a.kind === "live" && a.status === "open");
        return { n: i + 1, name: maskName(x), country: x.country, status: clientStage(x), signed_up: localDay(x.created_at), account_type: [...new Set(acc.map(a => a.type_name))].join(", "),
          deposits: money2(sum(store.all("payments").filter(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed").map(p => p.amount))), lots: Math.round(sum(my.filter(l => l.kind === "lot").map(l => l.lots)) * 100) / 100, commission: money2(sum(my.map(l => l.amount))) };
      });
    }
    function portalIbSubs(c, f = {}) {
      const { pt } = ibOf(c), r = rangeOf(f);
      return store.all("partners").filter(z => z.parent_id === pt.id).map(z => { const ls = store.all("commissions").filter(l => l.status !== "reversed" && r.inR(l.deal_time || l.created_at));
        return { code: z.code, status: z.status, clients: store.all("clients").filter(x => x.partner_id === z.id).length, lots: Math.round(sum(ls.filter(l => l.partner_id === z.id && l.kind === "lot" && l.level === 1).map(l => l.lots)) * 100) / 100, override: money2(sum(ls.filter(l => l.partner_id === pt.id && l.level === 2 && l.via_partner_id === z.id).map(l => l.amount))) }; });
    }
    // Monthly statement grouped by client (masked) and symbol group; held lines with the reason in plain words
    function portalIbCommissions(c, f = {}) {
      const { pt } = ibOf(c), period = /^\d{4}-\d{2}$/.test(f.period || "") ? f.period : thisPeriod();
      const lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.period === period), names = new Map();
      const who = id => { if (!id) return "Adjustment"; if (!names.has(id)) names.set(id, maskName(store.get("clients", id))); return names.get(id); };
      const groups = [...groupBy(lines.filter(l => l.status !== "reversed"), l => (l.client_id || "") + "|" + (l.kind === "lot" ? l.symbol_group : l.kind) + "|" + l.level + "|" + l.status)].map(([k, ls]) => { const [cid, grp, level, status] = k.split("|");
        return { client: who(cid), group: grp, level: Number(level), status, lines: ls.length, lots: Math.round(sum(ls.map(l => l.lots || 0)) * 100) / 100, amount: money2(sum(ls.map(l => l.amount))), reason: status === "held" ? [...new Set(ls.map(l => l.hold_reason))].join("; ") : "" }; })
        .sort((a, b) => a.client.localeCompare(b.client) || a.group.localeCompare(b.group));
      const periods = [...new Set(store.all("commissions").filter(l => l.partner_id === pt.id).map(l => l.period).concat([thisPeriod()]))].sort().reverse();
      return { period, periods, rows: groups, totals: { pending: money2(sum(lines.filter(l => l.status === "pending").map(l => l.amount))), held: money2(sum(lines.filter(l => l.status === "held").map(l => l.amount))), approved: money2(sum(lines.filter(l => l.status === "approved").map(l => l.amount))), paid: money2(sum(lines.filter(l => l.status === "paid").map(l => l.amount))), reversed: lines.filter(l => l.status === "reversed").length } };
    }
    function portalIbPayouts(c) { const { x } = ibOf(c); return store.all("payments").filter(p => p.client_id === x.id && p.type === "ib_payout").sort((a, b) => b.created_at.localeCompare(a.created_at)).map(clientPayment); }
    function portalIbMaterials(c) { ibOf(c); return store.all("files").filter(z => z.kind === "ib_material").sort((a, b) => b.created_at.localeCompare(a.created_at)).map(z => ({ id: z.id, name: z.name, type: z.type, size: z.size, note: z.note || "", created_at: z.created_at })); }
    function portalIbMaterialFile(c, id) { ibOf(c); const z = store.get("files", id); if (!z || z.kind !== "ib_material") throw new CrmError("File not found.", 404); return { name: z.name, type: z.type, data: z.data }; }
    function uploadIbMaterial(u, f = {}) {
      need(u, isPartnerships, "Only the partnerships team uploads materials.");
      const data = String(f.data || ""); if (!/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/.test(data)) throw new CrmError("Upload a PNG, JPG, WebP, GIF or PDF."); if (data.length > 6.5e6) throw new CrmError("Keep it under 4 MB.");
      const rec = { id: newId("F"), kind: "ib_material", name: clean(f.name, 120) || "banner", note: clean(f.note, 200), type: data.slice(5, data.indexOf(";")), size: Math.round(data.length * 0.75), data, created_by: u.id, created_at: nowIso() };
      store.put("files", rec); const o = Object.assign({}, rec); delete o.data; return o;
    }
    function listIbMaterials(u) { need(u, isPartnerships); return store.all("files").filter(z => z.kind === "ib_material").map(z => { const o = Object.assign({}, z); delete o.data; return o; }); }
    function deleteIbMaterial(u, id) { need(u, isPartnerships); const z = store.get("files", id); if (!z || z.kind !== "ib_material") throw new CrmError("Not found.", 404); store.remove("files", id); return { ok: true }; }

    /* ---------- partner profile and reports for staff ---------- */
    function getPartner(u, id) {
      need(u, x => isPartnerships(x) || isKyc(x), "Partner profiles are for the partnerships team.");
      const pt = store.get("partners", id); if (!pt) throw new CrmError("Partner not found.", 404);
      const full = isPartnerships(u), subs = store.all("partners").filter(z => z.parent_id === pt.id);
      const cls = store.all("clients").filter(x => x.partner_id === pt.id).map(x => Object.assign(clientRow(x), { stage_ib: clientStage(x), partner_locked_at: x.partner_locked_at || null, flagged: !!x.ib_flagged }));
      const lines = full ? store.all("commissions").filter(l => l.partner_id === pt.id).sort((a, b) => String(b.deal_time || b.created_at).localeCompare(String(a.deal_time || a.created_at))).slice(0, 2000).map(l => Object.assign({}, l, { client_name: l.client_id ? (store.get("clients", l.client_id) || {}).first_name + " " + ((store.get("clients", l.client_id) || {}).last_name || "") : "", decided_by_name: l.decided_by ? userName(l.decided_by) : "" })) : [];
      return { partner: partnerRow(pt), notes: pt.notes || "", agreement: pt.agreement, payout: pt.payout, referred_by: pt.referred_by_partner ? (store.get("partners", pt.referred_by_partner) || {}).code : "",
        tree: { master: pt.parent_id ? partnerRow(store.get("partners", pt.parent_id)) : null, subs: subs.map(partnerRow) }, clients: cls, lines, balance: ibBalance(pt),
        payouts: full ? store.all("payments").filter(p => p.type === "ib_payout" && (p.ib || {}).partner_id === pt.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(pubPayment) : [],
        docs: store.all("files").filter(z => z.partner_id === pt.id).map(z => ({ id: z.id, kind: z.kind, name: z.name, type: z.type, review: z.review, created_at: z.created_at })),
        audit: full ? arr(pt.audit).slice().reverse().map(a => Object.assign({}, a, { by_name: a.by === "system" ? "System" : userName(a.by) })) : [], links: pt.code ? { main: ibLink(pt), recruit: pt.can_recruit ? ibLink(pt, "", true) : "" } : null, can_edit: full, can_review_docs: isKyc(u) };
    }
    // Per IB: clicks → sign-ups → FTD, net deposits, lots, commission, % of net deposits, cost per FTD, top symbols
    function ibReport(u, f = {}) {
      need(u, isPartnerships, "The IB report is for the partnerships team.");
      const r = rangeOf(f);
      const rows = store.all("partners").filter(p => p.status === "approved" || p.status === "suspended").map(pt => {
        const cls = store.all("clients").filter(x => x.partner_id === pt.id), ids = new Set(cls.map(x => x.id));
        const pays = store.all("payments").filter(p => ids.has(p.client_id) && p.status === "completed" && r.inR(p.completed_at));
        const dep = sum(pays.filter(p => p.type === "deposit").map(p => p.amount)), wd = sum(pays.filter(p => p.type === "withdrawal").map(p => p.amount));
        const ftd = cls.filter(x => { const f1 = store.all("payments").filter(p => p.client_id === x.id && p.type === "deposit" && p.status === "completed").sort((a, b) => a.completed_at.localeCompare(b.completed_at))[0]; return f1 && r.inR(f1.completed_at); }).length;
        const lines = store.all("commissions").filter(l => l.partner_id === pt.id && l.status !== "reversed" && r.inR(l.deal_time || l.created_at)), comm = money2(sum(lines.map(l => l.amount)));
        const paid = money2(sum(store.all("payments").filter(p => p.type === "ib_payout" && (p.ib || {}).partner_id === pt.id && p.status === "completed" && r.inR(p.completed_at)).map(p => p.amount)));
        const top = [...groupBy(lines.filter(l => l.kind === "lot" && l.level === 1), l => l.symbol)].map(([s1, ls]) => ({ symbol: s1, lots: Math.round(sum(ls.map(l => l.lots)) * 100) / 100 })).sort((a, b) => b.lots - a.lots).slice(0, 3);
        const clicks = store.all("ib_clicks").filter(k => k.partner_id === pt.id && r.inR(k.at)).length, signups = cls.filter(x => r.inR(x.created_at)).length, net = money2(dep - wd);
        return { id: pt.id, code: pt.code, name: partnerRow(pt).name, status: pt.status, master: pt.parent_id ? (store.get("partners", pt.parent_id) || {}).code : "", clicks, signups, signup_rate: clicks ? pct(signups, clicks) : null, ftd, ftd_rate: signups ? pct(ftd, signups) : null,
          deposits: money2(dep), withdrawals: money2(wd), net, lots: Math.round(sum(lines.filter(l => l.kind === "lot" && l.level === 1).map(l => l.lots)) * 100) / 100, commission: comm, paid,
          commission_pct: net > 0 ? pct(comm, net) : null, cost_per_ftd: ftd ? money2(comm / ftd) : null, top_symbols: top };
      }).sort((a, b) => b.commission - a.commission);
      return { range: { from: r.from, to: r.to }, rows, totals: { clicks: sum(rows.map(x => x.clicks)), signups: sum(rows.map(x => x.signups)), ftd: sum(rows.map(x => x.ftd)), net: money2(sum(rows.map(x => x.net))), commission: money2(sum(rows.map(x => x.commission))), paid: money2(sum(rows.map(x => x.paid))) } };
    }
    // Programme settings (agreement, payout minimum, symbol groups): the partnerships team, not only admins
    function ibSettings(u) { need(u, x => isPartnerships(x) || isOps(x)); return ibCfg(); }
    function saveIbSettings(u, q = {}) {
      need(u, isPartnerships, "Only the partnerships team can change the partner programme.");
      const before = ibCfg(); saveSettings(SYSTEM, { ib: q }); const after = ibCfg();
      const changed = ["enabled", "payout_min", "click_days", "agreement_version"].filter(k => before[k] !== after[k]).concat(before.agreement_text !== after.agreement_text ? ["agreement text"] : [], JSON.stringify(before.symbol_groups) !== JSON.stringify(after.symbol_groups) ? ["symbol groups"] : []);
      if (changed.length) logSecurity(u, "ib_settings_changed", null, { detail: "Partner programme settings changed: " + changed.join(", ") + (before.agreement_version !== after.agreement_version ? ` (agreement ${before.agreement_version} → ${after.agreement_version})` : "") });
      return after;
    }
    // Business overview card
    function ibSummary(s) {
      const { inR } = s, active = store.all("partners").filter(p => p.status === "approved").length;
      const ibClientIds = new Set(store.all("clients").filter(x => x.partner_id).map(x => x.id));
      const ftd = store.all("deposits").filter(d => d.status === "verified" && inR(d.deposited_at) && (store.get("leads", d.lead_id) || {}).ib_client).length;
      const deps = store.all("payments").filter(p => p.type === "deposit" && p.status === "completed" && inR(p.completed_at)), ibDep = sum(deps.filter(p => ibClientIds.has(p.client_id)).map(p => p.amount)), allDep = sum(deps.map(p => p.amount));
      const due = money2(sum(store.all("commissions").filter(l => ["pending", "approved"].includes(l.status)).map(l => l.amount)));
      return { active, ftd, deposit_share: allDep ? pct(ibDep, allDep) : 0, ib_deposits: money2(ibDep), commission_due: due };
    }

    Object.assign(REPORTS, {
      // Whole-business view: acquisition → onboarding → funding → trading → retention, plus queues
      business(u, s) { return withFacts(() => businessReport(u, s)); },
      // Payment performance: attempts → paid → credited, per method, with failure reasons and recovery
      payments(u, s) { need(u, x => isMgr(x) || isOps(x) || x.role === "marketing_manager", "That report is for managers and operations."); return paymentsReport(s); },
    });

    // What happened to one deposit attempt
    function depositOutcome(p) {
      const g = p.gateway;
      if (p.status === "completed") return "credited";
      if (["paid", "approved", "first_approved"].includes(p.status)) return "received";
      if (p.status === "rejected") return "rejected";
      if (p.status === "pending") return g && g.review ? "review" : g && g.status === "creating" ? "error" : "open";
      if (p.status === "cancelled") {
        if (g && g.status === "error") return "error";
        if (g && g.status === "failed") return "declined";
        if (p.cancelled_by === "client") return "cancelled";
        if (g && (g.status === "expired" || g.returned === "cancel")) return "abandoned";
        return g ? "abandoned" : "cancelled";
      }
      return "open";
    }
    const OUTCOMES_PAY = [
      ["credited", "Credited"], ["received", "Received, not yet credited"], ["open", "In progress"], ["review", "Needs a decision"],
      ["declined", "Declined by the bank / card"], ["abandoned", "Not paid (left or timed out)"], ["cancelled", "Cancelled by the client"], ["error", "Provider error"], ["rejected", "Rejected by operations"],
    ];
    function failReason(p, o) {
      const g = p.gateway || {};
      if (o === "declined") { const e = arr(g.events).slice().reverse().find(z => z.state === "failed"); const n = (e && e.note) || ""; return n ? "Declined: " + n.replace(/\.$/, "").slice(0, 60) : "Declined (no reason given)"; }
      if (o === "abandoned") return g.returned === "cancel" ? "Left the payment page" : g.provider === "b2binpay" ? "Crypto not sent in time" : g.provider ? "Payment page timed out" : "Not paid";
      if (o === "cancelled") return "Cancelled by the client";
      if (o === "error") return "Payment provider unavailable";
      if (o === "rejected") return "Rejected: " + (clean(p.reject_reason, 60) || "no reason");
      return "";
    }
    function paymentsReport(s) {
      const { f, inR } = s;
      const agentOk = p => !f.agent || (() => { const l = store.get("leads", p.lead_id); return l && l.owner_id === f.agent; })();
      const all = store.all("payments").filter(p => p.type === "deposit" && inR(p.created_at) && agentOk(p));
      const methods = portalCfg().methods, mName = id => (methods.find(m => m.id === id) || {}).name || id;
      const rows = all.map(p => { const o = depositOutcome(p), g = p.gateway; const paidEv = g && arr(g.events).find(e => e.state === "paid");
        return { p, o, ok: o === "credited" || o === "received", closed: !["open", "review"].includes(o), provider: g ? g.provider : "manual",
          pay_min: paidEv ? (Date.parse(paidEv.at) - Date.parse(p.created_at)) / 60e3 : null,
          credit_h: p.status === "completed" && p.completed_at ? (Date.parse(p.completed_at) - Date.parse(paidEv ? paidEv.at : p.created_at)) / 36e5 : null }; });
      const stats = list => { const closed = list.filter(r => r.closed), ok = list.filter(r => r.ok), cred = list.filter(r => r.o === "credited");
        const by = Object.fromEntries(OUTCOMES_PAY.map(([k]) => [k, list.filter(r => r.o === k).length]));
        const pm = list.map(r => r.pay_min).filter(v => v != null), ch = list.map(r => r.credit_h).filter(v => v != null);
        return { attempts: list.length, clients: new Set(list.map(r => r.p.client_id)).size, ok: ok.length, ok_amount: money2(sum(ok.map(r => Number(r.p.gateway && r.p.gateway.paid) || r.p.amount))), credited: cred.length, credited_amount: money2(sum(cred.map(r => r.p.amount))),
          tried_amount: money2(sum(list.map(r => r.p.amount))), lost_amount: money2(sum(list.filter(r => r.closed && !r.ok).map(r => r.p.amount))), by,
          success_rate: closed.length ? pct(closed.filter(r => r.ok).length, closed.length) : null,
          client_success: list.length ? pct(new Set(ok.map(r => r.p.client_id)).size, new Set(list.map(r => r.p.client_id)).size) : null,
          avg_ticket: ok.length ? money2(sum(ok.map(r => r.p.amount)) / ok.length) : null,
          median_pay_min: pm.length ? Math.round(median(pm)) : null, median_credit_h: ch.length ? Math.round(median(ch) * 10) / 10 : null };
      };
      const total = stats(rows);
      const by_method = [...groupBy(rows, r => r.p.method)].map(([id, list]) => Object.assign({ id, name: mName(id), provider: list.slice().sort((x, y) => y.p.created_at.localeCompare(x.p.created_at))[0].provider, providers: [...new Set(list.map(r => r.provider))] }, stats(list))).sort((a, b) => b.attempts - a.attempts);
      const by_provider = [...groupBy(rows, r => r.provider)].map(([id, list]) => Object.assign({ id, name: { manual: "Manual (operations)", b2binpay: "B2BINPAY", cyrafa: "CyrafaPay" }[id] || id }, stats(list))).sort((a, b) => b.attempts - a.attempts);
      const first = stats(rows.filter(r => r.p.first_deposit)), repeat = stats(rows.filter(r => !r.p.first_deposit));
      // Funnel by client: opened the deposit page → started a deposit → money received → credited
      const viewers = new Set(store.all("clients").filter(x => arr(x.deposit_views).some(inR) && (!f.agent || (() => { const l = leadOfClient(x); return l && l.owner_id === f.agent; })())).map(x => x.id));
      const starters = new Set(rows.map(r => r.p.client_id)); starters.forEach(id => viewers.add(id));
      const payers = new Set(rows.filter(r => r.ok).map(r => r.p.client_id)), creditedC = new Set(rows.filter(r => r.o === "credited").map(r => r.p.client_id));
      const funnel = [["Opened the deposit page", viewers.size], ["Started a deposit", starters.size], ["Money received", payers.size], ["Credited to MT5", creditedC.size]].map(([label, n]) => ({ label, n, of_total: pct(n, viewers.size) }));
      // Recovery: clients with a failed attempt, did they succeed later (any method)?
      const failedC = groupBy(rows.filter(r => r.closed && !r.ok), r => r.p.client_id);
      let recovered = 0, recovered_amount = 0, switched = 0, lostC = 0, lost_amount = 0;
      failedC.forEach((fails, cid) => { const firstFail = fails.map(r => r.p.created_at).sort()[0]; const later = rows.filter(r => r.p.client_id === cid && r.ok && r.p.created_at > firstFail);
        if (later.length) { recovered++; recovered_amount += sum(later.map(r => r.p.amount)); if (later.some(r => r.p.method !== fails[0].p.method)) switched++; } else { lostC++; lost_amount += Math.max(...fails.map(r => r.p.amount)); } });
      const recovery = { failed_clients: failedC.size, recovered, recovered_amount: money2(recovered_amount), switched_method: switched, lost_clients: lostC, lost_amount: money2(lost_amount), recovery_rate: failedC.size ? pct(recovered, failedC.size) : null };
      // Why attempts fail
      const reasons = [...groupBy(rows.filter(r => r.closed && !r.ok), r => r.p.method + "|" + failReason(r.p, r.o))].map(([k, list]) => ({ method: mName(k.split("|")[0]), reason: k.split("|").slice(1).join("|"), n: list.length, amount: money2(sum(list.map(r => r.p.amount))) })).sort((a, b) => b.n - a.n).slice(0, 12);
      // Daily trend
      const dayList = days(f).slice(-120), byDay = groupBy(rows, r => localDay(r.p.created_at));
      const trend = dayList.map(d => { const l = byDay.get(d) || [], c = l.filter(r => r.closed); return { day: d, attempts: l.length, ok: l.filter(r => r.ok).length, failed: c.filter(r => !r.ok).length, success_rate: c.length ? pct(c.filter(r => r.ok).length, c.length) : null }; });
      // Right now (not limited to the period)
      const nowP = store.all("payments").filter(p => p.type === "deposit" && agentOk(p)), age = p => (nowMs() - Date.parse(p.created_at)) / 36e5;
      const waitingCredit = nowP.filter(p => ["paid", "approved", "first_approved"].includes(p.status) || (p.status === "pending" && !p.gateway));
      const now = { to_credit: waitingCredit.length, to_credit_amount: money2(sum(waitingCredit.map(p => p.amount))), oldest_h: waitingCredit.length ? Math.round(Math.max(...waitingCredit.map(age)) * 10) / 10 : null,
        review: nowP.filter(p => p.status === "pending" && p.gateway && p.gateway.review).length, awaiting_client: nowP.filter(p => p.status === "pending" && p.gateway && !p.gateway.review).length };
      // Withdrawals (manual): speed and outcome
      const wds = store.all("payments").filter(p => p.type === "withdrawal" && inR(p.created_at) && agentOk(p)), wPaid = wds.filter(p => p.status === "completed");
      const wdT = wPaid.map(p => (Date.parse(p.completed_at) - Date.parse(p.created_at)) / 36e5);
      const withdrawals = { requests: wds.length, paid: wPaid.length, paid_amount: money2(sum(wPaid.map(p => p.amount))), rejected: wds.filter(p => p.status === "rejected").length, cancelled: wds.filter(p => p.status === "cancelled").length, open: wds.filter(p => OPEN_PAY.includes(p.status)).length, median_h: wdT.length ? Math.round(median(wdT) * 10) / 10 : null, within_24h: wdT.length ? pct(wdT.filter(h => h <= 24).length, wdT.length) : null };
      return { range: f, outcomes: OUTCOMES_PAY.map(([id, label]) => ({ id, label })), total, by_method, by_provider, first, repeat, funnel, recovery, reasons, trend, now, withdrawals };
    }
    function businessReport(u, s) {
      {
        const { inR, cohort, f } = s, today = localDay(nowIso());
        const cl = store.all("clients").filter(x => { const l = leadOfClient(x); return !l || s.leadIds.has(l.id); });
        const pays = store.all("payments").filter(p => p.status === "completed" && (!f.agent || (() => { const l = store.get("leads", p.lead_id); return l && l.owner_id === f.agent; })()));
        const depsR = pays.filter(p => p.type === "deposit" && inR(p.completed_at)), wdR = pays.filter(p => p.type === "withdrawal" && inR(p.completed_at));
        const ftdR = store.all("deposits").filter(d => d.status === "verified" && s.leadIds.has(d.lead_id) && inR(d.deposited_at));
        const facts = new Map(s.leads.map(l => [l.id, clientFacts(l)])), lcOf = l => lifecycleOf(l, facts.get(l.id));
        const kpi = {
          leads: cohort.length, registrations: cl.filter(x => inR(x.created_at)).length, kyc_approved: cl.filter(x => x.kyc && x.kyc.status === "approved" && inR(x.kyc.decided_at)).length,
          accounts_opened: store.all("accounts").filter(a => a.kind === "live" && a.opened_at && inR(a.opened_at) && cl.some(x => x.id === a.client_id)).length,
          ftd: ftdR.length, ftd_amount: sum(ftdR.map(d => d.amount)), deposits: depsR.length, deposit_amount: sum(depsR.map(p => p.amount)), withdrawals: wdR.length, withdrawal_amount: sum(wdR.map(p => p.amount)),
          redeposits: depsR.filter(p => !p.first_deposit).length, redeposit_amount: sum(depsR.filter(p => !p.first_deposit).map(p => p.amount)),
          active_traders: s.leads.filter(l => lcOf(l) === "trading").length, conversion: pct(cohort.filter(l => l.reached && l.reached.funded).length, cohort.length),
        };
        kpi.net = kpi.deposit_amount - kpi.withdrawal_amount;
        const reachedC = k => cohort.filter(l => l.reached && l.reached[k]).length;
        const regC = cohort.filter(l => l.client_id), clientOfL = l => store.get("clients", l.client_id) || {};
        // Each lead counts at every step up to the furthest one it reached, so the journey never goes up (leads sold before the client area skip its steps)
        const rankOf = l => { const x = l.client_id && store.get("clients", l.client_id), k = x ? (x.kyc || {}).status : "", fx = facts.get(l.id), r = l.reached || {}; let n = 0;
          if (l.first_connected_at) n = 1; if (x) n = 2; if (x && x.email_verified_at) n = 3; if ((x && ["pending", "approved", "rejected", "resubmit"].includes(k)) || r.kyc) n = 4; if (k === "approved" || r.kyc) n = 5;
          if (r.registered || fx.live.some(a => a.opened_at)) n = 6; if (r.funded || fx.deps.length) n = 7; if (fx.tradingStarted) n = 8; if (fx.deps.length > 1) n = 9; return n; };
        const ranks = cohort.map(rankOf);
        const steps = ["Leads", "Spoke to client", "Signed up", "Email confirmed", "Documents submitted", "KYC approved", "Trading account opened", "First deposit (FTD)", "Started trading", "Deposited again"].map((label, i) => { const n = ranks.filter(r => r >= i).length; return { label, n, of_total: pct(n, cohort.length) }; });
        // daily trend
        const days = []; for (let d = new Date(f.from + "T12:00:00Z"); localDay(d.toISOString()) <= f.to && days.length < 120; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
        const byDay = (list, key) => { const m = {}; list.forEach(x => { const k = localDay(key(x)); m[k] = (m[k] || 0) + 1; }); return m; };
        const amtByDay = (list, key) => { const m = {}; list.forEach(x => { const k = localDay(key(x)); m[k] = (m[k] || 0) + (Number(x.amount) || 0); }); return m; };
        const tl = byDay(cohort, l => l.created_at), tr = byDay(cl.filter(x => inR(x.created_at)), x => x.created_at), tf = byDay(ftdR, d => d.deposited_at), td = amtByDay(depsR, p => p.completed_at), tw = amtByDay(wdR, p => p.completed_at);
        const trend = days.map(d => ({ day: d, leads: tl[d] || 0, registrations: tr[d] || 0, ftd: tf[d] || 0, deposits: td[d] || 0, withdrawals: tw[d] || 0, net: (td[d] || 0) - (tw[d] || 0) }));
        // lifecycle of the whole book (not only the period)
        const book = Object.fromEntries(LIFECYCLE.map(x => [x.id, 0])); s.leads.forEach(l => { book[lcOf(l)]++; });
        const segs = Object.fromEntries(SEGMENTS.map(x => [x.id, 0])); s.leads.forEach(l => segmentOf(l, lcOf(l), facts.get(l.id)).forEach(k => segs[k]++));
        // by source
        const srcMap = new Map();
        cohort.forEach(l => { const k = l.utm_source || "direct"; const r = srcMap.get(k) || { k, leads: 0, registered: 0, ftd: 0, ftd_amount: 0, deposits: 0 }; r.leads++; if (l.client_id) r.registered++; if (l.reached && l.reached.funded) { r.ftd++; r.ftd_amount += Number(l.deposit_amount) || 0; } r.deposits += sum(facts.get(l.id).deps.map(p => p.amount)); srcMap.set(k, r); });
        const sources = [...srcMap.values()].map(r => Object.assign(r, { conversion: pct(r.ftd, r.leads) })).sort((a, b) => b.leads - a.leads);
        const ibLead = d => !!(store.get("leads", d.lead_id) || {}).ib_client;
        kpi.ib_ftd = ftdR.filter(ibLead).length;
        const agents = store.all("users").filter(x => isSalesRole(x.role) && x.active !== false && (!f.agent || x.id === f.agent)).map(x => { const own = cohort.filter(l => l.owner_id === x.id), ftd = ftdR.filter(d => d.owner_id === x.id && !ibLead(d)); return { name: x.name, leads: own.length, ftd: ftd.length, ftd_amount: sum(ftd.map(d => d.amount)), conversion: pct(own.filter(l => l.reached && l.reached.funded).length, own.length) }; }).filter(r => r.leads || r.ftd).sort((a, b) => b.ftd_amount - a.ftd_amount).slice(0, 10);
        const openP = OPEN_PAY, allPays = store.all("payments");
        const queues = { kyc: store.all("clients").filter(x => (x.kyc || {}).status === "pending").length, accounts: store.all("accounts").filter(a => ["requested", "creating"].includes(a.status)).length, deposits: allPays.filter(p => p.type === "deposit" && openP.includes(p.status)).length, withdrawals: allPays.filter(p => p.type === "withdrawal" && openP.includes(p.status)).length, withdrawal_amount: sum(allPays.filter(p => p.type === "withdrawal" && openP.includes(p.status)).map(p => p.amount)), ftd_verify: store.all("deposits").filter(d => d.status === "pending").length,
          new_waiting: s.leads.filter(l => l.stage === "new" && !l.attempts && nowMs() - Date.parse(l.created_at) > (settings().sla_minutes || 15) * 60000).length, overdue_tasks: store.all("tasks").filter(t => !t.done_at && t.due_at < nowIso() && s.leadIds.has(t.lead_id)).length, unassigned: s.leads.filter(l => !l.owner_id && OPEN.has(l.stage)).length };
        const liveAcc = store.all("accounts").filter(a => a.kind === "live" && a.status === "open");
        const base = { clients: store.size("clients"), funded_clients: new Set(allPays.filter(p => p.type === "deposit" && p.status === "completed").map(p => p.client_id)).size + s.leads.filter(l => l.stage === "funded" && !l.client_id).length, live_accounts: liveAcc.length, balance: sum(liveAcc.map(a => Number(a.balance) || 0)), equity: sum(liveAcc.map(a => Number(a.equity == null ? a.balance : a.equity) || 0)),
          deposits_all: sum(allPays.filter(p => p.type === "deposit" && p.status === "completed").map(p => p.amount)), withdrawals_all: sum(allPays.filter(p => p.type === "withdrawal" && p.status === "completed").map(p => p.amount)), today_leads: s.leads.filter(l => localDay(l.created_at) === today).length };
        return { range: f, kpi, ib: ibSummary(s), steps, trend, book: LIFECYCLE.map(x => ({ id: x.id, label: x.label, group: x.group, n: book[x.id] })), segments: SEGMENTS.map(x => ({ id: x.id, label: x.label, n: segs[x.id] })), sources, agents, queues, base };
      }
    }

    /* ---------- meta / seed ---------- */
    function meta(u) {
      const s = settings();
      const me = store.get("users", u.id);
      return {
        user: me ? Object.assign({}, u, publicUser(me)) : u, gate: me ? gate(u) : null, stages: STAGES, outcomes: OUTCOMES, qa_fields: QA_FIELDS, lost_reasons: s.lost_reasons, roles: ROLES, role_labels: ROLE_LABELS, triggers: TRIGGERS, template_vars: TEMPLATE_VARS,
        checklist: CHECKLIST, deposit_methods: DEPOSIT_METHODS, qa_criteria: QA_CRITERIA, break_reasons: BREAK_REASONS, campaign_channels: CAMPAIGN_CHANNELS,
        status: me ? myStatus(u) : null, inbox_unread: me ? inboxUnread(u) : 0,
        deposits_pending: me && isMgr(u) ? store.all("deposits").filter(d => d.status === "pending").length : 0,
        broadcasts_pending: me && isMktMgr(u) ? store.all("broadcasts").filter(b => b.status === "pending_approval").length : 0,
        bonuses_pending: me && isMgr(u) ? store.all("bonuses").filter(b => b.status === "requested" || arr(b.withdrawals).some(w => w.status === "requested")).length : 0,
        bonus: bonusCfg(), triggers_time: [...TIME_TRIGGERS],
        ops_pending: me && isKyc(u) ? (() => { const o = opsOverview(u).queues; return { kyc: o.kyc, accounts: isOps(u) ? o.accounts : 0, money: isOps(u) ? o.deposits + o.withdrawals + o.transfers : 0 }; })() : null,
        lifecycle: LIFECYCLE, segments: SEGMENTS.map(x => ({ id: x.id, label: x.label })),
        kyc_kinds: KYC_KINDS, portal: { account_types: portalCfg().account_types, methods: portalCfg().methods.map(m => ({ id: m.id, name: m.name })), second_approval_over: portalCfg().second_approval_over, default_server: portalCfg().default_server },
        ib: { applications: me && (isPartnerships(u) || isKyc(u)) ? store.all("partners").filter(p => p.status === "applied" && (isPartnerships(u) || p.kind === "company")).length : 0, payouts: me && isOps(u) ? store.all("payments").filter(p => p.type === "ib_payout" && OPEN_PAY.includes(p.status)).length : 0 },
        mt5: { mode: mt5Mode(), account_creation_enabled: !!mt5Cfg().account_creation_enabled, auto_demo: !!mt5Cfg().auto_demo, match_after_hours: matchHours(), unlinked: me && isOps(u) ? store.all("mt5_unlinked").filter(x => x.status === "open").length : 0 },
        reviews_new: me ? store.all("reviews").filter(r => r.agent_id === u.id && !r.acknowledged_at).length : 0,
        users: store.all("users").filter(x => x.active !== false).map(x => ({ id: x.id, name: x.name, role: x.role, team: x.team || "", sales: isSalesRole(x.role) })).sort((a, b) => a.name.localeCompare(b.name)),
        campaigns: store.all("campaigns").map(c => ({ id: c.id, name: c.name, utm_source: c.utm_source, utm_campaign: c.utm_campaign, channel: c.channel })).sort((a, b) => a.name.localeCompare(b.name)),
        utm_campaigns: [...new Set(store.all("leads").map(l => l.utm_campaign).filter(Boolean))].sort(),
        cities: [...new Set(store.all("leads").map(l => l.city).filter(Boolean))].sort().slice(0, 300),
        templates: store.all("templates").filter(t => t.active !== false).map(t => ({ id: t.id, name: t.name, channel: t.channel, wa_template_name: t.wa_template_name })),
        settings: { company: s.company, sla_minutes: s.sla_minutes, tz_offset_min: s.tz_offset_min, register_url: s.register_url, whatsapp_number: s.whatsapp_number, currency: s.currency, site_url: s.site_url, deposit_approval: s.deposit_approval, broadcast_approval: s.broadcast_approval, broadcast_cap_days: s.broadcast_cap_days, broadcast_rate_per_min: s.broadcast_rate_per_min, stuck_days: s.stuck_days },
        countries: [...new Set(store.all("leads").map(l => l.country).filter(Boolean))].sort(),
        sources: [...new Set(store.all("leads").map(l => l.utm_source || "direct"))].sort(),
        unread: store.all("notifications").filter(n => n.user_id === u.id && !n.read).length,
      };
    }
    function ensureDefaults() {
      settings();
      if (!store.all("templates").length) DEFAULT_TEMPLATES.forEach(t => store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))));
      if (!store.all("automations").length) DEFAULT_AUTOMATIONS.forEach(a => store.put("automations", Object.assign({ created_at: nowIso() }, clone(a))));
      const s = settings();
      if ((s.defaults_version || 1) < 2) { // version 2: pre-deposit reminders and marketing templates
        V2_TEMPLATES.forEach(t => { if (!store.get("templates", t.id)) store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))); });
        V2_AUTOMATIONS.forEach(a => { if (!store.get("automations", a.id)) store.put("automations", Object.assign({ created_at: nowIso() }, clone(a))); });
        // Leads funded before deposit tracking existed get a verified deposit record, so targets and reports stay complete
        const has = new Set(store.all("deposits").map(d => d.lead_id));
        store.all("leads").filter(l => l.stage === "funded" && !has.has(l.id)).forEach(l => store.put("deposits", { id: newId("D"), lead_id: l.id, owner_id: l.owner_id, amount: Number(l.deposit_amount) || 0, currency: s.currency || "USD", method: "", tx_ref: "", account_id: l.account_id || "", deposited_at: l.funded_at || l.updated_at || nowIso(), proof_file_id: null, note: "Recorded before deposit verification was switched on", status: "verified", is_ftd: true, created_by: "system", created_at: nowIso(), verified_by: "system", verified_at: nowIso(), reject_reason: "" }));
        s.defaults_version = 2; store.put("settings", s);
      }
      if ((s.defaults_version || 1) < 3) { // version 3: optional demo and company-funded account journey
        V3_TEMPLATES.forEach(t => { if (!store.get("templates", t.id)) store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))); });
        V3_AUTOMATIONS.forEach(a => { if (!store.get("automations", a.id)) store.put("automations", Object.assign({ created_at: nowIso() }, clone(a))); });
        s.defaults_version = 3; store.put("settings", s);
      }
      if ((s.defaults_version || 1) < 4) { // version 4: client area. Clients see the Absel Global name only.
        V4_TEMPLATES.forEach(t => { if (!store.get("templates", t.id)) store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))); });
        if (s.company === "Absel Markets") s.company = "Absel Global";
        if (s.support_email === "support@abselmarkets.com") s.support_email = "support@abselglobal.com";
        if (/client\.abselmarkets\.com/.test(s.register_url || "")) s.register_url = (s.site_url || "https://abselglobal.com") + "/portal/#register";
        if (/client\.abselmarkets\.com/.test(s.login_url || "")) s.login_url = (s.site_url || "https://abselglobal.com") + "/portal/";
        const ids = new Set(DEFAULT_TEMPLATES.concat(V2_TEMPLATES, V3_TEMPLATES).map(t => t.id));
        store.all("templates").filter(t => ids.has(t.id)).forEach(t => { const b = rebrand(t.body), sj = rebrand(t.subject); if (b !== t.body || sj !== t.subject) { t.body = b; t.subject = sj; store.put("templates", t); } });
        s.defaults_version = 4; store.put("settings", s);
      }
      if ((s.defaults_version || 1) < 5) { // version 5: lifecycle automations; every client-area account linked to a lead
        V5_TEMPLATES.forEach(t => { if (!store.get("templates", t.id)) store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))); });
        V5_AUTOMATIONS.forEach(a => { if (!store.get("automations", a.id)) store.put("automations", Object.assign({ created_at: nowIso() }, clone(a))); });
        s.defaults_version = 5; store.put("settings", s);
      }
      if ((s.defaults_version || 1) < 6) { // version 6: IB / partner programme (emails and a starting commission plan)
        V6_TEMPLATES.forEach(t => { if (!store.get("templates", t.id)) store.put("templates", Object.assign({ created_at: nowIso(), active: true }, clone(t))); });
        if (!store.all("ib_plans").length) store.put("ib_plans", Object.assign({ created_at: nowIso() }, clone(DEFAULT_IB_PLAN)));
        s.defaults_version = 6; store.put("settings", s);
      }
      // Integrity on every start: no client without a lead, no lead without its client link
      store.all("clients").forEach(x => {
        let l = x.lead_id && store.get("leads", x.lead_id);
        if (!l) { l = store.all("leads").find(y => y.email === x.email && !y.client_id) || createLead(SYSTEM, { firstName: x.first_name, lastName: x.last_name, email: x.email, dialCode: x.dial_code, phone: x.phone, country: x.country, form: "client area", utm_source: "client-area" }, { source: "portal" }); x.lead_id = l.id; store.put("clients", x); }
        if (l.client_id !== x.id && !l.client_id) { l.client_id = x.id; store.put("leads", l); }
      });
    }

    return {
      meta, queue, listLeads, getLead, createLead, addLead, updateLead, changeStage, assignLeads, reassignPool, bulkStage, deleteLeads,
      logCall, addNote, createTask, completeTask, rescheduleTask, listTasks,
      sendMessage, markMessage, recordInbound, listMessages,
      report, listUsers, saveUser, setAvailability,
      listRules: rulesCrud.list, saveRule: rulesCrud.save, deleteRule: rulesCrud.remove,
      listTemplates: u => store.all("templates").sort((a, b) => String(a.name).localeCompare(String(b.name))), saveTemplate: tplCrud.save, deleteTemplate: tplCrud.remove,
      listAutomations: autoCrud.list, saveAutomation: autoCrud.save, deleteAutomation: autoCrud.remove,
      listNotifications, markRead, getSettings, saveSettings, importLeads, exportLeads,
      authLookup, authResult, changeOwnPassword, adminUserAction, totpBegin, totpEnable, totpDisable, totpCheck, listLogins, gate, checkPassword, exportAll, logSecurity,
      tick, ensureDefaults, SYSTEM, store,
      // sales
      submitDeposit, verifyDeposit, listDeposits, uploadFile, getFile, setChecklist, listPipeline, targets,
      listDnc, addDnc, removeDnc, listOptOuts, duplicateGroups, mergeLeads, listRecycle, recycleLeads,
      listConversations, getConversation, simulateInbound, unsubscribeLead, listCallsForReview, saveReview, listReviews, ackReview,
      heartbeat, setBreak, myStatus, liveBoard, dialInfo, recordCallEvent, setTarget,
      // marketing
      listCampaigns: campCrud.list, saveCampaign: campCrud.save, deleteCampaign, addSpend, importSpend, deleteSpend, listSpend,
      previewSegment, saveBroadcast, submitBroadcast, approveBroadcast, cancelBroadcast, listBroadcasts, getBroadcast,
      misSummary,
      // optional journey: demo and company-funded account
      // client area and operations
      portalRegister, portalResendVerify, portalVerifyEmail, portalAuthLookup, portalAuthResult, portalTotpCheck, portalForgot, portalReset, portalSetPassword, portalTotpBegin, portalTotpEnable, portalTotpDisable,
      portalMe, portalUpdateProfile, portalUploadKyc, portalGetFile, portalRequestAccount, portalRevealPassword, portalDeposit, portalWithdraw, portalTransfer, portalCancel, portalHistory,
      gatewayAttach, gatewayFailed, gatewayEvent, gatewayTick, gatewayPayments, portalGatewayReturn, portalTrack, depositOutcome,
      listClients, getClient, getClientFile, setClientStatus, listKyc, decideKyc, listAccountRequests, openAccount, rejectAccount, setAccountPassword, updateAccount, listPayments, decidePayment, importBalances, opsOverview,
      listLifecycle, markTradingStarted, listTradingAccounts,
      // MT5 Web API (the server reads MT5; these keep the state)
      mt5SyncPlan, mt5IngestAccounts, mt5IngestDeals, mt5IngestPositions, mt5SyncDone, mt5Alert, mt5LogCalls, mt5Status, listMt5Unlinked, mt5LinkAccount, mt5IgnoreUnlinked, mt5Reconcile,
      mt5OpResult, mt5OpToCheck, mt5OpNotFound, mt5StuckCreations, mt5AutoDemo: () => mt5AutoDemo(), mt5AccountCreate, mt5Leverage, listMt5Ops,
      // IB / partner programme
      listIbPlans, saveIbPlan, ibPlanPreview, ibSettings, saveIbSettings, listPartners, getPartner, reviewPartnerDocs, decidePartner, updatePartner, ibReassignClient, ibClick, ibProcessDeals, ibTick, markChargeback,
      ibMonthReview, ibApprovePeriod, ibLineAction, ibAdjust, ibReport, uploadIbMaterial, listIbMaterials, deleteIbMaterial,
      portalIbApply, portalIbMe, portalIbDashboard, portalIbClients, portalIbSubs, portalIbCommissions, portalIbPayout, portalIbPayouts, portalIbMaterials, portalIbMaterialFile,
      setDemo, bonusEligibility, requestBonus, decideBonus, updateBonus, requestBonusWithdrawal, decideBonusWithdrawal, cancelBonus, listBonuses,
    };
  }

  /* ------------------------------------------------- default templates */
  const DEFAULT_TEMPLATES = [
    { id: "tpl_welcome_email", channel: "email", name: "Welcome email", subject: "{{first_name}}, thanks for your interest in Absel Global", body: "Hi {{first_name}},\n\nThanks for your interest in trading with {{company}}. Your account specialist will call you shortly from {{agent_phone}} to help you choose the right account.\n\nWant to get started now? Register here: {{register_url}}\n\nAbsel Global is a trading name of Absel Markets, licensed by the Financial Services Commission of Mauritius (GB25205423). Client funds are held in segregated accounts.\n\nKind regards,\nThe {{company}} team\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money." },
    { id: "tpl_wa_intro", channel: "whatsapp", name: "WhatsApp intro", wa_template_name: "absel_intro", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, this is {{agent_name}} from Absel Global. Thanks for your request. When is a good time for a quick 5-minute call to set up your account?" },
    { id: "tpl_wa_missed", channel: "whatsapp", name: "Missed call follow-up", wa_template_name: "absel_missed_call", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, {{agent_name}} from Absel Global here. I just tried to call you about your trading account. Reply with a good time and I'll call you back." },
    { id: "tpl_no_contact_email", channel: "email", name: "We couldn't reach you", subject: "We tried to reach you, {{first_name}}", body: "Hi {{first_name}},\n\nWe tried to call you about your Absel Global account but couldn't get through. Reply to this email with the best time to call, or message us on WhatsApp at {{whatsapp_number}}.\n\nYou can also register directly: {{register_url}}\n\n{{agent_name}}\n{{company}}" },
    { id: "tpl_registered_email", channel: "email", name: "Next step: verify and fund", subject: "Your account is ready, {{first_name}}: two quick steps left", body: "Hi {{first_name}},\n\nWelcome to {{company}}. To start trading:\n1. Upload your ID and proof of address in the client area: {{login_url}}\n2. Fund your account by card, bank wire, USDT or e-wallet. Absel charges 0% on deposits.\n\nAny questions? Reply here or WhatsApp me.\n\n{{agent_name}}" },
    { id: "tpl_funded_email", channel: "email", name: "Thank you for funding", subject: "You're all set, {{first_name}}", body: "Hi {{first_name}},\n\nYour deposit has been received and your account is ready to trade on MetaTrader 5. I'm here if you need help with the platform.\n\n{{agent_name}}\n{{company}}\n\nRisk warning: CFDs are leveraged products. You may lose more than your deposit." },
    { id: "tpl_reengage_email", channel: "email", name: "Re-engagement", subject: "Still thinking about trading, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. If you'd like to compare our STP and ECN accounts or try swap-free trading, I can walk you through it in a short call.\n\nRegister when you're ready: {{register_url}}\n\n{{agent_name}}" },
  ];
  const V2_TEMPLATES = [
    { id: "tpl_wa_docs", channel: "whatsapp", name: "KYC documents reminder", wa_template_name: "absel_kyc_reminder", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, {{agent_name}} from Absel Global. Your account is open. Upload your ID and proof of address in the client area so we can verify it: {{login_url}}. Need help? Reply here." },
    { id: "tpl_wa_deposit", channel: "whatsapp", name: "Ready to fund", wa_template_name: "absel_ready_to_fund", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, good news: your Absel Global account is verified. You can fund by card, bank wire, USDT, Skrill or Neteller with 0% deposit fees. Want me to guide you? {{agent_name}}" },
    { id: "tpl_promo_email", channel: "email", name: "Newsletter: why traders choose Absel", subject: "{{first_name}}, trade gold and forex with an FSC-licensed broker", body: "Hi {{first_name}},\n\nHere's why traders are moving to {{company}}:\n• Licensed by the FSC Mauritius (GB25205423), client funds segregated\n• ECN spreads from 0.2 pips, swap-free accounts available\n• 0% deposit fees: card, bank wire, USDT, Skrill, Neteller\n\nOpen your account in 3 minutes: {{register_url}}\nQuestions? Reply to this email or WhatsApp {{whatsapp_number}}.\n\nThe {{company}} team\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money.\nUnsubscribe: {{unsubscribe_url}}" },
    { id: "tpl_wa_promo", channel: "whatsapp", name: "Broadcast: account offer", wa_template_name: "absel_offer", wa_language: "en", wa_params: ["first_name"], body: "Hi {{first_name}}, Absel Global here. Open a swap-free or ECN account in 3 minutes and fund with 0% fees: {{register_url}}. Reply STOP to opt out." },
  ];
  const V2_AUTOMATIONS = [
    { id: "auto_kyc_reminder", name: "Registered 2 days, no KYC: remind and call", active: true, trigger: { type: "stage_stuck", stages: ["registered"], days: 2 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_docs" }, { type: "create_task", task_type: "call", title: "KYC pending: help upload documents", due_in_hours: 1 }] },
    { id: "auto_fund_nudge", name: "KYC approved 2 days, no deposit: nudge and call", active: true, trigger: { type: "stage_stuck", stages: ["kyc"], days: 2 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_deposit" }, { type: "create_task", task_type: "call", title: "Verified but not funded: help with first deposit", due_in_hours: 1 }] },
  ];
  const V3_TEMPLATES = [
    { id: "tpl_wa_demo", channel: "whatsapp", name: "Demo account details", wa_template_name: "absel_demo_access", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, {{agent_name}} from Absel Global. Your free demo account is ready, with virtual funds so you can practise on MetaTrader 5 with no risk. Your login details are in your email. Reply here and I'll walk you through your first trade." },
    { id: "tpl_wa_demo_nudge", channel: "whatsapp", name: "Demo not used yet", wa_template_name: "absel_demo_nudge", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, have you tried your demo account yet? It takes 5 minutes to place a first practice trade on gold or EUR/USD. Want me to show you on a quick call? {{agent_name}}" },
    { id: "tpl_bonus_email", channel: "email", name: "Your company-funded account", subject: "{{first_name}}, your funded trading account is ready", body: "Hi {{first_name}},\n\n{{company}} has credited a starter balance to the trading account in your name, so you can trade live markets without depositing first.\n\nHow it works:\n• The starter balance itself can't be withdrawn.\n• Profit you make can be withdrawn after you meet the trading requirement, up to the limit in your terms.\n• The starter balance expires after the period in your terms.\n\nWhen you're ready to trade with your own funds, your agent will help you make your first deposit: {{login_url}}\n\n{{agent_name}}\n{{company}}\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money." },
    { id: "tpl_wa_bonus_expiring", channel: "whatsapp", name: "Funded account expiring", wa_template_name: "absel_bonus_expiring", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, your company-funded trading balance expires in a few days. Keep the momentum: fund your own account and keep trading with no interruption. Can I call you to set it up? {{agent_name}}" },
    { id: "tpl_wa_bonus_ended", channel: "whatsapp", name: "Funded account ended", wa_template_name: "absel_bonus_ended", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, your company-funded trading period has ended. You've had a real taste of live trading. Ready to continue with your own account? Deposits are 0% fee. {{agent_name}}" },
  ];
  const V3_AUTOMATIONS = [
    { id: "auto_demo_given", name: "Demo given: send details and book walkthrough", active: true, trigger: { type: "demo_given" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_demo" }, { type: "create_task", task_type: "call", title: "Demo walkthrough: first practice trade", due_in_hours: 24 }] },
    { id: "auto_demo_idle", name: "Demo not traded in 2 days: nudge and call", active: true, trigger: { type: "demo_idle", days: 2 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_demo_nudge" }, { type: "create_task", task_type: "call", title: "Demo not used: help place first trade", due_in_hours: 2 }] },
    { id: "auto_bonus_credited", name: "Funded account credited: welcome and first-trade call", active: true, trigger: { type: "bonus_credited" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_bonus_email" }, { type: "create_task", task_type: "call", title: "Funded account live: first trade together", due_in_hours: 4 }] },
    { id: "auto_bonus_expiring", name: "Funded account expires in 5 days: ask for deposit", active: true, trigger: { type: "bonus_expiring", days: 5 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_bonus_expiring" }, { type: "create_task", task_type: "call", title: "Funded account expiring: ask for own deposit", due_in_hours: 2 }] },
    { id: "auto_bonus_ended", name: "Funded account ended: convert to own deposit", active: true, trigger: { type: "bonus_ended" }, conditions: {}, delay_minutes: 60, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_bonus_ended" }, { type: "create_task", task_type: "call", title: "Funded account ended: convert to deposit", due_in_hours: 24 }] },
  ];
  const rebrand = t => String(t || "").replace(/Absel Markets is licensed by the Financial Services Commission of Mauritius \(GB25205423\)/g, "Absel Global is a trading name of Absel Markets, licensed by the Financial Services Commission of Mauritius (GB25205423)").replace(/Absel Markets(?!, licensed)/g, "Absel Global");
  const V4_TEMPLATES = [
    { id: "tpl_portal_account", channel: "email", name: "Client area: account opened", subject: "Your {{account_type}} account is ready, {{first_name}}", body: "Hi {{first_name}},\n\nYour {{account_type}} account is open.\n\nMT5 login: {{login}}\nServer: {{server}}\n\nFor your security, your password is shown once in the client area: {{login_url}}\nDownload MetaTrader 5 from the client area and sign in with these details.\n\nNeed help? Reply to this email or WhatsApp {{whatsapp_number}}.\n\nThe {{company}} team\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money." },
    { id: "tpl_portal_deposit", channel: "email", name: "Client area: deposit received", subject: "Deposit received: {{amount}}", body: "Hi {{first_name}},\n\nWe received your deposit of {{amount}} ({{method}}) and credited it to account {{account}}. Reference: {{reference}}.\n\nYou can see all your transactions in the client area: {{login_url}}\n\nThe {{company}} team" },
    { id: "tpl_portal_withdrawal", channel: "email", name: "Client area: withdrawal paid", subject: "Withdrawal sent: {{amount}}", body: "Hi {{first_name}},\n\nYour withdrawal of {{amount}} from account {{account}} has been sent by {{method}}. Reference: {{reference}}. Depending on your bank or wallet it can take 1–3 business days to arrive.\n\nThe {{company}} team" },
    { id: "tpl_portal_transfer", channel: "email", name: "Client area: transfer done", subject: "Transfer done: {{amount}}", body: "Hi {{first_name}},\n\nYour transfer of {{amount}} ({{reference}}) between your accounts is done.\n\nThe {{company}} team" },
    { id: "tpl_portal_kyc_ok", channel: "email", name: "Client area: documents approved", subject: "You're verified, {{first_name}}", body: "Hi {{first_name}},\n\nYour documents are approved. You can now open a live account and make your first deposit in the client area: {{login_url}}\n\n{{agent_name}}\n{{company}}" },
    { id: "tpl_portal_kyc_fix", channel: "email", name: "Client area: documents need attention", subject: "Action needed: your documents", body: "Hi {{first_name}},\n\nWe couldn't approve your documents: {{reason}}\n\nPlease upload new ones in the client area: {{login_url}}\n\n{{agent_name}}\n{{company}}" },
    { id: "tpl_portal_declined", channel: "email", name: "Client area: request declined", subject: "About your request", body: "Hi {{first_name}},\n\nWe couldn't complete your request ({{reference}}): {{reason}}\n\nReply to this email or contact your account manager if you have questions.\n\nThe {{company}} team" },
  ];
  // Version 6: IB / partner programme emails (to the IB: never a referred client's details)
  const V6_TEMPLATES = [
    { id: "tpl_ib_received", channel: "email", name: "Partner: application received", subject: "We received your partner application, {{first_name}}", body: "Hi {{first_name}},\n\nThank you for applying to the Absel Global partner programme. Our partnerships team reviews applications within 2 business days. If you applied as a company, please upload the company documents in the client area under Partner.\n\nThe {{company}} team" },
    { id: "tpl_ib_approved", channel: "email", name: "Partner: approved", subject: "Welcome to the Absel Global partner programme", body: "Hi {{first_name}},\n\nYour partner application is approved. Your partner code is {{code}}.\n\nYour link: {{link}}\n\nShare it with the people you introduce. When they register with it, they are linked to you. Your links, clients, commission and payouts are in the client area under Partner: {{login_url}}\n\nThe {{company}} partnerships team" },
    { id: "tpl_ib_rejected", channel: "email", name: "Partner: not approved", subject: "Your partner application", body: "Hi {{first_name}},\n\nThank you for applying to the Absel Global partner programme. We can't approve your application at this time.\n\nReason: {{reason}}\n\nYou can apply again from the client area once this is resolved.\n\nThe {{company}} partnerships team" },
    { id: "tpl_ib_referral", channel: "email", name: "Partner: new referral signed up", subject: "A new client registered with your partner code", body: "Hi {{first_name}},\n\nA new client just registered with your partner code {{code}}. You can follow their progress (masked, for their privacy) in the client area under Partner → Clients: {{login_url}}\n\nThe {{company}} partnerships team" },
    { id: "tpl_ib_statement", channel: "email", name: "Partner: monthly statement ready", subject: "Your partner statement for {{period}} is ready", body: "Hi {{first_name}},\n\nYour commission statement for {{period}} has been approved: {{amount}}. You can see it under Partner → Commissions and request a payout under Partner → Payouts: {{login_url}}\n\nThe {{company}} partnerships team" },
    { id: "tpl_ib_payout", channel: "email", name: "Partner: payout paid", subject: "Your partner payout {{reference}} was paid", body: "Hi {{first_name}},\n\nYour partner payout {{reference}} of {{amount}} was paid ({{method}}).\n\nThe {{company}} partnerships team" },
    { id: "tpl_ib_reassigned", channel: "email", name: "Partner: client moved", subject: "A change to your referred clients", body: "Hi {{first_name}},\n\n{{reason}}\n\nIf you have questions, reply to this email.\n\nThe {{company}} partnerships team" },
  ];
  const DEFAULT_IB_PLAN = { id: "PL_standard", name: "Standard", active: true,
    rates: [{ account_type: "*", symbol_group: "forex", per_lot: 5 }, { account_type: "*", symbol_group: "metals", per_lot: 6 }, { account_type: "*", symbol_group: "indices", per_lot: 3 }, { account_type: "*", symbol_group: "energy", per_lot: 4 }, { account_type: "*", symbol_group: "crypto", per_lot: 2 }, { account_type: "*", symbol_group: "other", per_lot: 2 }],
    override_per_lot: [{ symbol_group: "forex", per_lot: 1 }, { symbol_group: "metals", per_lot: 1 }, { symbol_group: "indices", per_lot: 0.5 }, { symbol_group: "energy", per_lot: 0.5 }, { symbol_group: "crypto", per_lot: 0.5 }, { symbol_group: "other", per_lot: 0.5 }],
    cpa: { enabled: false, amount: 200, min_deposit: 200, min_lots: 1, within_days: 30 }, min_hold_seconds: 120, holdback_days: 30 };
  const V5_TEMPLATES = [
    { id: "tpl_portal_finish", channel: "email", name: "Finish your registration", subject: "{{first_name}}, one step left to open your account", body: "Hi {{first_name}},\n\nThanks for signing up with {{company}}. To open your live trading account, confirm your email and upload two documents in the client area:\n• a photo of your ID or passport\n• a proof of address from the last 3 months\n\nIt takes about 2 minutes: {{login_url}}\n\nNeed help? Reply here or WhatsApp {{whatsapp_number}}.\n\n{{agent_name}}\n{{company}}" },
    { id: "tpl_wa_portal_finish", channel: "whatsapp", name: "Finish registration (WhatsApp)", wa_template_name: "absel_finish_registration", wa_language: "en", wa_params: ["first_name", "agent_name"], body: "Hi {{first_name}}, {{agent_name}} from Absel Global. You're almost there: upload your ID and proof of address in the client area to open your live account. Want me to guide you? Reply here." },
    { id: "tpl_first_trade", channel: "email", name: "Ready for your first trade?", subject: "{{first_name}}, your account is funded: let's place your first trade", body: "Hi {{first_name}},\n\nYour account is funded and ready. If you'd like, I can walk you through MetaTrader 5 and your first trade on a short call: choosing a market, setting your size, and using stop-loss to manage risk.\n\nReply with a good time, or WhatsApp {{whatsapp_number}}.\n\n{{agent_name}}\n{{company}}\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money." },
    { id: "tpl_dormant", channel: "email", name: "Dormant client re-engagement", subject: "{{first_name}}, what's new at {{company}}", body: "Hi {{first_name}},\n\nIt's been a while since your last trade. Your account is still open, and I'm happy to share this week's market outlook or help with anything on the platform.\n\nClient area: {{login_url}}\n\n{{agent_name}}\n{{company}}\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money.\nUnsubscribe: {{unsubscribe_url}}" },
  ];
  const V5_AUTOMATIONS = [
    { id: "auto_portal_signup", name: "Client-area sign-up: welcome call", active: true, trigger: { type: "client_registered" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "create_task", task_type: "call", title: "New client-area sign-up: welcome call, help with documents", due_in_hours: 0 }, { type: "notify_owner", text: "{{full_name}} signed up in the client area. Call now while they're online" }] },
    { id: "auto_reg_incomplete", name: "Registration incomplete after 24 hours: remind and call", active: true, trigger: { type: "registration_incomplete", hours: 24 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_portal_finish" }, { type: "send_whatsapp", template_id: "tpl_wa_portal_finish" }, { type: "create_task", task_type: "call", title: "Registration incomplete: help finish email and documents", due_in_hours: 1 }] },
    { id: "auto_kyc_rejected", name: "KYC needs attention: help the client", active: true, trigger: { type: "kyc_rejected" }, conditions: {}, delay_minutes: 0, once_per_lead: false, actions: [{ type: "create_task", task_type: "call", title: "KYC not accepted: help upload new documents", due_in_hours: 1 }] },
    { id: "auto_kyc_approved", name: "KYC approved: open account and first deposit", active: true, trigger: { type: "kyc_approved" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "create_task", task_type: "call", title: "KYC approved: help open the account and make the first deposit", due_in_hours: 1 }] },
    { id: "auto_funded_idle", name: "Funded 3 days, not trading: first-trade help", active: true, trigger: { type: "funded_not_trading", days: 3 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_first_trade" }, { type: "create_task", task_type: "call", title: "Funded but not trading: book a platform walkthrough", due_in_hours: 2 }] },
    { id: "auto_dormant", name: "Dormant client: re-engage", active: true, trigger: { type: "client_dormant", days: 30 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_dormant" }, { type: "create_task", task_type: "call", title: "Dormant client: check in and share market ideas", due_in_hours: 24 }] },
  ];
  const DEFAULT_AUTOMATIONS = [
    { id: "auto_welcome", name: "Welcome email on new lead", active: true, trigger: { type: "lead_created" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_welcome_email" }] },
    { id: "auto_wa_intro", name: "WhatsApp intro from assigned agent", active: true, trigger: { type: "lead_assigned" }, conditions: { stages: ["new"] }, delay_minutes: 2, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_intro" }] },
    { id: "auto_missed", name: "WhatsApp after unanswered call", active: true, trigger: { type: "call_logged", outcomes: ["no_answer", "busy", "switched_off", "voicemail"] }, conditions: {}, delay_minutes: 5, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_missed" }] },
    { id: "auto_nocontact", name: "No contact after 24 hours", active: true, trigger: { type: "no_contact", hours: 24 }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_no_contact_email" }, { type: "create_task", task_type: "call", title: "Urgent: no contact yet", due_in_hours: 0 }, { type: "notify_managers", text: "{{full_name}} has not been reached in 24 hours" }] },
    { id: "auto_registered", name: "Registered: push to verify and fund", active: true, trigger: { type: "stage_changed", stages: ["registered"] }, conditions: {}, delay_minutes: 10, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_registered_email" }, { type: "create_task", task_type: "call", title: "Help client complete KYC and fund", due_in_hours: 24 }] },
    { id: "auto_funded", name: "Thank-you on first deposit", active: true, trigger: { type: "stage_changed", stages: ["funded"] }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_funded_email" }, { type: "notify_managers", text: "New FTD: {{full_name}}" }] },
    { id: "auto_inactive", name: "Re-engage after 7 quiet days", active: true, trigger: { type: "inactive", days: 7 }, conditions: { stages: ["contacted", "qualified", "registered", "kyc"] }, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email", template_id: "tpl_reengage_email" }, { type: "create_task", task_type: "call", title: "Re-engage quiet lead", due_in_hours: 2 }] },
  ];

  return { createCRM, createMemoryStore, CrmError, totpCode, totpVerify, base32Encode, STAGES, OUTCOMES, QA_FIELDS, TRIGGERS, TEMPLATE_VARS, ROLES, COLLECTIONS, CHECKLIST };
});
