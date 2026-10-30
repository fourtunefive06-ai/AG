/* Everything on the homepage that Settings → Website settings can change. Used by the homepage (to apply saved text), the back
   office (to build the form and read the page's original text as defaults) and the server (to accept only these keys).
   Nothing is stored unless it differs from the page, and text is only ever set as text, so it can't add markup or scripts. */
(function (root) {
  "use strict";
  var F = [];
  // section, key, label, selector, options: i = which match, n = which text inside the element, t = inside the lead form template,
  // lines = several lines, attr = an attribute instead of text, href = a link, d = default when the page has no element for it
  function f(section, k, l, q, o) { F.push(Object.assign({ section: section, k: k, l: l, q: q }, o || {})); }
  function list(section, k, l, q, count, o) { for (var i = 0; i < count; i++) f(section, k + "_" + (i + 1), l + " " + (i + 1), q, Object.assign({ i: i }, o || {})); }
  function head(section, p, id) { f(section, p + "_eyebrow", "Small heading", id + " .eyebrow"); f(section, p + "_title", "Heading", id + " h2"); }

  var S = "Contact details";
  f(S, "contact_phone", "Phone number", ".contact-line", { i: 1 });
  f(S, "office_address", "Office address", "footer .foot-top > div:nth-child(3) p", { lines: 1 });

  S = "Page title and search result";
  f(S, "page_title", "Browser tab title", "title");
  f(S, "page_description", "Description shown in search results", 'meta[name="description"]', { attr: "content", long: 1 });

  S = "Top bar and menu";
  f(S, "risk_label", "Risk bar label", ".riskbar .wrap b");
  f(S, "risk_text", "Risk bar text", ".riskbar .wrap", { long: 1 });
  ["Markets", "Accounts", "Platform", "Regulation", "Partners", "FAQ"].forEach(function (x, i) { f(S, "nav_" + (i + 1), "Menu: " + x, "nav.main a", { i: i }); });
  f(S, "nav_login", "Log in button", "header.site .login");
  f(S, "nav_cta", "Open account button", "header.site .btn-cta");
  f(S, "mbar_cta", "Phone bottom bar: open account", ".mbar .btn-cta");
  f(S, "mbar_login", "Phone bottom bar: log in", ".mbar .btn-line");

  S = "Top of the page (hero)";
  f(S, "hero_badge_b", "Badge: bold part", ".hero .badge b");
  f(S, "hero_badge", "Badge: rest", ".hero .badge");
  f(S, "hero_title_a", "Headline: start", "h1");
  f(S, "hero_title_b", "Headline: highlighted part", "h1 span");
  f(S, "hero_title_c", "Headline: end", "h1", { n: 1 });
  f(S, "hero_lede", "Paragraph", ".hero .lede", { long: 1 });
  f(S, "hero_cta", "Main button", ".hero-ctas .btn-cta");
  f(S, "hero_cta2", "Second button", ".hero .btn-line-band");
  f(S, "board_title", "Conditions board: title", ".board-top span", { i: 0 });
  f(S, "board_hours", "Conditions board: hours", ".board-top span", { i: 1 });
  f(S, "board_1", "ECN spread value", ".board-grid b", { i: 0 });
  f(S, "board_1_unit", "ECN spread unit", ".board-grid b small");
  f(S, "board_1_l", "ECN spread label", ".board-grid span", { i: 0 });
  f(S, "board_2", "Leverage value", ".board-grid b", { i: 1 });
  f(S, "board_2_l", "Leverage label", ".board-grid span", { i: 1 });
  f(S, "board_3", "Lot size value", ".board-grid b", { i: 2 });
  f(S, "board_3_l", "Lot size label", ".board-grid span", { i: 2 });
  f(S, "board_4", "Deposit fees value", ".board-grid b", { i: 3 });
  f(S, "board_4_l", "Deposit fees label", ".board-grid span", { i: 3 });

  S = "Trust strip";
  for (var a = 0; a < 5; a++) { f(S, "trust_" + (a + 1), "Item " + (a + 1) + ": title", ".trust b", { i: a }); f(S, "trust_" + (a + 1) + "_s", "Item " + (a + 1) + ": text", ".trust small", { i: a }); }

  S = "Markets section";
  head(S, "markets", "#markets");
  f(S, "markets_text", "Paragraph", "#markets .head p", { long: 1 });

  S = "Accounts";
  head(S, "accounts", "#accounts");
  f(S, "accounts_text", "Paragraph", "#accounts .head p", { long: 1 });
  [["stp", "STP"], ["ecn", "ECN"]].forEach(function (x, i) {
    var p = ".plan:nth-of-type(" + (i + 1) + ") ", k = "plan_" + x[0], l = x[1] + ": ";
    if (i === 1) f(S, k + "_flag", l + "flag", p + ".flag");
    f(S, k + "_kind", l + "type", p + ".kind"); f(S, k + "_name", l + "name", p + "h3"); f(S, k + "_price", l + "main figure", p + ".price b"); f(S, k + "_price_l", l + "main figure label", p + ".price span");
    ["Commission", "Leverage", "Min lot", "Sub-accounts"].forEach(function (r, j) { f(S, k + "_r" + j, l + r + " label", p + "li span", { i: j * 2 }); f(S, k + "_v" + j, l + r + " value", p + "li span", { i: j * 2 + 1 }); });
    f(S, k + "_btn", l + "button", p + ".btn");
  });
  [["islamic", "Islamic"], ["cent", "Cent"]].forEach(function (x, i) {
    var p = ".plan:nth-of-type(" + (i + 3) + ") ", k = "plan_" + x[0], l = x[1] + ": ";
    f(S, k + "_kind", l + "type", p + ".kind"); f(S, k + "_name", l + "name", p + "h3"); f(S, k + "_price", l + "main figure", p + ".price b"); f(S, k + "_price_l", l + "main figure label", p + ".price span"); f(S, k + "_desc", l + "text", p + ".desc", { long: 1 }); f(S, k + "_btn", l + "button", p + ".btn");
  });

  S = "Platform";
  head(S, "platform", "#platform");
  f(S, "platform_text", "Paragraph", "#platform .copy p", { long: 1 });
  list(S, "platform_device", "Device", ".devices span", 4);
  f(S, "term_label", "Terminal label", ".term-top span", { i: 1 });
  for (var b = 0; b < 4; b++) { f(S, "term_" + (b + 1), "Stat " + (b + 1) + ": value", ".term-stats b", { i: b }); f(S, "term_" + (b + 1) + "_l", "Stat " + (b + 1) + ": label", ".term-stats span", { i: b }); }

  S = "Getting started";
  head(S, "steps", "#how");
  for (var c = 0; c < 3; c++) { f(S, "step_" + (c + 1) + "_n", "Step " + (c + 1) + ": number", ".step .num", { i: c }); f(S, "step_" + (c + 1) + "_t", "Step " + (c + 1) + ": title", ".step h3", { i: c }); f(S, "step_" + (c + 1) + "_p", "Step " + (c + 1) + ": text", ".step p", { i: c, long: 1 }); }
  f(S, "steps_btn", "Button", ".steps-cta .btn"); f(S, "steps_small", "Text beside the button", ".steps-cta small");

  S = "Regulation and licences";
  head(S, "reg", "#regulation");
  f(S, "reg_text", "Paragraph", "#regulation .head p", { long: 1 });
  [1, 2].forEach(function (n) {
    var p = ".cert:nth-of-type(" + n + ") ", k = "cert" + n + "_", l = "Licence " + n + ": ";
    f(S, k + "title", l + "title", p + "h3"); f(S, k + "issuer", l + "issuer", p + ".issuer"); f(S, k + "status", l + "status", p + ".status");
    ["holder", "number", "code", "issued"].forEach(function (x, j) { f(S, k + x, l + x, p + "dd", { i: j }); });
    f(S, k + "link", l + "PDF link text", p + "a"); f(S, k + "url", l + "PDF address", p + "a", { attr: "href", href: 1 });
  });
  for (var d = 0; d < 6; d++) { f(S, "protect_" + (d + 1) + "_t", "Protection " + (d + 1) + ": title", ".protect h4", { i: d }); f(S, "protect_" + (d + 1) + "_p", "Protection " + (d + 1) + ": text", ".protect p", { i: d, long: 1 }); }

  S = "Funding";
  head(S, "pay", "#payments");
  list(S, "pay_note", "Note", ".notes span", 3);
  list(S, "pay_method", "Payment method", ".pay span", 8);

  S = "Partners";
  head(S, "partners", "#partners");
  f(S, "partners_text", "Paragraph", "#partners .head p", { long: 1 });
  [1, 2, 3].forEach(function (n) { var p = ".partner:nth-child(" + n + ") ", k = "partner" + n + "_", l = "Programme " + n + ": "; f(S, k + "kind", l + "type", p + ".kind"); f(S, k + "name", l + "name", p + "h3"); f(S, k + "text", l + "text", p + "p", { long: 1 }); });
  f(S, "partner1_btn1", "Programme 1: first button", "#ib-card .btn", { i: 0 }); f(S, "partner1_btn2", "Programme 1: second button", "#ib-card .btn", { i: 1 });
  f(S, "partner2_btn", "Programme 2: button", ".partner:nth-child(2) .btn"); f(S, "partner3_btn", "Programme 3: button", ".partner:nth-child(3) .btn");

  S = "FAQ section";
  head(S, "faq", "#faq");
  f(S, "faq_intro_a", "Intro: before the email address", "#faq .intro p");
  f(S, "faq_intro_b", "Intro: after the email address", "#faq .intro p", { n: 1 });
  f(S, "faq_btn", "Button", "#faq .intro .btn");

  S = "Closing banner";
  f(S, "final_title", "Heading", ".final h2"); f(S, "final_text", "Text", ".final p", { long: 1 }); f(S, "final_btn1", "First button", ".final .btn-white"); f(S, "final_btn2", "Second button", ".final .btn-line-white");

  S = "Footer";
  f(S, "foot_about", "About text", "footer .foot-top > div:nth-child(1) p", { long: 1 });
  f(S, "foot_h_contact", "Contact heading", "footer .foot-top > div:nth-child(2) h4");
  list(S, "foot_label", "Contact label", ".c-label", 3);
  f(S, "foot_h_office", "Office heading", "footer .foot-top > div:nth-child(3) h4");
  f(S, "foot_h_legal", "Legal heading", "footer .foot-top > div:nth-child(4) h4");
  ["Risk Disclosure", "Privacy Policy", "Terms of Use", "Anti Money Laundering", "Legal Documents"].forEach(function (x, i) { f(S, "legal_" + (i + 1) + "_t", x + ": link text", ".foot-top ul a", { i: i }); f(S, "legal_" + (i + 1) + "_u", x + ": address", ".foot-top ul a", { i: i, attr: "href", href: 1 }); });
  ["Regulatory status", "Risk warning", "Restricted jurisdictions"].forEach(function (x, i) { f(S, "foot_legal_" + (i + 1) + "_h", x + ": heading", "footer .legal h5", { i: i }); f(S, "foot_legal_" + (i + 1), x + ": text", "footer .legal p", { i: i, long: 1 }); });
  f(S, "foot_copy", "Copyright line", "footer .copy span", { i: 0 }); f(S, "foot_licence", "Licence line", "footer .copy span", { i: 1 });

  S = "Popup";
  f(S, "pop_eyebrow", "Small heading", ".modal-side .eyebrow"); f(S, "pop_title", "Heading", "#modalTitle"); f(S, "pop_text", "Text", ".modal-side > p", { long: 1 });
  list(S, "pop_point", "Point", ".modal-side li", 4);
  f(S, "pop_lic", "Licence box", ".modal-side .lic", { lines: 1 });
  f(S, "pop_form_title", "Form heading inside the popup", "", { d: "Get your account set up" });

  S = "Lead form";
  f(S, "form_title", "Heading", "[data-h]", { t: 1 }); f(S, "form_sub", "Text under the heading", ".lf-wrap .sub", { t: 1, long: 1 });
  f(S, "form_btn", "Submit button", '.lf button[type="submit"]', { t: 1 });
  f(S, "form_consent_a", "Consent: before the link", ".check > span", { t: 1, long: 1 }); f(S, "form_consent_l", "Consent: link text", ".check a", { t: 1 }); f(S, "form_consent_b", "Consent: after the link", ".check > span", { t: 1, n: 1 });
  f(S, "form_consent_u", "Consent: Privacy Policy address", ".check a", { t: 1, attr: "href", href: 1 });
  f(S, "form_risk", "Risk text", ".lf .risk", { t: 1, long: 1 });
  list(S, "form_trust", "Trust item", ".trust-row span", 3, { t: 1 });
  f(S, "form_done_a", "Thank you: before the name", ".done h3", { t: 1 }); f(S, "form_done_b", "Thank you: after the name", ".done h3", { t: 1, n: 1 });
  f(S, "form_done_p", "Thank you: text", ".done > p", { t: 1, long: 1 }); f(S, "form_done_reg", "Thank you: open account button", ".reg-link", { t: 1 }); f(S, "form_done_wa", "Thank you: WhatsApp button", ".wa-link", { t: 1 });

  var MARKETS = [
    { k: "Forex", t: "Forex", d: "70+ major, minor and exotic currency pairs with leverage up to 1:500.", pts: ["Raw ECN spreads from 0.2 pips", "Trade 24 hours, Monday to Friday", "Majors, minors and exotics"], rows: [["EUR/USD", "Euro vs US Dollar"], ["GBP/USD", "Pound vs US Dollar"], ["USD/JPY", "US Dollar vs Yen"], ["AUD/USD", "Aussie vs US Dollar"], ["USD/ZAR", "US Dollar vs Rand"]] },
    { k: "Commodities", t: "Commodities", d: "Gold, silver, oil and agricultural CFDs to diversify or hedge.", pts: ["Spot gold and silver", "Crude oil CFDs", "Long or short in one click"], rows: [["XAU/USD", "Gold vs US Dollar"], ["XAG/USD", "Silver vs US Dollar"], ["USOIL", "WTI Crude Oil"], ["UKOIL", "Brent Crude Oil"]] },
    { k: "Indices", t: "Indices", d: "Trade the direction of the world's leading stock markets.", pts: ["US, UK and European benchmarks", "No need to buy every stock", "Go long or short"], rows: [["US500", "S&P 500"], ["NAS100", "Nasdaq 100"], ["GER40", "DAX 40"], ["UK100", "FTSE 100"]] },
    { k: "Futures", t: "Futures", d: "Energy, metals and index futures CFDs on MT5.", pts: ["Energy and metals futures", "Index futures", "Margin-based trading"], rows: [["Energy", "Oil and gas futures"], ["Metals", "Gold and silver futures"], ["Index", "Equity index futures"]] },
    { k: "Crypto", t: "Crypto CFDs", d: "Trade price moves in major cryptocurrencies without a wallet.", pts: ["No crypto wallet needed", "Go long or short", "Trade with MT5 tools"], rows: [["BTC/USD", "Bitcoin"], ["ETH/USD", "Ethereum"], ["XRP/USD", "Ripple"]] }
  ];
  var BEHAVIOUR = { popup_delay: 35, exit_intent: true, live_ticker: true };

  function textNodes(el) { return Array.prototype.filter.call(el.childNodes, function (c) { return c.nodeType === 3 && c.nodeValue.trim(); }); }
  function target(doc, x) { var r = x.t ? (doc.getElementById("leadTpl") || {}).content : doc; return r && x.q ? r.querySelectorAll(x.q)[x.i || 0] : null; }
  function read(doc, x) {
    var el = target(doc, x); if (!el) return x.d || "";
    if (x.attr) return el.getAttribute(x.attr) || "";
    if (x.lines) return textNodes(el).map(function (t) { return t.nodeValue.trim(); }).join("\n");
    var t = textNodes(el)[x.n || 0]; return t ? t.nodeValue.trim().replace(/\s+/g, " ") : "";
  }
  function write(doc, x, v) {
    var el = target(doc, x); if (!el) return false;
    if (x.attr) { el.setAttribute(x.attr, v); return true; }
    if (x.lines) { el.textContent = ""; v.split("\n").forEach(function (l, i) { if (i) el.appendChild(doc.createElement("br")); el.appendChild(doc.createTextNode(l)); }); return true; }
    var t = textNodes(el)[x.n || 0]; if (!t) return false;
    var m = t.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/); t.nodeValue = m[1] + v + m[2]; return true;
  }
  // The page's original questions and answers
  function readFaq(doc) { return Array.prototype.map.call(doc.querySelectorAll("#faq details"), function (d) { return { q: d.querySelector("summary").textContent.trim(), a: d.querySelector("p").textContent.trim() }; }); }
  function apply(doc, site) {
    var c = (site && site.content) || {};
    F.forEach(function (x) { if (c[x.k]) write(doc, x, c[x.k]); });
    if (site && site.faq && site.faq.length) {
      var box = doc.querySelector("#faq .faq-grid > div:last-child"); box.textContent = "";
      site.faq.forEach(function (i) { var d = doc.createElement("details"), s = doc.createElement("summary"), p = doc.createElement("p"); s.textContent = i.q; p.textContent = i.a; d.appendChild(s); d.appendChild(p); box.appendChild(d); });
    }
  }
  var API = { FIELDS: F, MARKETS: MARKETS, BEHAVIOUR: BEHAVIOUR, read: read, readFaq: readFaq, apply: apply };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ABSEL_FIELDS = API;
})(this);
