// Client messages: branded layout, categories, system emails, the journey automations, no passwords anywhere.
// Memory store only: nothing is sent and no database is touched.
//   node tools/messages-test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const require = createRequire(import.meta.url);
const { createCRM, createMemoryStore } = require("../lib/core.js");
const { renderEmail } = require("../lib/email-layout.js");
const channels = require("../lib/channels.js");

let passed = 0; const ok = (c, m) => { assert.ok(c, m); passed++; };
function world(now = Date.parse("2026-11-02T10:00:00Z")) {
  const store = createMemoryStore(); store.transaction = fn => fn(); let clock = now;
  const crm = createCRM({ store, now: () => new Date(clock), hashPassword: p => "h:" + p, verifyPassword: (p, h) => h === "h:" + p, hashToken: t => "t:" + t, random: n => new Uint8Array(n).map((_, i) => (i * 37 + 11) % 256), onQueue: () => {}, mt5Mode: () => "manual", unsubscribeUrl: l => "https://abselglobal.com/unsubscribe?t=" + l.id });
  crm.ensureDefaults();
  const admin = crm.saveUser(crm.SYSTEM, { name: "Admin", username: "admin1", password: "Zebra-Mango-7741", role: "admin", email: "admin@example.test", accepts_leads: false });
  const agent = crm.saveUser(crm.SYSTEM, { name: "Dana Agent", username: "agent1", password: "Zebra-Mango-7741", role: "agent", email: "dana@example.test", accepts_leads: true });
  const s = store.get("settings", "main"); s.quiet = { enabled: false, start: "21:00", end: "09:00" }; store.put("settings", s);
  return { store, crm, admin: Object.assign({ role: "admin" }, admin), agent: Object.assign({ role: "agent" }, agent), step: ms => { clock += ms; }, run: () => crm.tick() };
}
let seq = 0;
const lead = (w, more = {}) => { seq++; return w.crm.createLead(w.crm.SYSTEM, Object.assign({ first_name: "Amina", last_name: "Bello", email: `amina${seq}@example.test`, dial_code: "+234", phone: "80100" + String(10000 + seq), country: "Nigeria", consent: true }, more), { source: "web" }); };
const msgs = (w, l, tpl) => w.store.all("messages").filter(m => m.lead_id === l.id && (!tpl || m.template_id === tpl));
const portalClient = w => { seq++; const email = `client${seq}@example.test`, r = w.crm.portalRegister({ first_name: "Chidi", last_name: "Obi", email, dial_code: "+234", phone: "80200" + String(10000 + seq), country: "Nigeria", password: "Kiwi-Lantern-8352", terms: true }, { ip: "203.0.113." + seq }); w.crm.portalVerifyEmail(r.verify_token); return { C: { id: r.client.id }, lead: w.store.get("leads", w.store.get("clients", r.client.id).lead_id), id: r.client.id }; };
const SETTINGS = { company: "Absel Global", site_url: "https://abselglobal.com", whatsapp_number: "447576077989" };

/* ---------- 1. layout ---------- */
{
  const tx = renderEmail({ subject: "S", body: "Hi Amina,\n\nOpen https://abselglobal.com/portal/.\n\n• one\n• two\n\n{{button:Open|https://abselglobal.com/portal/}}", category: "transactional", unsubscribe_url: "https://x.test/u", preheader: "Sneak" }, SETTINGS);
  ok(/<img src="https:\/\/abselglobal\.com\/assets\/email-logo-white\.png"[^>]*alt="Absel Global"/.test(tx.html) && !/\.svg/i.test(tx.html), "the default dark header has the hosted white PNG logo with alt text, never SVG");
  const lightHeader = renderEmail({ subject: "S", body: "Hi" }, Object.assign({}, SETTINGS, { email: { header_color: "#FFFFFF" } }));
  ok(lightHeader.html.includes("/assets/email-logo-dark.png") && !lightHeader.html.includes("email-logo-white"), "a white header gets the dark logo");
  ok(renderEmail({ subject: "S", body: "Hi" }, Object.assign({}, SETTINGS, { email: { header_color: "#112233" } })).html.includes("/assets/email-logo-white.png"), "another dark header keeps the white logo");
  ok(renderEmail({ subject: "S", body: "Hi" }, Object.assign({}, SETTINGS, { email_logo_url: "https://cdn.test/own.png", email: { header_color: "#FFFFFF" } })).html.includes("https://cdn.test/own.png"), "a custom logo URL replaces both");
  const blanked = renderEmail({ subject: "S", body: "Hi", category: "transactional" }, Object.assign({}, SETTINGS, { email: { help_line: "", legal_line: "", risk_warning: " " } }));
  ok(blanked.html.includes("GB25205423") && blanked.html.includes("high risk of losing money") && blanked.html.includes("Need help?") && blanked.text.includes("GB25205423") && blanked.text.includes("high risk of losing money"), "saving the settings form with empty footer fields keeps the legal line and risk warning");
  ok(renderEmail({ subject: "S", body: "Hi" }, SETTINGS, { logo_src: "data:image/png;base64,AA" }).html.includes('src="data:image/png;base64,AA"'), "the preview can pass the logo inline");
  ok(tx.html.includes("Financial Services Commission of Mauritius (GB25205423)") && tx.html.includes("high risk of losing money"), "footer has the legal line and the risk warning");
  ok(!/unsubscribe/i.test(tx.html) && !/unsubscribe/i.test(tx.text), "transactional email has no unsubscribe link");
  ok(/<ul[\s\S]*<li[^>]*>one<\/li>/.test(tx.html) && /<a href="https:\/\/abselglobal\.com\/portal\/"[^>]*>Open<\/a>/.test(tx.html) && /<a href="https:\/\/abselglobal\.com\/portal\/"[^>]*>https:\/\/abselglobal\.com\/portal\/<\/a>\./.test(tx.html), "lists, a button and links (the full stop stays outside the link)");
  ok(tx.html.includes("Sneak") && /display:none/.test(tx.html), "hidden preheader");
  ok(!/<script|<link|<style|@import|fonts\.googleapis/i.test(tx.html) && /width:100%;max-width:600px/.test(tx.html) && /<!--\[if mso\]><table role="presentation" width="600"/.test(tx.html), "table layout at 600 px with no scripts, external fonts or style blocks");
  ok(tx.text.includes("https://abselglobal.com/portal/") && tx.text.includes("Open: https://abselglobal.com/portal/") && tx.text.includes("GB25205423") && !tx.text.includes("{{button"), "the plain-text part has the same links and the footer");
  const mk = renderEmail({ subject: "S", body: "Hi", category: "marketing", unsubscribe_url: "https://x.test/u?t=1" }, SETTINGS);
  ok(mk.html.includes('href="https://x.test/u?t=1"') && mk.text.includes("Unsubscribe: https://x.test/u?t=1"), "marketing email has the unsubscribe link in both parts");
  const evil = renderEmail({ subject: "<b>", body: 'Hi <script>alert(1)</script>\n\n{{button:Go|javascript:alert(1)}}', category: "transactional" }, SETTINGS);
  ok(!evil.html.includes("<script>") && !/href="javascript/i.test(evil.html), "values are escaped; only http(s) links");
  const staff = renderEmail({ subject: "S", body: "a  b", audience: "staff", category: "transactional", mono: true }, SETTINGS);
  ok(!staff.html.includes("GB25205423") && /white-space:pre-wrap/.test(staff.html), "staff emails use the layout without the client footer");
  const custom = renderEmail({ subject: "S", body: "{{button:Go|https://x.test}}", category: "transactional" }, Object.assign({}, SETTINGS, { email_logo_url: "https://cdn.test/logo.png", email: { header_color: "#112233", button_color: "#ABCDEF", legal_line: "Own legal", address: "1 Road" } }));
  ok(custom.html.includes("https://cdn.test/logo.png") && custom.html.includes("#112233") && custom.html.includes("#ABCDEF") && custom.html.includes("Own legal") && custom.html.includes("1 Road"), "the settings drive the logo, colours and footer");
  const mime = channels.mime({ from: "a@b.test", fromName: "A" }, "c@d.test", "S", "plain", "<p>h</p>");
  ok(/multipart\/alternative/.test(mime.data) && /text\/plain/.test(mime.data) && /text\/html/.test(mime.data), "SMTP sends multipart/alternative with both parts");
  ok(/text\/plain/.test(channels.mime({ from: "a@b.test", fromName: "A" }, "c@d.test", "S", "plain").data), "without HTML it stays plain text");
}

/* ---------- 2. WhatsApp components ---------- */
{
  const c = channels.waComponents({ params: ["Amina"], header: { type: "image", image_url: "https://x.test/l.png" }, buttons: [{ type: "quick_reply", text: "Yes" }, { type: "url", text: "Open", param: "abc" }] });
  ok(c[0].type === "header" && c[0].parameters[0].image.link === "https://x.test/l.png" && c[1].type === "body" && c[2].sub_type === "url" && c[2].index === "1" && c.length === 3, "header image, body values and dynamic URL button are sent; a quick reply needs no parameter");
  ok(channels.waComponents({ params: [], header: { type: "none" } }).length === 0, "a template with no parameters sends no components");
}

/* ---------- 3. demo given by an agent ---------- */
{
  const w = world(), l = lead(w), u = w.agent; w.store.get("leads", l.id).owner_id = u.id;
  w.crm.setDemo(u, l.id, "give", { login: "5001234", server: "Absel-Demo" }); w.run();
  const em = msgs(w, l, "tpl_demo_ready")[0], wa = msgs(w, l, "tpl_wa_demo")[0];
  ok(em && wa && em.status === "queued" && wa.status === "queued", "a demo given by an agent sends both the email and the WhatsApp");
  ok(em.body.includes("5001234") && em.body.includes("Absel-Demo") && em.body.includes("Your password was given to you by your account manager. You can also reset it from MetaTrader 5."), "the email has login, server and the password note");
  ok(!/password\s*[:=]/i.test(em.body), "the email has no password value");
  ok(/email we just sent/.test(wa.body) && !/details are in your email/.test(wa.body), "the WhatsApp text matches what the client receives");
}

/* ---------- 4. demo from the client area: one email; live account flow ---------- */
{
  const w = world(), c = portalClient(w);
  const req = w.crm.portalRequestAccount(c.C, { type: "ecn", kind: "demo", leverage: 100 });
  const ops = w.crm.saveUser(w.crm.SYSTEM, { name: "Ops", username: "ops1", password: "Zebra-Mango-7741", role: "operations", email: "o@example.test", accepts_leads: false });
  w.crm.openAccount(Object.assign({ role: "operations" }, ops), req.id, { login: "9000123", server: "Demo" }); w.run();
  ok(msgs(w, c.lead, "tpl_portal_account").length === 1 && msgs(w, c.lead, "tpl_demo_ready").length === 0, "a demo opened in the client area doesn't produce two demo emails");
  ok(/skipped: already sent/.test(w.store.all("jobs").find(j => j.rule_id === "auto_demo_given").result), "the skipped email is logged");
}

/* ---------- 5. system emails ---------- */
{
  const w = world(), v = w.crm.systemEmail("tpl_sys_verify", { first_name: "Amina", verify_url: "https://x.test/portal/#verify?t=T1" }), r = w.crm.systemEmail("tpl_sys_reset", { first_name: "Amina", reset_url: "https://x.test/portal/#reset?t=T2" });
  ok(v.body.includes("{{button:Confirm my email|https://x.test/portal/#verify?t=T1}}") && /48 hours/.test(v.body), "verification email carries its link and the expiry");
  ok(r.body.includes("https://x.test/portal/#reset?t=T2") && /1 hour/.test(r.body), "reset email carries its link and the expiry");
  const html = renderEmail(v, { site_url: "https://abselglobal.com" }).html;
  ok(html.includes('href="https://x.test/portal/#verify?t=T1"') && html.includes("GB25205423"), "verification email uses the layout, and the link works");
  ok(!w.store.all("messages").some(m => /t=T1|t=T2/.test(m.body)), "the links stay out of the message log");
  assert.throws(() => w.crm.deleteTemplate(w.admin, "tpl_sys_verify"), /can't be deleted/); passed++;
  const saved = w.crm.saveTemplate(w.admin, Object.assign({}, w.store.get("templates", "tpl_sys_verify"), { active: false, body: "Hi, please confirm." }));
  ok(saved.active === true, "a system email can't be switched off");
  ok(w.crm.systemEmail("tpl_sys_verify", { verify_url: "https://x.test/v" }).body.includes("https://x.test/v"), "if the link is edited out, the client still gets it");
  const d = w.crm.systemEmail("tpl_sys_digest", { digest: "Calls: 1", date: "2026-11-01", leads: 3, ftds: 1 });
  ok(d.audience === "staff" && d.body === "Calls: 1" && d.subject.includes("3 leads"), "the digest is a template and goes to staff");
}

/* ---------- 6. triggers fire once, with their data ---------- */
{
  const w = world(), c = portalClient(w);
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const kinds = ["kyc_id", "kyc_address", "kyc_selfie", "id", "poa"];
  for (const k of kinds) { try { w.crm.portalUploadKyc(c.C, { kind: k, name: k, data: png }); } catch (e) { /* not a kind on this install */ } }
  w.run();
  ok(msgs(w, c.lead, "tpl_docs_received").length === 1, "documents uploaded: one email, however many files");
  const cx = w.store.get("clients", c.id); cx.kyc = { status: "approved" }; w.store.put("clients", cx);
  w.crm.portalRequestAccount(c.C, { type: "ecn", leverage: 100 }); w.run();
  const reqMail = msgs(w, c.lead, "tpl_account_requested");
  ok(reqMail.length === 1 && reqMail[0].body.includes("ECN"), "account request: one email with the account type");
  const before = msgs(w, c.lead).length;
  w.crm.portalSetPassword(c.C, "Otter-Cobalt-9163"); w.run();
  ok(msgs(w, c.lead, "tpl_security_password").length === 1 && msgs(w, c.lead).length === before + 1, "password changed: one security email");
  const totp = w.crm.portalTotpBegin(c.C); ok(!!totp.secret, "two-step can begin");
  const mail = msgs(w, c.lead, "tpl_security_password")[0];
  ok(!mail.body.includes("Otter-Cobalt-9163"), "the new password isn't in the email");
  // once_per_lead respected for a one-time journey message
  const l2 = lead(w); w.crm.setDemo(w.admin, l2.id, "give", { login: "1", server: "S" }); w.run(); w.crm.setDemo(w.admin, l2.id, "give", { login: "1", server: "S" }); w.run();
  ok(msgs(w, l2, "tpl_demo_ready").length === 1, "once_per_lead: giving the demo twice sends one email");
}

/* ---------- 7. WhatsApp without approval falls back to email ---------- */
{
  const w = world(), l = lead(w);
  w.store.put("automations", { id: "auto_t", name: "T", active: true, trigger: { type: "whatsapp_reply" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_whatsapp", template_id: "tpl_wa_first_trade", fallback_email_id: "tpl_first_trade" }] });
  w.crm.simulateInbound(w.admin, l.id, "hello"); w.run();
  const wa = msgs(w, l, "tpl_wa_first_trade")[0];
  ok(wa.status === "blocked" && wa.error === "WhatsApp template not approved yet", "no approved name: not sent, logged as not approved, even inside the 24-hour window");
  ok(msgs(w, l, "tpl_first_trade").length === 1, "the automation falls back to the email");
  const t = w.store.get("templates", "tpl_wa_first_trade"); t.wa_template_name = "absel_first_trade"; w.store.put("templates", t);
  const l2 = lead(w); w.crm.simulateInbound(w.admin, l2.id, "hello"); w.run();
  ok(msgs(w, l2, "tpl_wa_first_trade")[0].status === "queued" && msgs(w, l2, "tpl_first_trade").length === 0, "once the name is filled in, the WhatsApp goes and there's no fallback");
}

/* ---------- 8. opt-outs and Do not contact ---------- */
{
  const w = world(), l = lead(w), x = w.store.get("leads", l.id); x.dnc = true; x.unsubscribed = { email: true }; w.store.put("leads", x);
  const add = (id, tpl, type) => w.store.put("automations", { id, name: id, active: true, trigger: { type: "whatsapp_reply" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type, template_id: tpl }] });
  add("auto_a", "tpl_security_password", "send_email"); add("auto_b", "tpl_dormant", "send_email"); add("auto_c", "tpl_wa_deposit_ok", "send_whatsapp");
  const t = w.store.get("templates", "tpl_wa_deposit_ok"); t.wa_template_name = "absel_deposit"; w.store.put("templates", t);
  w.crm.simulateInbound(w.admin, l.id, "hello"); w.run();
  ok(msgs(w, l, "tpl_security_password")[0].status === "queued", "transactional email goes even to an opt-out");
  ok(msgs(w, l, "tpl_dormant")[0].status === "blocked", "marketing email respects Do not contact");
  ok(msgs(w, l, "tpl_wa_deposit_ok")[0].status === "blocked", "WhatsApp never goes to Do not contact");
}

/* ---------- 9. seed upgrade ---------- */
{
  const store = createMemoryStore(); store.transaction = fn => fn();
  const mk = () => createCRM({ store, now: () => new Date("2026-11-02T10:00:00Z"), hashPassword: p => p, verifyPassword: () => true, hashToken: t => t, random: n => new Uint8Array(n), onQueue: () => {} });
  const crm = mk(); crm.ensureDefaults();
  const fresh = store.get("templates", "tpl_welcome_email");
  ok(!/Risk warning|trading name of Absel Markets/.test(fresh.body) && !/Unsubscribe/.test(store.get("templates", "tpl_promo_email").body), "a new install has clean bodies");
  // back to version 6: one template still as seeded, one edited by staff, one automation edited
  const s = store.get("settings", "main"); s.defaults_version = 6; delete s.messages_upgrade; store.put("settings", s);
  const ORIG = "Hi {{first_name}},\n\nYour deposit has been received and your account is ready to trade on MetaTrader 5. I'm here if you need help with the platform.\n\n{{agent_name}}\n{{company}}\n\nRisk warning: CFDs are leveraged products. You may lose more than your deposit.";
  const t1 = store.get("templates", "tpl_funded_email"); t1.body = ORIG; store.put("templates", t1);
  const t2 = store.get("templates", "tpl_dormant"); t2.body = "Staff wrote this.\n\nRisk warning: CFDs are leveraged products and carry a high risk of losing money."; delete t2.category; store.put("templates", t2);
  const a1 = store.get("automations", "auto_funded"); a1.updated_at = "2026-01-01T00:00:00Z"; a1.actions.forEach(x => { delete x.skip_if_sent; }); store.put("automations", a1);
  store.remove("automations", "auto_wa_dormant"); store.remove("templates", "tpl_docs_received");
  const edited = store.get("automations", "auto_docs_received"); edited.name = "Staff renamed"; edited.updated_at = "2026-01-01T00:00:00Z"; store.put("automations", edited);
  mk().ensureDefaults();
  ok(!/Risk warning/.test(store.get("templates", "tpl_funded_email").body), "a template still matching the seed is cleaned");
  ok(store.get("templates", "tpl_dormant").body.startsWith("Staff wrote this."), "the seed upgrade doesn't overwrite an edited template");
  ok(store.get("templates", "tpl_dormant").category === "marketing", "an edited template still gets a category");
  const rep = store.get("settings", "main").messages_upgrade;
  ok(rep.cleaned.includes("Thank you for funding") && rep.left_alone.includes("Dormant client re-engagement"), "the upgrade lists cleaned and untouched templates");
  ok(store.get("automations", "auto_docs_received").name === "Staff renamed" && rep.automations_left_alone.includes(a1.name) && !store.get("automations", "auto_funded").actions.some(x => x.skip_if_sent), "edited automations are left alone and listed");
  ok(store.get("automations", "auto_wa_dormant") && store.get("templates", "tpl_docs_received"), "missing templates and automations are added by id");
  ok(store.all("templates").filter(t => t.channel === "email").every(t => ["transactional", "marketing"].includes(t.category)), "every email template has a category");
}

/* ---------- 10. new time-based automations don't message existing clients at once ---------- */
{
  const store = createMemoryStore(); store.transaction = fn => fn(); let clock = Date.parse("2026-11-02T10:00:00Z");
  const mk = () => createCRM({ store, now: () => new Date(clock), hashPassword: p => p, verifyPassword: () => true, hashToken: t => t, random: n => new Uint8Array(n), onQueue: () => {} });
  const crm = mk(); crm.ensureDefaults();
  const s = store.get("settings", "main"); s.quiet = { enabled: false, start: "21:00", end: "09:00" }; s.defaults_version = 6; store.put("settings", s);
  const l = crm.createLead(crm.SYSTEM, { first_name: "Old", last_name: "Lead", email: "old@example.test", dial_code: "+234", phone: "8099999999", country: "Nigeria", consent: true }, { source: "web" });
  const x = store.get("leads", l.id); x.demo = { login: "1", server: "S", given_at: "2026-10-01T00:00:00Z" }; x.stage = "contacted"; store.put("leads", x);
  store.remove("automations", "auto_demo_idle_email");
  const c2 = mk(); c2.ensureDefaults(); c2.tick();
  ok(!store.all("messages").some(m => m.lead_id === l.id && m.template_id === "tpl_demo_nudge_email"), "the upgrade doesn't email leads already past the point");
}

/* ---------- 11. card failure: once, after 30 minutes, with the retry link ---------- */
{
  const w = world(), c = portalClient(w), cx = w.store.get("clients", c.id); cx.kyc = { status: "approved" }; cx.address = "1 Road"; cx.city = "Lagos"; w.store.put("clients", cx);
  const s = w.store.get("settings", "main"); s.portal = Object.assign({}, s.portal); s.portal.methods = (s.portal.methods || []).map(m => m.kind === "card" ? Object.assign({}, m, { gateway: "cyrafa", enabled: true, deposit: true, min: 1, max: 0 }) : m); s.portal.account_types = s.portal.account_types.map(t => Object.assign({}, t, { min_deposit: 0 })); w.store.put("settings", s);
  const acc = { id: "T1", client_id: c.id, lead_id: c.lead.id, kind: "live", type: "stp", type_name: "STP", status: "open", login: "44002", server: "Live", balance: 0, created_at: "2026-11-01T00:00:00Z" }; w.store.put("accounts", acc);
  const card = s.portal.methods.find(m => m.kind === "card"), p = w.crm.portalDeposit(c.C, { account_id: acc.id, method: card.id, amount: 50, billing: { address1: "1 Road", city: "Lagos" } });
  w.crm.gatewayAttach(p.id, { ext_id: "E1", target: 50 });
  w.crm.gatewayEvent(p.id, { ext_id: "E1", state: "failed", note: "declined" }); w.crm.gatewayEvent(p.id, { ext_id: "E1", state: "failed", note: "declined again" });
  w.run(); ok(msgs(w, c.lead, "tpl_card_failed").length === 0, "not sent straight away");
  w.step(31 * 60e3); w.run(); w.step(31 * 60e3); w.run();
  const m = msgs(w, c.lead, "tpl_card_failed");
  ok(m.length === 1 && m[0].body.includes("/portal/#deposit") && m[0].body.includes("$50"), "card failure: one email after 30 minutes, with the retry link and amount");
  ok(msgs(w, c.lead, "tpl_wa_card_failed")[0].error === "WhatsApp template not approved yet", "its WhatsApp waits for Meta approval");
}

/* ---------- 12. no password in any template, message or log ---------- */
{
  const w = world();
  ok(!w.crm.meta(w.admin).template_vars.some(v => /pass|pwd|secret/i.test(v)), "no password variable exists");
  const bad = w.store.all("templates").filter(t => /\{\{\s*[a-z_]*(pass|pwd|secret)[a-z_]*\s*\}\}/i.test(`${t.subject} ${t.body} ${t.preheader}`));
  ok(bad.length === 0, "no template asks for a password: " + bad.map(t => t.id));
  const c = portalClient(w), req = w.crm.portalRequestAccount(c.C, { type: "ecn", kind: "demo", leverage: 100 });
  const ops = w.crm.saveUser(w.crm.SYSTEM, { name: "Ops", username: "ops2", password: "Zebra-Mango-7741", role: "operations", email: "o2@example.test", accepts_leads: false });
  w.crm.openAccount(Object.assign({ role: "operations" }, ops), req.id, { login: "9000777", server: "S", password: "Mt5-Secret-Xy9" }); w.run();
  const everything = JSON.stringify([w.store.all("messages"), w.store.all("activities"), w.store.all("jobs"), w.store.all("notifications")]);
  ok(!everything.includes("Mt5-Secret-Xy9") && !everything.includes("Kiwi-Lantern-8352"), "no message, activity, job or notification holds a password");
  const unfilled = w.store.all("templates").filter(t => { const p = w.crm.previewTemplate(w.admin, t), rest = renderEmail(p, { site_url: "https://abselglobal.com" }); return /\{\{/.test(rest.html + rest.text + p.subject); });
  ok(unfilled.length === 0, "every seeded template fills all its variables and buttons: " + unfilled.map(t => t.id));
  const banned = w.store.all("templates").filter(t => /guarantee|risk-free|risk free/i.test(`${t.subject} ${t.body}`));
  ok(banned.length === 0, "no template promises: " + banned.map(t => t.id));
  ok(w.store.all("templates").filter(t => t.channel === "email" && !t.system).every(t => !/Risk warning:/.test(t.body)), "no seeded body repeats the risk warning");
}

console.log(`✔ Client messages: ${passed} checks passed (layout, categories, system emails, demo journey, triggers, WhatsApp fallback, opt-outs, seed upgrade, card failure, no passwords)`);
