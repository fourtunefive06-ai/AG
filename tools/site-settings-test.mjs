// Website settings: what the public site may read, validation, and that the main Settings form can't wipe them.
// Memory store only: nothing is sent and no database is touched.
//   node tools/site-settings-test.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createCRM, createMemoryStore } = require("../lib/core.js");
const store = createMemoryStore(); store.transaction = fn => fn();
const crm = createCRM({ store, hashPassword: p => p, verifyPassword: () => true, hashToken: t => t, random: n => new Uint8Array(n), onQueue: () => {} });
crm.ensureDefaults();
const admin = { id: "a", role: "admin" }, agent = { id: "b", role: "agent" };
let n = 0; const ok = (c, m) => { if (!c) { console.error("✖ " + m); process.exit(1); } n++; };
const refused = fn => { try { fn(); return false; } catch { return true; } };

let c = crm.siteConfig();
ok(c.registerUrl === "/portal/#register" && c.loginUrl === "/portal/", "links on the site's own address stay relative, as the page had them");
ok(c.whatsapp === "447576077989" && c.supportEmail === "support@abselglobal.com", "the defaults match the page");
ok(Object.keys(c).sort().join() === "loginUrl,registerUrl,supportEmail,whatsapp", "only these four values are public");

crm.saveSettings(admin, { whatsapp_number: "+971 50 123 4567", support_email: "help@abselglobal.com", register_url: "https://other.example/join", login_url: "https://abselglobal.com/portal/?x=1" });
c = crm.siteConfig();
ok(c.whatsapp === "971501234567" && c.supportEmail === "help@abselglobal.com", "a saved number and email reach the site");
ok(c.registerUrl === "https://other.example/join" && c.loginUrl === "/portal/?x=1", "another site's link stays full, our own stays relative");

for (const bad of [{ register_url: "javascript:alert(1)" }, { login_url: "" }, { site_url: "abselglobal.com" }, { support_email: "nope" }, { whatsapp_number: "12" }, { whatsapp_number: "" }]) ok(refused(() => crm.saveSettings(admin, bad)), "refused: " + JSON.stringify(bad));
ok(crm.siteConfig().whatsapp === "971501234567" && crm.getSettings().site_url === "https://abselglobal.com", "a refused save changes nothing");
ok(refused(() => crm.saveSettings(agent, { whatsapp_number: "971501234567" })), "only admins can change them");

// the main Settings form no longer sends these fields
crm.saveSettings(admin, { company: "Absel Global", sla_minutes: 20, lost_reasons: ["Other"], require_2fa_roles: [] });
const s = crm.getSettings();
ok(s.whatsapp_number === "971501234567" && s.support_email === "help@abselglobal.com" && s.register_url === "https://other.example/join" && s.site_url === "https://abselglobal.com" && s.sla_minutes === 20, "saving the main Settings form keeps the website settings");
// and the website form leaves everything else alone
crm.saveSettings(admin, { whatsapp_number: "447576077989", support_email: "support@abselglobal.com", register_url: "https://abselglobal.com/portal/#register", login_url: "https://abselglobal.com/portal/", site_url: "https://abselglobal.com" });
const t = crm.getSettings();
ok(t.sla_minutes === 20 && t.lost_reasons.join() === "Other" && t.company === "Absel Global", "saving the website form keeps the main settings");

// page text: only known fields, nothing unless it was changed, links checked
const FX = require("../public/site-fields.js");
ok(new Set(FX.FIELDS.map(x => x.k)).size === FX.FIELDS.length, "field keys are unique");
ok(!("content" in crm.siteConfig()) && !("faq" in crm.siteConfig()) && !("markets" in crm.siteConfig()), "nothing extra goes to the site until something is changed");
crm.saveSettings(admin, { website: { content: { contact_phone: " +230 111 2222 ", not_a_field: "x", hero_lede: "" }, faq: [{ q: "Q", a: "A" }, { q: "", a: "no question" }], markets: [{ t: "T", d: "D", pts: ["p"], rows: [["R", "S"]] }], popup_delay: "9999", exit_intent: false, live_ticker: true } });
const site = crm.siteConfig();
ok(site.content.contact_phone === "+230 111 2222" && !("not_a_field" in site.content) && !("hero_lede" in site.content), "known fields are kept and trimmed; unknown and empty ones are dropped");
ok(site.faq.length === 1 && site.markets[0].k === "Forex" && site.markets[0].t === "T", "the FAQ and market tabs are cleaned");
ok(site.popup_delay === 600 && site.exit_intent === false && site.live_ticker === true, "behaviour settings are limited to safe values");
ok(refused(() => crm.saveSettings(admin, { website: { content: { legal_1_u: "javascript:alert(1)" } } })), "a script link is refused");
ok(refused(() => crm.saveSettings(agent, { website: { content: { contact_phone: "1" } } })), "only admins can change page text");
crm.saveSettings(admin, { lost_reasons: ["Other"] });
ok(crm.siteConfig().content.contact_phone === "+230 111 2222", "other saves keep the page text");
crm.saveSettings(admin, { website: { content: {}, faq: [], markets: [] } });
ok(!("content" in crm.siteConfig()) && crm.siteConfig().exit_intent === false, "clearing the text goes back to the page's own; other choices stay");
console.log(`✔ Website settings: ${n} checks passed`);
