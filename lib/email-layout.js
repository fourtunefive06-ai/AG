/* The one branded layout around every email: header, body and footer. Text templates go in; a plain-text part and an HTML
   part come out. Table layout, 600 px, inline CSS only, no external fonts or scripts. Values are escaped here, so a client's
   name can't add markup. Marketing emails carry the unsubscribe link; transactional and staff emails don't. */
"use strict";

const EMAIL_DEFAULTS = {
  header_color: "#162040", button_color: "#2F6BFF",
  help_line: "Need help? Reply to this email or WhatsApp {{whatsapp_number}}",
  legal_line: "Absel Global is a trading name of Absel Markets, licensed by the Financial Services Commission of Mauritius (GB25205423). Client funds are held in segregated accounts.",
  risk_warning: "CFDs are leveraged products and carry a high risk of losing money.",
  address: "", website: "", social: { facebook: "", instagram: "", linkedin: "", x: "", youtube: "" },
};
const SOCIAL_LABELS = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X", youtube: "YouTube" };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(String(u || "")) ? String(u) : "";
const safeColor = (c, d) => /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : d;
const isLight = c => { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };
const BUTTON = /\{\{button:([^|{}]+)\|([^{}\s]+)\}\}/g, BUTTON_LINE = /^\s*\{\{button:([^|{}]+)\|([^{}\s]+)\}\}\s*$/;

function configOf(s = {}) {
  const e = s.email || {}, site = String(s.site_url || "").replace(/\/+$/, "");
  const out = Object.assign({}, EMAIL_DEFAULTS, e, { social: Object.assign({}, EMAIL_DEFAULTS.social, e.social) });
  out.header_color = safeColor(e.header_color, EMAIL_DEFAULTS.header_color); out.button_color = safeColor(e.button_color, EMAIL_DEFAULTS.button_color);
  // The settings form shows these defaults as hints, so a field left empty keeps the default: legal text can't be blanked by saving the form
  for (const k of ["help_line", "legal_line", "risk_warning"]) out[k] = String(e[k] || "").trim() || EMAIL_DEFAULTS[k];
  // White lettering on a dark header, dark lettering on a light one. A logo URL in the settings replaces both.
  out.header_light = isLight(out.header_color); out.header_ink = out.header_light ? "#1E3559" : "#FFFFFF";
  const custom = safeUrl(s.email_logo_url);
  out.logo_file = custom ? "" : out.header_light ? "email-logo-dark.png" : "email-logo-white.png";
  out.logo_url = custom || (site ? `${site}/assets/${out.logo_file}` : "");
  out.website = e.website || site; out.company = s.company || "Absel Global";
  out.whatsapp = s.whatsapp_number ? "+" + String(s.whatsapp_number).replace(/\D/g, "") : "";
  return out;
}

// URLs in already-escaped text become links; punctuation at the end of a sentence stays outside the link
const linkify = t => t.replace(/https?:\/\/[^\s<]+/g, m => { const tail = (m.match(/(?:[.,;:!?)]|&#39;|&quot;)+$/) || [""])[0], url = tail ? m.slice(0, -tail.length) : m; return `<a href="${url}" style="color:#1F57E6;text-decoration:underline" target="_blank">${url}</a>${tail}`; });
const inlineButtons = t => t.replace(BUTTON, (m, label, url) => `${label}: ${url}`);
const FONT = "font-family:Arial,Helvetica,sans-serif;";

function buttonHtml(label, url, color) {
  const href = safeUrl(url); if (!href) return `<p style="${FONT}font-size:15px;line-height:24px;color:#1C2436;margin:0 0 16px">${esc(label)}</p>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr><td align="center" bgcolor="${color}" style="background-color:${color};border-radius:6px"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 26px;${FONT}font-size:15px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:6px">${esc(label)}</a></td></tr></table>`;
}

// paragraphs and line breaks, "• " lines as a list, URLs as links, {{button:Label|url}} as a button
function bodyToHtml(body, cfg) {
  const out = [], p = `${FONT}font-size:15px;line-height:24px;color:#1C2436;margin:0 0 16px`;
  for (const block of String(body || "").replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    let lines = [], list = [];
    const flushLines = () => { if (lines.length) { out.push(`<p style="${p}">${lines.map(l => linkify(esc(inlineButtons(l)))).join("<br>")}</p>`); lines = []; } };
    const flushList = () => { if (list.length) { out.push(`<ul style="${FONT}font-size:15px;line-height:24px;color:#1C2436;margin:0 0 16px;padding:0 0 0 22px">${list.map(l => `<li style="margin:0 0 6px">${linkify(esc(inlineButtons(l)))}</li>`).join("")}</ul>`); list = []; } };
    for (const line of block.split("\n")) {
      const b = line.match(BUTTON_LINE), li = line.match(/^\s*•\s*(.*)$/);
      if (b) { flushLines(); flushList(); out.push(buttonHtml(b[1].trim(), b[2], cfg.button_color)); }
      else if (li) { flushLines(); list.push(li[1]); }
      else if (line.trim()) { flushList(); lines.push(line.trim()); }
    }
    flushLines(); flushList();
  }
  return out.join("");
}

// opts.logo_src: the back office preview passes the logo inline, because its security policy blocks images from other sites
function renderEmail(msg = {}, settings = {}, opts = {}) {
  const cfg = configOf(settings), staff = msg.audience === "staff", marketing = msg.category === "marketing" && !staff;
  const unsub = marketing ? safeUrl(msg.unsubscribe_url) : "", body = String(msg.body || "").trim();
  const help = String(cfg.help_line || "").replace(/\{\{\s*whatsapp_number\s*\}\}/g, cfg.whatsapp);
  const socials = Object.keys(SOCIAL_LABELS).map(k => [SOCIAL_LABELS[k], safeUrl(cfg.social[k])]).filter(x => x[1]);
  const website = safeUrl(cfg.website);

  const text = [inlineButtons(body)];
  if (staff) text.push(`${cfg.company} back office`);
  else {
    if (help) text.push(help);
    if (website || socials.length) text.push([website, ...socials.map(x => `${x[0]}: ${x[1]}`)].filter(Boolean).join("\n"));
    text.push([cfg.legal_line, cfg.risk_warning].filter(Boolean).join("\n"));
    if (unsub) text.push("Unsubscribe: " + unsub);
    if (cfg.address) text.push(cfg.address);
  }

  const small = `${FONT}font-size:12px;line-height:18px;color:#5B6478;margin:0 0 10px`, link = "color:#3B4560;text-decoration:underline";
  const footer = staff ? `<p style="${small}">${esc(cfg.company)} back office</p>` : [
    help ? `<p style="${FONT}font-size:13px;line-height:20px;color:#1C2436;margin:0 0 12px">${linkify(esc(help))}</p>` : "",
    website || socials.length ? `<p style="${small}">${[website ? `<a href="${esc(website)}" style="${link}" target="_blank">${esc(website.replace(/^https?:\/\//, ""))}</a>` : "", ...socials.map(x => `<a href="${esc(x[1])}" style="${link}" target="_blank">${esc(x[0])}</a>`)].filter(Boolean).join(" &nbsp;·&nbsp; ")}</p>` : "",
    cfg.legal_line ? `<p style="${small}">${esc(cfg.legal_line)}</p>` : "",
    cfg.risk_warning ? `<p style="${small}"><b>Risk warning:</b> ${esc(cfg.risk_warning)}</p>` : "",
    unsub ? `<p style="${small}"><a href="${esc(unsub)}" style="${link}" target="_blank">Unsubscribe</a></p>` : "",
    cfg.address ? `<p style="${small}">${esc(cfg.address)}</p>` : "",
  ].join("");
  const logoSrc = opts.logo_src || cfg.logo_url;
  const logo = logoSrc ? `<img src="${esc(logoSrc)}" width="160" alt="Absel Global" style="display:block;width:160px;max-width:160px;height:auto;border:0;${FONT}font-size:20px;font-weight:bold;color:${cfg.header_ink}">` : `<span style="${FONT}font-size:20px;font-weight:bold;color:${cfg.header_ink}">Absel Global</span>`;
  const main = msg.mono ? `<div style="font-family:Consolas,Menlo,monospace;font-size:13px;line-height:20px;color:#1C2436;white-space:pre-wrap">${linkify(esc(body))}</div>` : bodyToHtml(body, cfg);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(msg.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#EEF0F5">
${msg.preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#EEF0F5">${esc(msg.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF0F5" style="background-color:#EEF0F5"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-radius:10px;overflow:hidden">
<tr><td bgcolor="${cfg.header_color}" style="background-color:${cfg.header_color};padding:22px 28px">${logo}</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:28px">${main}</td></tr>
<tr><td bgcolor="#F7F8FB" style="background-color:#F7F8FB;padding:20px 28px;border-top:1px solid #DDE1EA">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { text: text.filter(Boolean).join("\n\n") + "\n", html };
}

module.exports = { renderEmail, configOf, EMAIL_DEFAULTS };
