/* Absel Global client area. Clients register, verify, upload documents, request MT5 accounts,
   deposit, withdraw and transfer. Every request is handled by the operations team. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, cur) => (Number(n) < 0 ? "-" : "") + (cur && cur !== "USD" ? cur + " " : "$") + Math.abs(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const fDT = iso => iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const root = $("#root");
  const S = { me: null };
  let C_install = () => {};

  /* ------------------------------------------------------------- API */
  async function post(path, body) {
    let r;
    try {
      r = window.PORTAL_API ? await window.PORTAL_API.post(path, body || {}) // in-browser demo
        : await fetch("/api/portal/" + path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "absel-portal" }, body: JSON.stringify(body || {}) });
    } catch (e) { const ne = new Error(navigator.onLine === false ? "You're offline. Check your connection and try again." : "We couldn't reach Absel Global. Try again in a moment."); ne.network = true; throw ne; }
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (r.status === 401 && path === "rpc") { S.me = null; go("login"); }
    if (!r.ok || d.ok === false) { const e = new Error(d.error || (d.need_code ? "Enter the 6-digit code from your authenticator app." : "Something went wrong. Please try again.")); e.fields = d.fields; e.data = d; throw e; }
    return d;
  }
  const rpc = async (method, ...args) => (await post("rpc", { method, args })).result;

  // Without an email service (development and the demo) the server returns the link it would have emailed
  function devLink(link, what) {
    if (!link) return;
    const href = link.replace(/^https?:\/\/[^#]+/, "");
    setTimeout(() => modal("Email preview", `<p class="muted" style="font-size:14px">Email sending isn't set up here, so this is the ${esc(what)} email the client would receive.</p><a class="btn pri block" href="${esc(href)}" data-x>Open the link from the email</a>`), 300);
  }

  /* ------------------------------------------------------------- UI helpers */
  const I = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    home: I('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'), acc: I('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 14l3-3 3 2 4-5"/>'),
    dep: I('<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>'), wd: I('<path d="M12 20V8M6 14l6-6 6 6"/><path d="M4 4h16"/>'), tr: I('<path d="M4 8h14l-4-4M20 16H6l4 4"/>'),
    hist: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'), doc: I('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 14h8M8 18h5"/>'),
    user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'), help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>'),
  };
  const NAV = [["home", "Dashboard", "home"], ["accounts", "Accounts", "acc"], ["deposit", "Deposit", "dep"], ["withdraw", "Withdraw", "wd"], ["transfer", "Transfer", "tr"], ["history", "Transactions", "hist"], ["documents", "Documents", "doc"], ["profile", "Profile & security", "user"], ["support", "Help", "help"]];
  const TABS = ["home", "accounts", "deposit", "history", "profile"];
  function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3600); }
  const fld = (label, inner, cls = "") => `<label class="fld ${cls}"><span>${esc(label)}</span>${inner}</label>`;
  const inp = (name, val = "", attrs = "") => `<input class="in" name="${name}" value="${esc(val)}" ${attrs}>`;
  const sel = (name, opts, val, attrs = "") => `<select class="in" name="${name}" ${attrs}>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  function readForm(f) { const o = {}; $$("[name]", f).forEach(el => { if (el.type === "checkbox") o[el.name] = el.checked; else if (el.type === "radio") { if (el.checked) o[el.name] = el.value; } else if (el.type !== "file") o[el.name] = el.value; }); return o; }
  function showErr(f, e) {
    $$(".fld.err", f).forEach(x => { x.classList.remove("err"); const s = $("small.e", x); if (s) s.remove(); });
    const box = $(".form-err", f); if (box) { box.textContent = e.message; box.hidden = false; }
    Object.entries(e.fields || {}).forEach(([k, v]) => { const el = $(`[name="${k}"]`, f); const w = el && el.closest(".fld"); if (w) { w.classList.add("err"); w.insertAdjacentHTML("beforeend", `<small class="e">${esc(v)}</small>`); } });
  }
  function onSubmit(f, fn) {
    f.addEventListener("submit", async ev => {
      ev.preventDefault(); const b = $('button[type="submit"]', f), box = $(".form-err", f); if (box) box.hidden = true;
      if (b) b.disabled = true;
      try { await fn(readForm(f), f); } catch (e) { showErr(f, e); } finally { if (b && b.isConnected) b.disabled = false; }
    });
  }
  function modal(title, body, actions = "") {
    const el = document.createElement("div"); el.className = "modal"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="bg"></div><div class="box"><h3>${esc(title)}</h3>${body}<div class="row" style="justify-content:flex-end">${actions}<button class="btn" data-x>Close</button></div></div>`;
    document.body.appendChild(el); const close = () => el.remove();
    $$("[data-x],.bg", el).forEach(b => b.addEventListener("click", close)); document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
    return { el, close };
  }
  // Photos of documents are shrunk before upload; PDFs go as they are
  function readFile(file) {
    return new Promise((res, rej) => {
      if (!file) return res(null);
      if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.type)) return rej(new Error("Upload a photo (JPG, PNG) or a PDF."));
      const rd = new FileReader(); rd.onerror = () => rej(new Error("Couldn't read that file."));
      rd.onload = () => {
        const data = rd.result;
        if (file.type === "application/pdf" || data.length < 1.6e6) { if (data.length > 6.4e6) return rej(new Error("That PDF is over 4 MB. Try a smaller scan.")); return res({ name: file.name, data }); }
        const img = new Image(); img.onerror = () => res({ name: file.name, data });
        img.onload = () => { const k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res({ name: file.name.replace(/\.\w+$/, "") + ".jpg", data: c.toDataURL("image/jpeg", 0.85) }); };
        img.src = data;
      };
      rd.readAsDataURL(file);
    });
  }
  const ST = { pending: ["Waiting", "var(--warn)"], first_approved: ["Being approved", "var(--warn)"], approved: ["Approved, sending", "var(--cta)"], completed: ["Done", "var(--up)"], rejected: ["Declined", "var(--down)"], cancelled: ["Cancelled", "var(--muted)"], requested: ["Being opened", "var(--warn)"], open: ["Active", "var(--up)"], closed: ["Closed", "var(--muted)"] };
  const pill = s => { const [l, c] = ST[s] || [s, "var(--muted)"]; return `<span class="pill" style="--c:${c}">${esc(l)}</span>`; };
  const KYC = { none: ["Not uploaded", "var(--muted)"], pending: ["Under review", "var(--warn)"], approved: ["Verified", "var(--up)"], rejected: ["Not accepted", "var(--down)"], resubmit: ["New documents needed", "var(--down)"] };
  const kycPill = s => { const [l, c] = KYC[s] || KYC.none; return `<span class="pill" style="--c:${c}">${esc(l)}</span>`; };
  const TYPE = { deposit: "Deposit", withdrawal: "Withdrawal", transfer: "Transfer" };

  /* ------------------------------------------------------------- attribution */
  // First touch wins for 30 days: campaign links, the website's stored campaign, or a referral code
  const ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ref", "landing"];
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const ss = k => { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) { return null; } };
  function captureAttribution() {
    const found = {}, add = q => ATTR_KEYS.forEach(k => { const v = q.get(k); if (v && !found[k]) found[k] = v.slice(0, 300); });
    try { add(new URLSearchParams(location.search)); add(new URLSearchParams((location.hash.split("?")[1]) || "")); } catch (e) {}
    const site = ss("ag_utm"); if (site) ATTR_KEYS.forEach(k => { if (site[k] && !found[k]) found[k] = String(site[k]).slice(0, 300); });
    if (!found.landing && document.referrer && !document.referrer.startsWith(location.origin)) found.landing = document.referrer.slice(0, 300);
    const old = ls.get("ag_attr");
    if (Object.keys(found).some(k => k !== "landing") && !(old && old.t > Date.now() - 30 * 864e5)) ls.set("ag_attr", Object.assign(found, { t: Date.now() }));
  }
  const attribution = () => { const a = ls.get("ag_attr") || {}, o = {}; ATTR_KEYS.forEach(k => { if (a[k]) o[k] = a[k]; }); return o; };
  captureAttribution();

  /* ------------------------------------------------------------- routing */
  function parse() { const h = location.hash.replace(/^#\/?/, ""); const [path, qs] = h.split("?"); return { path: path || "", q: Object.fromEntries(new URLSearchParams(qs || "")) }; }
  function go(path) { if (location.hash !== "#" + path) location.hash = path; else render(); }
  window.addEventListener("hashchange", () => render());
  const PUBLIC = ["login", "register", "forgot", "reset", "verify"];

  async function render() {
    const r = parse();
    if (r.path === "verify") return verifyPage(r.q.t);
    if (r.path === "reset") return resetPage(r.q.t);
    if (!PUBLIC.includes(r.path)) {
      try { S.me = await rpc("me"); } // fresh on every page: the team may have acted since
      catch (e) {
        if (e.network) { root.innerHTML = `<div class="auth-logo" style="display:block"><img src="/assets/absel-global-logo-white.png" alt="Absel Global" width="95" height="40"></div><div class="empty" style="padding:60px 20px"><b>You're offline</b>Your account details load when you're back online.<p style="margin-top:16px"><button class="btn pri" id="retry">Try again</button></p></div>`; $("#retry").addEventListener("click", render); return; }
        S.me = null;
      }
    }
    if (!S.me) return PUBLIC.includes(r.path) ? authPage(r.path) : go("login");
    if (PUBLIC.includes(r.path) || !r.path) return go("home");
    shell(r);
  }

  /* ------------------------------------------------------------- auth pages */
  const COUNTRIES = [["Kenya", "+254"], ["Nigeria", "+234"], ["Ghana", "+233"], ["South Africa", "+27"], ["Tanzania", "+255"], ["Uganda", "+256"], ["Rwanda", "+250"], ["Zambia", "+260"], ["Zimbabwe", "+263"], ["Botswana", "+267"], ["Cameroon", "+237"], ["Senegal", "+221"], ["Ivory Coast", "+225"], ["Ethiopia", "+251"], ["Egypt", "+20"], ["Morocco", "+212"], ["Tunisia", "+216"], ["Algeria", "+213"],
    ["Saudi Arabia", "+966"], ["Oman", "+968"], ["Qatar", "+974"], ["Kuwait", "+965"], ["Bahrain", "+973"], ["Jordan", "+962"], ["Lebanon", "+961"], ["Iraq", "+964"], ["India", "+91"], ["Pakistan", "+92"], ["Bangladesh", "+880"], ["Sri Lanka", "+94"], ["Nepal", "+977"], ["Maldives", "+960"],
    ["Malaysia", "+60"], ["Indonesia", "+62"], ["Thailand", "+66"], ["Vietnam", "+84"], ["Philippines", "+63"], ["Hong Kong", "+852"], ["China", "+86"], ["Japan", "+81"], ["South Korea", "+82"], ["Kazakhstan", "+7"], ["Uzbekistan", "+998"], ["Turkey", "+90"], ["Cyprus", "+357"], ["Greece", "+30"],
    ["United Kingdom", "+44"], ["Germany", "+49"], ["France", "+33"], ["Italy", "+39"], ["Spain", "+34"], ["Portugal", "+351"], ["Netherlands", "+31"], ["Switzerland", "+41"], ["Poland", "+48"], ["Romania", "+40"], ["Ukraine", "+380"], ["Mauritius", "+230"], ["Seychelles", "+248"],
    ["Brazil", "+55"], ["Argentina", "+54"], ["Chile", "+56"], ["Colombia", "+57"], ["Mexico", "+52"], ["Australia", "+61"]].sort((a, b) => a[0].localeCompare(b[0]));
  function authLayout(inner) {
    root.innerHTML = `<div class="auth">
      <aside class="auth-side"><img src="/assets/absel-global-logo-white.png" alt="Absel Global" width="123" height="52">
        <h1>Trade the world's markets with Absel Global</h1>
        <p>Forex, gold, indices and crypto CFDs on MetaTrader 5.</p>
        <ul><li>Open your account in minutes</li><li>0% deposit fees: card, bank, USDT, e-wallets</li><li>A personal account manager</li><li>Client money held in segregated accounts</li></ul>
        <p class="legal">Absel Global is a trading name of Absel Markets, licensed by the Financial Services Commission of Mauritius (licence GB25205423). CFDs are leveraged products and carry a high risk of losing money.</p></aside>
      <main class="auth-main"><div class="auth-card"><div class="auth-logo"><img src="/assets/absel-global-logo-white.png" alt="Absel Global" width="95" height="40"></div>${inner}</div></main></div>`;
  }
  function authPage(p) {
    if (p === "register") {
      authLayout(`<div><h2>Open your account</h2><p class="sub">Already registered? <a href="#login">Sign in</a></p></div>
        <form id="f" class="grid2" novalidate>
          ${fld("First name", inp("first_name", "", 'autocomplete="given-name"'))}${fld("Last name", inp("last_name", "", 'autocomplete="family-name"'))}
          ${fld("Email", inp("email", "", 'type="email" autocomplete="email"'), "full")}
          ${fld("Country of residence", sel("country", [["", "Select"]].concat(COUNTRIES.map(c => c[0])), "", 'id="rC" autocomplete="country-name"'), "full")}
          <label class="fld full"><span>Mobile number</span><div class="phone">${inp("dial_code", "+", 'id="rD" aria-label="Dial code" autocomplete="tel-country-code"')}${inp("phone", "", 'type="tel" autocomplete="tel-national" aria-label="Phone number"')}</div></label>
          ${fld("Password (10+ characters, letters and numbers)", inp("password", "", 'type="password" autocomplete="new-password"'), "full")}
          <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <label class="check full"><input type="checkbox" name="terms"><span>I confirm I'm 18 or older and accept the client agreement, privacy policy and risk disclosure. I understand that CFDs are high-risk leveraged products.</span></label>
          <p class="form-err full" hidden></p>
          <button class="btn pri block full" type="submit">Create account</button>
        </form>`);
      const pre = ss("ag_prefill") || {};
      ["first_name", "last_name", "email", "phone"].forEach(k => { if (pre[k] && $(`[name=${k}]`)) $(`[name=${k}]`).value = pre[k]; });
      if (pre.country && COUNTRIES.some(c => c[0] === pre.country)) $("#rC").value = pre.country; if (pre.dial_code) $("#rD").value = pre.dial_code;
      const f = $("#f"); $("#rC").addEventListener("change", e => { const c = COUNTRIES.find(x => x[0] === e.target.value); if (c && (!$("#rD").value || $("#rD").value === "+")) $("#rD").value = c[1]; else if (c) $("#rD").value = c[1]; });
      onSubmit(f, async v => {
        const d = await post("register", Object.assign(v, attribution()));
        S.me = null; toast("Account created. Check your email to confirm it"); go("home"); devLink(d.dev_link, "confirmation");
      });
      return;
    }
    if (p === "forgot") {
      authLayout(`<div><h2>Reset your password</h2><p class="sub">We'll email you a link to choose a new one.</p></div>
        <form id="f" class="grid2" novalidate>${fld("Email", inp("email", "", 'type="email" autocomplete="email"'), "full")}<p class="form-err full" hidden></p><button class="btn pri block full" type="submit">Send reset link</button><p class="full"><a href="#login">Back to sign in</a></p></form>`);
      onSubmit($("#f"), async v => { const d = await post("forgot", v); devLink(d.dev_link, "password reset"); $("#f").innerHTML = `<div class="note good full">If an account exists for ${esc(v.email)}, a reset link is on its way. It works for 1 hour.</div><p class="full"><a href="#login">Back to sign in</a></p>`; });
      return;
    }
    authLayout(`<div><h2>Sign in</h2><p class="sub">New to Absel Global? <a href="#register">Open an account</a></p></div>
      <form id="f" class="grid2" novalidate>
        ${fld("Email", inp("email", "", 'type="email" autocomplete="username"'), "full")}${fld("Password", inp("password", "", 'type="password" autocomplete="current-password"'), "full")}
        <div class="full" id="codeBox" hidden>${fld("6-digit code from your authenticator app", inp("code", "", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"'))}</div>
        <p class="form-err full" hidden></p>
        <button class="btn pri block full" type="submit">Sign in</button>
        <p class="full"><a href="#forgot">Forgot your password?</a></p>
      </form>`);
    onSubmit($("#f"), async v => {
      try { await post("login", v); }
      catch (e) { if (e.data && e.data.need_code) { $("#codeBox").hidden = false; $("[name=code]").focus(); if (!v.code) return; } throw e; }
      S.me = null; go("home");
    });
  }
  async function verifyPage(t) {
    authLayout(`<div class="loading">Confirming your email…</div>`);
    try { await post("verify", { token: t || "" }); S.me = null; $(".auth-card").innerHTML = `<h2>Email confirmed</h2><p class="sub">Thank you. Next, upload your documents so we can open your live account.</p><a class="btn pri block" href="#documents">Continue</a>`; }
    catch (e) { $(".auth-card").innerHTML = `<h2>Link expired</h2><p class="sub">${esc(e.message)}</p><a class="btn pri block" href="#home">Go to the client area</a>`; }
  }
  function resetPage(t) {
    authLayout(`<div><h2>Choose a new password</h2><p class="sub">Use 10 or more characters with letters and numbers.</p></div>
      <form id="f" class="grid2" novalidate>${fld("New password", inp("password", "", 'type="password" autocomplete="new-password"'), "full")}<p class="form-err full" hidden></p><button class="btn pri block full" type="submit">Save password</button></form>`);
    onSubmit($("#f"), async v => { await post("reset", { token: t || "", password: v.password }); toast("Password changed. Sign in with your new password"); go("login"); });
  }

  /* ------------------------------------------------------------- app shell */
  function shell(r) {
    const me = S.me, c = me.client, cur = r.path.split("/")[0];
    root.innerHTML = `<div class="app">
      <nav class="side" aria-label="Client area"><a class="logo" href="#home"><img src="/assets/absel-global-logo-white.png" alt="Absel Global" width="109" height="46"></a>
        ${NAV.map(([k, l, ic]) => `<a class="nv ${cur === k ? "on" : ""}" href="#${k}">${IC[ic]}<span>${l}</span></a>`).join("")}
        ${standalone() ? "" : `<a class="nv" href="#install" id="instSide" role="button">${I('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 8v7M9 12l3 3 3-3"/>')}<span>Install the app</span></a>`}
        <div class="me"><b>${esc(c.first_name)} ${esc(c.last_name)}</b>${esc(c.email)}<br><button id="out">Sign out</button></div></nav>
      <div class="main"><header class="top"><img class="tlogo" src="/assets/absel-global-logo-white.png" alt="Absel Global" width="85" height="36"><h1 id="ttl"></h1><span class="sp"></span><a class="btn sm pri" href="#deposit">${IC.dep.replace("<svg", '<svg width="16" height="16"')} Deposit</a></header>
        <div class="page" id="pg"><div class="loading">Loading…</div></div>
        <footer class="foot"><p>${esc(me.config.legal_line)}</p><p><b>Risk warning:</b> ${esc(me.config.risk_warning)}</p></footer></div>
      <nav class="tabbar" aria-label="Main">${NAV.filter(n => TABS.includes(n[0])).map(([k, l, ic]) => `<a class="${cur === k ? "on" : ""}" href="#${k}">${IC[ic]}<span>${k === "profile" ? "Profile" : k === "history" ? "History" : l}</span></a>`).join("")}</nav></div>`;
    $("#out").addEventListener("click", async () => { await post("logout").catch(() => {}); S.me = null; go("login"); });
    const v = VIEWS[cur] || VIEWS.home; $("#ttl").textContent = v.title; document.title = v.title + " · Absel Global";
    Promise.resolve(v.render($("#pg"), r)).catch(e => { $("#pg").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; });
    $$(".tabbar a, .side a.nv").forEach(a => { if (a.classList.contains("on")) a.setAttribute("aria-current", "page"); });
    const ib = $("#instSide"); if (ib) ib.addEventListener("click", e => { e.preventDefault(); C_install(true); });
    scheduleInstall();
  }
  const reload = async () => { S.me = await rpc("me"); render(); };
  const liveAccs = () => S.me.accounts.filter(a => a.kind === "live" && a.status === "open");
  const accLabel = a => `${a.login} · ${a.type_name}${a.balance_at ? " · " + money(a.balance, a.currency) : ""}`;

  /* ------------------------------------------------------------- views */
  const VIEWS = {};
  VIEWS.home = {
    title: "Dashboard",
    render(pg) {
      const me = S.me, c = me.client, live = liveAccs(), k = c.kyc.status;
      const steps = [
        ["Confirm email", !!c.email_verified_at, c.email_verified_at ? "Done" : "Check your inbox", "#profile"],
        ["Upload documents", k === "approved", k === "approved" ? "Verified" : k === "pending" ? "Under review" : k === "rejected" || k === "resubmit" ? "New documents needed" : "ID and proof of address", "#documents"],
        ["Open live account", me.accounts.some(a => a.kind === "live" && a.status === "open"), me.accounts.some(a => a.kind === "live" && a.status === "open") ? "Done" : me.accounts.some(a => a.kind === "live" && a.status === "requested") ? "Being opened" : "Choose your account", "#accounts/new"],
        ["Fund your account", me.totals.deposits > 0, me.totals.deposits > 0 ? "Done" : "Card, bank, USDT, e-wallets", "#deposit"],
      ];
      const nowIdx = steps.findIndex(s => !s[1]);
      const recent = me.payments.slice(0, 6);
      pg.innerHTML = `${nowIdx >= 0 ? `<section class="hero"><div><h2>Welcome, ${esc(c.first_name)}</h2><p>${nowIdx === 0 ? "Confirm your email to get started." : nowIdx === 1 ? "Upload your documents so we can open your live account." : nowIdx === 2 ? "You're verified. Open your live trading account." : "Your account is ready. Make your first deposit to start trading."}</p></div>
          <div class="steps">${steps.map((s, i) => `<a class="step ${s[1] ? "done" : i === nowIdx ? "now" : ""}" href="${s[3]}"><i>${s[1] ? "✓ DONE" : "STEP " + (i + 1)}</i><b>${esc(s[0])}</b><small>${esc(s[2])}</small></a>`).join("")}</div>
          ${nowIdx === 0 ? '<div><button class="btn sm" id="resend">Send the email again</button></div>' : ""}</section>` : ""}
        ${k === "rejected" || k === "resubmit" ? `<div class="note warn"><b>Documents not accepted:</b> ${esc(c.kyc.reason || "")} <a href="#documents">Upload new ones</a></div>` : ""}
        <div class="kpis"><div class="kpi"><span>Balance (live accounts)</span><b>${money(me.totals.balance)}</b><small>${live.some(a => a.balance_at) ? "Updated " + fDT(live.map(a => a.balance_at).filter(Boolean).sort().pop()) : "Live figures are in MT5"}</small></div>
          <div class="kpi"><span>Total deposited</span><b>${money(me.totals.deposits)}</b></div><div class="kpi"><span>Total withdrawn</span><b>${money(me.totals.withdrawals)}</b></div><div class="kpi"><span>Requests in progress</span><b>${me.totals.pending}</b><small><a href="#history">See transactions</a></small></div></div>
        <div class="cols"><div style="display:grid;gap:20px">
          <section class="card"><h3>Your accounts <span class="sp"></span><a class="btn sm" href="#accounts/new">Open account</a></h3>${me.accounts.filter(a => a.status !== "rejected").length ? me.accounts.filter(a => a.status !== "rejected").map(accCard).join("") : `<div class="empty"><b>No trading accounts yet</b>Open a live account, or try a free demo first.</div>`}</section>
          <section class="card"><h3>Recent transactions <span class="sp"></span><a class="btn sm" href="#history">All</a></h3>${recent.length ? `<div class="list">${recent.map(txRow).join("")}</div>` : '<div class="empty">No transactions yet.</div>'}</section>
        </div><div style="display:grid;gap:20px">
          ${me.bonus && ["credited", "traded"].includes(me.bonus.status) ? `<section class="card"><h3>$${me.bonus.amount} funded account</h3><p class="muted" style="font-size:14px">Trade it live. Profit can be withdrawn after ${me.bonus.min_lots} lots, up to $${me.bonus.max_profit}. The $${me.bonus.amount} itself can't be withdrawn.</p><div class="acc" style="margin-top:12px"><dl><div><dt>Account</dt><dd>${esc(me.bonus.account_id)}</dd></div><div><dt>Lots</dt><dd>${me.bonus.lots} / ${me.bonus.min_lots}</dd></div><div><dt>Profit</dt><dd>${money(me.bonus.profit)}</dd></div><div><dt>Ends</dt><dd>${fDate(me.bonus.expires_at)}</dd></div></dl></div></section>` : ""}
          ${me.manager ? `<section class="card"><h3>Your account manager</h3><div class="mgr"><div class="av">${esc(me.manager.name.split(" ").map(x => x[0]).join("").slice(0, 2))}</div><div><b>${esc(me.manager.name)}</b><br><span class="muted" style="font-size:13px">${esc(me.manager.email || "")}</span></div></div><div class="row" style="margin-top:12px">${me.manager.phone ? `<a class="btn sm" href="https://wa.me/${esc(me.manager.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">WhatsApp</a><a class="btn sm" href="tel:${esc(me.manager.phone.replace(/[^\d+]/g, ""))}">Call</a>` : ""}${me.manager.email ? `<a class="btn sm" href="mailto:${esc(me.manager.email)}">Email</a>` : ""}</div></section>` : ""}
          <section class="card"><h3>Download MetaTrader 5</h3><p class="muted" style="font-size:14px">Sign in with the login and server shown on your account.</p><div class="dl" style="margin-top:12px">${platformLinks()}</div></section>
        </div></div>`;
      wireAccCards(pg);
      const rs = $("#resend"); if (rs) rs.addEventListener("click", async () => { try { const d = await post("resend"); toast("Sent. Check your inbox and spam folder"); devLink(d.dev_link, "confirmation"); } catch (e) { toast(e.message); } });
    },
  };
  function platformLinks() { const l = S.me.config.platform_links || {}; return [["windows", "Windows"], ["ios", "iPhone"], ["android", "Android"], ["web", "Web trader"]].filter(([k]) => l[k]).map(([k, lb]) => `<a class="btn sm" href="${esc(l[k])}" target="_blank" rel="noopener">${lb}</a>`).join(""); }
  function accCard(a) {
    return `<div class="acc"><div class="hd"><b>${esc(a.type_name)}</b><span class="pill" style="--c:${a.kind === "live" ? "var(--cta)" : "var(--muted)"}">${a.kind === "live" ? "LIVE" : "DEMO"}</span>${pill(a.status)}<span class="sp"></span>${a.status === "open" && a.kind === "live" ? `<a class="btn sm" href="#deposit?a=${esc(a.id)}">Deposit</a><a class="btn sm" href="#withdraw?a=${esc(a.id)}">Withdraw</a>` : ""}</div>
      ${a.status === "open" ? `<dl><div><dt>MT5 login</dt><dd>${esc(a.login)}</dd></div><div><dt>Server</dt><dd>${esc(a.server || "—")}</dd></div><div><dt>Leverage</dt><dd>1:${esc(a.leverage)}</dd></div><div><dt>Balance</dt><dd>${a.balance_at || a.kind === "demo" ? money(a.balance, a.currency) : "—"}</dd></div></dl>
        ${a.has_password ? `<div class="row"><button class="btn sm pri" data-pw="${esc(a.id)}">Show my MT5 password</button><small class="muted">Shown once only. Save it somewhere safe.</small></div>` : ""}${a.balance_at ? `<small class="muted">Balance updated ${fDT(a.balance_at)}. Live balance and equity are in MT5.</small>` : ""}`
        : a.status === "requested" ? `<p class="muted" style="font-size:14px">We're opening this account (${a.kind}, 1:${esc(a.leverage)}, ${esc(a.currency)}). You'll get an email with your login, usually within one business day.</p>` : a.status === "rejected" ? `<p class="muted" style="font-size:14px">${esc(a.reject_reason)}</p>` : ""}</div>`;
  }
  function wireAccCards(pg) {
    $$("[data-pw]", pg).forEach(b => b.addEventListener("click", async () => {
      try { const r = await rpc("revealPassword", b.dataset.pw); modal("Your MT5 password", `<p>Login <b class="mono">${esc(r.login)}</b> · Server <b class="mono">${esc(r.server)}</b></p><div class="pw">${esc(r.password)}</div><p class="note warn">This is the only time we show it. Write it down or save it in a password manager, then change it in MT5 (Tools → Options → Change).</p>`); S.me = await rpc("me"); render(); }
      catch (e) { toast(e.message); }
    }));
  }
  function txRow(p) {
    const sign = p.type === "deposit" ? "+" : p.type === "withdrawal" ? "−" : "";
    return `<div class="li"><div><b>${TYPE[p.type]}</b> ${pill(p.status)}<small>${esc(p.reference)} · ${esc(p.method_name || (p.type === "transfer" ? p.account + " → " + p.to_account : ""))}${p.type !== "transfer" && p.account ? " · " + esc(p.account) : ""} · ${fDT(p.created_at)}${p.status === "rejected" && p.reject_reason ? " · " + esc(p.reject_reason) : ""}</small></div><div class="amt ${p.type === "deposit" ? "pos" : ""}">${sign}${money(p.amount)}</div></div>`;
  }

  VIEWS.accounts = {
    title: "Accounts",
    render(pg, r) {
      if (r.path === "accounts/new") return newAccount(pg, r);
      const accs = S.me.accounts;
      pg.innerHTML = `<div class="row"><a class="btn pri" href="#accounts/new">Open a new account</a><a class="btn" href="#accounts/new?kind=demo">Free demo account</a></div>
        <section class="card"><h3>Trading accounts</h3>${accs.length ? accs.map(accCard).join("") : '<div class="empty"><b>No accounts yet</b></div>'}</section>
        <section class="card"><h3>Download MetaTrader 5</h3><div class="dl">${platformLinks()}</div></section>`;
      wireAccCards(pg);
    },
  };
  function newAccount(pg, r) {
    const me = S.me, kind = r.q.kind === "demo" ? "demo" : "live", c = me.client, types = me.config.account_types;
    const blocked = kind === "live" && me.config.require_kyc_for_live && c.kyc.status !== "approved";
    pg.innerHTML = `<div class="seg"><button data-k="live" class="${kind === "live" ? "on" : ""}">Live account</button><button data-k="demo" class="${kind === "demo" ? "on" : ""}">Demo account</button></div>
      ${!c.email_verified_at ? '<div class="note warn">Confirm your email first. We sent you a link when you registered.</div>' : ""}
      ${blocked ? `<div class="note warn">Your documents need to be approved before we open a live account. <a href="#documents">Upload documents</a>. You can open a demo account now.</div>` : ""}
      <form id="f" class="card" style="display:grid;gap:18px" novalidate>
        <div><h3>Account type</h3><div class="choices">${types.map((t, i) => `<label class="choice"><input type="radio" name="type" value="${esc(t.id)}" ${i === 0 ? "checked" : ""}><b>${esc(t.name)}</b><small>${esc(t.desc || "")}</small>${kind === "live" ? `<span class="mono muted">Min. first deposit $${t.min_deposit}</span>` : ""}</label>`).join("")}</div></div>
        <div class="grid2">${fld("Leverage", `<select class="in" name="leverage" id="lev"></select>`)}${fld("Account currency", `<select class="in" name="currency" id="cur"></select>`)}${kind === "demo" ? fld("Practice balance", sel("demo_balance", [["10000", "$10,000"], ["50000", "$50,000"], ["100000", "$100,000"]], "10000")) : ""}</div>
        <p class="muted" style="font-size:13px">Higher leverage increases both potential profit and potential loss. ${kind === "live" ? "We open your account within one business day and email you the login." : "Practice with virtual money. Nothing you do on a demo affects real money."}</p>
        <p class="form-err" hidden></p>
        <div class="row"><button class="btn pri" type="submit" ${blocked || !c.email_verified_at ? "disabled" : ""}>Request ${kind} account</button><a class="btn ghost" href="#accounts">Cancel</a></div>
      </form>`;
    $$("[data-k]").forEach(b => b.addEventListener("click", () => go("accounts/new" + (b.dataset.k === "demo" ? "?kind=demo" : ""))));
    const upd = () => { const t = types.find(x => x.id === ($("input[name=type]:checked") || {}).value) || types[0]; $("#lev").innerHTML = (t.leverages || [100]).map(l => `<option value="${l}" ${l === 100 ? "selected" : ""}>1:${l}</option>`).join(""); $("#cur").innerHTML = (t.currencies || ["USD"]).map(x => `<option>${esc(x)}</option>`).join(""); };
    $$("input[name=type]").forEach(x => x.addEventListener("change", upd)); upd();
    onSubmit($("#f"), async v => { await rpc("requestAccount", Object.assign(v, { kind })); toast("Request sent. We'll email you when it's ready"); await reload(); go("accounts"); });
  }

  VIEWS.deposit = {
    title: "Deposit",
    render(pg, r) {
      const me = S.me, accs = liveAccs(), methods = me.config.methods.filter(m => m.deposit !== false);
      if (!accs.length) { pg.innerHTML = `<section class="card"><div class="empty"><b>Open a live account first</b>Your deposit goes straight into your MT5 trading account.</div><div class="row" style="justify-content:center"><a class="btn pri" href="#accounts/new">Open live account</a></div></section>`; return; }
      pg.innerHTML = `<form id="f" class="cols" novalidate><section class="card" style="display:grid;gap:18px">
          ${fld("To account", sel("account_id", accs.map(a => [a.id, accLabel(a)]), r.q.a || accs[0].id))}
          <div><h3>Payment method</h3><div class="choices">${methods.map((m, i) => `<label class="choice"><input type="radio" name="method" value="${esc(m.id)}" ${i === 0 ? "checked" : ""}><b>${esc(m.name)}</b><small>${esc(m.eta || "")}</small><span class="mono muted">Min. $${m.min || 0}${m.max ? " · max $" + m.max : ""}</span></label>`).join("")}</div></div>
          <div class="grid2">${fld("Amount (USD)", inp("amount", "", 'type="number" min="1" step="0.01" inputmode="decimal"'))}${fld("Receipt or screenshot (optional)", '<input class="in" type="file" name="proof" accept="image/*,application/pdf">')}</div>
          ${fld("Note (optional)", inp("note", "", 'placeholder="e.g. sent from my Equity Bank account"'))}
          <p class="form-err" hidden></p><button class="btn pri" type="submit">I've paid: notify the team</button>
        </section><aside class="card" style="display:grid;gap:12px"><h3>How to pay</h3><div id="ins"></div><p class="muted" style="font-size:13px">Deposits are free. Pay from an account in your own name; third-party payments are returned. We credit your MT5 account as soon as the payment is confirmed.</p></aside></form>`;
      const ins = () => { const m = methods.find(x => x.id === ($("input[name=method]:checked") || {}).value) || methods[0]; $("#ins").innerHTML = `<b>${esc(m.name)}</b>${m.instructions ? `<div class="instr" style="margin-top:8px">${esc(m.instructions)}</div>` : ""}${m.link ? `<a class="btn pri block" style="margin-top:10px" href="${esc(m.link)}" target="_blank" rel="noopener">Open secure payment page</a>` : ""}<p class="muted" style="font-size:13px;margin-top:8px">Put your registered email <b>${esc(me.client.email)}</b> in the payment reference so we can match it.</p>`; };
      $$("input[name=method]").forEach(x => x.addEventListener("change", ins)); ins();
      onSubmit($("#f"), async (v, f) => {
        const proof = f.proof.files[0] ? await readFile(f.proof.files[0]) : null;
        const p = await rpc("deposit", { account_id: v.account_id, method: v.method, amount: v.amount, note: v.note, proof });
        await reload(); go("history"); modal("Deposit request sent", `<p>Reference <b class="mono">${esc(p.reference)}</b> · ${money(p.amount)} by ${esc(p.method_name)}.</p><p class="muted">We'll credit your account as soon as the payment arrives and email you when it's done.</p>`);
      });
    },
  };
  VIEWS.withdraw = {
    title: "Withdraw",
    render(pg, r) {
      const me = S.me, accs = liveAccs(), methods = me.config.methods.filter(m => m.withdraw !== false);
      if (me.client.kyc.status !== "approved") { pg.innerHTML = `<section class="card"><div class="empty"><b>Verify your documents first</b>For your security, withdrawals are available once your ID and address are approved.</div><div class="row" style="justify-content:center"><a class="btn pri" href="#documents">Upload documents</a></div></section>`; return; }
      if (!accs.length) { pg.innerHTML = `<section class="card"><div class="empty"><b>No live account</b></div></section>`; return; }
      const ph = { bank: "Account holder name, bank name, IBAN or account number, SWIFT", crypto: "Your USDT (TRC20) wallet address", ewallet: "The email of your e-wallet account", card: "Last 4 digits of the card you deposited with", other: "Where should we send the money?" };
      pg.innerHTML = `<form id="f" class="cols" novalidate><section class="card" style="display:grid;gap:18px">
          ${fld("From account", sel("account_id", accs.map(a => [a.id, accLabel(a)]), r.q.a || accs[0].id, 'id="wa"'))}
          <div><h3>Send to</h3><div class="choices">${methods.map((m, i) => `<label class="choice"><input type="radio" name="method" value="${esc(m.id)}" data-kind="${esc(m.kind)}" ${i === 0 ? "checked" : ""}><b>${esc(m.name)}</b><small>${esc(m.eta || "")}</small></label>`).join("")}</div></div>
          ${fld("Amount (USD)", inp("amount", "", 'type="number" min="1" step="0.01" inputmode="decimal"'))}
          ${fld("Payment details", '<textarea class="in" name="details" id="wd"></textarea>')}
          <p class="form-err" hidden></p><button class="btn pri" type="submit">Request withdrawal</button>
        </section><aside class="card" style="display:grid;gap:10px"><h3>Before you withdraw</h3><p id="avail" class="note"></p><p class="muted" style="font-size:13.5px">Withdrawals go back to the method you deposited with, in your own name. Make sure the money isn't needed as margin for open trades. We process requests on business days and email you the reference when it's sent.</p></aside></form>`;
      const upd = () => { const kind = ($("input[name=method]:checked") || {}).dataset.kind; $("#wd").placeholder = ph[kind] || ph.other; const a = accs.find(x => x.id === $("#wa").value); $("#avail").innerHTML = a && a.balance_at ? `Balance on ${esc(a.login)}: <b>${money(a.balance)}</b> (updated ${fDT(a.balance_at)}). Requests in progress are held from this.` : "Check your free margin in MT5 before you request."; };
      $$("input[name=method]").forEach(x => x.addEventListener("change", upd)); $("#wa").addEventListener("change", upd); upd();
      onSubmit($("#f"), async v => { const p = await rpc("withdraw", v); await reload(); go("history"); modal("Withdrawal requested", `<p>Reference <b class="mono">${esc(p.reference)}</b> · ${money(p.amount)}.</p><p class="muted">Our team checks it and sends the payment. You'll get an email with the payment reference.</p>`); });
    },
  };
  VIEWS.transfer = {
    title: "Transfer between accounts",
    render(pg) {
      const accs = liveAccs();
      if (accs.length < 2) { pg.innerHTML = `<section class="card"><div class="empty"><b>You need two live accounts</b>Open another account to move money between them.</div><div class="row" style="justify-content:center"><a class="btn pri" href="#accounts/new">Open account</a></div></section>`; return; }
      pg.innerHTML = `<form id="f" class="card" style="display:grid;gap:16px;max-width:560px" novalidate>${fld("From", sel("account_id", accs.map(a => [a.id, accLabel(a)]), accs[0].id))}${fld("To", sel("to_account_id", accs.map(a => [a.id, accLabel(a)]), accs[1].id))}${fld("Amount (USD)", inp("amount", "", 'type="number" min="1" step="0.01"'))}<p class="form-err" hidden></p><button class="btn pri" type="submit">Request transfer</button></form>`;
      onSubmit($("#f"), async v => { const p = await rpc("transfer", v); await reload(); go("history"); toast("Transfer " + p.reference + " requested"); });
    },
  };
  VIEWS.history = {
    title: "Transactions",
    async render(pg, r) {
      const type = r.q.type || "", rows = await rpc("history", { type });
      pg.innerHTML = `<div class="seg">${[["", "All"], ["deposit", "Deposits"], ["withdrawal", "Withdrawals"], ["transfer", "Transfers"]].map(([k, l]) => `<button data-t="${k}" class="${type === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <section class="card" style="padding:0"><div class="scroll"><table class="t"><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Method</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td>${fDT(p.created_at)}<small class="mono">${esc(p.reference)}</small></td><td>${TYPE[p.type]}</td><td class="mono">${esc(p.account)}${p.to_account ? " → " + esc(p.to_account) : ""}</td><td>${esc(p.method_name || "—")}</td><td class="amt ${p.type === "deposit" ? "pos" : ""}">${money(p.amount)}${p.amount_requested && p.amount_requested !== p.amount ? `<small>requested ${money(p.amount_requested)}</small>` : ""}</td><td>${pill(p.status)}${p.status === "rejected" ? `<small>${esc(p.reject_reason)}</small>` : p.status === "completed" && p.completed_at ? `<small>${fDT(p.completed_at)}</small>` : ""}</td><td>${p.status === "pending" ? `<button class="btn sm" data-cancel="${esc(p.id)}">Cancel</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : '<div class="empty"><b>No transactions</b></div>'}</section>`;
      $$("[data-t]").forEach(b => b.addEventListener("click", () => go("history" + (b.dataset.t ? "?type=" + b.dataset.t : ""))));
      $$("[data-cancel]").forEach(b => b.addEventListener("click", async () => { try { await rpc("cancel", b.dataset.cancel); toast("Cancelled"); await reload(); } catch (e) { toast(e.message); } }));
    },
  };
  VIEWS.documents = {
    title: "Documents",
    render(pg) {
      const me = S.me, k = me.client.kyc, docs = me.docs;
      const rowFor = kk => { const mine = docs.filter(d => d.kind === kk.id).sort((a, b) => b.created_at.localeCompare(a.created_at)), last = mine[0];
        return `<div class="doc"><div><b>${esc(kk.label)}</b>${kk.required ? ' <span class="muted" style="font-size:12px">required</span>' : ' <span class="muted" style="font-size:12px">optional</span>'}${last ? `<small class="muted" style="display:block">${esc(last.name)} · ${fDT(last.created_at)} · ${last.status === "approved" ? "approved" : last.status === "rejected" ? "not accepted" : "uploaded"}</small>` : ""}</div>
          ${k.status === "approved" ? '<span class="pill" style="--c:var(--up)">Approved</span>' : `<label class="btn sm ${last && last.status !== "rejected" ? "" : "pri"}">${last && last.status !== "rejected" ? "Replace" : "Upload"}<input type="file" accept="image/*,application/pdf" data-kind="${esc(kk.id)}" hidden></label>`}</div>`; };
      pg.innerHTML = `<section class="card"><h3>Verification ${kycPill(k.status)}</h3>
          ${k.status === "approved" ? '<div class="note good">Your identity is verified. You can open live accounts, deposit and withdraw.</div>' : k.status === "pending" ? '<div class="note">Thanks, our compliance team is reviewing your documents. This usually takes a few hours on business days.</div>' : k.status === "rejected" || k.status === "resubmit" ? `<div class="note warn"><b>We couldn't accept your documents:</b> ${esc(k.reason || "")}. Please upload new ones.</div>` : '<p class="muted">Regulation requires us to confirm who you are before you trade. Upload clear photos or scans, with all four corners visible.</p>'}
          <div class="docs" style="margin-top:8px">${me.kyc_kinds.map(rowFor).join("")}</div></section>
        <section class="card"><h3>Tips for quick approval</h3><p class="muted" style="font-size:14px">• The name and address must match your profile. • Proof of address must be dated within the last 3 months (utility bill, bank statement, tax letter). • No screenshots of edited files; photos must be sharp and not cut off.</p></section>`;
      $$("[data-kind]", pg).forEach(inp2 => inp2.addEventListener("change", async () => {
        const f = inp2.files[0]; if (!f) return;
        try { const file = await readFile(f); toast("Uploading…"); const r = await rpc("uploadKyc", Object.assign(file, { kind: inp2.dataset.kind })); toast(r.kyc && r.kyc.status === "pending" ? "Thanks! Your documents are under review" : "Uploaded"); await reload(); }
        catch (e) { toast(e.message); }
      }));
    },
  };
  VIEWS.profile = {
    title: "Profile & security",
    render(pg) {
      const c = S.me.client, locked = c.kyc.status === "approved";
      pg.innerHTML = `<div class="cols"><form id="pf" class="card grid2" novalidate><h3 class="full">Personal details</h3>
          ${fld("First name", inp("first_name", c.first_name, locked ? "disabled" : ""))}${fld("Last name", inp("last_name", c.last_name, locked ? "disabled" : ""))}
          ${fld("Email", inp("email_ro", c.email, "disabled"))}${fld("Mobile", inp("phone_ro", c.dial_code + " " + c.phone, "disabled"))}
          ${fld("Date of birth", inp("dob", c.dob, 'type="date"'))}${fld("Nationality", inp("nationality", c.nationality))}
          ${fld("Address", inp("address", c.address, 'autocomplete="street-address"'), "full")}${fld("City", inp("city", c.city))}${fld("Postcode", inp("postcode", c.postcode))}
          ${fld("Country of residence", inp("country_ro", c.country, "disabled"), "full")}
          <p class="muted full" style="font-size:12.5px">${locked ? "Your name is verified. To change it, email, phone or country, contact support." : "Use your name exactly as it appears on your ID."}</p>
          <p class="form-err full" hidden></p><div class="full"><button class="btn pri" type="submit">Save details</button></div></form>
        <div style="display:grid;gap:20px">
          <section class="card"><h3>Email ${c.email_verified_at ? '<span class="pill" style="--c:var(--up)">Confirmed</span>' : '<span class="pill" style="--c:var(--warn)">Not confirmed</span>'}</h3>${c.email_verified_at ? `<p class="muted" style="font-size:14px">${esc(c.email)}</p>` : `<p class="muted" style="font-size:14px">We sent a link to ${esc(c.email)}.</p><button class="btn sm" id="resend" style="margin-top:10px">Send it again</button>`}</section>
          <form id="pw" class="card" style="display:grid;gap:12px" novalidate><h3>Change password</h3>${fld("Current password", inp("current", "", 'type="password" autocomplete="current-password"'))}${fld("New password", inp("password", "", 'type="password" autocomplete="new-password"'))}<p class="form-err" hidden></p><button class="btn" type="submit">Change password</button></form>
          ${standalone() ? "" : `<section class="card"><h3>Absel Global app</h3><p class="muted" style="font-size:14px">Install the client area on your phone or computer. It opens like an app, straight to your account.</p><button class="btn sm pri" id="appBtn" style="margin-top:10px">Install the app</button></section>`}
          <section class="card" id="tf"><h3>Two-step login ${c.totp_enabled ? '<span class="pill" style="--c:var(--up)">On</span>' : '<span class="pill">Off</span>'}</h3><p class="muted" style="font-size:14px">${c.totp_enabled ? "You'll be asked for a code from your authenticator app when you sign in." : "Protect your money: ask for a code from Google Authenticator or a similar app when you sign in."}</p><button class="btn sm" id="tfBtn" style="margin-top:10px">${c.totp_enabled ? "Turn off" : "Turn on"}</button></section>
        </div></div>`;
      onSubmit($("#pf"), async v => { await rpc("updateProfile", v); toast("Saved"); await reload(); });
      const ab = $("#appBtn"); if (ab) ab.addEventListener("click", () => C_install(true));
      onSubmit($("#pw"), async v => { await post("password", v); toast("Password changed"); $("#pw").reset(); });
      const rs = $("#resend"); if (rs) rs.addEventListener("click", async () => { try { const d = await post("resend"); toast("Sent. Check your inbox"); devLink(d.dev_link, "confirmation"); } catch (e) { toast(e.message); } });
      $("#tfBtn").addEventListener("click", async () => {
        if (c.totp_enabled) {
          const m = modal("Turn off two-step login", `<form id="tx" class="grid2" novalidate>${fld("Code from your app", inp("code", "", 'inputmode="numeric" maxlength="6"'), "full")}<p class="form-err full" hidden></p><button class="btn pri full" type="submit">Turn off</button></form>`);
          onSubmit($("#tx", m.el), async v => { await rpc("totpDisable", v.code); m.close(); toast("Two-step login is off"); await reload(); }); return;
        }
        try {
          const t = await rpc("totpBegin");
          const m = modal("Turn on two-step login", `<p class="muted" style="font-size:14px">1. Scan this with Google Authenticator, Microsoft Authenticator or Authy. 2. Enter the 6-digit code it shows.</p><div class="qr" id="qr"></div><p class="mono" style="font-size:12px;word-break:break-all">Or enter this key: ${esc(t.secret)}</p><form id="tx" class="grid2" novalidate>${fld("6-digit code", inp("code", "", 'inputmode="numeric" maxlength="6"'), "full")}<p class="form-err full" hidden></p><button class="btn pri full" type="submit">Turn on</button></form>`);
          loadQr().then(ok => { if (ok && $("#qr", m.el)) new window.QRCode($("#qr", m.el), { text: t.otpauth, width: 168, height: 168 }); else if ($("#qr", m.el)) $("#qr", m.el).hidden = true; });
          onSubmit($("#tx", m.el), async v => { await rpc("totpEnable", v.code); m.close(); toast("Two-step login is on"); await reload(); });
        } catch (e) { toast(e.message); }
      });
    },
  };
  function loadQr() { return window.QRCode ? Promise.resolve(true) : new Promise(res => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload = () => res(!!window.QRCode); s.onerror = () => res(false); setTimeout(() => res(!!window.QRCode), 5000); document.head.appendChild(s); }); }
  VIEWS.support = {
    title: "Help",
    render(pg) {
      const me = S.me, wa = String(me.config.whatsapp || "").replace(/\D/g, "");
      pg.innerHTML = `<div class="cols"><section class="card"><h3>Contact us</h3><div class="row">${me.manager ? `<span>Your account manager: <b>${esc(me.manager.name)}</b></span>` : ""}</div><div class="row" style="margin-top:12px">${wa ? `<a class="btn pri" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp us</a>` : ""}${me.config.support_email ? `<a class="btn" href="mailto:${esc(me.config.support_email)}">${esc(me.config.support_email)}</a>` : ""}</div></section>
        <section class="card"><h3>Common questions</h3>
          <details><summary><b>How long does a deposit take?</b></summary><p class="muted">Card and e-wallets are usually credited the same day once confirmed, USDT within an hour, bank wires in 1–3 business days.</p></details>
          <details style="margin-top:10px"><summary><b>How do I log in to MetaTrader 5?</b></summary><p class="muted">Download MT5, choose "Login to an existing account", search for the server shown on your account and enter your login and password.</p></details>
          <details style="margin-top:10px"><summary><b>Where does my withdrawal go?</b></summary><p class="muted">Back to the method you deposited with, in your own name, for your security and to meet anti-money-laundering rules.</p></details>
        </section></div>`;
    },
  };

  /* ------------------------------------------------------------- app install (PWA) */
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const iosSafari = isIOS && !/crios|fxios|edgios/i.test(navigator.userAgent);
  let deferredPrompt = null, promptTimer = null;
  const canInstall = () => !standalone() && (deferredPrompt || iosSafari || window.PORTAL_DEMO);
  const snoozed = () => { const t = ls.get("ag_install_snooze"); return t && t > Date.now(); };
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; scheduleInstall(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; closeInstall(); toast("Absel Global is installed. Open it from your home screen"); });
  function scheduleInstall() {
    // Ask only signed-in clients, once per visit, after they've been here a little while, never on forms
    clearTimeout(promptTimer);
    if (!S.me || !canInstall() || snoozed()) return;
    try { if (sessionStorage.getItem("ag_install_shown")) return; } catch (e) {}
    promptTimer = setTimeout(() => { const pth = parse().path; if (S.me && ["home", "accounts", "history"].includes(pth) && !document.querySelector(".modal")) showInstall(); }, 12000);
  }
  function closeInstall(snoozeDays) { const el = $("#inst"); if (el) el.remove(); if (snoozeDays) ls.set("ag_install_snooze", Date.now() + snoozeDays * 864e5); }
  async function doInstall() {
    if (deferredPrompt) { deferredPrompt.prompt(); const ch = await deferredPrompt.userChoice.catch(() => ({})); deferredPrompt = null; closeInstall(ch.outcome === "accepted" ? 0 : 30); return; }
    if (window.PORTAL_DEMO) { closeInstall(); toast("On abselglobal.com this installs the app on the device"); return; }
    closeInstall();
  }
  function showInstall(fromMenu) {
    if (!canInstall()) { if (fromMenu) toast(standalone() ? "You're already using the app" : "Open this page in Chrome, Edge or Safari to install the app"); return; }
    try { sessionStorage.setItem("ag_install_shown", "1"); } catch (e) {}
    closeInstall();
    const ios = !deferredPrompt && iosSafari;
    const el = document.createElement("div"); el.id = "inst"; el.className = "inst"; el.setAttribute("role", "dialog"); el.setAttribute("aria-labelledby", "instT");
    el.innerHTML = `<img src="/assets/app-192.png" alt="" width="52" height="52"><div class="it"><b id="instT">Get the Absel Global app</b><p>${ios ? 'Tap <span class="ios-share" aria-label="Share">' + I('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>').replace("<svg", '<svg width="18" height="18"') + '</span> then <b>Add to Home Screen</b>.' : "Check your balance, deposit and withdraw in one tap. No app store needed, it takes 2 seconds."}</p>
      <div class="row">${ios ? "" : '<button class="btn sm pri" id="instGo">Install</button>'}<button class="btn sm ghost" id="instNo">${ios ? "Got it" : "Not now"}</button></div></div><button class="ix" id="instX" aria-label="Close">×</button>`;
    document.body.appendChild(el);
    const go2 = $("#instGo"); if (go2) go2.addEventListener("click", doInstall);
    $("#instNo").addEventListener("click", () => closeInstall(ios ? 30 : 14)); $("#instX").addEventListener("click", () => closeInstall(14));
  }
  C_install = showInstall;
  // Service worker: app shell works offline and loads instantly; money and account data always come live from the server
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.PORTAL_API) window.addEventListener("load", () => navigator.serviceWorker.register("/portal/sw.js", { scope: "/portal/" }).catch(() => {}));
  function netBanner() { let b = $("#offline"); if (navigator.onLine !== false) { if (b) b.remove(); return; } if (!b) { b = document.createElement("div"); b.id = "offline"; b.className = "offline"; b.setAttribute("role", "status"); b.textContent = "You're offline. Balances and requests will update when you reconnect."; document.body.appendChild(b); } }
  window.addEventListener("online", () => { netBanner(); if (S.me) render(); }); window.addEventListener("offline", netBanner); netBanner();

  window.addEventListener("message", e => { if (e.data === "portal:refresh" && S.me && ["home", "accounts", "history", "documents", ""].includes(parse().path.split("?")[0]) && !document.querySelector(".modal")) render(); });
  render();
})();
