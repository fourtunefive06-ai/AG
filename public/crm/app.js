/* Absel CRM — shell, router and shared UI helpers. Views live in views-*.js. */
(function () {
  "use strict";
  const API = window.CRM_API;
  const C = (window.CRM = { views: {}, state: { meta: null, user: null }, API });

  /* ------------------------------------------------------------ helpers */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const num = n => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString());
  const money = n => (n == null ? "–" : "$" + Math.round(Number(n) || 0).toLocaleString());
  const pct = n => (n == null ? "–" : n + "%");
  const d0 = iso => (iso ? new Date(iso) : null);
  const fDate = iso => { const d = d0(iso); return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) : ""; };
  const fTime = iso => { const d = d0(iso); return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""; };
  const fDT = iso => (iso ? fDate(iso) + " · " + fTime(iso) : "");
  function ago(iso) {
    if (!iso) return ""; const s = (Date.now() - Date.parse(iso)) / 1000, fut = s < 0, a = Math.abs(s);
    if (a < 60) return "just now"; if (a >= 86400 * 30) return fDate(iso);
    const t = a < 3600 ? Math.round(a / 60) + " min" : a < 86400 ? Math.round(a / 3600) + " h" : Math.round(a / 86400) + " d";
    return fut ? "in " + t : t + " ago";
  }
  const dur = s => { s = Number(s) || 0; const m = Math.floor(s / 60), r = s % 60; return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`; };
  const minsTxt = m => (m == null ? "–" : m < 60 ? Math.round(m) + " min" : m < 1440 ? (m / 60).toFixed(1) + " h" : (m / 1440).toFixed(1) + " d");
  const digits = s => String(s || "").replace(/\D/g, "");
  const telHref = (dial, ph) => "tel:+" + digits(String(dial || "") + String(ph || ""));
  const waHref = (dial, ph, text) => "https://wa.me/" + digits(String(dial || "") + String(ph || "")) + (text ? "?text=" + encodeURIComponent(text) : "");
  const localInput = iso => { const d = iso ? new Date(iso) : new Date(); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };
  const fromLocalInput = v => (v ? new Date(v).toISOString() : "");
  const todayStr = (off = 0) => { const d = new Date(Date.now() + off * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const role = () => (C.state.user ? C.state.user.role : "");
  const isAdmin = () => role() === "admin";
  const isMgr = () => isAdmin() || role() === "manager";                 // sales management
  const isMktMgr = () => isAdmin() || role() === "marketing_manager";
  const isMkt = () => isMktMgr() || role() === "marketing";              // marketing workspace
  const isSales = () => isMgr() || role() === "agent";                   // works leads
  const seesAll = () => isMgr() || isMkt();
  const canComm = () => isMgr() || isMktMgr();
  const isOps = () => isAdmin() || role() === "operations";              // client-area operations (accounts, money)
  const isKyc = () => isOps() || role() === "compliance";                  // document review
  const roleLabel = r => (C.state.meta && C.state.meta.role_labels && C.state.meta.role_labels[r]) || r;
  const salesUsers = () => C.state.meta.users.filter(u => u.sales);
  const stage = id => (C.state.meta.stages.find(s => s.id === id) || { id, label: id });
  const stagePill = id => `<span class="c-pill" style="--c:var(--s-${esc(id)})">${esc(stage(id).label)}</span>`;
  const tempTag = (t, score) => `<span class="c-temp" style="--c:var(--t-${esc(t)})" title="Lead score ${esc(score)}"><i></i>${esc(t ? t[0].toUpperCase() + t.slice(1) : "")}${score != null ? " · " + esc(score) : ""}</span>`;
  const outcomeLabel = id => (C.state.meta.outcomes.find(o => o.id === id) || { label: id }).label;
  const userName = id => (C.state.meta.users.find(u => u.id === id) || {}).name || (id ? "Former user" : "Unassigned");
  function csv(columns, rows) {
    const e = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return "﻿" + [columns.map(e).join(",")].concat(rows.map(r => r.map(e).join(","))).join("\r\n");
  }
  function downloadCsv(name, columns, rows) { return API.download(name + "-" + todayStr() + ".csv", csv(columns, rows)).then(ok => ok !== false && toast("Export ready")).catch(e => toast(e.message || "Download failed")); }

  const I = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    route: I('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>'),
    idcard: I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14 10h4M14 13h3"/>'), bank: I('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
    gift: I('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'), play: I('<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M10 8l5 3-5 3z"/><path d="M8 21h8"/>'),
    day: I('<path d="M3 12h4l3-8 4 16 3-8h4"/>'), phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    list: I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), check: I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    grid: I('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    chart: I('<path d="M3 3v18h18"/><path d="M7 15v3M11 10v8M15 6v12M19 12v6"/>'), bolt: I('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'), mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    msg: I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'), map: I('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
    users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>'), upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    bell: I('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'), menu: I('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    x: I('<path d="M6 6l12 12M18 6L6 18"/>'), note: I('<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>'), flag: I('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'), user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), wa: I('<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1.2-1.2 2 .8-.4 1.8c-3.6.4-8-4-7.6-7.6l1.8-.4.8 2z"/>'),
    out: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'),
    funnel: I('<path d="M3 4h18l-7 8v6l-4 2v-8z"/>'), cash: I('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
    target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'), live: I('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>'),
    star: I('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'), broom: I('<path d="M19 3l-7 7"/><path d="M6 13l5 5-3 3-6-6 3-3z"/><path d="M9 10l5 5"/>'),
    megaphone: I('<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>'), send: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
    plug: I('<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>'), shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    pie: I('<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'), coffee: I('<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M7 3v2M11 3v2M15 3v2"/>'),
  };
  const TL_ICON = { call: ICONS.phone, pbx: ICONS.phone, note: ICONS.note, message: ICONS.msg, stage: ICONS.flag, assign: ICONS.user, created: ICONS.user, task: ICONS.clock, automation: ICONS.bolt, edit: ICONS.note, deposit: ICONS.cash, checklist: ICONS.check, file: ICONS.upload, merge: ICONS.users, demo: ICONS.play, bonus: ICONS.gift, portal: ICONS.bank };

  /* --------------------------------------------------------------- toast */
  function toast(msg) { let t = $("#cToast"); if (!t) { t = document.createElement("div"); t.id = "cToast"; t.className = "c-toast"; t.setAttribute("role", "status"); $("#crm").appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); }

  /* --------------------------------------------------------------- modal */
  function modal({ title, body, submit = "Save", wide = false, danger = false, onSubmit, onOpen, extra = "" }) {
    const el = document.createElement("div"); el.className = "c-modal"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="bg" data-close></div><form class="box${wide ? " wide" : ""}" novalidate><header><h3>${esc(title)}</h3><button type="button" class="c-btn ghost sm" data-close aria-label="Close">${ICONS.x}</button></header><div class="bd">${body}<p class="err-msg" hidden></p></div><footer>${extra}<span style="flex:1"></span><button type="button" class="c-btn" data-close>Cancel</button>${onSubmit ? `<button type="submit" class="c-btn ${danger ? "danger" : "pri"}">${esc(submit)}</button>` : ""}</footer></form>`;
    $("#crm").appendChild(el);
    const last = document.activeElement, form = $("form", el);
    const close = () => { el.remove(); document.removeEventListener("keydown", key); if (last && last.focus) last.focus(); };
    const key = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    $$("[data-close]", el).forEach(b => b.addEventListener("click", close));
    form.addEventListener("submit", async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', form); const errEl = $(".err-msg", el); errEl.hidden = true; clearErrors(form);
      if (!onSubmit) return close();
      btn.disabled = true;
      try { const r = await onSubmit(readForm(form), form); if (r !== false) close(); }
      catch (err) { errEl.textContent = err.message; errEl.hidden = false; showErrors(form, err.fields); }
      finally { btn.disabled = false; }
    });
    if (onOpen) onOpen(el, close);
    setTimeout(() => { const f = $("input:not([type=hidden]):not([type=checkbox]),select,textarea", $(".bd", el)); if (f) f.focus(); }, 30);
    return { el, close };
  }
  function confirmBox(title, text, yes = "Confirm", danger = true) { return new Promise(res => { let ok = false; const m = modal({ title, body: `<p>${esc(text)}</p>`, submit: yes, danger, onSubmit: () => { ok = true; } }); new MutationObserver((_, o) => { if (!m.el.isConnected) { o.disconnect(); res(ok); } }).observe($("#crm"), { childList: true }); }); }

  /* --------------------------------------------------------------- forms */
  function readForm(form) {
    const o = {};
    $$("[name]", form).forEach(el => {
      const k = el.name; if (el.disabled) return;
      let v;
      if (el.type === "checkbox") { if (el.dataset.multi !== undefined) { let a = getPath(o, k); if (!Array.isArray(a)) { a = []; setPath(o, k, a); } if (el.checked) a.push(el.value); return; } v = el.checked; }
      else if (el.type === "radio") { if (!el.checked) return; v = el.value; }
      else if (el.multiple) v = $$("option", el).filter(x => x.selected).map(x => x.value);
      else v = el.value;
      setPath(o, k, v);
    });
    return o;
  }
  function getPath(o, k) { return k.split(".").reduce((t, p) => (t == null ? undefined : t[p]), o); }
  function setPath(o, k, v) { const parts = k.split("."); let t = o; parts.slice(0, -1).forEach(p => { t = t[p] = t[p] || {}; }); t[parts[parts.length - 1]] = v; }
  function clearErrors(form) { $$(".c-field.err", form).forEach(f => { f.classList.remove("err"); const e = $("small.e", f); if (e) e.remove(); }); }
  const FIELD_ALIAS = { firstName: "first_name", lastName: "last_name" };
  function showErrors(form, fields) {
    if (!fields) return;
    Object.entries(fields).forEach(([k, msg]) => {
      const el = $(`[name="${FIELD_ALIAS[k] || k}"]`, form); const f = el && el.closest(".c-field"); if (!f) return;
      f.classList.add("err"); const s = document.createElement("small"); s.className = "e"; s.textContent = msg; f.appendChild(s);
    });
  }
  const field = (label, inner, cls = "") => `<label class="c-field ${cls}"><span>${esc(label)}</span>${inner}</label>`;
  const inp = (name, val, attrs = "") => `<input class="c-in" name="${esc(name)}" value="${esc(val == null ? "" : val)}" ${attrs}>`;
  const sel = (name, opts, val, attrs = "") => `<select class="c-sel" name="${esc(name)}" ${attrs}>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val == null ? "" : val) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  const chips = (name, opts, vals) => `<div class="c-chips">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label class="c-chip"><input type="checkbox" data-multi name="${esc(name)}" value="${esc(v)}" ${(vals || []).includes(v) ? "checked" : ""}>${esc(l)}</label>`; }).join("")}</div>`;
  const listInput = (name, vals, ph) => `<input class="c-in" name="${esc(name)}" data-list value="${esc((vals || []).join(", "))}" placeholder="${esc(ph || "Comma separated")}">`;
  const splitList = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

  /* -------------------------------------------------------------- charts */
  function bars(points, o = {}) {
    // points: [{label, value, value2?}] — one bar per point, optional second series as thinner bar
    const W = 640, H = o.height || 170, pad = { l: 34, r: 6, t: 10, b: 22 };
    const max = Math.max(4, ...points.map(p => Math.max(p.value || 0, p.value2 || 0)));
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), nn = raw / mag, step = (nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 5 ? 5 : 10) * mag;
    const top = Math.ceil(max / step) * step, y = v => pad.t + (H - pad.t - pad.b) * (1 - v / top), bw = (W - pad.l - pad.r) / Math.max(1, points.length);
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.label || "Chart")}">`;
    for (let v = 0; v <= top + 1e-9; v += step) s += `<line class="gr" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pad.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${o.fmt ? o.fmt(v) : num(v)}</text>`;
    const every = Math.ceil(points.length / 8);
    points.forEach((p, i) => {
      const two = p.value2 != null, w = bw * (two ? 0.36 : 0.62), x = pad.l + i * bw + bw * (two ? 0.12 : 0.19);
      const bar = (val, xx, cls, name) => { if (!val) return ""; const h = y(0) - y(val), r = Math.min(3, h); return `<path class="bar ${cls}" d="M${xx},${y(0)} V${y(val) + r} q0,-${r} ${r},-${r} h${w - 2 * r} q${r},0 ${r},${r} V${y(0)} Z"><title>${esc(p.title || p.label)} · ${esc(name)}: ${num(val)}</title></path>`; };
      s += bar(p.value, x, "", o.name || "Value") + (two ? bar(p.value2, x + w + 2, "alt", o.name2 || "Value 2") : "");
      if (i % every === 0) s += `<text class="ax" x="${pad.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>`;
    });
    const legend = o.name2 ? `<div class="c-legend"><span><i style="background:var(--cta)"></i>${esc(o.name)}</span><span><i style="background:var(--up)"></i>${esc(o.name2)}</span></div>` : "";
    return `<div class="c-chart">${legend}${s}</svg></div>`;
  }
  function hbars(items, o = {}) {
    if (!items.length) return `<p class="muted" style="font-size:13px">No data for this period.</p>`;
    const max = Math.max(1, ...items.map(i => i.n));
    return `<div class="c-hb">${items.map(i => `<div class="c-hb-row" title="${esc(i.label || i.k)}: ${num(i.n)}"${i.color ? ` style="--c:${i.color}"` : ""}><span class="t">${esc(i.label || i.k || "—")}</span><span class="n">${num(i.n)}${i.sub ? " · " + esc(i.sub) : ""}</span><span class="trk"><i style="width:${Math.max(2, (i.n / max) * 100)}%"></i></span></div>`).join("")}</div>`;
  }
  function heat(matrix) {
    const max = Math.max(1, ...matrix.flat()), dn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let h = `<div class="c-scroll"><div class="c-heat"><span></span>${Array.from({ length: 24 }, (_, i) => `<span>${i % 3 === 0 ? i : ""}</span>`).join("")}`;
    [1, 2, 3, 4, 5, 6, 0].forEach(d => { h += `<span style="text-align:left">${dn[d]}</span>` + matrix[d].map((v, hr) => `<i style="opacity:${v ? 0.12 + 0.88 * (v / max) : 0.05}" title="${dn[d]} ${hr}:00 · ${v} calls"></i>`).join(""); });
    return h + "</div></div>";
  }

  /* -------------------------------------------------------------- router */
  function route() {
    const pre = API.routePrefix || "#/"; let h = location.hash || "";
    if (!h.startsWith(pre)) h = pre;
    const raw = h.slice(pre.length), [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    return { name: parts[0] || "", id: parts[1] || "", sub: parts[2] || "", params: Object.fromEntries(new URLSearchParams(qs || "")) };
  }
  C.go = (path, params) => { const q = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null && v !== false)).toString() : ""; const h = (API.routePrefix || "#/") + path + (q.length > 1 ? q : ""); if (location.hash === h) render(); else location.hash = h; };
  C.href = path => (API.routePrefix || "#/") + path;

  /* --------------------------------------------------------------- shell */
  // Two workspaces. Each item: [route, label, icon, who can see it, badge key]
  // The brokerage lifecycle: acquire → sell → onboard → fund → trade → retain. Every route from earlier versions is kept.
  const seesBiz = () => isMgr() || isMktMgr() || isOps();
  const NAV = [
    ["Overview", [["overview", "Business overview", "grid", seesBiz], ["dashboard", "Sales dashboard", "chart", isSales], ["ops", "Operations desk", "check", isKyc]]],
    ["Acquisition", [["mkt", "Marketing overview", "pie", isMkt], ["campaigns", "Campaigns & spend", "megaphone", isMkt], ["broadcasts", "Broadcasts", "send", isMkt, "broadcasts"], ["sources", "Lead sources", "plug", isMkt], ["leads", "Leads (view only)", "list", () => isMkt() && !isSales()]]],
    ["Sales", [["queue", "My day", "day", isSales, "queue"], ["call", "Calling mode", "phone", isSales], ["inbox", "Inbox", "inbox", isSales, "inbox"], ["leads", "Leads", "list", isSales], ["lifecycle", "Client journey", "route", () => isSales() || isMktMgr()], ["tasks", "Follow-ups", "check", isSales], ["pipeline", "Deposit pipeline", "funnel", isSales], ["bonus", "Demo & $100", "gift", isSales, "bonus"], ["targets", "Targets", "target", isSales]]],
    ["Sales management", [["live", "Team live", "live", isMgr], ["quality", "Call quality", "star", isSales, "reviews"], ["hygiene", "Lead hygiene", "broom", isMgr], ["territories", "Territories", "map", isMgr]]],
    ["Clients & onboarding", [["clients", "Clients", "users", () => isKyc() || isSales()], ["kyc", "KYC review", "idcard", isKyc, "kyc"], ["openacc", "Account opening", "bank", isOps, "accounts"]]],
    ["Funding", [["money", "Deposits & withdrawals", "cash", () => isOps() || isMgr(), "money"], ["deposits", "FTD verification", "cash", isSales, "deposits"]]],
    ["Trading", [["trading", "Trading accounts", "chart", () => isOps() || isMgr() || isKyc()], ["balances", "Trading data import", "upload", isOps]]],
    ["Communication", [["templates", "Templates", "mail", () => canComm() || isMkt()], ["automations", "Automations", "bolt", () => canComm() || isMkt()], ["messages", "Message log", "msg", () => canComm() || isMkt()], ["optouts", "Opt-outs & DNC", "shield", () => isMgr() || isMkt()]]],
    ["Reports", [["reports", "Reports & MIS", "chart", () => isSales() || isMkt() || isOps()]]],
    ["Admin", [["team", "Team", "users", () => isMgr() || isMktMgr()], ["import", "Import leads", "upload", () => isMgr() || isMktMgr()], ["settings", "Settings", "gear", isAdmin], ["portalsettings", "Client area settings", "gear", isAdmin]]],
  ];
  const ACCESS = {}; NAV.forEach(([, items]) => items.forEach(i => { const prev = ACCESS[i[0]]; ACCESS[i[0]] = prev ? () => prev() || i[3]() : i[3]; }));
  ACCESS.lead = () => true;
  const home = () => (isMgr() ? "overview" : isSales() ? "queue" : isMkt() ? "mkt" : isOps() ? "ops" : isKyc() ? "kyc" : "overview");
  C.home = home;
  function shell() {
    const u = C.state.user, m = C.state.meta;
    const nav = NAV.map(([g, items]) => { const vis = items.filter(i => i[3]()); return vis.length ? `<h6>${g}</h6>` + vis.map(([k, l, ic, , badge]) => `<a href="${C.href(k)}" data-nav="${k}">${ICONS[ic]}<span>${l}</span>${badge ? `<b data-badge="${badge}" hidden></b>` : ""}</a>`).join("") : ""; }).join("");
    const ws = isAdmin() ? "Admin" : isSales() && isMkt() ? "Sales + Marketing" : isMkt() ? "Marketing workspace" : isOps() ? "Operations" : isKyc() ? "Compliance" : "Sales workspace";
    $("#crm").innerHTML = `<div class="c-shell"><aside class="c-side"><div class="c-logo"><img src="/assets/absel-global-logo-white.png" alt="Absel Global" width="128" height="54"><small>BACK OFFICE · ${esc(ws.toUpperCase())}</small></div><nav class="c-nav" aria-label="CRM">${nav}</nav><div class="c-me"><b>${esc(u.name)}</b><span>${esc(roleLabel(u.role))}</span>${u.sample ? '<span style="display:block;color:#8FA0C8;font-size:11.5px;margin-top:4px">Sample account</span>' : ""}</div></aside><div class="c-scrim" data-act="closenav"></div>
      <div class="c-main"><header class="c-top"><button class="c-btn ghost c-burger" data-act="opennav" aria-label="Menu">${ICONS.menu}</button><h1 id="cTitle"></h1><span class="sp"></span>
      <input class="c-in c-search" id="cSearch" type="search" placeholder="Search name, phone, email, ref" aria-label="Search leads">
      ${isSales() && u.role !== "admin" ? `<div style="position:relative"><button class="c-btn sm c-status" id="cStatus"></button></div>` : ""}
      ${u.role === "agent" ? `<label class="c-switch" title="When off, territories skip you for new leads"><input type="checkbox" id="cAvail" ${u.accepts_leads !== false ? "checked" : ""}><span>Taking leads</span></label>` : ""}
      <div class="c-bell" style="position:relative"><button class="c-btn ghost" id="cBell" aria-label="Notifications">${ICONS.bell}<b id="cUnread" ${m.unread ? "" : "hidden"}>${m.unread}</b></button></div>
      <div style="position:relative"><button class="c-btn ghost" id="cUserBtn" aria-label="Account">${ICONS.user}</button></div></header>
      <main class="c-page" id="cPage"></main></div></div>`;
    $("#crm").addEventListener("click", shellClick);
    $("#cSearch").addEventListener("keydown", e => { if (e.key === "Enter") C.go("leads", { q: e.target.value.trim() }); });
    const av = $("#cAvail"); if (av) av.addEventListener("change", async () => { try { await API.call("setAvailability", av.checked); C.state.user.accepts_leads = av.checked; toast(av.checked ? "You're receiving new leads" : "New leads paused for you"); } catch (e) { toast(e.message); av.checked = !av.checked; } });
    $("#cBell").addEventListener("click", openNotifications);
    $("#cUserBtn").addEventListener("click", openUserMenu);
    const sb = $("#cStatus"); if (sb) sb.addEventListener("click", openStatus);
    drawBadges();
  }
  // Available / on break (breaks are reported in Team live and the Agent activity report; new leads skip you while on break)
  function drawStatus() {
    const b = $("#cStatus"); if (!b) return; const st = C.state.meta.status || {};
    b.className = "c-btn sm c-status " + (st.on_break ? "brk" : "ok");
    b.innerHTML = `<i></i>${st.on_break ? esc(st.break_reason || "On break") + " · " + esc(ago(st.break_since).replace(" ago", "")) : "Available"}`;
  }
  async function openStatus(e) {
    e.stopPropagation(); if ($("#cStatusPop")) return closePops(); closePops();
    const st = C.state.meta.status || {}, p = document.createElement("div"); p.className = "c-pop"; p.id = "cStatusPop"; p.style.width = "230px";
    p.innerHTML = st.on_break ? `<div style="padding:12px 14px"><b>On break: ${esc(st.break_reason)}</b><small class="muted" style="display:block">since ${esc(fTime(st.break_since))}. New leads skip you.</small></div><button class="it" data-br="">I'm back</button>` : `<div style="padding:10px 14px;border-bottom:1px solid var(--line)"><b>Take a break</b><small class="muted" style="display:block">New leads go to others meanwhile.</small></div>` + C.state.meta.break_reasons.map(r => `<button class="it" data-br="${esc(r)}">${esc(r)}</button>`).join("");
    e.currentTarget.parentElement.appendChild(p);
    $$("[data-br]", p).forEach(b => b.addEventListener("click", async () => { closePops(); try { C.state.meta.status = await API.call("setBreak", b.dataset.br || null); drawStatus(); toast(b.dataset.br ? "Break started" : "Welcome back"); } catch (err) { toast(err.message); } }));
  }
  function drawBadges() {
    const m = C.state.meta; if (!m) return;
    const vals = { inbox: m.inbox_unread, deposits: m.deposits_pending, bonus: m.bonuses_pending, kyc: m.ops_pending ? m.ops_pending.kyc : 0, accounts: m.ops_pending ? m.ops_pending.accounts : 0, money: m.ops_pending ? m.ops_pending.money : 0, broadcasts: m.broadcasts_pending, reviews: m.reviews_new, queue: C.state.queueCount };
    $$("[data-badge]").forEach(b => { const n = vals[b.dataset.badge] || 0; b.textContent = n; b.hidden = !n; });
    drawStatus();
  }
  C.drawBadges = drawBadges;
  function shellClick(e) {
    const a = e.target.closest("[data-act]"); if (!a) { if (e.target.closest(".c-nav a")) $("#crm").classList.remove("nav-open"); return; }
    if (a.dataset.act === "opennav") $("#crm").classList.add("nav-open");
    if (a.dataset.act === "closenav") $("#crm").classList.remove("nav-open");
  }
  function closePops() { $$(".c-pop").forEach(p => p.remove()); }
  async function openNotifications(e) {
    e.stopPropagation(); if ($("#cNotif")) return closePops(); closePops();
    const host = $("#cBell").parentElement, p = document.createElement("div"); p.className = "c-pop"; p.id = "cNotif"; p.innerHTML = '<p class="muted" style="padding:14px">Loading…</p>'; host.appendChild(p);
    try {
      const list = await API.call("listNotifications");
      p.innerHTML = `<div class="c-row" style="padding:10px 14px;border-bottom:1px solid var(--line)"><b>Notifications</b><span class="sp"></span><button class="c-btn sm" id="cReadAll">Mark all read</button></div>` + (list.length ? list.map(n => `<button class="it ${n.read ? "" : "unread"}" data-lead="${esc(n.lead_id || "")}" data-id="${esc(n.id)}">${esc(n.text)}<small>${ago(n.created_at)}</small></button>`).join("") : '<p class="muted" style="padding:14px">Nothing yet.</p>');
      $("#cReadAll", p).addEventListener("click", async ev => { ev.stopPropagation(); await API.call("markRead"); closePops(); setUnread(0); });
      $$(".it", p).forEach(b => b.addEventListener("click", async () => { closePops(); API.call("markRead", [b.dataset.id]).then(updateBadges); if (b.dataset.lead) C.go("lead/" + b.dataset.lead); }));
    } catch (err) { p.innerHTML = `<p style="padding:14px">${esc(err.message)}</p>`; }
  }
  function openUserMenu(e) {
    e.stopPropagation(); if ($("#cUserPop")) return closePops(); closePops();
    const u = C.state.user, p = document.createElement("div"); p.className = "c-pop"; p.id = "cUserPop"; p.style.width = "260px";
    p.innerHTML = `<div style="padding:12px 14px;border-bottom:1px solid var(--line)"><b>${esc(u.name)}</b><small class="muted" style="display:block">${esc(u.username)} · ${esc(roleLabel(u.role))}</small></div><button class="it" data-u="pw">Change password</button>${"Notification" in window && Notification.permission !== "granted" ? '<button class="it" data-u="alerts">Turn on desktop alerts<small>New leads, replies and approvals pop up even in another tab</small></button>' : ""}<button class="it" data-u="2fa">Two-step verification<small>${u.totp_enabled ? "On" : "Off"}</small></button><button class="it" data-u="out">Sign out</button>`;
    e.currentTarget.parentElement.appendChild(p);
    $$("[data-u]", p).forEach(b => b.addEventListener("click", async () => {
      closePops();
      if (b.dataset.u === "out") { await API.logout(); C.state.user = null; if (unsub) unsub(); loginScreen("You're signed out."); }
      if (b.dataset.u === "pw") passwordModal();
      if (b.dataset.u === "alerts") Notification.requestPermission().then(p => toast(p === "granted" ? "Desktop alerts on" : "Alerts blocked in this browser"));
      if (b.dataset.u === "2fa") u.totp_enabled ? disable2fa() : setup2fa(false);
    }));
  }
  const PW_RULE = "At least 10 characters, with letters and numbers.";
  const pwFields = () => field("Current password", '<input class="c-in" type="password" name="current" autocomplete="current-password">') + field("New password", '<input class="c-in" type="password" name="password" autocomplete="new-password">') + field("Type the new password again", '<input class="c-in" type="password" name="confirm" autocomplete="new-password">') + `<p class="muted" style="font-size:12.5px">${PW_RULE} Changing it signs you out on every other device.</p>`;
  async function submitPw(v) {
    if (v.password !== v.confirm) { const e = new Error("The two new passwords don't match."); e.fields = { confirm: "Doesn't match" }; throw e; }
    await API.changePassword(v.current, v.password);
  }
  function passwordModal() { modal({ title: "Change password", body: pwFields(), submit: "Change password", onSubmit: async v => { await submitPw(v); toast("Password changed"); await updateBadges(); } }); }
  function loadQr() { return window.QRCode ? Promise.resolve(true) : new Promise(res => { const s2 = document.createElement("script"); s2.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s2.onload = () => res(!!window.QRCode); s2.onerror = () => res(false); setTimeout(() => res(!!window.QRCode), 5000); document.head.appendChild(s2); }); }
  function twoFaBody(t) {
    return `<ol style="margin:0;padding-left:18px;display:grid;gap:8px;font-size:13.5px"><li>Install an authenticator app: Google Authenticator, Microsoft Authenticator or Authy.</li><li>Scan this code, or type the key into the app.</li></ol>
      <div class="c-row" style="align-items:center;gap:16px"><div id="cQr" style="background:#fff;padding:8px;border-radius:8px;width:176px;height:176px;display:grid;place-items:center;color:#55607F;font-size:12px">Loading…</div>
      <div style="min-width:0;flex:1"><span class="muted" style="font-size:12px;font-weight:700">KEY</span><p class="mono" style="font-size:15px;word-break:break-all;margin-top:4px">${esc(t.secret.replace(/(.{4})/g, "$1 ").trim())}</p></div></div>
      ${field("Enter the 6-digit code from the app", '<input class="c-in mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="font-size:18px;letter-spacing:.2em">')}`;
  }
  async function drawQr(el, t) { const box = $("#cQr", el); if (await loadQr()) { box.innerHTML = ""; new window.QRCode(box, { text: t.otpauth, width: 160, height: 160 }); } else box.textContent = "Type the key into your app."; }
  async function setup2fa(forced) {
    const t = await API.call("totpBegin");
    if (forced) {
      $("#crm").innerHTML = `<div class="c-login"><form class="c-card" id="c2fa" novalidate style="max-width:460px;display:grid;gap:14px;padding:28px"><h1 style="font-size:22px">Set up two-step verification</h1><p class="muted">Your role requires a code from your phone each time you sign in.</p>${twoFaBody(t)}<p class="err-msg" style="color:var(--warn);font-size:13px" hidden></p><button class="c-btn pri lg" type="submit">Turn on and continue</button><button class="c-btn ghost" type="button" id="cOut">Sign out</button></form></div>`;
      const f = $("#c2fa"); drawQr(f, t); $("#cOut").addEventListener("click", async () => { await API.logout(); loginScreen(); });
      f.addEventListener("submit", async e => { e.preventDefault(); const er = $(".err-msg", f); er.hidden = true; try { await API.call("totpEnable", readForm(f).code); await boot(); toast("Two-step verification is on"); } catch (err) { er.textContent = err.message; er.hidden = false; } });
      return;
    }
    modal({ title: "Turn on two-step verification", body: twoFaBody(t), submit: "Turn on", onOpen: el => drawQr(el, t), onSubmit: async v => { await API.call("totpEnable", v.code); toast("Two-step verification is on"); await updateBadges(); } });
  }
  function disable2fa() { modal({ title: "Turn off two-step verification", body: `<p>Enter a current code from your authenticator app to turn it off.</p>${field("6-digit code", '<input class="c-in mono" name="code" inputmode="numeric" maxlength="6">')}`, submit: "Turn off", danger: true, onSubmit: async v => { await API.call("totpDisable", v.code); toast("Two-step verification is off"); await updateBadges(); } }); }
  document.addEventListener("click", e => { if (!e.target.closest(".c-pop")) closePops(); });
  function setUnread(n) { const b = $("#cUnread"); if (b) { b.textContent = n; b.hidden = !n; } }
  async function updateBadges() {
    try {
      const prev = C.state.meta ? C.state.meta.unread : 0, m = await API.call("meta"); C.state.meta = m; C.state.user = m.user; setUnread(m.unread); drawBadges(); if (m.gate) boot();
      if (m.unread > prev && document.hidden && "Notification" in window && Notification.permission === "granted") {
        API.call("listNotifications").then(list => { const n = list.find(x => !x.read); if (n) { const nt = new Notification("Absel back office", { body: n.text, tag: n.id }); nt.onclick = () => { window.focus(); if (n.lead_id) C.go("lead/" + n.lead_id); }; } }).catch(() => {});
      }
    } catch (e) { if (e.auth) return loginScreen("Your session ended. Please sign in again."); }
  }
  function setQueueCount(n) { C.state.queueCount = n; drawBadges(); }

  /* -------------------------------------------------------------- render */
  let renderSeq = 0;
  async function render() {
    if (!C.state.user) return;
    closePops(); $("#crm").classList.remove("nav-open");
    const r = route(); let name = r.name || home();
    if (!C.views[name]) name = home();
    if (ACCESS[name] && !ACCESS[name]()) { if (name === home()) return; return C.go(home()); }
    const view = C.views[name];
    $$(".c-nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === (view.nav || name)));
    const page = $("#cPage"); const seq = ++renderSeq; page.onclick = null;
    page.innerHTML = '<p class="muted">Loading…</p>';
    $("#cTitle").textContent = view.title || "";
    document.title = (view.title ? view.title + " · " : "") + "Absel back office";
    C.current = { view, r, seq };
    try { await view.render(page, r, () => seq === renderSeq); }
    catch (e) { if (e.auth) return loginScreen("Your session ended. Please sign in again."); if (e.gate) return boot(); if (seq === renderSeq) page.innerHTML = `<div class="c-card"><b>Couldn't load this page.</b><p class="muted">${esc(e.message)}</p></div>`; }
  }
  C.render = render;
  C.setTitle = t => { $("#cTitle").textContent = t; };
  function softRefresh() {
    updateBadges();
    const c = C.current; if (!c || !c.view.refresh) return;
    if ($(".c-modal") || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#cPage").contains(document.activeElement))) return;
    c.view.refresh($("#cPage"), c.r, () => c.seq === renderSeq);
  }

  function loginScreen(msg) {
    if (unsub) { unsub(); unsub = null; }
    $("#crm").innerHTML = `<div class="c-login"><form id="cLogin" novalidate><div class="c-logo login" style="padding:0"><img src="/assets/absel-global-logo.png" alt="Absel Global" width="128" height="54"><small style="color:var(--muted)">BACK OFFICE · TEAM SIGN-IN</small></div><h1>Sign in</h1>
      <div id="cStep1">${field("Username", '<input class="c-in" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" required>')}<div style="height:12px"></div>${field("Password", '<input class="c-in" type="password" name="p" autocomplete="current-password" required>')}</div>
      <div id="cStep2" hidden><p class="muted" style="margin-bottom:10px">Enter the 6-digit code from your authenticator app.</p>${field("Code", '<input class="c-in mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="font-size:18px;letter-spacing:.2em">')}</div>
      <p class="err-msg" style="color:var(--warn);font-size:13px" ${msg ? "" : "hidden"}>${esc(msg || "")}</p><button class="c-btn pri lg" type="submit">Sign in</button>
      <p class="muted" style="font-size:12px">Forgot your password? Ask a CRM admin to set a new one. Accounts lock for 15 minutes after 5 wrong attempts.</p></form></div>`;
    const f = $("#cLogin"); setTimeout(() => $("[name=u]", f).focus(), 30);
    if (msg) $(".err-msg", f).style.color = /signed out/i.test(msg) ? "var(--muted)" : "var(--warn)";
    f.addEventListener("submit", async e => {
      e.preventDefault(); const v = readForm(f), er = $(".err-msg", f), btn = $("button[type=submit]", f); er.hidden = true; er.style.color = "var(--warn)";
      if (!v.u || !v.p) { er.textContent = "Enter your username and password."; er.hidden = false; return; }
      const step2 = !$("#cStep2", f).hidden;
      if (step2 && !/^\d{6}$/.test(v.code || "")) { er.textContent = "Enter the 6-digit code."; er.hidden = false; return; }
      btn.disabled = true; btn.textContent = "Checking…";
      try {
        const r = await API.login(v.u, v.p, step2 ? v.code : "");
        if (r && r.need_code) { $("#cStep1", f).hidden = true; $("#cStep2", f).hidden = false; $("[name=code]", f).value = ""; $("[name=code]", f).focus(); if (r.error) { er.textContent = r.error; er.hidden = false; } return; }
        await boot();
      } catch (err) { er.textContent = err.message; er.hidden = false; }
      finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = "Sign in"; } }
    });
  }
  function forcedPasswordScreen() {
    $("#crm").innerHTML = `<div class="c-login"><form class="c-card" id="cPw" novalidate style="max-width:420px;display:grid;gap:14px;padding:28px"><h1 style="font-size:22px">Choose your own password</h1><p class="muted">Welcome, ${esc(C.state.user.name)}. Your account was set up with a temporary password. Choose a new one to continue.</p>${pwFields()}<p class="err-msg" style="color:var(--warn);font-size:13px" hidden></p><button class="c-btn pri lg" type="submit">Save and continue</button><button class="c-btn ghost" type="button" id="cOut">Sign out</button></form></div>`;
    const f = $("#cPw"); $("#cOut").addEventListener("click", async () => { await API.logout(); loginScreen(); });
    f.addEventListener("submit", async e => { e.preventDefault(); const er = $(".err-msg", f); er.hidden = true; clearErrors(f); try { await submitPw(readForm(f)); await boot(); toast("Password saved"); } catch (err) { er.textContent = err.message; er.hidden = false; showErrors(f, err.fields); } });
  }
  function blockedScreen(msg) { $("#crm").innerHTML = `<div class="c-login"><div class="c-card" style="max-width:420px"><h2 style="font-size:20px;margin-bottom:8px">CRM access only</h2><p class="muted">${esc(msg)}</p></div></div>`; }

  let unsub = null;
  async function boot() {
    try { C.state.meta = await API.call("meta"); C.state.user = C.state.meta.user; }
    catch (e) { if (e.auth) return loginScreen(); if (e.bootstrap) return bootstrapScreen(); return blockedScreen(e.message); }
    if (C.state.meta.gate === "change_password") return forcedPasswordScreen();
    if (C.state.meta.gate === "setup_2fa") return setup2fa(true);
    shell(); render();
    if (unsub) unsub(); unsub = API.subscribe(softRefresh);
  }
  function bootstrapScreen() {
    $("#crm").innerHTML = `<div class="c-login"><form class="c-card" id="cBoot" novalidate style="max-width:420px;display:grid;gap:14px;padding:28px"><h1 style="font-size:22px">Create the first admin</h1><p class="muted">No CRM accounts exist yet. This admin can then add the rest of the team.</p>${field("Your name", '<input class="c-in" name="name">')}${field("Username", '<input class="c-in" name="username" autocapitalize="none">')}${field("Password", '<input class="c-in" type="password" name="password" autocomplete="new-password">')}<p class="muted" style="font-size:12.5px">${PW_RULE}</p><p class="err-msg" style="color:var(--warn);font-size:13px" hidden></p><button class="c-btn pri lg" type="submit">Create admin</button></form></div>`;
    const f = $("#cBoot"); f.addEventListener("submit", async e => { e.preventDefault(); const er = $(".err-msg", f); er.hidden = true; try { const v = readForm(f); await API.bootstrap(v.name, v.username, v.password); await API.login(v.username, v.password, ""); await boot(); } catch (err) { er.textContent = err.message; er.hidden = false; } });
  }
  C.start = () => { window.addEventListener("hashchange", () => { if (C.state.user && (location.hash || "").startsWith(API.routePrefix || "#/")) render(); }); boot(); };
  C.boot = boot;

  Object.assign(C, { esc, $, $$, num, money, pct, fDate, fTime, fDT, ago, dur, minsTxt, digits, telHref, waHref, localInput, fromLocalInput, todayStr, debounce, isMgr, isAdmin, isMkt, isMktMgr, isSales, seesAll, canComm, isOps, isKyc, roleLabel, salesUsers, stage, stagePill, tempTag, outcomeLabel, userName, csv, downloadCsv, ICONS, TL_ICON, toast, modal, confirmBox, readForm, showErrors, clearErrors, field, inp, sel, chips, listInput, splitList, bars, hbars, heat, setUnread, setQueueCount, updateBadges });
})();
