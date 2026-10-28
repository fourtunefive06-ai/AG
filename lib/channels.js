/**
 * Outbound channels: email (SMTP, SendGrid, Brevo, Resend) and WhatsApp Cloud API (Meta).
 * Configured from .env. Nothing here stores secrets in the database.
 */
"use strict";
const net = require("net");
const tls = require("tls");
const crypto = require("crypto");
const os = require("os");

const env = k => (process.env[k] || "").trim();

function emailConfig() {
  const provider = env("EMAIL_PROVIDER").toLowerCase();
  const from = env("EMAIL_FROM"), fromName = env("EMAIL_FROM_NAME") || "Absel Global";
  if (!provider || !from) return null;
  return { provider, from, fromName, replyTo: env("EMAIL_REPLY_TO"), apiKey: env("EMAIL_API_KEY"),
    smtp: { host: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 587), user: env("SMTP_USER"), pass: env("SMTP_PASS"), secure: env("SMTP_SECURE") === "true" || Number(env("SMTP_PORT")) === 465 } };
}
function whatsappConfig() {
  const token = env("WHATSAPP_TOKEN"), phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return null;
  return { token, phoneId, version: env("WHATSAPP_API_VERSION") || "v21.0", verifyToken: env("WHATSAPP_VERIFY_TOKEN"), appSecret: env("WHATSAPP_APP_SECRET") };
}
function status() {
  const e = emailConfig(), w = whatsappConfig();
  return {
    email: e ? { configured: true, provider: e.provider, from: e.from } : { configured: false },
    whatsapp: w ? { configured: true, phone_number_id: w.phoneId.replace(/.(?=.{4})/g, "•"), webhook: !!w.verifyToken } : { configured: false },
  };
}

/* ------------------------------------------------------------------ email */
const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
function mime(cfg, to, subject, text) {
  const id = `<${crypto.randomBytes(12).toString("hex")}@${cfg.from.split("@")[1] || "localhost"}>`;
  const body = Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const head = [
    `From: ${encWord(cfg.fromName)} <${cfg.from}>`, `To: <${to}>`, `Subject: ${encWord(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${id}`,
    cfg.replyTo ? `Reply-To: <${cfg.replyTo}>` : null, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64",
  ].filter(Boolean).join("\r\n");
  return { id, data: head + "\r\n\r\n" + body + "\r\n" };
}

function smtpSend(cfg, to, subject, text) {
  const s = cfg.smtp;
  if (!s.host) return Promise.reject(new Error("SMTP_HOST is not set"));
  return new Promise((resolve, reject) => {
    let sock = s.secure ? tls.connect({ host: s.host, port: s.port, servername: s.host }) : net.connect({ host: s.host, port: s.port });
    let buf = "", waiter = null, done = false;
    const fail = e => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error("SMTP timeout")), 30000);
    const onData = d => { buf += d.toString("utf8"); const m = buf.match(/(^|\r\n)(\d{3}) [^\r\n]*\r\n$/); if (m && waiter) { const w = waiter; waiter = null; const text = buf; buf = ""; w(Number(m[2]), text); } };
    const attach = so => { so.on("data", onData); so.on("error", fail); };
    attach(sock);
    const read = () => new Promise(r => { waiter = (code, text) => r({ code, text }); });
    const cmd = async (line, expect) => { sock.write(line + "\r\n"); const r = await read(); if (!expect.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.trim().slice(0, 200)}`); return r; };
    (async () => {
      let r = await read(); if (r.code !== 220) throw new Error("SMTP greeting " + r.code);
      const host = os.hostname() || "localhost";
      r = await cmd("EHLO " + host, [250]);
      if (!s.secure && /STARTTLS/i.test(r.text)) {
        await cmd("STARTTLS", [220]);
        sock.removeListener("data", onData);
        sock = tls.connect({ socket: sock, servername: s.host }); attach(sock);
        await new Promise((ok, ko) => { sock.once("secureConnect", ok); sock.once("error", ko); });
        r = await cmd("EHLO " + host, [250]);
      }
      if (s.user) {
        await cmd("AUTH LOGIN", [334]);
        await cmd(Buffer.from(s.user).toString("base64"), [334]);
        await cmd(Buffer.from(s.pass).toString("base64"), [235]);
      }
      await cmd(`MAIL FROM:<${cfg.from}>`, [250]);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd("DATA", [354]);
      const m = mime(cfg, to, subject, text);
      await cmd(m.data.replace(/\r\n\./g, "\r\n..") + "\r\n.", [250]);
      sock.write("QUIT\r\n");
      clearTimeout(timer); done = true; sock.end(); resolve({ provider_id: m.id });
    })().catch(e => { clearTimeout(timer); fail(e); });
  });
}

async function http(url, body, headers) {
  const r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body) });
  const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch {}
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${(json && (json.message || (json.error && (json.error.message || json.error)) || JSON.stringify(json.errors || ""))) || txt.slice(0, 200)}`); e.retry = r.status >= 500 || r.status === 429; throw e; }
  return { json, headers: r.headers };
}

async function sendEmail(to, subject, text) {
  const cfg = emailConfig();
  if (!cfg) { const e = new Error("Email is not configured (set EMAIL_PROVIDER and EMAIL_FROM in .env)"); e.notConfigured = true; throw e; }
  if (cfg.provider === "smtp") return smtpSend(cfg, to, subject, text);
  if (cfg.provider === "sendgrid") {
    const r = await http("https://api.sendgrid.com/v3/mail/send", { personalizations: [{ to: [{ email: to }] }], from: { email: cfg.from, name: cfg.fromName }, reply_to: cfg.replyTo ? { email: cfg.replyTo } : undefined, subject, content: [{ type: "text/plain", value: text }] }, { Authorization: "Bearer " + cfg.apiKey });
    return { provider_id: r.headers.get("x-message-id") || "" };
  }
  if (cfg.provider === "brevo") {
    const r = await http("https://api.brevo.com/v3/smtp/email", { sender: { email: cfg.from, name: cfg.fromName }, to: [{ email: to }], replyTo: cfg.replyTo ? { email: cfg.replyTo } : undefined, subject, textContent: text }, { "api-key": cfg.apiKey });
    return { provider_id: (r.json && r.json.messageId) || "" };
  }
  if (cfg.provider === "resend") {
    const r = await http("https://api.resend.com/emails", { from: `${cfg.fromName} <${cfg.from}>`, to: [to], reply_to: cfg.replyTo || undefined, subject, text }, { Authorization: "Bearer " + cfg.apiKey });
    return { provider_id: (r.json && r.json.id) || "" };
  }
  throw new Error("Unknown EMAIL_PROVIDER: " + cfg.provider);
}

/* --------------------------------------------------------------- whatsapp */
async function sendWhatsApp(msg) {
  const cfg = whatsappConfig();
  if (!cfg) { const e = new Error("WhatsApp is not configured (set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env)"); e.notConfigured = true; throw e; }
  const to = String(msg.to).replace(/\D/g, "");
  const body = msg.wa_template && msg.wa_template.name
    ? { messaging_product: "whatsapp", to, type: "template", template: { name: msg.wa_template.name, language: { code: msg.wa_template.language || "en" }, components: msg.wa_template.params && msg.wa_template.params.length ? [{ type: "body", parameters: msg.wa_template.params.map(p => ({ type: "text", text: String(p || "-") })) }] : [] } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: msg.body, preview_url: true } };
  const r = await http(`https://graph.facebook.com/${cfg.version}/${cfg.phoneId}/messages`, body, { Authorization: "Bearer " + cfg.token });
  return { provider_id: (r.json && r.json.messages && r.json.messages[0] && r.json.messages[0].id) || "" };
}
function verifyWebhookSignature(raw, header) {
  const secret = env("WHATSAPP_APP_SECRET"); if (!secret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const a = Buffer.from(crypto.createHmac("sha256", secret).update(raw).digest("hex")), b = Buffer.from(header.slice(7));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sendEmail, sendWhatsApp, status, whatsappConfig, verifyWebhookSignature };
