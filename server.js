/**
 * Absel Global — website + lead API + Absel CRM
 * Node.js 22.13+ (built-in http and crypto) and PostgreSQL via the `pg` package.
 *
 *   cp .env.example .env    (edit it: DATABASE_URL, SESSION_SECRET, admin login)
 *   npm install && node server.js
 */
"use strict";
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ROOT = __dirname;
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* optional */ }

const { createCRM, CrmError } = require("./lib/core.js");
const { openStore } = require("./lib/store-postgres.js");
const channels = require("./lib/channels.js");

/* ------------------------------------------------------------------ config */
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const IS_PROD = process.env.NODE_ENV === "production";
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 0) > 0;
const CRM_PATH = "/" + (process.env.CRM_PATH || "crm").replace(/^\/+|\/+$/g, "");
const RESTRICTED = new Set(["United Arab Emirates", "United States", "Canada", "Singapore", "Cuba", "Eritrea", "Myanmar", "Iran", "North Korea", "Kyrgyzstan", "Syria", "Liberia", "Yemen", "Somalia", "Jamaica", "Albania", "Barbados", "Cambodia", "Panama"]);

if (SESSION_SECRET.length < 32) { console.error("✖ Set SESSION_SECRET in .env (at least 32 random characters)."); process.exit(1); }
if (!DATABASE_URL) { console.error("✖ Set DATABASE_URL in .env to your Postgres connection string (e.g. from Neon: postgresql://user:pass@host/db?sslmode=require)."); process.exit(1); }

/* --------------------------------------------------------------- passwords */
// PBKDF2-SHA256, 310,000 rounds (OWASP). Same format the browser prototype writes, so accounts move between them.
const PBKDF2_ROUNDS = 310000;
function hashPassword(p) { const salt = crypto.randomBytes(16); const h = crypto.pbkdf2Sync(String(p), salt, PBKDF2_ROUNDS, 32, "sha256"); return `pbkdf2$sha256$${PBKDF2_ROUNDS}$${salt.toString("base64")}$${h.toString("base64")}`; }
function verifyPassword(p, stored) {
  const parts = String(stored || "").split("$");
  try {
    if (parts[0] === "pbkdf2" && parts[1] === "sha256") {
      const want = Buffer.from(parts[4], "base64"), got = crypto.pbkdf2Sync(String(p), Buffer.from(parts[3], "base64"), Number(parts[2]), want.length, "sha256");
      return want.length === got.length && crypto.timingSafeEqual(want, got);
    }
    if (parts[0] === "scrypt") { // older demo databases
      const want = Buffer.from(parts[2], "base64"), got = crypto.scryptSync(String(p), Buffer.from(parts[1], "base64"), want.length, { N: 16384, r: 8, p: 1 });
      return crypto.timingSafeEqual(want, got);
    }
  } catch (e) { return false; }
  return false;
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex")); // keeps "unknown user" as slow as "wrong password"

/* ------------------------------------------------------------- CRM + queue */
const store = openStore(DATABASE_URL, path.join(ROOT, "db", "schema.sql")); // loaded in start() below
const sendQueue = [];
// One-click unsubscribe links in marketing emails: /unsubscribe?t=<lead id>.<signature>
const unsubToken = id => Buffer.from(id).toString("base64url") + "." + crypto.createHmac("sha256", SESSION_SECRET).update("unsub:" + id).digest("base64url").slice(0, 22);
const crm = createCRM({ store, hashPassword, verifyPassword, random: n => new Uint8Array(crypto.randomBytes(n)), onQueue: m => sendQueue.push(m.id),
  hashToken: t => crypto.createHash("sha256").update(String(t)).digest("hex"),
  unsubscribeUrl: l => (crm.getSettings().site_url || "") + "/unsubscribe?t=" + unsubToken(l.id) });

function prepare() {
  store.transaction(() => crm.ensureDefaults());
  // First start: create the admin from .env
  if (!store.all("users").some(u => u.role === "admin")) {
    const u = (process.env.ADMIN_USERNAME || "").trim(), p = process.env.ADMIN_PASSWORD || "";
    if (!u || p.length < 10) { console.error("✖ First start: set ADMIN_USERNAME and ADMIN_PASSWORD (10+ characters, letters and numbers) in .env to create the admin login."); process.exit(1); }
    try { store.transaction(() => crm.saveUser(crm.SYSTEM, { name: process.env.ADMIN_NAME || "Administrator", username: u, password: p, role: "admin", email: process.env.ADMIN_EMAIL || "", accepts_leads: false, must_change_password: true })); }
    catch (e) { console.error("✖ " + e.message); process.exit(1); }
    console.log(`✔ Admin user "${u}" created. It must choose a new password at first sign-in. Remove ADMIN_PASSWORD from .env now.`);
  }
  // Re-queue anything left unsent by a previous run
  store.all("messages").filter(m => m.status === "queued").forEach(m => sendQueue.push(m.id));
}

let sending = false;
async function drainQueue() {
  if (sending) return; sending = true;
  try {
    while (sendQueue.length) {
      const id = sendQueue.shift(), m = store.get("messages", id);
      if (!m || m.status !== "queued") continue;
      try {
        const r = m.channel === "email" ? await channels.sendEmail(m.to, m.subject || "(no subject)", m.body) : await channels.sendWhatsApp(m);
        store.transaction(() => crm.markMessage(m.id, "sent", { provider_id: r.provider_id }));
      } catch (e) {
        m.attempts = (m.attempts || 0) + 1;
        if (e.notConfigured) store.transaction(() => crm.markMessage(m.id, "skipped", { error: e.message }));
        else if (e.retry && m.attempts < 4) { store.put("messages", m); setTimeout(() => { sendQueue.push(m.id); drainQueue(); }, 60000 * m.attempts); }
        else store.transaction(() => crm.markMessage(m.id, "failed", { error: e.message }));
      }
    }
  } finally { sending = false; }
}
function startJobs() {
  setInterval(() => { try { store.transaction(() => crm.tick()); } catch (e) { console.error("automation tick:", e); } drainQueue(); dailyMis().catch(e => console.error("MIS email:", e.message)); }, 30000).unref();
  setTimeout(() => { try { store.transaction(() => crm.tick()); } catch (e) { console.error("automation tick:", e); } drainQueue(); }, 3000).unref();
}

/* ------------------------------------------------------- daily MIS email */
async function sendMis(day, to) {
  const m = crm.misSummary(day);
  for (const r of to) await channels.sendEmail(r, m.subject, m.text);
  return { sent: to.length, subject: m.subject, day };
}
async function dailyMis() {
  const s = crm.getSettings(), cfg = s.mis_email || {};
  if (!cfg.enabled || !(cfg.recipients || []).length || !channels.status().email.configured) return;
  const now = new Date(Date.now() + (Number(s.tz_offset_min) || 0) * 60000), today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < (cfg.hour || 0) || s.mis_last_sent === today) return;
  store.transaction(() => { const st = store.get("settings", "main"); st.mis_last_sent = today; store.put("settings", st); });
  const y = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  await sendMis(y, cfg.recipients);
  console.log("✔ Daily MIS email sent for", y);
}

/* ----------------------------------------------------------------- helpers */
const clean = (v, max = 200) => (v == null ? "" : String(v)).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
function clientIp(req) {
  if (TRUST_PROXY) { const cf = req.headers["cf-connecting-ip"]; if (cf) return clean(cf, 64); const x = req.headers["x-forwarded-for"]; if (x) return clean(String(x).split(",")[0], 64); }
  return clean(req.socket.remoteAddress, 64);
}
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, windowMs).unref();
  return key => { const n = Date.now(), h = hits.get(key) || { n: 0, reset: n + windowMs }; if (h.reset < n) { h.n = 0; h.reset = n + windowMs; } h.n++; hits.set(key, h); return h.n <= max; };
}
const leadLimit = limiter(8, 15 * 60e3), loginLimit = limiter(60, 15 * 60e3), hookLimit = limiter(600, 15 * 60e3);
const env = k => (process.env[k] || "").trim();
const safeEq = (a, b) => { a = Buffer.from(String(a || "")); b = Buffer.from(String(b || "")); return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b); };

const sign = d => crypto.createHmac("sha256", SESSION_SECRET).update(d).digest("base64url");
// Session cookie: user id . session version . expiry . HMAC. Changing a password, deactivating an account
// or "Sign out everywhere" bumps the version, which ends every existing session for that user.
function makeToken(uid, ver) { const body = Buffer.from(uid).toString("base64url") + "." + (ver || 0) + "." + (Date.now() + SESSION_HOURS * 3600e3); return body + "." + sign(body); }
function sessionUser(req) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith("ag_crm="));
  const p = (m ? decodeURIComponent(m.slice(7)) : "").split("."); if (p.length !== 4) return null;
  const a = Buffer.from(sign(p[0] + "." + p[1] + "." + p[2])), b = Buffer.from(p[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || Number(p[2]) < Date.now()) return null;
  const u = store.get("users", Buffer.from(p[0], "base64url").toString());
  if (!u || u.active === false || Number(p[1]) !== (u.session_ver || 0)) return null;
  return { id: u.id, name: u.name, role: u.role, email: u.email, phone: u.phone, username: u.username, accepts_leads: u.accepts_leads !== false };
}
const cookie = (v, age) => `ag_crm=${encodeURIComponent(v)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${IS_PROD ? "; Secure" : ""}`;

const SEC = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN", ...(IS_PROD ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}) };
function send(res, status, body, headers = {}) {
  if (res.sending) return; res.sending = true;
  const str = typeof body === "string";
  const write = () => {
    res.writeHead(status, { ...SEC, "Content-Type": str ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
    res.end(str ? body : JSON.stringify(body));
  };
  // Answer only after this request's changes are saved in Postgres
  return store.pending() ? store.flush().then(write) : write();
}
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Request too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject);
  });
}
async function readJson(req, limit) { const raw = await readBody(req, limit); if (!raw.length) return {}; try { return JSON.parse(raw.toString("utf8")); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); } }

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };
const PUBLIC = path.join(ROOT, "public");
function serveFile(req, res, file, extra = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Not found");
    res.writeHead(200, { ...SEC, "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600", ...extra });
    if (req.method === "HEAD") return res.end(); fs.createReadStream(file).pipe(res);
  });
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === CRM_PATH) return send(res, 301, "", { Location: CRM_PATH + "/" });
  if (rel.startsWith(CRM_PATH + "/")) {
    const sub = rel.slice(CRM_PATH.length + 1) || "index.html";
    if (sub === "core.js") return send(res, 404, "Not found");
    const file = path.normalize(path.join(PUBLIC, "crm", sub));
    if (!file.startsWith(path.join(PUBLIC, "crm") + path.sep)) return send(res, 403, "Forbidden");
    return serveFile(req, res, file, { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src https: data: blob:; frame-src blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  }
  if (rel.startsWith("/crm/")) return send(res, 404, "Not found"); // hide the default path when CRM_PATH is customised
  if (rel === "/portal") return send(res, 301, "", { Location: "/portal/" });
  if (rel.startsWith("/portal/")) {
    const file = path.normalize(path.join(PUBLIC, rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(path.join(PUBLIC, "portal") + path.sep)) return send(res, 403, "Forbidden");
    return serveFile(req, res, file, { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; frame-src blob: data:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden");
  serveFile(req, res, file);
}

/* -------------------------------------------------------------------- RPC */
// Every CRM screen calls one of these. Permissions are enforced inside the core.
const RPC = {
  meta: u => Object.assign(crm.meta(u), { channels: channels.status(), mode: "server", telephony: { mode: env("TELEPHONY_CLICK_URL") ? "click" : "tel" } }),
  queue: u => crm.queue(u),
  listLeads: (u, f) => crm.listLeads(u, f), getLead: (u, id) => crm.getLead(u, id), addLead: (u, d) => crm.addLead(u, d),
  updateLead: (u, id, p) => crm.updateLead(u, id, p), changeStage: (u, id, s, o) => crm.changeStage(u, id, s, o),
  assignLeads: (u, ids, owner) => crm.assignLeads(u, ids, owner), reassignPool: u => crm.reassignPool(u), bulkStage: (u, ids, s, o) => crm.bulkStage(u, ids, s, o), deleteLeads: (u, ids) => crm.deleteLeads(u, ids),
  logCall: (u, id, c) => crm.logCall(u, id, c), addNote: (u, id, t) => crm.addNote(u, id, t),
  createTask: (u, id, t) => crm.createTask(u, id, t), completeTask: (u, id, o) => crm.completeTask(u, id, o), rescheduleTask: (u, id, d) => crm.rescheduleTask(u, id, d), listTasks: (u, f) => crm.listTasks(u, f),
  sendMessage: (u, id, p) => crm.sendMessage(u, id, p), listMessages: (u, f) => crm.listMessages(u, f),
  report: (u, t, f) => crm.report(u, t, f),
  listUsers: u => crm.listUsers(u), saveUser: (u, p) => crm.saveUser(u, p), setAvailability: (u, a) => crm.setAvailability(u, a),
  listRules: u => crm.listRules(u), saveRule: (u, r) => crm.saveRule(u, r), deleteRule: (u, id) => crm.deleteRule(u, id),
  listTemplates: u => crm.listTemplates(u), saveTemplate: (u, t) => crm.saveTemplate(u, t), deleteTemplate: (u, id) => crm.deleteTemplate(u, id),
  listAutomations: u => crm.listAutomations(u), saveAutomation: (u, a) => crm.saveAutomation(u, a), deleteAutomation: (u, id) => crm.deleteAutomation(u, id),
  listNotifications: u => crm.listNotifications(u), markRead: (u, ids) => crm.markRead(u, ids),
  getSettings: u => Object.assign(crm.getSettings(), { channels: channels.status(), integrations: integrations() }), saveSettings: (u, p) => crm.saveSettings(u, p),
  importLeads: (u, rows, o) => crm.importLeads(u, rows, o), exportLeads: (u, f) => crm.exportLeads(u, f),
  adminUserAction: (u, id, action) => crm.adminUserAction(u, id, action), listLogins: (u, f) => crm.listLogins(u, f),
  totpBegin: u => crm.totpBegin(u), totpEnable: (u, code) => crm.totpEnable(u, code), totpDisable: (u, code) => crm.totpDisable(u, code),
  exportAll: u => crm.exportAll(u),
  // sales
  submitDeposit: (u, id, d) => crm.submitDeposit(u, id, d), verifyDeposit: (u, id, ok, why) => crm.verifyDeposit(u, id, ok, why), listDeposits: (u, f) => crm.listDeposits(u, f),
  uploadFile: (u, id, f) => crm.uploadFile(u, id, f), getFile: (u, id) => crm.getFile(u, id),
  setChecklist: (u, id, k, d, v) => crm.setChecklist(u, id, k, d, v), listPipeline: (u, f) => crm.listPipeline(u, f), targets: (u, f) => crm.targets(u, f),
  listDnc: u => crm.listDnc(u), addDnc: (u, p) => crm.addDnc(u, p), removeDnc: (u, id) => crm.removeDnc(u, id), listOptOuts: u => crm.listOptOuts(u),
  duplicateGroups: u => crm.duplicateGroups(u), mergeLeads: (u, keep, ids) => crm.mergeLeads(u, keep, ids), listRecycle: u => crm.listRecycle(u), recycleLeads: (u, ids) => crm.recycleLeads(u, ids),
  listConversations: (u, f) => crm.listConversations(u, f), getConversation: (u, id) => crm.getConversation(u, id),
  listCallsForReview: (u, f) => crm.listCallsForReview(u, f), saveReview: (u, p) => crm.saveReview(u, p), listReviews: (u, f) => crm.listReviews(u, f), ackReview: (u, id) => crm.ackReview(u, id),
  setBreak: (u, r) => crm.setBreak(u, r), liveBoard: u => crm.liveBoard(u), setTarget: (u, id, n, a) => crm.setTarget(u, id, n, a),
  // marketing
  listCampaigns: u => crm.listCampaigns(u), saveCampaign: (u, c) => crm.saveCampaign(u, c), deleteCampaign: (u, id) => crm.deleteCampaign(u, id),
  addSpend: (u, p) => crm.addSpend(u, p), importSpend: (u, rows) => crm.importSpend(u, rows), deleteSpend: (u, id) => crm.deleteSpend(u, id), listSpend: (u, id) => crm.listSpend(u, id),
  previewSegment: (u, g, ch) => crm.previewSegment(u, g, ch), saveBroadcast: (u, b) => crm.saveBroadcast(u, b), submitBroadcast: (u, id) => crm.submitBroadcast(u, id),
  // optional journey: demo and company-funded account
  setDemo: (u, id, act, d) => crm.setDemo(u, id, act, d), bonusEligibility: (u, id) => crm.bonusEligibility(u, id), requestBonus: (u, id, p) => crm.requestBonus(u, id, p),
  decideBonus: (u, id, ok, p) => crm.decideBonus(u, id, ok, p), updateBonus: (u, id, p) => crm.updateBonus(u, id, p), requestBonusWithdrawal: (u, id, a) => crm.requestBonusWithdrawal(u, id, a),
  decideBonusWithdrawal: (u, id, wid, ok, why) => crm.decideBonusWithdrawal(u, id, wid, ok, why), cancelBonus: (u, id, why) => crm.cancelBonus(u, id, why), listBonuses: (u, f) => crm.listBonuses(u, f),
  // operations back office (client area)
  listLifecycle: (u, f) => crm.listLifecycle(u, f), markTradingStarted: (u, id) => crm.markTradingStarted(u, id), listTradingAccounts: (u, f) => crm.listTradingAccounts(u, f),
  opsOverview: u => crm.opsOverview(u), listClients: (u, f) => crm.listClients(u, f), getClient: (u, id) => crm.getClient(u, id), getClientFile: (u, id) => crm.getClientFile(u, id),
  setClientStatus: (u, id, st, why) => crm.setClientStatus(u, id, st, why), listKyc: (u, f) => crm.listKyc(u, f), decideKyc: (u, id, d, why) => crm.decideKyc(u, id, d, why),
  listAccountRequests: (u, f) => crm.listAccountRequests(u, f), openAccount: (u, id, d) => crm.openAccount(u, id, d), rejectAccount: (u, id, why) => crm.rejectAccount(u, id, why),
  setAccountPassword: (u, id, pw) => crm.setAccountPassword(u, id, pw), updateAccount: (u, id, d) => crm.updateAccount(u, id, d),
  listPayments: (u, f) => crm.listPayments(u, f), decidePayment: (u, id, a, d) => crm.decidePayment(u, id, a, d), importBalances: (u, rows) => crm.importBalances(u, rows),
  approveBroadcast: (u, id, ok, why) => crm.approveBroadcast(u, id, ok, why), cancelBroadcast: (u, id) => crm.cancelBroadcast(u, id), listBroadcasts: u => crm.listBroadcasts(u), getBroadcast: (u, id) => crm.getBroadcast(u, id),
};
// Actions that call out to other systems (async, outside the database transaction)
const ASYNC_RPC = {
  async dial(u, leadId) {
    const info = store.transaction(() => crm.dialInfo(u, leadId)), url = env("TELEPHONY_CLICK_URL");
    if (!url) return { mode: "tel", number: info.number };
    if (!info.extension) throw new CrmError("Ask an admin to add your phone extension in Team before using click-to-call.");
    const fill = t => t.replace(/\{extension\}/g, encodeURIComponent(info.extension)).replace(/\{number\}/g, encodeURIComponent(info.number)).replace(/\{number_digits\}/g, info.number.replace(/\D/g, ""));
    const method = (env("TELEPHONY_CLICK_METHOD") || "GET").toUpperCase(), headers = env("TELEPHONY_AUTH_HEADER") ? { Authorization: env("TELEPHONY_AUTH_HEADER") } : {};
    let r;
    try { r = await fetch(fill(url), { method, headers: method === "POST" ? Object.assign({ "Content-Type": "application/json" }, headers) : headers, body: method === "POST" ? fill(env("TELEPHONY_CLICK_BODY") || '{"extension":"{extension}","number":"{number}"}') : undefined, signal: AbortSignal.timeout(10000) }); }
    catch (e) { throw new CrmError("The phone system didn't answer. Dial manually for now."); }
    if (!r.ok) throw new CrmError("The phone system refused the call (" + r.status + "). Dial manually for now.");
    return { mode: "click", number: info.number, extension: info.extension };
  },
  async sendMisNow(u) {
    if (u.role !== "admin") throw new CrmError("Only admins can do this.", 403);
    const cfg = crm.getSettings().mis_email || {};
    if (!channels.status().email.configured) throw new CrmError("Connect an email provider first (EMAIL_PROVIDER in .env).");
    if (!(cfg.recipients || []).length) throw new CrmError("Add at least one recipient and save settings first.");
    const s = crm.getSettings(), y = new Date(Date.now() + (Number(s.tz_offset_min) || 0) * 60000 - 864e5).toISOString().slice(0, 10);
    return sendMis(y, cfg.recipients);
  },
};
function integrations() {
  return {
    lead_api: !!env("LEAD_API_KEY"), meta_leads: !!(env("META_VERIFY_TOKEN") && env("META_PAGE_TOKEN")), google_leads: !!env("GOOGLE_LEAD_KEY"),
    telephony_click: !!env("TELEPHONY_CLICK_URL"), telephony_webhook: !!env("TELEPHONY_WEBHOOK_TOKEN"),
  };
}

async function rpc(req, res) {
  if (req.headers["x-requested-with"] !== "absel-crm") return send(res, 403, { ok: false, error: "Forbidden" }); // CSRF guard
  const u = sessionUser(req);
  if (!u) return send(res, 401, { ok: false, error: "Please sign in." });
  const b = await readJson(req);
  const fn = RPC[b.method], afn = ASYNC_RPC[b.method];
  if (!fn && !afn) return send(res, 404, { ok: false, error: "Unknown action" });
  const g = crm.gate(u); // forced password change / required two-step setup come first
  if (g && !["meta", "totpBegin", "totpEnable"].includes(b.method)) return send(res, 403, { ok: false, error: g === "change_password" ? "Change your password first." : "Set up two-step verification first.", gate: g });
  store.transaction(() => crm.heartbeat(u)); // attendance: online time
  try {
    const args = Array.isArray(b.args) ? b.args : [];
    const result = afn ? await afn(u, ...args) : store.transaction(() => fn(u, ...args));
    drainQueue();
    send(res, 200, { ok: true, result });
  } catch (e) {
    if (e instanceof CrmError) return send(res, e.code === 404 ? 404 : e.code === 403 ? 403 : 422, { ok: false, error: e.message, fields: e.fields });
    throw e;
  }
}

/* ------------------------------------------------------- client area (portal) */
// Clients sign in with their email. Separate cookie (only sent to /api/portal) and a separate signing prefix,
// so a client session can never be used against the CRM.
const PORTAL_HOURS = Number(process.env.PORTAL_SESSION_HOURS || 8);
const signP = d => sign("client:" + d);
function makeClientToken(id, ver) { const body = Buffer.from(id).toString("base64url") + "." + (ver || 0) + "." + (Date.now() + PORTAL_HOURS * 3600e3); return body + "." + signP(body); }
function sessionClient(req) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith("ag_client="));
  const p = (m ? decodeURIComponent(m.slice(10)) : "").split("."); if (p.length !== 4) return null;
  const a = Buffer.from(signP(p[0] + "." + p[1] + "." + p[2])), b = Buffer.from(p[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || Number(p[2]) < Date.now()) return null;
  const x = store.get("clients", Buffer.from(p[0], "base64url").toString());
  if (!x || x.status !== "active" || Number(p[1]) !== (x.session_ver || 0)) return null;
  return { id: x.id };
}
const clientCookie = (v, age) => `ag_client=${encodeURIComponent(v)}; Path=/api/portal; HttpOnly; SameSite=Strict; Max-Age=${age}${IS_PROD ? "; Secure" : ""}`;
const regLimit = limiter(6, 60 * 60e3), forgotLimit = limiter(6, 60 * 60e3);
const siteUrl = () => (crm.getSettings().site_url || "").replace(/\/+$/, "") || "http://localhost:" + PORT;
const brand = () => ((crm.getSettings().portal || {}).brand) || "Absel Global";
// Verification and reset links are emailed directly and never stored in the message log
async function sendClientLink(kind, to, firstName, token) {
  const link = siteUrl() + "/portal/#" + kind + "?t=" + encodeURIComponent(token);
  const subject = kind === "verify" ? `Confirm your email for ${brand()}` : `Reset your ${brand()} password`;
  const text = kind === "verify" ? `Hi ${firstName},\n\nWelcome to ${brand()}. Confirm your email to open your trading account:\n${link}\n\nThe link works for 48 hours. If you didn't sign up, ignore this email.\n\nThe ${brand()} team`
    : `Hi ${firstName},\n\nSomeone asked to reset the password for your ${brand()} client area. To choose a new password, open:\n${link}\n\nThe link works for 1 hour. If it wasn't you, ignore this email; your password stays the same.\n\nThe ${brand()} team`;
  try { await channels.sendEmail(to, subject, text); return null; }
  catch (e) { if (!IS_PROD) { console.log(`  [dev] ${kind} link for ${to}: ${link}`); return link; } console.error("Client email failed:", e.message); return null; }
}
const PORTAL_RPC = {
  me: c => crm.portalMe(c), updateProfile: (c, p) => crm.portalUpdateProfile(c, p), uploadKyc: (c, f) => crm.portalUploadKyc(c, f), getFile: (c, id) => crm.portalGetFile(c, id),
  requestAccount: (c, p) => crm.portalRequestAccount(c, p), revealPassword: (c, id) => crm.portalRevealPassword(c, id),
  deposit: (c, d) => crm.portalDeposit(c, d), withdraw: (c, d) => crm.portalWithdraw(c, d), transfer: (c, d) => crm.portalTransfer(c, d), cancel: (c, id) => crm.portalCancel(c, id), history: (c, f) => crm.portalHistory(c, f),
  totpBegin: c => crm.portalTotpBegin(c), totpEnable: (c, code) => crm.portalTotpEnable(c, code), totpDisable: (c, code) => crm.portalTotpDisable(c, code),
};
const portalErr = (res, e) => { if (e instanceof CrmError) return send(res, e.code === 401 ? 401 : e.code === 404 ? 404 : e.code === 403 ? 403 : 422, { ok: false, error: e.message, fields: e.fields }); throw e; };
async function portal(req, res, p) {
  if (req.headers["x-requested-with"] !== "absel-portal") return send(res, 403, { ok: false, error: "Forbidden" }); // CSRF guard
  const ip = clientIp(req), meta = { ip, ua: clean(req.headers["user-agent"], 200) };
  try {
    if (p === "register") {
      if (!regLimit(ip)) return send(res, 429, { ok: false, error: "Too many sign-ups from this network. Try again later." });
      const b = await readJson(req, 20480);
      if (b.website) return send(res, 200, { ok: true }); // honeypot
      if (RESTRICTED.has(clean(b.country, 80))) return send(res, 422, { ok: false, error: RESTRICTED_MSG + ".", fields: { country: RESTRICTED_MSG } });
      const r = store.transaction(() => crm.portalRegister(b, meta)); drainQueue();
      const dev = await sendClientLink("verify", r.client.email, r.client.first_name, r.verify_token);
      return send(res, 201, { ok: true, dev_link: dev || undefined }, { "Set-Cookie": clientCookie(makeClientToken(r.client.id, 0), PORTAL_HOURS * 3600) });
    }
    if (p === "login") {
      if (!loginLimit(ip)) return send(res, 429, { ok: false, error: "Too many attempts from this network. Try again in 15 minutes." });
      const b = await readJson(req, 4096), email = clean(b.email, 160).toLowerCase(), password = String(b.password || "").slice(0, 200), code = clean(b.code, 10);
      const generic = () => send(res, 401, { ok: false, error: "Wrong email or password." });
      const { client } = crm.portalAuthLookup(email);
      if (!client) { verifyPassword(password, DUMMY_HASH); return generic(); }
      if (client.locked) { const mins = Math.max(1, Math.ceil((Date.parse(client.locked_until) - Date.now()) / 60000)); return send(res, 423, { ok: false, error: `Too many wrong attempts. Try again in ${mins} min or reset your password.` }); }
      if (!client.active) { verifyPassword(password, DUMMY_HASH); return send(res, 403, { ok: false, error: "This account is suspended. Contact support." }); }
      if (!verifyPassword(password, client.password_hash)) { store.transaction(() => crm.portalAuthResult(email, "bad_password", meta)); return generic(); }
      if (client.totp_enabled) {
        if (!code) return send(res, 200, { ok: false, need_code: true });
        if (!crm.portalTotpCheck(client.id, code)) { store.transaction(() => crm.portalAuthResult(email, "bad_code", meta)); return send(res, 401, { ok: false, need_code: true, error: "That code is wrong or expired." }); }
      }
      const r = store.transaction(() => crm.portalAuthResult(email, "ok", meta));
      return send(res, 200, { ok: true }, { "Set-Cookie": clientCookie(makeClientToken(r.id, r.session_ver), PORTAL_HOURS * 3600) });
    }
    if (p === "logout") return send(res, 200, { ok: true }, { "Set-Cookie": clientCookie("", 0) });
    if (p === "verify") { const b = await readJson(req, 2048); store.transaction(() => crm.portalVerifyEmail(b.token)); return send(res, 200, { ok: true }); }
    if (p === "forgot") {
      if (!forgotLimit(ip)) return send(res, 429, { ok: false, error: "Too many requests. Try again later." });
      const b = await readJson(req, 2048), r = store.transaction(() => crm.portalForgot(clean(b.email, 160)));
      const dev = r ? await sendClientLink("reset", r.email, r.first_name, r.reset_token) : null;
      return send(res, 200, { ok: true, dev_link: dev || undefined }); // same answer whether or not the email exists
    }
    if (p === "reset") {
      if (!loginLimit(ip)) return send(res, 429, { ok: false, error: "Too many attempts. Try again later." });
      const b = await readJson(req, 4096); store.transaction(() => crm.portalReset(b.token, String(b.password || ""))); return send(res, 200, { ok: true });
    }
    const c = sessionClient(req);
    if (!c) return send(res, 401, { ok: false, error: "Please sign in." }, { "Set-Cookie": clientCookie("", 0) });
    if (p === "resend") { const r = store.transaction(() => crm.portalResendVerify(c)); const dev = await sendClientLink("verify", r.email, r.first_name, r.verify_token); return send(res, 200, { ok: true, dev_link: dev || undefined }); }
    if (p === "password") {
      if (!loginLimit(ip)) return send(res, 429, { ok: false, error: "Too many attempts. Try again later." });
      const b = await readJson(req, 4096), x = store.get("clients", c.id);
      if (!verifyPassword(String(b.current || ""), x.password_hash)) return send(res, 422, { ok: false, error: "Your current password is wrong.", fields: { current: "Wrong password" } });
      const r = store.transaction(() => crm.portalSetPassword(c, String(b.password || ""), null));
      return send(res, 200, { ok: true }, { "Set-Cookie": clientCookie(makeClientToken(c.id, r.session_ver), PORTAL_HOURS * 3600) });
    }
    if (p === "rpc") {
      const b = await readJson(req, 9 * 1024 * 1024), fn = PORTAL_RPC[b.method];
      if (!fn) return send(res, 404, { ok: false, error: "Unknown action" });
      const result = store.transaction(() => fn(c, ...(Array.isArray(b.args) ? b.args : []))); drainQueue();
      return send(res, 200, { ok: true, result });
    }
    return send(res, 404, { ok: false, error: "Not found" });
  } catch (e) { return portalErr(res, e); }
}

/* ---------------------------------------------------------------- routes */
async function publicLead(req, res) {
  if (!leadLimit(clientIp(req))) return send(res, 429, { ok: false, error: "Too many requests. Please try again in a few minutes." });
  const b = await readJson(req, 20480);
  if (b.website) return send(res, 201, { ok: true, reference: "AG-" + crypto.randomBytes(3).toString("hex").toUpperCase() }); // honeypot
  if (b.consent !== true) return send(res, 422, { ok: false, errors: { consent: "Consent is required" } });
  if (RESTRICTED.has(clean(b.country, 80))) return send(res, 422, { ok: false, errors: { country: "Absel Global does not accept clients from this country" } });
  delete b.sample; delete b.reference; delete b.tags;
  try {
    const l = store.transaction(() => crm.createLead(crm.SYSTEM, Object.assign({}, b, { ip: clientIp(req), user_agent: req.headers["user-agent"] }), { source: "web" }));
    drainQueue();
    send(res, 201, { ok: true, reference: l.reference });
  } catch (e) {
    if (e instanceof CrmError) return send(res, 422, { ok: false, errors: e.fields || {}, error: e.message });
    throw e;
  }
}

async function whatsappWebhook(req, res, url) {
  const verify = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  if (req.method === "GET") {
    if (verify && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verify) return send(res, 200, clean(url.searchParams.get("hub.challenge"), 100));
    return send(res, 403, "Forbidden");
  }
  if (req.method !== "POST") return send(res, 405, "Method not allowed");
  const raw = await readBody(req, 1024 * 1024);
  const secret = (process.env.WHATSAPP_APP_SECRET || "").trim();
  if (!secret && IS_PROD) return send(res, 401, "Set WHATSAPP_APP_SECRET to accept webhooks");
  if (secret && !channels.verifyWebhookSignature(raw, req.headers["x-hub-signature-256"])) return send(res, 401, "Bad signature");
  let body = {}; try { body = JSON.parse(raw.toString("utf8")); } catch {}
  store.transaction(() => {
    for (const entry of body.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        const text = m.text ? m.text.body : m.button ? m.button.text : m.interactive ? JSON.stringify(m.interactive).slice(0, 300) : `[${m.type}]`;
        const name = String(names[m.from] || "").split(" ");
        crm.recordInbound({ phone: m.from, text, provider_id: m.id, name: name[0] || "", channel: "whatsapp" });
      }
      for (const s of v.statuses || []) crm.markMessage(null, s.status === "failed" ? "failed" : s.status, { provider_id: s.id, error: s.errors && s.errors[0] && s.errors[0].title });
    }
  });
  send(res, 200, "OK");
}

async function login(req, res) {
  const ip = clientIp(req), ua = clean(req.headers["user-agent"], 200), meta = { ip, ua };
  if (!loginLimit(ip)) return send(res, 429, { ok: false, error: "Too many attempts from this network. Try again in 15 minutes." });
  const b = await readJson(req, 4096);
  const username = clean(b.username, 60).toLowerCase(), password = String(b.password || "").slice(0, 200), code = clean(b.code, 10);
  const generic = () => send(res, 401, { ok: false, error: "Wrong username or password." });
  const { user } = crm.authLookup(username);
  if (!user) { verifyPassword(password, DUMMY_HASH); store.transaction(() => crm.authResult(username, "unknown", meta)); return generic(); }
  if (user.locked) { store.transaction(() => crm.authResult(username, "locked", meta)); const mins = Math.max(1, Math.ceil((Date.parse(user.locked_until) - Date.now()) / 60000)); return send(res, 423, { ok: false, error: `This account is locked after too many wrong attempts. Try again in ${mins} min or ask an admin to unlock it.` }); }
  if (!user.active) { verifyPassword(password, DUMMY_HASH); store.transaction(() => crm.authResult(username, "inactive", meta)); return generic(); }
  if (!user.password_hash || !verifyPassword(password, user.password_hash)) { store.transaction(() => crm.authResult(username, "bad_password", meta)); return generic(); }
  if (user.totp_enabled) {
    if (!code) return send(res, 200, { ok: false, need_code: true });
    if (!crm.totpCheck(user.id, code)) { store.transaction(() => crm.authResult(username, "bad_code", meta)); return send(res, 401, { ok: false, need_code: true, error: "That code is wrong or expired. Use the newest code in your authenticator app." }); }
  }
  const u = store.transaction(() => crm.authResult(username, "ok", meta));
  send(res, 200, { ok: true, user: u }, { "Set-Cookie": cookie(makeToken(u.id, u.session_ver), SESSION_HOURS * 3600) });
}
async function changePassword(req, res) {
  if (req.headers["x-requested-with"] !== "absel-crm") return send(res, 403, { ok: false, error: "Forbidden" });
  const u = sessionUser(req); if (!u) return send(res, 401, { ok: false, error: "Please sign in." });
  if (!loginLimit(clientIp(req))) return send(res, 429, { ok: false, error: "Too many attempts. Try again in 15 minutes." });
  const b = await readJson(req, 4096), x = store.get("users", u.id);
  if (!verifyPassword(String(b.current || ""), x.password_hash)) { store.transaction(() => crm.logSecurity(x, "password_change_failed", x, { ip: clientIp(req) })); return send(res, 422, { ok: false, error: "Your current password is wrong.", fields: { current: "Wrong password" } }); }
  try {
    const nu = store.transaction(() => crm.changeOwnPassword(u, String(b.password || "")));
    send(res, 200, { ok: true, user: nu }, { "Set-Cookie": cookie(makeToken(nu.id, nu.session_ver), SESSION_HOURS * 3600) }); // keep this browser signed in, end all others
  } catch (e) { if (e instanceof CrmError) return send(res, 422, { ok: false, error: e.message, fields: e.fields }); throw e; }
}

/* ------------------------------------------------- lead sources (ads, partners, Zapier) */
const RESTRICTED_MSG = "Absel Global does not accept clients from this country";
function intake(data, source, res) {
  if (RESTRICTED.has(clean(data.country, 80))) return send(res, 422, { ok: false, error: RESTRICTED_MSG });
  delete data.sample; delete data.reference;
  try {
    const l = store.transaction(() => crm.createLead(crm.SYSTEM, data, { source, requireEmail: false }));
    drainQueue(); return send(res, 201, { ok: true, reference: l.reference, duplicate: !!l.duplicate_of });
  } catch (e) { if (e instanceof CrmError) return send(res, 422, { ok: false, error: e.message, errors: e.fields || {} }); throw e; }
}
// Generic: Zapier, Make, partner sites, landing-page builders. Header X-Api-Key: LEAD_API_KEY
async function inboundLead(req, res) {
  const key = env("LEAD_API_KEY");
  if (!key || !safeEq(req.headers["x-api-key"], key)) return send(res, 401, { ok: false, error: "Bad or missing X-Api-Key" });
  if (!hookLimit("api:" + clientIp(req))) return send(res, 429, { ok: false, error: "Too many requests" });
  const b = await readJson(req, 20480);
  const name = String(b.full_name || b.name || "").trim().split(/\s+/);
  if (!b.dial_code && b.phone) Object.assign(b, splitPhone(b.phone));
  return intake(Object.assign({ first_name: b.first_name || name.shift() || "", last_name: b.last_name || name.join(" ") || "-", form: "api" }, b, { utm: Object.assign({ utm_source: b.utm_source || b.source || "api" }, b.utm || {}) }), "api", res);
}
// Phone split for numbers that arrive as one international string (+2348012345678)
function splitPhone(p) { const d = String(p || "").replace(/[^\d+]/g, ""); return d.startsWith("+") ? { dial_code: "+", phone: d.slice(1) } : { dial_code: "", phone: d }; }
// Meta (Facebook / Instagram) Lead Ads: subscribe the Page to the "leadgen" webhook field
async function metaLeads(req, res, url) {
  if (req.method === "GET") {
    const v = env("META_VERIFY_TOKEN");
    if (v && url.searchParams.get("hub.mode") === "subscribe" && safeEq(url.searchParams.get("hub.verify_token"), v)) return send(res, 200, clean(url.searchParams.get("hub.challenge"), 100));
    return send(res, 403, "Forbidden");
  }
  const raw = await readBody(req, 1024 * 1024), secret = env("META_APP_SECRET");
  if (secret) { const sig = String(req.headers["x-hub-signature-256"] || ""), want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"); if (!safeEq(sig, want)) return send(res, 401, "Bad signature"); }
  else if (IS_PROD) return send(res, 401, "Set META_APP_SECRET");
  let body = {}; try { body = JSON.parse(raw.toString("utf8")); } catch {}
  send(res, 200, "OK"); // answer Meta at once, then fetch the lead details
  const token = env("META_PAGE_TOKEN"); if (!token) return console.error("Meta lead received but META_PAGE_TOKEN is not set");
  for (const entry of body.entry || []) for (const ch of entry.changes || []) {
    if (ch.field !== "leadgen" || !ch.value || !ch.value.leadgen_id) continue;
    try {
      const r = await fetch(`https://graph.facebook.com/${env("META_API_VERSION") || "v21.0"}/${encodeURIComponent(ch.value.leadgen_id)}?fields=field_data,campaign_name,adset_name,ad_name,platform,created_time&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
      const d = await r.json(); if (!r.ok) throw new Error((d.error && d.error.message) || r.status);
      const f = Object.fromEntries((d.field_data || []).map(x => [String(x.name).toLowerCase(), (x.values || [])[0] || ""]));
      const full = String(f.full_name || "").trim().split(/\s+/), ph = splitPhone(f.phone_number || f.phone);
      const lead = { first_name: f.first_name || full.shift() || "Meta", last_name: f.last_name || full.join(" ") || "lead", email: f.email || "", dial_code: ph.dial_code, phone: ph.phone, country: f.country || env("META_DEFAULT_COUNTRY") || "Unknown", city: f.city || "", form: "meta-lead-ad",
        utm: { utm_source: d.platform === "ig" ? "instagram" : "facebook", utm_medium: "lead-ad", utm_campaign: d.campaign_name || "", utm_content: d.ad_name || "", utm_term: d.adset_name || "" } };
      if (RESTRICTED.has(lead.country)) continue;
      store.transaction(() => crm.createLead(crm.SYSTEM, lead, { source: "meta", requireEmail: false })); drainQueue();
    } catch (e) { console.error("Meta lead", ch.value.leadgen_id, e.message); }
  }
}
// Google Ads lead form extensions: webhook URL + key set in the lead form
async function googleLeads(req, res) {
  const b = await readJson(req, 65536), key = env("GOOGLE_LEAD_KEY");
  if (!key || !safeEq(b.google_key, key)) return send(res, 401, { ok: false, error: "Bad key" });
  const col = Object.fromEntries((b.user_column_data || []).map(c => [String(c.column_id).toUpperCase(), c.string_value || ""]));
  const full = String(col.FULL_NAME || "").trim().split(/\s+/), ph = splitPhone(col.PHONE_NUMBER);
  const lead = { first_name: col.FIRST_NAME || full.shift() || "Google", last_name: col.LAST_NAME || full.join(" ") || "lead", email: col.EMAIL || "", dial_code: ph.dial_code, phone: ph.phone, country: col.COUNTRY || env("GOOGLE_DEFAULT_COUNTRY") || "Unknown", city: col.CITY || "", form: "google-lead-form", gclid: b.gcl_id || "",
    tags: b.is_test ? ["Test"] : [], utm: { utm_source: "google", utm_medium: "lead-form", utm_campaign: b.campaign_name || (b.campaign_id ? "gads-" + b.campaign_id : ""), utm_content: b.creative_id ? String(b.creative_id) : "" } };
  return intake(lead, "google", res);
}
// Phone system call events (3CX, Asterisk, Twilio, Zadarma… via their webhook or a small script)
async function callWebhook(req, res, url) {
  const tok = env("TELEPHONY_WEBHOOK_TOKEN");
  if (!tok || !safeEq(req.headers["x-webhook-token"] || url.searchParams.get("token"), tok)) return send(res, 401, { ok: false, error: "Bad token" });
  if (!hookLimit("pbx:" + clientIp(req))) return send(res, 429, { ok: false, error: "Too many requests" });
  const b = await readJson(req, 65536);
  try { const r = store.transaction(() => crm.recordCallEvent(b)); return send(res, 200, r); }
  catch (e) { if (e instanceof CrmError) return send(res, 422, { ok: false, error: e.message }); throw e; }
}
// Email unsubscribe: GET shows a confirm button (mail scanners can't unsubscribe people), POST records it
async function unsubscribe(req, res, url) {
  const t = String(url.searchParams.get("t") || ""), [idPart, sig] = t.split(".");
  let id = ""; try { id = Buffer.from(idPart || "", "base64url").toString(); } catch {}
  const ok = id && sig && safeEq(unsubToken(id), t), l = ok ? store.get("leads", id) : null;
  const page = (title, msg, form) => send(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#F4F6FB;color:#162040;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{background:#fff;border-radius:14px;padding:32px;max-width:440px;box-shadow:0 8px 30px rgba(22,32,64,.08)}h1{font-size:22px;margin:0 0 10px}p{color:#55607F;line-height:1.5}button{background:#162040;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer}</style></head><body><main><h1>${title}</h1><p>${msg}</p>${form || ""}</main></body></html>`, { "Content-Type": "text/html; charset=utf-8" });
  if (!l) return page("Link not valid", "This unsubscribe link is incomplete or has expired. Reply to any of our emails with “unsubscribe” and we'll remove you.");
  if (req.method === "POST") {
    store.transaction(() => crm.unsubscribeLead(l.id, "email", "unsubscribe link"));
    return page("You're unsubscribed", "You won't receive marketing emails from Absel Global any more. Your account specialist may still contact you about an open request.");
  }
  return page("Unsubscribe from Absel Global emails?", "Click below to stop marketing emails to this address.", `<form method="post"><button type="submit">Unsubscribe</button></form>`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname, m = req.method;
  try {
    if (p === "/api/leads" && m === "POST") return await publicLead(req, res);
    if (p === "/webhooks/whatsapp") return await whatsappWebhook(req, res, url);
    if (p === "/api/inbound/lead" && m === "POST") return await inboundLead(req, res);
    if (p === "/webhooks/meta-leads") return await metaLeads(req, res, url);
    if (p === "/webhooks/google-leads" && m === "POST") return await googleLeads(req, res);
    if (p === "/webhooks/calls" && m === "POST") return await callWebhook(req, res, url);
    if (p === "/unsubscribe" && (m === "GET" || m === "POST")) return await unsubscribe(req, res, url);
    if (p === "/api/crm/login" && m === "POST") return await login(req, res);
    if (p === "/api/crm/password" && m === "POST") return await changePassword(req, res);
    if (p === "/api/crm/logout" && m === "POST") return send(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });
    if (p === "/api/crm/rpc" && m === "POST") return await rpc(req, res);
    if (p.startsWith("/api/portal/") && m === "POST") return await portal(req, res, p.slice(12));
    if (p.startsWith("/api/")) return send(res, 404, { ok: false, error: "Not found" });
    if (m !== "GET" && m !== "HEAD") return send(res, 405, "Method not allowed");
    return serveStatic(req, res, p);
  } catch (e) {
    if (e.status) return send(res, e.status, { ok: false, error: e.message });
    console.error(e);
    if (!res.headersSent && !res.sending) send(res, 500, { ok: false, error: "Server error" });
  }
});

async function start() {
  try { await store.open(); }
  catch (e) { console.error("✖ Could not open the Postgres database (check DATABASE_URL): " + e.message); process.exit(1); }
  prepare();
  startJobs();
  server.listen(PORT, () => {
    const c = channels.status();
    console.log(`✔ Absel Global running on http://localhost:${PORT}`);
    console.log(`  CRM:        http://localhost:${PORT}${CRM_PATH}/`);
    console.log(`  Client area: http://localhost:${PORT}/portal/`);
    console.log(`  Database:   PostgreSQL ${new URL(DATABASE_URL).host} (${store.all("leads").length} leads, ${store.all("users").length} users)`);
    console.log(`  Email:      ${c.email.configured ? c.email.provider + " (" + c.email.from + ")" : "not configured — messages are logged as skipped"}`);
    console.log(`  WhatsApp:   ${c.whatsapp.configured ? "Cloud API connected" : "not configured — messages are logged as skipped"}`);
  });
}
// Render and PM2 send SIGTERM on deploy/restart: finish saving before exiting
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => {
  if (stopping) return; stopping = true;
  server.close();
  try { await store.close(); } catch (e) { console.error("postgres: " + e.message); }
  process.exit(0);
});
start();
