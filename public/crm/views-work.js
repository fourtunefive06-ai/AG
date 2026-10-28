/* Absel CRM — agent workspace: My day, Calling mode, Leads, Lead 360, Follow-ups */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, fDate, fTime, fDT, ago, dur, minsTxt, telHref, waHref, localInput, fromLocalInput, isMgr, isAdmin, isSales, seesAll, salesUsers, stagePill, tempTag, outcomeLabel, userName, toast, modal, confirmBox, field, inp, sel, chips, ICONS, TL_ICON } = C;
  const needsApproval = () => meta().settings.deposit_approval !== false && !isMgr();

  /* ====================================================== SHARED TOOLS */
  // Click-to-call through the phone system when it's connected, otherwise the computer's softphone (tel: link)
  C.dial = async (l, el) => {
    const m = meta();
    if (m.telephony && m.telephony.mode === "click") {
      try { await API.call("dial", l.id); toast("Your phone is ringing. Pick up to connect to " + l.first_name); } catch (e) { toast(e.message); }
    } else { const a = document.createElement("a"); a.href = telHref(l.dial_code, l.phone); a.click(); }
    if (el) el.dispatchEvent(new CustomEvent("dialed", { bubbles: true }));
  };
  // Shrinks photos of receipts before upload (keeps them readable, well under the 2 MB limit)
  C.readFile = file => new Promise((res, rej) => {
    if (!file) return res(null);
    const rd = new FileReader(); rd.onerror = () => rej(new Error("Couldn't read that file."));
    rd.onload = () => {
      const data = String(rd.result);
      if (!/^data:image\/(png|jpeg|webp)/.test(data)) { if (/^data:application\/pdf/.test(data) && data.length < 3.1e6) return res({ name: file.name, data }); return rej(new Error("Upload a photo (JPG, PNG) or a PDF under 2 MB.")); }
      const img = new Image(); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res({ name: file.name.replace(/\.\w+$/, "") + ".jpg", data: c.toDataURL("image/jpeg", 0.8) }); };
      img.onerror = () => rej(new Error("That image couldn't be opened.")); img.src = data;
    };
    rd.readAsDataURL(file);
  });
  C.uploadFile = async (leadId, file, kind) => { const f = await C.readFile(file); if (!f) return null; const r = await API.call("uploadFile", leadId, { name: f.name, data: f.data, kind: kind || "deposit_proof" }); return r.id; };
  C.openFile = async id => {
    try {
      const f = await API.call("getFile", id);
      if (f.type === "application/pdf") { const bin = atob(f.data.split(",")[1]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank"); return; }
      modal({ title: f.name, wide: true, body: `<img src="${esc(f.data)}" alt="${esc(f.name)}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto">` });
    } catch (e) { toast(e.message); }
  };
  const meta = () => C.state.meta;

  /* ============================================================ SCRIPT */
  const OBJECTIONS = {
    "Regulation / trust": "Absel Global is a trading name of Absel Markets, which is licensed by the Financial Services Commission of Mauritius under licence GB25205423, with both a Global Business and an Investment Dealer licence. Client money sits in segregated bank accounts, separate from company funds, and there is professional indemnity insurance. I can send you the licence PDF on WhatsApp right now.",
    "Spreads & costs": "On the ECN account spreads start from 0.2 pips with a commission from $7 per lot. If you prefer no commission, the STP account starts from 0.9 pips. There are no deposit fees. Which instruments do you trade most? I'll tell you what that means for your costs.",
    "Deposit methods": "You can fund by Visa or Mastercard, bank wire, USDT, Skrill, Neteller or UnionPay, with 0% deposit fees. Most card and e-wallet deposits arrive instantly.",
    "Withdrawal speed": "Withdrawals go back to the method you deposited with once your account is verified. Our team processes requests on business days, and I'll personally follow up on your first one.",
    "Leverage": "Leverage goes up to 1:500, but you choose what you use. Higher leverage also increases risk, so many clients start lower. Let's set it to match your experience.",
    "Platform": "You trade on MetaTrader 5: Windows, web browser, iPhone and Android. If you already use MT4 or MT5 elsewhere, your indicators and EAs work the same way. I can send the download links now.",
    "Needs more info": "Of course. I'll send a short summary on WhatsApp now: account types, costs and our licence. When's a good time tomorrow for a 5-minute call to answer anything left?",
    "Partner / family decision": "That makes sense. Would it help if I join a quick call with both of you, or send the details so you can review together? When should I follow up?",
    "No time now": "No problem. Registration takes about 3 minutes. Shall I send you the link on WhatsApp and call you back at a time that suits you?",
    "Bad past broker experience": "I'm sorry that happened. That's exactly why we show our FSC licence and keep client funds segregated. You can start with a small deposit, test a withdrawal, and only add more once you're comfortable.",
  };
  function scriptPanel(l, j) {
    const p = l.profile || {}, agent = C.state.user.name.split(" ")[0], first = esc(l.first_name);
    const open = {
      new: `Hi ${first}, this is ${esc(agent)} from Absel Global. You asked for a call back about opening a trading account. Do you have 3 minutes now?`,
      attempting: `Hi ${first}, it's ${esc(agent)} from Absel Global. I tried you earlier about your account request. Is now a better time?`,
      contacted: `Hi ${first}, ${esc(agent)} from Absel Global again, following up on our last call. Did you get a chance to look at the details I sent?`,
      qualified: `Hi ${first}, ${esc(agent)} here. You were ready to open your ${esc(p.account_type || "trading")} account. Shall we complete the registration together now? It takes about 3 minutes.`,
      registered: `Hi ${first}, congratulations on registering. The next step is uploading your ID and proof of address. Can I guide you through it now?`,
      kyc: `Hi ${first}, your account is verified. Shall I help you make your first deposit so you're ready to trade?`,
      funded: `Hi ${first}, thanks for funding your account. How is your trading going? Do you need help with MT5?`,
    }[l.stage] || `Hi ${first}, this is ${esc(agent)} from Absel Global.`;
    const close = { qualified: "Send the registration link on WhatsApp and stay on the line while they complete it.", registered: "Walk them through KYC upload in the client area.", kyc: "Help them choose a deposit method and confirm the amount.", funded: "Offer MT5 setup help and ask for referrals." }[l.stage] || "Agree a clear next step: registration now, or a fixed call-back time.";
    const JO = C.journeyObjections ? C.journeyObjections() : {}, ALL = Object.assign({}, OBJECTIONS, JO), js = C.journeyScript ? C.journeyScript(l, j) : "";
    const inJourney = j && (j.demo || j.bonus);
    const objs = ((p.objections || []).length ? p.objections : Object.keys(OBJECTIONS).slice(0, 4)).concat(inJourney ? Object.keys(JO).filter(k => j.bonus ? !/demo/i.test(k) : /demo/i.test(k)) : []);
    return `<div class="c-script">
      <details open><summary>Opening</summary><div><p><q>${open}</q></p></div></details>
      <details ${l.stage === "new" || l.stage === "attempting" || l.stage === "contacted" ? "open" : ""}><summary>Discovery questions</summary><div>
        <p>1. Have you traded before? Which markets and which broker?</p><p>2. Roughly how much would you like to start with?</p><p>3. What do you want to trade: forex, gold, indices, crypto?</p><p>4. When would you like to start?</p><p>5. Any concerns about choosing a new broker?</p></div></details>
      <details><summary>Key points to mention</summary><div>
        <p>• FSC Mauritius licence GB25205423, segregated client funds</p><p>• ECN spreads from 0.2 pips, STP with $0 commission</p><p>• MetaTrader 5 on desktop, web and mobile</p><p>• Swap-free Islamic accounts, Cent accounts for small starts</p><p>• 0% deposit fees: card, wire, USDT, Skrill, Neteller</p></div></details>
      ${js ? `<details open><summary>Demo & company-funded account <small class="muted">optional</small></summary><div>${js}</div></details>` : ""}
      <details open><summary>Close</summary><div><p>${esc(close)}</p></div></details>
      <h3 style="font-size:13px;font-family:var(--f-body);margin-top:4px">Handling concerns</h3>
      ${objs.map(o => `<details><summary>${esc(o)}</summary><div><p>${esc(ALL[o] || "")}</p></div></details>`).join("")}
      <details><summary>All concerns</summary><div>${Object.keys(ALL).filter(o => !objs.includes(o)).map(o => `<p><b>${esc(o)}:</b> ${esc(ALL[o])}</p>`).join("")}</div></details>
      <div class="c-banner warn" style="font-size:12.5px"><b>Compliance:</b> never promise profits or guaranteed returns. Mention that CFDs are high risk. Don't call leads marked Do not contact or from restricted countries.</div>
    </div>`;
  }
  C.scriptPanel = scriptPanel;

  /* ========================================================= CALL FORM */
  const NEXT = [["", "No follow-up"], ["1h", "In 1 hour"], ["3h", "In 3 hours"], ["tom10", "Tomorrow 10:00"], ["tom16", "Tomorrow 16:00"], ["2d", "In 2 days"], ["custom", "Pick a time"]];
  function nextDate(code) {
    const d = new Date();
    if (code === "1h") return new Date(Date.now() + 3600e3); if (code === "3h") return new Date(Date.now() + 3 * 3600e3);
    if (code === "2d") { d.setDate(d.getDate() + 2); d.setHours(11, 0, 0, 0); return d; }
    if (code === "tom10" || code === "tom16") { d.setDate(d.getDate() + 1); d.setHours(code === "tom10" ? 10 : 16, 0, 0, 0); return d; }
    return null;
  }
  function callForm(host, l, o = {}) {
    const m = meta(), p = l.profile || {};
    const qa = m.qa_fields.map(f => {
      const v = p[f.id];
      if (f.type === "select") return field(f.label, sel("qa." + f.id, [["", "—"]].concat(f.options), v || (f.id === "experience" && l.experience ? { "New to trading": "None" }[l.experience] || l.experience : "")));
      if (f.type === "multi") return field(f.label, chips("qa." + f.id, f.options, v || []), "full");
      if (f.type === "textarea") return field(f.label, `<textarea class="c-ta" name="qa.${f.id}" rows="2" placeholder="e.g. Asked about withdrawal times and gold spreads">${esc(v || "")}</textarea>`, "full");
      return field(f.label, inp("qa." + f.id, v || "", f.type === "number" ? 'type="number" min="0" step="50"' : ""));
    }).join("");
    host.innerHTML = `<form class="c-card" novalidate style="display:grid;gap:14px">
      <div class="c-row"><div><div class="c-timer" id="cfTimer">00:00</div><small class="muted">Call timer</small></div><span class="sp"></span>
        <button type="button" class="c-btn pri lg" id="cfDial" ${l.dnc ? "disabled" : ""}>${ICONS.phone} Dial ${esc(l.dial_code)} ${esc(l.phone)}</button>
        <button type="button" class="c-btn lg" id="cfStart">Start timer</button></div>
      ${l.dnc ? '<div class="c-banner warn"><b>Do not contact.</b> This client asked not to be called.</div>' : ""}
      <div><h3 style="font-size:13px;font-family:var(--f-body);margin-bottom:8px">Call outcome</h3><div class="c-outcomes" role="radiogroup">${m.outcomes.map((x, i) => `<button type="button" class="${x.connected ? "con" : ""}" data-oc="${x.id}" role="radio" aria-checked="false"><kbd>${i + 1}</kbd>${esc(x.label)}</button>`).join("")}</div><input type="hidden" name="outcome"></div>
      <details id="cfQa" ${o.qaOpen ? "open" : ""} style="border:1px solid var(--line);border-radius:10px"><summary style="cursor:pointer;padding:10px 12px;font-weight:700">Discovery: what the client told you</summary><div class="c-grid" style="padding:0 12px 12px">${qa}</div></details>
      ${field("Call notes", '<textarea class="c-ta" name="notes" rows="3" placeholder="What was discussed, what the client asked, what you promised"></textarea>')}
      <div class="c-grid">
        ${field("Next step", sel("next_code", NEXT, ""))}
        ${field("Follow-up type", sel("next_type", [["call", "Call"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["meeting", "Meeting / video call"]], "call"))}
        <label class="c-field full" id="cfCustom" hidden><span>Follow-up time</span><input class="c-in" type="datetime-local" name="next_at" value="${localInput(new Date(Date.now() + 86400e3).toISOString())}"></label>
        ${field("Move stage", sel("stage", [["", "Automatic (from outcome)"]].concat(m.stages.filter(s => s.id !== l.stage).map(s => [s.id, s.id === "funded" && needsApproval() ? "Funded: submit deposit" : s.label])), ""))}
        ${field("Duration (minutes)", inp("dur_min", "", 'type="number" min="0" step="0.5" placeholder="Auto from timer"'))}
        <label class="c-field" id="cfAcc" hidden><span>MT5 account number</span>${inp("account_id", l.account_id || "")}</label>
        <div class="full c-grid" id="cfDep" hidden style="background:var(--bg);border-radius:10px;padding:12px">
          <p class="full" style="font-size:13px"><b>${needsApproval() ? "Submit the first deposit for verification" : "Record the first deposit"}</b><br><span class="muted">${needsApproval() ? "A manager checks it, then the lead moves to Funded and counts on your target." : "The lead moves to Funded straight away."}</span></p>
          ${field("Amount (USD)", inp("deposit_amount", "", 'type="number" min="1" step="any"'))}${field("Method", sel("deposit_method", [["", "Choose"]].concat(meta().deposit_methods), (l.checklist && l.checklist.method_agreed && l.checklist.method_agreed.value) || ""))}
          ${field("Transaction reference", inp("tx_ref", "", 'placeholder="From the receipt or back-office"'))}${field("Proof (photo or PDF)", '<input class="c-in" type="file" name="proof" accept="image/*,application/pdf">')}</div>
        <label class="c-field" id="cfLost" hidden><span>Lost reason</span>${sel("lost_reason", m.lost_reasons, "")}</label>
      </div>
      <p class="muted" id="cfHint" style="font-size:12.5px"></p>
      <p class="err-msg" style="color:var(--warn);font-size:13px" hidden></p>
      <div class="c-row"><span class="sp"></span>${o.skip ? '<button type="button" class="c-btn" id="cfSkip">Skip</button>' : ""}<button class="c-btn pri lg" type="submit">${esc(o.submitLabel || "Save call")}</button></div>
    </form>`;
    const f = $("form", host); let t0 = null, tick = null;
    const timer = () => { const s = Math.floor((Date.now() - t0) / 1000); $("#cfTimer", f).textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
    const startTimer = () => { if (t0) return; t0 = Date.now(); tick = setInterval(timer, 1000); $("#cfStart", f).textContent = "Timer running"; $("#cfStart", f).disabled = true; };
    $("#cfStart", f).addEventListener("click", startTimer);
    $("#cfDial", f).addEventListener("click", e => { startTimer(); C.dial(l, e.currentTarget); });
    f.dial = () => { startTimer(); C.dial(l); };
    const setOutcome = id => {
      f.outcome.value = id; $$("[data-oc]", f).forEach(b => { const on = b.dataset.oc === id; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
      const oc = meta().outcomes.find(x => x.id === id);
      if (oc && oc.connected) $("#cfQa", f).open = true;
      const hint = { callback: "Pick when to call back.", interested: "Set the next step: registration help, KYC or funding.", not_interested: "The lead will move to Lost.", wrong_number: "The lead will move to Invalid." }[id] || (!oc.connected ? "An automatic retry call is scheduled unless you pick a follow-up. A missed-call WhatsApp goes out if that automation is on." : "");
      $("#cfHint", f).textContent = hint;
      if (id === "callback" && !f.next_code.value) { f.next_code.value = "tom10"; }
      if (id === "interested" && !f.next_code.value) { f.next_code.value = "tom16"; }
      if (id === "not_interested") { f.stage.value = "lost"; }
      upd();
    };
    $$("[data-oc]", f).forEach(b => b.addEventListener("click", () => setOutcome(b.dataset.oc)));
    const upd = () => { $("#cfCustom", f).hidden = f.next_code.value !== "custom"; $("#cfAcc", f).hidden = f.stage.value !== "registered"; $("#cfDep", f).hidden = f.stage.value !== "funded"; $("#cfLost", f).hidden = f.stage.value !== "lost"; };
    if (l.deposit_pending || l.stage === "funded") { const o2 = $('option[value="funded"]', f.stage); if (o2) o2.remove(); }
    f.next_code.addEventListener("change", upd); f.stage.addEventListener("change", upd);
    const keys = e => {
      if (!host.isConnected) return document.removeEventListener("keydown", keys);
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) || $(".c-modal") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key); if (n >= 1 && n <= meta().outcomes.length) { e.preventDefault(); setOutcome(meta().outcomes[n - 1].id); }
    };
    document.addEventListener("keydown", keys);
    if (o.skip) $("#cfSkip", f).addEventListener("click", () => { clearInterval(tick); o.skip(); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const v = C.readForm(f), er = $(".err-msg", f); er.hidden = true; C.clearErrors(f);
      if (!v.outcome) { er.textContent = "Choose a call outcome."; er.hidden = false; return; }
      const durSec = v.dur_min !== "" ? Math.round(Number(v.dur_min) * 60) : t0 ? Math.round((Date.now() - t0) / 1000) : 0;
      let next = null;
      if (v.next_code) { const at = v.next_code === "custom" ? fromLocalInput(v.next_at) : nextDate(v.next_code).toISOString(); if (at) next = { type: v.next_type, due_at: at, title: v.outcome === "callback" ? "Call back" : v.next_type === "call" ? "Follow-up call" : "Follow up by " + v.next_type }; }
      const payload = { outcome: v.outcome, duration_sec: durSec, notes: v.notes, qa: v.qa, next, stage: v.stage || undefined, account_id: v.account_id, deposit_amount: v.deposit_amount, deposit_method: v.deposit_method, tx_ref: v.tx_ref, lost_reason: v.stage === "lost" ? v.lost_reason : undefined };
      if (v.stage === "funded" && !(Number(v.deposit_amount) > 0)) { er.textContent = "Enter the deposit amount."; er.hidden = false; return; }
      const btn = $('button[type="submit"]', f); btn.disabled = true;
      try {
        if (v.stage === "funded" && f.proof.files[0]) payload.proof_file_id = await C.uploadFile(l.id, f.proof.files[0]);
        const lead = await API.call("logCall", l.id, payload);
        if (v.stage === "funded") toast(needsApproval() ? "Call saved. Deposit sent for verification" : "Call saved. Lead funded"); clearInterval(tick); document.removeEventListener("keydown", keys); if (v.stage !== "funded") toast("Call saved"); if (o.onSaved) o.onSaved(lead); }
      catch (err) { er.textContent = err.message; er.hidden = false; btn.disabled = false; }
    });
  }
  C.callForm = callForm;

  /* ============================================================ MY DAY */
  const queueRow = (l, why, extra = "") => `<div class="c-qitem"><div><a href="${C.href("lead/" + l.id)}" style="text-decoration:none"><b>${esc(l.name)}</b></a> ${stagePill(l.stage)} ${tempTag(l.temperature)}<small>${esc(why)} · ${esc(l.city ? l.city + ", " : "")}${esc(l.country)} · ${esc(l.interest || "")}</small></div><div class="acts">${extra}<a class="c-btn sm" href="${waHref(l.dial_code, l.phone)}" target="_blank" rel="noopener" title="WhatsApp">${ICONS.wa}</a><a class="c-btn sm pri" href="${C.href("call/" + l.id)}">${ICONS.phone} Call</a></div></div>`;
  C.views.queue = {
    title: "My day",
    async render(page, r, alive) {
      const [q, tg, pl, lf] = await Promise.all([API.call("queue"), API.call("targets", {}).catch(() => null), API.call("listPipeline", { owner: "me" }).catch(() => null), API.call("listLifecycle", { segment: "uncontacted", owner: "me" }).catch(() => null)]); if (!alive()) return;
      C.setQueueCount(q.dial.length);
      const sla = q.stats.sla_minutes, s = q.stats, me = tg && tg.rows.find(x => x.me);
      const sec = (title, items, empty, fn, cls = "") => `<section class="c-card ${cls}"><h3>${title} <small>${items.length}</small></h3>${items.length ? items.slice(0, 25).map(fn).join("") : `<p class="muted" style="font-size:13px">${empty}</p>`}</section>`;
      page.innerHTML = `
        <div class="c-kpis">
          <div class="c-kpi"><span>Calls today</span><b>${num(s.calls)}</b><small>${num(s.connected)} connected</small></div>
          <div class="c-kpi"><span>Talk time</span><b>${num(s.talk_min)}<small style="font-size:14px"> min</small></b><small>today</small></div>
          <div class="c-kpi ${q.overdue.length ? "alert" : ""}"><span>Overdue follow-ups</span><b>${q.overdue.length}</b><small>call these first</small></div>
          <div class="c-kpi ${q.fresh.some(l => l.wait_min > sla) ? "alert" : ""}"><span>New leads waiting</span><b>${q.fresh.length}</b><small>target: call within ${sla} min</small></div>
          <div class="c-kpi"><span>My open leads</span><b>${num(s.open_leads)}</b><small>${q.hot.length} hot</small></div>
        </div>
        ${me ? `<div class="c-card c-row" style="gap:18px"><div style="min-width:200px;flex:1"><span class="muted" style="font-size:12px;font-weight:700">MY FTDs THIS MONTH</span><div class="c-row" style="gap:10px;flex-wrap:nowrap;margin-top:4px"><b class="mono" style="font-size:22px">${me.ftd}${me.target_ftd ? "/" + me.target_ftd : ""}</b><div class="c-progress" style="flex:1"><i style="width:${Math.min(100, me.pct || 0)}%"></i></div></div><small class="muted">${money(me.amount)} · rank #${me.rank} of ${tg.rows.length}${me.target_ftd ? " · on pace for " + me.projection : ""}${me.pending ? " · " + me.pending + " waiting verification" : ""}</small></div>
          ${pl ? `<a class="c-btn" href="${C.href("pipeline")}">${ICONS.funnel} ${pl.rows.length} in deposit pipeline${pl.stuck ? ` · <b style="color:var(--down)">${pl.stuck} stuck</b>` : ""}</a>` : ""}<a class="c-btn" href="${C.href("targets")}">${ICONS.target} Leaderboard</a></div>` : ""}
        ${lf ? `<div class="c-card"><h3>My clients by journey step <small><a href="${C.href("lifecycle?owner=me")}">Open client journey</a></small></h3><div class="c-attn">${lf.segments.filter(x => x.id !== "active").map(x => `<a href="${C.href("lifecycle?segment=" + x.id + "&owner=me")}" class="${x.n ? "warn" : "zero"}"><b class="mono">${num(x.n)}</b><span>${esc(x.label)}</span></a>`).join("")}</div></div>` : ""}
        <div class="c-card" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:var(--brand);color:#EEF2FA;border-color:transparent">
          <div style="flex:1;min-width:220px"><h2 style="font-size:20px">${q.dial.length ? `${q.dial.length} call${q.dial.length === 1 ? "" : "s"} in your queue` : "Your queue is clear"}</h2><p style="color:#A6B0CC;margin-top:4px">${q.dial.length ? "Calling mode takes you through them in priority order: overdue follow-ups, new leads, WhatsApp replies, then hot leads." : "New leads assigned to you will appear here."}</p></div>
          ${q.dial.length ? `<a class="c-btn pri lg" href="${C.href("call")}">${ICONS.phone} Start calling</a>` : ""}
        </div>
        <div class="c-cols c2">
          ${sec("Overdue follow-ups", q.overdue, "Nothing overdue. Nice work.", t => queueRow(t.lead, `${t.title} · due ${ago(t.due_at)}`), "")}
          ${sec("New leads", q.fresh, "No new leads waiting.", l => queueRow(l, "", `<span class="c-wait mono ${l.wait_min > sla ? "late" : ""}" title="Waiting since ${fDT(l.created_at)}">${minsTxt(l.wait_min)}</span>`))}
          ${sec("Replied on WhatsApp", q.replies, "No unanswered replies.", l => queueRow(l, "Replied " + ago(l.last_inbound_at)))}
          ${sec("Due today", q.today, "No more follow-ups today.", t => queueRow(t.lead, `${t.title} · ${fTime(t.due_at)}`))}
          ${sec("Hot leads with no follow-up booked", q.hot, "None right now.", l => queueRow(l, "Last activity " + ago(l.last_activity_at)))}
          ${q.journey && q.journey.bonus_profit.length ? sec("In profit on the company-funded account: ask for a deposit", q.journey.bonus_profit, "", l => queueRow(l, l.why), "") : ""}
          ${q.journey && q.journey.bonus_expiring.length ? sec("Company-funded account expiring soon", q.journey.bonus_expiring, "", l => queueRow(l, l.why), "") : ""}
          ${q.journey && q.journey.demo_idle.length ? sec("Demo given, no trade yet", q.journey.demo_idle, "", l => queueRow(l, l.why), "") : ""}
        </div>`;
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ====================================================== CALLING MODE */
  C.views.call = {
    title: "Calling mode",
    async render(page, r, alive) {
      let id = r.id, why = "";
      const skipped = C.state.skipped = C.state.skipped || new Set();
      if (!id) {
        const q = await API.call("queue"); if (!alive()) return;
        C.setQueueCount(q.dial.length);
        const nxt = q.dial.find(x => !skipped.has(x.lead_id));
        if (!nxt) { page.innerHTML = `<div class="c-card c-empty"><b>${q.dial.length ? "You've skipped everything left in the queue." : "Queue complete."}</b>${q.dial.length ? `<p><button class="c-btn" id="cRestart">Start again from the top</button></p>` : `<p>Nothing left to call right now. New leads and due follow-ups will appear here automatically.</p>`}</div>`; const b = $("#cRestart"); if (b) b.addEventListener("click", () => { skipped.clear(); C.render(); }); return; }
        id = nxt.lead_id; why = nxt.why;
      }
      const d = await API.call("getLead", id); if (!alive()) return;
      const l = d.lead, calls = d.activities.filter(a => a.type === "call" || a.type === "note" || (a.type === "message" && a.data.direction === "in")).slice(0, 5);
      C.setTitle("Calling: " + l.first_name + " " + l.last_name);
      let auto = false; try { auto = localStorage.getItem("absel_autodial") === "1"; } catch (e) {}
      page.innerHTML = `${why ? `<div class="c-banner c-row"><span><b>Why now:</b> ${esc(why)}</span><span class="sp"></span><label class="c-switch" title="Dial the next lead automatically after you save a call"><input type="checkbox" id="cAuto" ${auto ? "checked" : ""}><span>Auto-dial next lead</span></label></div>` : ""}
        <div class="c-call">
          <div style="display:grid;gap:14px">
            <div class="c-card c-who"><div class="c-row"><span>${stagePill(l.stage)}</span>${tempTag(l.temperature, l.score)}${C.journeyTags(d.journey)}</div>
              <h2 style="margin-top:10px">${esc(l.first_name)} ${esc(l.last_name)}</h2>
              <div class="ph">${esc(l.dial_code)} ${esc(l.phone)}</div>
              <div class="c-row" style="margin:6px 0 12px"><a class="c-btn sm" href="${waHref(l.dial_code, l.phone)}" target="_blank" rel="noopener">${ICONS.wa} WhatsApp</a><a class="c-btn sm" href="${C.href("lead/" + l.id)}">Full profile</a></div>
              <dl class="c-dl"><dt>Location</dt><dd>${esc([l.area, l.city, l.country].filter(Boolean).join(", "))}</dd><dt>Interest</dt><dd>${esc(l.interest || "—")}</dd><dt>Experience</dt><dd>${esc((l.profile || {}).experience || l.experience || "—")}</dd><dt>Source</dt><dd>${esc(l.utm_source || "direct")}${l.utm_campaign ? " · " + esc(l.utm_campaign) : ""}</dd><dt>Lead age</dt><dd>${ago(l.created_at)}</dd><dt>Attempts</dt><dd>${l.attempts} (${l.connected_calls} connected)</dd><dt>Email</dt><dd>${esc(l.email || "—")}</dd></dl>
              ${d.duplicates.length ? `<div class="c-banner warn" style="margin-top:10px">Also enquired before: ${d.duplicates.map(x => esc(x.reference)).join(", ")}</div>` : ""}
            </div>
            ${["qualified", "registered", "kyc"].includes(l.stage) ? C.checklistCard(l, null, true) : ""}
            <div class="c-card"><h3>Recent history</h3>${calls.length ? `<ul class="c-tl">${calls.map(tlItem).join("")}</ul>` : '<p class="muted" style="font-size:13px">First contact. No history yet.</p>'}</div>
          </div>
          <div id="cCallForm"></div>
          <div class="c-card">${scriptPanel(l, d.journey)}</div>
        </div>`;
      C.wireChecklist(page, l, () => C.render());
      const ab = $("#cAuto"); if (ab) ab.addEventListener("change", () => { try { localStorage.setItem("absel_autodial", ab.checked ? "1" : "0"); } catch (e) {} toast(ab.checked ? "Auto-dial on: the next lead rings after you save" : "Auto-dial off"); });
      callForm($("#cCallForm"), l, {
        submitLabel: r.id ? "Save call" : "Save & next lead", qaOpen: !l.connected_calls,
        skip: r.id ? null : () => { skipped.add(l.id); C.render(); },
        onSaved: () => { if (r.id) C.go("lead/" + l.id); else { skipped.add(l.id); C.state.autoDialNext = !!(ab && ab.checked); C.render(); window.scrollTo(0, 0); } },
      });
      if (!r.id && C.state.autoDialNext && !l.dnc) { C.state.autoDialNext = false; setTimeout(() => { const f = $("#cCallForm form"); if (f && f.isConnected && f.dial) { f.dial(); toast("Auto-dialing " + l.first_name); } }, 1200); }
    },
  };

  /* ============================================================= LEADS */
  const LEAD_COLS = [["created", "Received"], ["name", "Lead"], [null, "Phone"], [null, "Location"], [null, "Interest"], ["stage", "Stage"], ["score", "Temp."], [null, "Owner"], [null, "Source"], ["followup", "Next follow-up"], ["activity", "Last activity"]];
  C.views.leads = {
    title: "Leads",
    async render(page, r, alive) {
      const p = Object.assign({ page: 1, sort: "created", dir: "desc", stage: "open" }, r.params), m = meta();
      const res = await API.call("listLeads", p); if (!alive()) return;
      const selected = new Set();
      const owners = [["", "All owners"]].concat(isSales() ? [["me", "Mine"]] : []).concat([["none", "Unassigned"]]).concat(salesUsers().map(u => [u.id, u.name]));
      page.innerHTML = `
        <div class="c-filters">
          <input class="c-in grow" type="search" id="fQ" value="${esc(p.q || "")}" placeholder="Search name, phone, email, reference, city">
          ${sel("stage", [["open", "All open stages"], ["", "All stages"]].concat(m.stages.map(s => [s.id, s.label])), p.stage, 'id="fStage" aria-label="Stage"')}
          ${seesAll() ? sel("owner", owners, p.owner || "", 'id="fOwner" aria-label="Owner"') : ""}
          ${sel("temperature", [["", "Any temperature"], ["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]], p.temperature || "", 'id="fTemp" aria-label="Temperature"')}
          ${sel("country", [["", "All countries"]].concat(m.countries), p.country || "", 'id="fCountry" aria-label="Country"')}
          ${sel("source", [["", "All sources"]].concat(m.sources), p.source || "", 'id="fSource" aria-label="Source"')}
          <input class="c-in" type="date" id="fFrom" value="${esc(p.from || "")}" aria-label="Received from">
          <input class="c-in" type="date" id="fTo" value="${esc(p.to || "")}" aria-label="Received to">
          <label class="c-chip"><input type="checkbox" id="fUntouched" ${p.untouched ? "checked" : ""}>Never called</label>
          <label class="c-chip"><input type="checkbox" id="fOverdue" ${p.overdue ? "checked" : ""}>Overdue follow-up</label>
          <span style="flex:1"></span>
          <button class="c-btn" id="bAdd">Add lead</button>
          ${isMgr() || C.isMktMgr() ? `<button class="c-btn" id="bExport">Export CSV</button>` : ""}
        </div>
        ${isMgr() ? `<div class="c-row" id="bulk" hidden style="background:var(--cta-soft);border-radius:10px;padding:8px 12px"><b id="bulkN"></b><span class="sp"></span>${sel("bulk_owner", [["", "Assign to…"], ["__none", "Unassigned"]].concat(salesUsers().map(u => [u.id, u.name])), "", 'id="bOwner" style="width:auto"')}${sel("bulk_stage", [["", "Move to stage…"]].concat(m.stages.filter(s2 => s2.id !== "funded").map(s2 => [s2.id, s2.label])), "", 'id="bStage" style="width:auto"')}<button class="c-btn sm" id="bRecycle" title="Reopen lost leads and give them to another agent">Recycle</button>${isAdmin() ? '<button class="c-btn danger sm" id="bDel">Delete</button>' : ""}</div>` : ""}
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1150px"><thead><tr>${isMgr() ? '<th><input type="checkbox" id="selAll" aria-label="Select all"></th>' : ""}${LEAD_COLS.map(([k, l]) => `<th>${k ? `<button data-sort="${k}">${l}${p.sort === k ? (p.dir === "asc" ? " ↑" : " ↓") : ""}</button>` : l}</th>`).join("")}</tr></thead>
        <tbody>${res.rows.map(x => `<tr class="click" data-id="${esc(x.id)}">${isMgr() ? `<td><input type="checkbox" class="rowSel" value="${esc(x.id)}" aria-label="Select ${esc(x.first_name)}"></td>` : ""}
          <td><span class="mono">${fDate(x.created_at)}</span><small>${fTime(x.created_at)}</small></td>
          <td><b>${esc(x.first_name)} ${esc(x.last_name)}</b>${x.duplicate_of ? '<span class="c-tag" title="Same email or phone as an earlier lead">REPEAT</span>' : ""}${x.dnc ? '<span class="c-tag">DNC</span>' : ""}${x.sample ? '<span class="c-tag info">SAMPLE</span>' : ""}<small class="mono">${esc(x.reference)}</small></td>
          <td class="mono" style="white-space:nowrap">${esc(x.dial_code)} ${esc(x.phone)}<small>${esc(x.email)}</small></td>
          <td>${esc(x.country)}<small>${esc(x.city || "")}</small></td><td>${esc(x.interest || "")}</td><td>${stagePill(x.stage)}<small>${x.attempts ? x.attempts + " attempt" + (x.attempts > 1 ? "s" : "") : "Not called"}${x.lifecycle && !["lead_new", "lead_working", "closed"].includes(x.lifecycle) ? " · " + esc((meta().lifecycle.find(z => z.id === x.lifecycle) || {}).label || "") : ""}</small></td>
          <td>${tempTag(x.temperature, x.score)}</td><td>${esc(x.owner_name)}</td><td class="mono" style="font-size:12px">${esc(x.utm_source)}<small>${esc(x.utm_campaign || "")}</small></td>
          <td>${x.next_follow_up_at ? `<span class="${Date.parse(x.next_follow_up_at) < Date.now() ? "c-wait late" : ""}">${ago(x.next_follow_up_at)}</span>` : '<span class="muted">—</span>'}</td><td>${ago(x.last_activity_at)}</td></tr>`).join("")}</tbody></table></div>
        ${res.rows.length ? "" : `<div class="c-empty"><b>No leads match</b>Try clearing filters or choose “All stages”.</div>`}
        <div class="c-foot"><span>${res.total ? `${num((res.page - 1) * res.pageSize + 1)}–${num(Math.min(res.total, res.page * res.pageSize))} of ${num(res.total)} leads` : ""}</span><div class="c-row"><button class="c-btn sm" id="pPrev" ${res.page <= 1 ? "disabled" : ""}>Previous</button><button class="c-btn sm" id="pNext" ${res.page * res.pageSize >= res.total ? "disabled" : ""}>Next</button></div></div></div>`;
      const go = patch => C.go("leads", Object.assign({}, p, { page: 1 }, patch));
      $("#fQ").addEventListener("input", C.debounce(e => go({ q: e.target.value.trim() }), 350));
      [["fStage", "stage"], ["fOwner", "owner"], ["fTemp", "temperature"], ["fCountry", "country"], ["fSource", "source"], ["fFrom", "from"], ["fTo", "to"]].forEach(([id, k]) => { const el = $("#" + id); if (el) el.addEventListener("change", () => go({ [k]: el.value })); });
      $("#fUntouched").addEventListener("change", e => go({ untouched: e.target.checked ? "1" : "" }));
      $("#fOverdue").addEventListener("change", e => go({ overdue: e.target.checked ? "1" : "" }));
      $$("[data-sort]").forEach(b => b.addEventListener("click", () => go({ sort: b.dataset.sort, dir: p.sort === b.dataset.sort && p.dir === "desc" ? "asc" : "desc", page: p.page })));
      $("#pPrev").addEventListener("click", () => C.go("leads", Object.assign({}, p, { page: Number(p.page) - 1 })));
      $("#pNext").addEventListener("click", () => C.go("leads", Object.assign({}, p, { page: Number(p.page) + 1 })));
      $$("tr.click").forEach(tr => tr.addEventListener("click", e => { if (e.target.closest("input")) return; C.go("lead/" + tr.dataset.id); }));
      $("#bAdd").addEventListener("click", () => addLeadModal());
      if (isMgr()) {
        const upd = () => { $("#bulk").hidden = !selected.size; $("#bulkN").textContent = selected.size + " selected"; };
        $$(".rowSel").forEach(c => c.addEventListener("change", () => { c.checked ? selected.add(c.value) : selected.delete(c.value); upd(); }));
        $("#selAll").addEventListener("change", e => { $$(".rowSel").forEach(c => { c.checked = e.target.checked; c.checked ? selected.add(c.value) : selected.delete(c.value); }); upd(); });
        $("#bOwner").addEventListener("change", async e => { if (!e.target.value) return; try { const r2 = await API.call("assignLeads", [...selected], e.target.value === "__none" ? null : e.target.value); toast(r2.updated + " leads reassigned"); C.render(); } catch (err) { toast(err.message); } });
        $("#bStage").addEventListener("change", async e => { const st = e.target.value; if (!st) return; let o = {}; if (st === "lost") { const reason = await askReason(); if (!reason) { e.target.value = ""; return; } o.lost_reason = reason; } try { const r2 = await API.call("bulkStage", [...selected], st, o); toast(r2.updated + " leads moved"); C.render(); } catch (err) { toast(err.message); } });
        const del = $("#bDel"); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete leads", `Delete ${selected.size} leads and all their calls, notes and messages? This can't be undone.`, "Delete"))) return; try { await API.call("deleteLeads", [...selected]); toast("Deleted"); C.render(); } catch (err) { toast(err.message); } });
        $("#bRecycle").addEventListener("click", async () => { try { const r2 = await API.call("recycleLeads", [...selected]); toast(r2.recycled ? r2.recycled + " lost leads recycled to new owners" : "Only lost leads can be recycled"); C.render(); } catch (err) { toast(err.message); } });
      }
      if (isMgr() || C.isMktMgr()) {
        $("#bExport").addEventListener("click", async () => { try { const ex = await API.call("exportLeads", p); C.downloadCsv("absel-leads", ex.columns, ex.rows); } catch (err) { toast(err.message); } });
      }
    },
    refresh(page, r, alive) { if (!$$(".rowSel:checked").length) return this.render(page, r, alive); },
  };
  function askReason() { return new Promise(res => { let v = null; const m = modal({ title: "Why was it lost?", body: field("Lost reason", sel("reason", meta().lost_reasons, "")), submit: "Mark as lost", onSubmit: x => { v = x.reason; } }); new MutationObserver((_, o) => { if (!m.el.isConnected) { o.disconnect(); res(v); } }).observe($("#crm"), { childList: true }); }); }
  C.askReason = askReason;
  const COUNTRIES = ["Algeria", "Argentina", "Australia", "Bahrain", "Bangladesh", "Botswana", "Brazil", "Cameroon", "Chile", "China", "Colombia", "Cyprus", "Egypt", "Ethiopia", "France", "Germany", "Ghana", "Greece", "Hong Kong", "India", "Indonesia", "Iraq", "Italy", "Ivory Coast", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Lebanon", "Malaysia", "Maldives", "Mauritius", "Mexico", "Morocco", "Nepal", "Netherlands", "Nigeria", "Oman", "Pakistan", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Rwanda", "Saudi Arabia", "Senegal", "Seychelles", "South Africa", "South Korea", "Spain", "Sri Lanka", "Switzerland", "Tanzania", "Thailand", "Tunisia", "Turkey", "Uganda", "Ukraine", "United Kingdom", "Uzbekistan", "Vietnam", "Zambia", "Zimbabwe"];
  C.COUNTRIES = COUNTRIES;
  function addLeadModal() {
    const m = meta();
    modal({
      title: "Add lead", wide: true,
      body: `<p class="muted">For walk-ins, phone enquiries and referrals. ${isMgr() ? "Leave owner empty to route by territory." : isSales() ? "The lead is assigned to you." : "It's routed to the sales team by territory."}</p><div class="c-grid">
        ${field("First name", inp("first_name", ""))}${field("Last name", inp("last_name", ""))}
        ${field("Dial code", inp("dial_code", "+", 'placeholder="+234"'))}${field("Phone", inp("phone", "", 'type="tel"'))}
        ${field("Email (optional)", inp("email", "", 'type="email"'))}${field("Country", sel("country", [["", "Select"]].concat(COUNTRIES), ""))}
        ${field("City", inp("city", ""))}${field("Area", inp("area", ""))}
        ${field("Interested in", sel("interest", ["ECN account", "STP account", "Islamic (swap-free) account", "Cent account", "Introducing Broker (IB)", "PAMM / MAM"], "ECN account"))}
        ${field("Source", inp("utm_source", "referral"))}
        ${isMgr() ? field("Owner", sel("owner_id", [["", "Route by territory"]].concat(salesUsers().map(u => [u.id, u.name])), "")) : ""}
      </div>`,
      submit: "Add lead",
      onSubmit: async v => { const l = await API.call("addLead", v); toast("Lead added: " + l.reference); C.go("lead/" + l.id); },
    });
  }
  C.addLeadModal = addLeadModal;

  /* ========================================================== TIMELINE */
  function tlItem(a) {
    const who = esc(a.user_name || ""), when = `<small title="${esc(fDT(a.created_at))}"> · ${esc(ago(a.created_at))}</small>`;
    let head = "", body = "";
    const d = a.data || {};
    if (a.type === "call") {
      head = `<b>${esc(outcomeLabel(d.outcome))}</b> call${d.duration_sec ? " · " + dur(d.duration_sec) : ""} · ${who}`;
      body = (d.notes ? esc(d.notes) : "") + (d.recording_url ? `<audio controls preload="none" src="${esc(d.recording_url)}"></audio>` : "");
      const qa = Object.entries(d.qa || {}).filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length));
      if (qa.length) body += `<div class="qa">${qa.map(([k, v]) => `<span>${esc((meta().qa_fields.find(f => f.id === k) || { label: k }).label)}: <b>${esc(Array.isArray(v) ? v.join(", ") : v)}</b></span>`).join("")}</div>`;
    } else if (a.type === "note") { head = `<b>Note</b> · ${who}`; body = esc(d.text); }
    else if (a.type === "message") { head = d.direction === "in" ? `<b>Client replied</b> on ${esc(d.channel)}` : `<b>${esc(d.channel === "email" ? "Email" : "WhatsApp")}</b> ${esc(d.template || "")} · ${d.transactional ? "client area notice" : d.rule_id ? "automation" : a.user_id === "system" ? "broadcast" : who} · <span class="c-pill plain" style="--c:${msgColor(d.status)}">${esc(d.status)}</span>`; body = esc(d.subject ? d.subject + " — " : "") + esc(d.preview || ""); }
    else if (a.type === "stage") { head = `<b>Stage:</b> ${esc(C.stage(d.from).label)} → ${esc(C.stage(d.to).label)} · ${who}`; body = [d.reason, d.deposit ? "Deposit " + money(d.deposit) : "", d.note].filter(Boolean).map(esc).join(" · "); }
    else if (a.type === "assign") { head = `<b>Assigned</b> to ${esc(userName(d.to))}${d.from ? " (was " + esc(userName(d.from)) + ")" : ""}`; body = esc(d.via || ""); }
    else if (a.type === "created") { head = `<b>Lead created</b> from ${esc(d.form || d.source)}`; body = d.duplicate_of ? "Repeat enquiry: same email or phone as an earlier lead." : ""; }
    else if (a.type === "task") { head = `<b>Follow-up booked</b> · ${who}`; body = esc(d.title) + " · " + esc(fDT(d.due_at)); }
    else if (a.type === "automation") { head = `<b>Automation:</b> ${esc(d.rule)}`; body = esc(d.result); }
    else if (a.type === "edit") { head = `<b>Details updated</b> · ${who}`; body = d.changes ? d.changes.map(c => `${esc(c.field.replace("_", " "))}: <s class="muted">${esc(c.from === "" ? "empty" : c.from)}</s> → <b>${esc(c.to === "" ? "empty" : c.to)}</b>`).join("<br>") : esc((d.fields || []).join(", ")); }
    else if (a.type === "deposit") { head = `<b>First deposit ${esc(d.status)}</b> · ${money(d.amount)} · ${who}`; body = [d.method, d.tx_ref ? "ref " + d.tx_ref : "", d.reason].filter(Boolean).map(esc).join(" · "); }
    else if (a.type === "checklist") { head = `<b>${d.done ? "Step done" : "Step unticked"}:</b> ${esc(d.item)} · ${who}`; body = esc(d.value || ""); }
    else if (a.type === "file") { head = `<b>File uploaded</b> · ${who}`; body = `<button type="button" class="c-linkbtn" data-file="${esc(d.file_id)}">${esc(d.name)}</button>`; }
    else if (a.type === "merge") { head = `<b>Merged</b> duplicate leads · ${who}`; body = esc((d.merged || []).join(", ")); }
    else if (a.type === "pbx") { head = `<b>${d.status === "missed" ? "Missed incoming call" : "Incoming call"}</b>${d.duration_sec ? " · " + dur(d.duration_sec) : ""}`; body = d.recording_url ? `<audio controls preload="none" src="${esc(d.recording_url)}"></audio>` : ""; }
    else if (a.type === "demo") { head = `<b>${esc(d.label || "Demo")}</b> · ${who}`; body = esc([d.login ? "login " + d.login : "", d.feedback].filter(Boolean).join(" · ")); }
    else if (a.type === "portal") { head = `<b>Client area:</b> ${esc(d.label || "")}${a.user_id !== "system" ? " · " + who : ""}`; }
    else if (a.type === "bonus") { head = `<b>${esc(d.label || "Company-funded account")}</b> · ${who}`; }
    else head = `<b>${esc(a.type)}</b>`;
    return `<li><span class="ic ${esc(a.type)}">${TL_ICON[a.type] || ICONS.note}</span><div><div class="hd">${head}${when}</div>${body ? `<div class="bd">${body}</div>` : ""}</div></li>`;
  }
  const msgColor = s => ({ sent: "var(--cta)", simulated: "var(--cta)", delivered: "var(--up)", read: "var(--up)", received: "var(--up)", failed: "var(--down)", blocked: "var(--down)", skipped: "var(--muted)", queued: "var(--muted)" }[s] || "var(--muted)");
  C.tlItem = tlItem; C.msgColor = msgColor;

  /* ========================================================= LEAD 360 */
  // Pre-deposit checklist: the steps between "interested" and a verified first deposit
  function checklistCard(l, reload, compact) {
    const m = meta(), c = l.checklist || {}, can = isSales();
    const val = (it, e) => !e || e.value == null ? "" : typeof e.value === "object" ? `${money(e.value.amount)} on ${fDate(e.value.date)}` : esc(e.value);
    const done = m.checklist.filter(it => c[it.id]).length;
    return `<div class="c-card c-check" data-checklist><h3>Steps to first deposit <small>${done}/${m.checklist.length}</small></h3>
      <div class="c-progress" style="margin:4px 0 10px"><i style="width:${Math.round(done / m.checklist.length * 100)}%"></i></div>
      ${m.checklist.map(it => { const e = c[it.id]; return `<label class="c-checkrow ${e ? "on" : ""}"><input type="checkbox" data-ck="${it.id}" ${e ? "checked" : ""} ${!can || it.auto || l.stage === "funded" || ["lost", "invalid"].includes(l.stage) ? "disabled" : ""}><span>${esc(it.label)}${it.auto ? ' <small class="muted">automatic</small>' : ""}${e ? `<small>${val(it, e)}${val(it, e) ? " · " : ""}${compact ? "" : esc(userName(e.by)) + " · "}${esc(ago(e.at))}</small>` : ""}</span></label>`; }).join("")}
      ${l.deposit_pending ? '<div class="c-banner" style="margin-top:8px">A first deposit is waiting for a manager to verify.</div>' : ""}</div>`;
  }
  function wireChecklist(host, l, reload) {
    $$("[data-ck]", host).forEach(cb => cb.addEventListener("change", async () => {
      const it = meta().checklist.find(x => x.id === cb.dataset.ck), on = cb.checked;
      const save = async value => { try { await API.call("setChecklist", l.id, it.id, on, value); toast(on ? "Step done: " + it.label : "Step unticked"); reload(); } catch (e) { toast(e.message); cb.checked = !on; } };
      if (!on || !it.input) return save();
      cb.checked = false;
      const body = it.input === "account_id" ? field("Trading account number (optional)", inp("value", l.account_id || "")) : it.input === "method" ? field("Deposit method", sel("value", [["", "Choose"]].concat(meta().deposit_methods), "")) : `<div class="c-grid">${field("Amount promised (USD)", inp("amount", (l.profile || {}).expected_deposit || "", 'type="number" min="1"'))}${field("When", `<input class="c-in" type="datetime-local" name="date" value="${localInput(new Date(Date.now() + 864e5).toISOString())}">`)}</div><p class="muted" style="font-size:12.5px">A follow-up is booked for that time to check the money arrived.</p>`;
      modal({ title: it.label, body, submit: "Mark done", onSubmit: async v => { await API.call("setChecklist", l.id, it.id, true, it.input === "promise" ? { amount: v.amount, date: fromLocalInput(v.date) } : v.value); toast("Step done: " + it.label); reload(); } });
    }));
  }
  C.checklistCard = checklistCard; C.wireChecklist = wireChecklist;

  const depColor = st => ({ pending: "var(--warn)", verified: "var(--up)", rejected: "var(--down)" }[st] || "var(--muted)");
  C.depColor = depColor;
  // Submit (agent) or record (manager) the first deposit
  function depositModal(l, done) {
    const m = meta(), method = (l.checklist && l.checklist.method_agreed && l.checklist.method_agreed.value) || "";
    modal({
      title: needsApproval() ? "Submit first deposit for verification" : "Record first deposit", wide: true, submit: needsApproval() ? "Submit for verification" : "Record deposit",
      body: `<p class="muted">${needsApproval() ? "A sales manager checks the proof. Once verified, the lead moves to Funded and counts as your FTD." : "As a manager, the deposit is verified straight away."}</p><div class="c-grid">
        ${field("Amount (USD)", inp("amount", l.promised_amount || "", 'type="number" min="1" step="any"'))}${field("Method", sel("method", [["", "Choose"]].concat(m.deposit_methods), method))}
        ${field("Date of deposit", `<input class="c-in" type="datetime-local" name="deposited_at" value="${localInput()}">`)}${field("Transaction reference", inp("tx_ref", "", 'placeholder="From the receipt or back-office"'))}
        ${field("Trading account", inp("account_id", l.account_id || ""))}${field("Proof (photo or PDF)", '<input class="c-in" type="file" name="proof" accept="image/*,application/pdf">')}
        ${field("Note for the manager (optional)", inp("note", ""), "full")}</div>`,
      onSubmit: async (v, form) => {
        const proof = form.proof.files[0] ? await C.uploadFile(l.id, form.proof.files[0]) : null;
        const dep = await API.call("submitDeposit", l.id, { amount: v.amount, method: v.method, tx_ref: v.tx_ref, account_id: v.account_id, deposited_at: fromLocalInput(v.deposited_at), note: v.note, proof_file_id: proof, verify: isMgr() });
        toast(dep.status === "verified" ? "Deposit recorded. Lead is funded" : "Sent for verification"); done();
      },
    });
  }
  C.depositModal = depositModal;
  function verifyModal(d, done) {
    modal({ title: "Reject deposit", body: `<p>${esc(d.lead ? d.lead.name : "")} · ${money(d.amount)} by ${esc(d.method || "—")}</p>${field("What's wrong? The agent sees this.", '<textarea class="c-ta" name="reason" rows="3" placeholder="e.g. Proof doesn\'t show the transaction reference"></textarea>')}`, submit: "Reject", danger: true, onSubmit: async v => { await API.call("verifyDeposit", d.id, false, v.reason); toast("Deposit rejected. The agent was told why"); done(); } });
  }
  C.rejectDepositModal = verifyModal;
  C.verifyDeposit = async (d, done) => { if (!(await confirmBox("Verify first deposit", `Confirm ${money(d.amount)} from ${d.lead ? d.lead.name : "this client"} arrived? The lead moves to Funded and counts as ${d.owner_name}'s FTD.`, "Verify", false))) return; try { await API.call("verifyDeposit", d.id, true); toast("Verified. Lead is funded"); done(); } catch (e) { toast(e.message); } };
  const depRow = (d, reload) => `<div class="c-qitem"><div><b class="mono">${money(d.amount)}</b> <span class="c-pill plain" style="--c:${depColor(d.status)}">${esc(d.status)}</span><small>${esc(d.method || "—")}${d.tx_ref ? " · ref " + esc(d.tx_ref) : ""} · ${fDT(d.deposited_at)} · by ${esc(d.created_by_name)}${d.status === "rejected" ? " · " + esc(d.reject_reason) : d.verified_by_name ? " · checked by " + esc(d.verified_by_name) : ""}</small></div><div class="acts">${d.proof_file_id ? `<button class="c-btn sm" data-file="${esc(d.proof_file_id)}">Proof</button>` : ""}${d.status === "pending" && isMgr() ? `<button class="c-btn sm" data-rej="${esc(d.id)}">Reject</button><button class="c-btn sm good" data-ver="${esc(d.id)}">Verify</button>` : ""}</div></div>`;
  C.depRow = depRow;
  C.wireDeposits = (host, list, reload) => {
    $$("[data-file]", host).forEach(b => b.addEventListener("click", () => C.openFile(b.dataset.file)));
    $$("[data-ver]", host).forEach(b => b.addEventListener("click", () => C.verifyDeposit(list.find(x => x.id === b.dataset.ver), reload)));
    $$("[data-rej]", host).forEach(b => b.addEventListener("click", () => verifyModal(list.find(x => x.id === b.dataset.rej), reload)));
  };

  C.views.lead = {
    title: "Lead", nav: "leads",
    async render(page, r, alive) {
      const d = await API.call("getLead", r.id); if (!alive()) return;
      const l = d.lead, m = meta(), p = l.profile || {}, work = d.can_work;
      C.setTitle(l.first_name + " " + l.last_name);
      const flow = m.stages.filter(s => !s.closed);
      const curIdx = flow.findIndex(s => s.id === l.stage);
      const openTasks = d.tasks.filter(t => !t.done_at), doneTasks = d.tasks.filter(t => t.done_at);
      const filt = C.state.tlFilter || "all";
      const acts = d.activities.filter(a => filt === "all" || (filt === "calls" ? a.type === "call" || a.type === "pbx" : filt === "notes" ? a.type === "note" : filt === "messages" ? a.type === "message" : !["call", "pbx", "note", "message"].includes(a.type)));
      const showCheck = ["qualified", "registered", "kyc", "funded"].includes(l.stage) || Object.keys(l.checklist || {}).length;
      const unsub = l.unsubscribed || {};
      page.innerHTML = `
        <div class="c-card" style="display:grid;gap:12px">
<<<<<<< HEAD
          <div class="c-row" style="align-items:flex-start"><div style="min-width:0"><h2 style="font-size:24px">${esc(l.first_name)} ${esc(l.last_name)} ${l.sample ? '<span class="c-tag info">SAMPLE</span>' : ""}${l.dnc ? '<span class="c-tag">DO NOT CONTACT</span>' : ""}${(l.tags || []).includes("Recycled") ? '<span class="c-tag info">RECYCLED</span>' : ""}${l.ib_client ? `<span class="c-tag info" title="Referred by a partner: not counted in agent FTD targets">IB client · ${esc(l.ib_code || "")}</span>` : ""}${C.journeyTags(d.journey)} ${d.lifecycle && C.lifecyclePill ? C.lifecyclePill(d.lifecycle) : ""}</h2>
=======
          <div class="c-row" style="align-items:flex-start"><div style="min-width:0"><h2 style="font-size:24px">${esc(l.first_name)} ${esc(l.last_name)} ${l.sample ? '<span class="c-tag info">SAMPLE</span>' : ""}${l.dnc ? '<span class="c-tag">DO NOT CONTACT</span>' : ""}${(l.tags || []).includes("Recycled") ? '<span class="c-tag info">RECYCLED</span>' : ""}${C.journeyTags(d.journey)} ${d.lifecycle && C.lifecyclePill ? C.lifecyclePill(d.lifecycle) : ""}</h2>
>>>>>>> 3d0b0f61d47bc139cb59d499942b38aeb9987b00
            <p class="muted mono" style="margin-top:4px">${esc(l.reference)} · received ${fDT(l.created_at)} · ${esc(l.form)} form · ${esc(C.stage(l.stage).label)} for ${esc(d.stage_days)} d</p></div><span class="sp"></span>
            <div style="text-align:right">${tempTag(l.temperature, l.score)}<div class="muted" style="font-size:12px;margin-top:4px">Owner: <b style="color:var(--fg)">${esc(d.owner ? d.owner.name : "Unassigned")}</b></div></div></div>
          <div class="c-stepper" role="group" aria-label="Stage">${flow.map((s, i) => `<button data-stage="${s.id}" class="${s.id === l.stage ? "cur" : curIdx > i || l.stage === "funded" ? "done" : ""}" style="--c:var(--s-${s.id})" ${work ? "" : "disabled"}>${esc(s.label)}</button>`).join("")}<button data-stage="lost" class="${l.stage === "lost" ? "cur" : ""}" style="--c:var(--s-lost);margin-left:8px;border-radius:999px" ${work ? "" : "disabled"}>Lost</button><button data-stage="invalid" class="${l.stage === "invalid" ? "cur" : ""}" style="--c:var(--s-invalid);border-radius:999px" ${work ? "" : "disabled"}>Invalid</button></div>
          ${l.stage === "lost" ? `<p class="muted">Lost reason: <b style="color:var(--fg)">${esc(l.lost_reason)}</b></p>` : ""}
          ${work ? `<div class="c-row">
            <a class="c-btn pri" href="${C.href("call/" + l.id)}">${ICONS.phone} Log a call</a>
            <button class="c-btn" data-a="dial" ${l.dnc ? "disabled" : ""}>Dial</button>
            <a class="c-btn" href="${waHref(l.dial_code, l.phone)}" target="_blank" rel="noopener">${ICONS.wa} Open WhatsApp</a>
            <a class="c-btn" href="${C.href("inbox/" + l.id)}">${ICONS.inbox} Conversation</a>
            <button class="c-btn" data-a="send">${ICONS.mail} Send template</button>
            <button class="c-btn" data-a="note">${ICONS.note} Add note</button>
            <button class="c-btn" data-a="task">${ICONS.clock} Book follow-up</button>
            ${l.stage !== "funded" && !l.deposit_pending && !["lost", "invalid"].includes(l.stage) ? `<button class="c-btn good" data-a="deposit">${ICONS.cash} ${needsApproval() ? "Submit FTD" : "Record FTD"}</button>` : ""}
            <span class="sp"></span>
            ${isMgr() ? `<label class="c-field" style="min-width:180px"><span>Owner</span>${sel("owner", [["", "Unassigned"]].concat(salesUsers().filter(u => u.role !== "admin" || u.id === l.owner_id).map(u => [u.id, u.name])), l.owner_id || "", 'id="lOwner"')}</label>` : ""}
          </div>` : '<div class="c-banner">View only. The sales team calls and moves this lead; marketing can update contact permissions below.</div>'}
          ${work && ["qualified", "registered", "kyc"].includes(l.stage) ? `<p style="font-size:13px"><b>Next step:</b> ${esc(d.next_step)}</p>` : ""}
          ${d.whatsapp_window_open ? '<div class="c-banner">The client messaged on WhatsApp in the last 24 hours, so you can send a free-text WhatsApp reply.</div>' : ""}
          ${d.duplicates.length ? `<div class="c-banner warn">Repeat enquiry. Other leads with the same email or phone: ${d.duplicates.map(x => x.visible ? `<a href="${C.href("lead/" + x.id)}">${esc(x.reference)}</a> (${esc(C.stage(x.stage).label)})` : esc(x.reference)).join(", ")}${isMgr() ? ` · <a href="${C.href("hygiene")}">Merge in Lead hygiene</a>` : ""}</div>` : ""}
        </div>
        <div class="c-cols side-l">
          <div style="display:grid;gap:16px;align-content:start">
            ${showCheck ? checklistCard(l) : ""}
            ${d.deposits.length ? `<div class="c-card" id="lDeps"><h3>First deposit</h3>${d.deposits.map(x => depRow(x)).join("")}</div>` : ""}
            ${C.portalCard ? C.portalCard(d) : ""}
            ${C.journeyCards(d)}
            <div class="c-card"><h3>Contact ${work ? '<button class="c-btn sm" data-a="edit">Edit</button>' : ""}</h3><dl class="c-dl">
              <dt>Phone</dt><dd class="mono">${esc(l.dial_code)} ${esc(l.phone)}</dd><dt>Email</dt><dd>${esc(l.email || "—")}</dd>
              <dt>Location</dt><dd>${esc([l.area, l.city, l.country].filter(Boolean).join(", "))}</dd><dt>Language</dt><dd>${esc(l.language || p.language || "—")}</dd>
              <dt>Interest</dt><dd>${esc(l.interest || "—")}</dd><dt>Trading account</dt><dd class="mono">${esc(l.account_id || "—")}</dd>
              <dt>First deposit</dt><dd class="mono">${l.deposit_amount ? money(l.deposit_amount) : l.deposit_pending ? "Waiting for verification" : "—"}</dd></dl></div>
            <div class="c-card"><h3>Discovery profile</h3>${Object.keys(p).length ? `<dl class="c-dl">${m.qa_fields.filter(f => p[f.id] != null && p[f.id] !== "" && !(Array.isArray(p[f.id]) && !p[f.id].length)).map(f => `<dt>${esc(f.label)}</dt><dd>${esc(Array.isArray(p[f.id]) ? p[f.id].join(", ") : f.id === "expected_deposit" ? money(p[f.id]) : p[f.id])}</dd>`).join("")}</dl>` : '<p class="muted" style="font-size:13px">Filled in from calls.</p>'}</div>
            <div class="c-card"><h3>Follow-ups <small>${openTasks.length} open</small></h3>${openTasks.length ? openTasks.map(t => `<div class="c-qitem"><div><b>${esc(t.title)}</b><small class="${Date.parse(t.due_at) < Date.now() ? "c-wait late" : ""}">${esc(t.type)} · ${fDT(t.due_at)} (${ago(t.due_at)})${t.auto ? " · automatic" : ""}</small></div>${work ? `<div class="acts"><button class="c-btn sm" data-resched="${esc(t.id)}">Move</button><button class="c-btn sm good" data-done="${esc(t.id)}">Done</button></div>` : ""}</div>`).join("") : '<p class="muted" style="font-size:13px">No follow-up booked.</p>'}${doneTasks.length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:12.5px">${doneTasks.length} completed</summary>${doneTasks.slice(0, 15).map(t => `<p style="font-size:12.5px;margin-top:6px">${esc(t.title)} · <span class="muted">${esc(t.outcome)} ${ago(t.done_at)}</span></p>`).join("")}</details>` : ""}</div>
            <div class="c-card"><h3>Files <small>${d.files.length}</small>${work ? '<button class="c-btn sm" data-a="upload">Upload</button>' : ""}</h3>${d.files.length ? d.files.map(f => `<div class="c-qitem"><div><b>${esc(f.name)}</b><small>${esc(f.kind.replace("_", " "))} · ${Math.round(f.size / 1024)} KB · ${esc(f.by)} · ${ago(f.created_at)}</small></div><div class="acts"><button class="c-btn sm" data-file="${esc(f.id)}">Open</button></div></div>`).join("") : '<p class="muted" style="font-size:13px">Deposit proofs and documents appear here.</p>'}</div>
            <div class="c-card"><h3>Attribution and permissions</h3><dl class="c-dl"><dt>Source</dt><dd>${esc(l.utm_source || "direct")}</dd><dt>Medium</dt><dd>${esc(l.utm_medium || "—")}</dd><dt>Campaign</dt><dd>${esc(l.utm_campaign || "—")}</dd>${l.utm_content ? `<dt>Ad</dt><dd>${esc(l.utm_content)}</dd>` : ""}${l.utm_term ? `<dt>Keyword / ad set</dt><dd>${esc(l.utm_term)}</dd>` : ""}${l.ref_code ? `<dt>Partner ref</dt><dd class="mono">${esc(l.ref_code)}</dd>` : ""}${l.gclid ? `<dt>Google click</dt><dd class="mono">${esc(l.gclid.slice(0, 18))}…</dd>` : ""}${l.fbclid ? `<dt>Meta click</dt><dd class="mono">${esc(l.fbclid.slice(0, 18))}…</dd>` : ""}<dt>Speed to lead</dt><dd>${l.first_contact_at ? minsTxt((Date.parse(l.first_contact_at) - Date.parse(l.created_at)) / 60000) : "Not called yet"}</dd></dl>
              <div style="display:grid;gap:8px;margin-top:12px"><label class="c-switch"><input type="checkbox" id="lDnc" ${l.dnc ? "checked" : ""}><span>Do not contact (no calls or messages)</span></label><label class="c-switch"><input type="checkbox" data-unsub="email" ${unsub.email ? "checked" : ""}><span>Unsubscribed from marketing email</span></label><label class="c-switch"><input type="checkbox" data-unsub="whatsapp" ${unsub.whatsapp ? "checked" : ""}><span>Unsubscribed from WhatsApp broadcasts</span></label></div></div>
          </div>
          <div class="c-card"><h3>Timeline <small>${d.activities.length} events</small></h3>
            <div class="c-seg" style="margin-bottom:8px">${[["all", "All"], ["calls", "Calls"], ["notes", "Notes"], ["messages", "Messages"], ["system", "Changes"]].map(([k, lb]) => `<button data-tl="${k}" class="${filt === k ? "on" : ""}">${lb}</button>`).join("")}</div>
            ${acts.length ? `<ul class="c-tl">${acts.map(tlItem).join("")}</ul>` : '<p class="muted">Nothing here yet.</p>'}</div>
        </div>`;
      const reload = () => C.render();
      $$("[data-tl]").forEach(b => b.addEventListener("click", () => { C.state.tlFilter = b.dataset.tl; reload(); }));
      if (work) $$("[data-stage]").forEach(b => b.addEventListener("click", () => stageModal(l, b.dataset.stage, reload)));
      wireChecklist(page, l, reload);
      C.wireDeposits(page, d.deposits, reload);
      C.wireJourney(page, d, reload);
      $$("[data-file]").forEach(b => { if (!b.closest("#lDeps")) b.addEventListener("click", () => C.openFile(b.dataset.file)); });
      $$("[data-done]").forEach(b => b.addEventListener("click", async () => { try { await API.call("completeTask", b.dataset.done, "done"); toast("Follow-up done"); reload(); } catch (e) { toast(e.message); } }));
      $$("[data-resched]").forEach(b => b.addEventListener("click", () => { const t = d.tasks.find(x => x.id === b.dataset.resched); modal({ title: "Move follow-up", body: field("New time", `<input class="c-in" type="datetime-local" name="at" value="${localInput(t.due_at)}">`), onSubmit: async v => { await API.call("rescheduleTask", t.id, fromLocalInput(v.at)); toast("Moved"); reload(); } }); }));
      const own = $("#lOwner"); if (own) own.addEventListener("change", async () => { try { await API.call("assignLeads", [l.id], own.value || null); toast("Owner updated"); reload(); } catch (e) { toast(e.message); } });
      $("#lDnc").addEventListener("change", async e => { try { await API.call("updateLead", l.id, { dnc: e.target.checked }); toast(e.target.checked ? "Marked Do not contact and added to the DNC list" : "Contact allowed"); reload(); } catch (err) { toast(err.message); e.target.checked = !e.target.checked; } });
      $$("[data-unsub]").forEach(cb => cb.addEventListener("change", async () => { try { await API.call("updateLead", l.id, { unsubscribed: { [cb.dataset.unsub]: cb.checked } }); toast(cb.checked ? "Opted out" : "Opted back in"); reload(); } catch (err) { toast(err.message); cb.checked = !cb.checked; } }));
      page.onclick = e => {
        const a = e.target.closest("[data-a]"); if (!a) return;
        if (a.dataset.a === "dial") C.dial(l);
        if (a.dataset.a === "deposit") depositModal(l, reload);
        if (a.dataset.a === "upload") modal({ title: "Upload a file", body: `${field("Type", sel("kind", [["deposit_proof", "Deposit proof"], ["document", "Client document"], ["other", "Other"]], "document"))}${field("File (photo or PDF, under 2 MB)", '<input class="c-in" type="file" name="file" accept="image/*,application/pdf">')}`, submit: "Upload", onSubmit: async (v, form) => { if (!form.file.files[0]) throw new Error("Choose a file."); await C.uploadFile(l.id, form.file.files[0], v.kind); toast("Uploaded"); reload(); } });
        if (a.dataset.a === "note") modal({ title: "Add note", body: field("Note", '<textarea class="c-ta" name="text" rows="5"></textarea>'), onSubmit: async v => { await API.call("addNote", l.id, v.text); toast("Note saved"); reload(); } });
        if (a.dataset.a === "task") modal({ title: "Book follow-up", body: `<div class="c-grid">${field("What", inp("title", "Follow-up call"))}${field("Type", sel("type", [["call", "Call"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["meeting", "Meeting"]], "call"))}${field("When", `<input class="c-in" type="datetime-local" name="due" value="${localInput(new Date(Date.now() + 864e5).toISOString())}">`, "full")}${field("Note", inp("note", ""), "full")}</div>`, onSubmit: async v => { await API.call("createTask", l.id, { title: v.title, type: v.type, due_at: fromLocalInput(v.due), note: v.note }); toast("Follow-up booked"); reload(); } });
        if (a.dataset.a === "edit") modal({ title: "Edit contact", wide: true, body: `<div class="c-grid">${field("First name", inp("first_name", l.first_name))}${field("Last name", inp("last_name", l.last_name))}${field("Dial code", inp("dial_code", l.dial_code))}${field("Phone", inp("phone", l.phone))}${field("Email", inp("email", l.email))}${field("Country", sel("country", [...new Set([l.country].concat(COUNTRIES))], l.country))}${field("City", inp("city", l.city))}${field("Area", inp("area", l.area))}${field("Language", inp("language", l.language))}${field("Interest", inp("interest", l.interest))}${field("Trading account", inp("account_id", l.account_id))}</div><p class="muted" style="font-size:12.5px">Every change is kept in the timeline with the old and new value. Deposits are recorded with “Submit FTD”.</p>`, onSubmit: async v => { await API.call("updateLead", l.id, v); toast("Saved"); reload(); } });
        if (a.dataset.a === "send") sendModal(l, d.whatsapp_window_open, reload, d.owner);
      };
    },
  };
  function stageModal(l, to, done) {
    if (to === l.stage) return;
    if (to === "funded") { if (l.deposit_pending) return toast("A deposit is already waiting for verification."); return depositModal(l, done); }
    const m = meta(), extra = to === "lost" ? field("Lost reason", sel("lost_reason", m.lost_reasons, "")) : to === "registered" ? field("Trading account number (optional)", inp("account_id", l.account_id || "")) : "";
    modal({ title: `Move to ${C.stage(to).label}`, body: extra + field("Note (optional)", inp("note", "")), submit: "Move", onSubmit: async v => { await API.call("changeStage", l.id, to, v); toast("Stage updated"); done(); } });
  }
  C.stageModal = stageModal;
  async function sendModal(l, waOpen, done, owner) {
    const tpls = await API.call("listTemplates").catch(() => meta().templates);
    const opts = ch => [["", ch === "whatsapp" && waOpen ? "Free text (24-hour window open)" : ch === "email" ? "Write your own email" : "Choose an approved template"]].concat(tpls.filter(t => t.channel === ch && t.active !== false).map(t => [t.id, t.name]));
    modal({
      title: "Send message", wide: true, submit: "Send",
      body: `<div class="c-grid">${field("Channel", sel("channel", [["whatsapp", "WhatsApp"], ["email", "Email"]], "whatsapp", 'id="sCh"'))}${field("Template", sel("template_id", opts("whatsapp"), "", 'id="sTpl"'))}<label class="c-field full" id="sSubj" hidden><span>Subject</span>${inp("subject", "")}</label><label class="c-field full" id="sText"><span>Message</span><textarea class="c-ta" name="text" rows="5"></textarea></label></div><div><span class="muted" style="font-size:12px;font-weight:700">PREVIEW</span><div class="c-preview" id="sPrev" style="margin-top:6px">Choose a template or write a message.</div></div><p class="muted" style="font-size:12.5px">WhatsApp rules: outside the 24-hour reply window, only Meta-approved templates can be sent.</p>`,
      onOpen: el => {
        const ch = $("#sCh", el), tp = $("#sTpl", el);
        const vars = { first_name: l.first_name, last_name: l.last_name, full_name: l.first_name + " " + l.last_name, reference: l.reference, interest: l.interest, country: l.country, city: l.city, agent_name: owner ? owner.name : "Your account specialist", agent_phone: (owner && owner.phone) || "+" + meta().settings.whatsapp_number, company: meta().settings.company, register_url: meta().settings.register_url, whatsapp_number: "+" + meta().settings.whatsapp_number };
        const rnd = s => String(s || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] != null ? vars[k] : "");
        const upd = () => { const t = tpls.find(x => x.id === tp.value); $("#sSubj", el).hidden = ch.value !== "email" || !!t; $("#sText", el).hidden = !!t || (ch.value === "whatsapp" && !waOpen); const pv = $("#sPrev", el); pv.className = "c-preview" + (ch.value === "whatsapp" ? " wa" : ""); pv.textContent = t ? (t.subject ? "Subject: " + rnd(t.subject) + "\n\n" : "") + rnd(t.body) : $("[name=text]", el).value || (ch.value === "whatsapp" && !waOpen ? "Choose an approved template." : "Write a message."); };
        ch.addEventListener("change", () => { tp.innerHTML = opts(ch.value).map(([v, lb]) => `<option value="${esc(v)}">${esc(lb)}</option>`).join(""); upd(); });
        tp.addEventListener("change", upd); $("[name=text]", el).addEventListener("input", upd); upd();
      },
      onSubmit: async v => { const msg = await API.call("sendMessage", l.id, { channel: v.channel, template_id: v.template_id || undefined, text: v.text, subject: v.subject }); toast(msg.status === "blocked" ? "Not sent: " + msg.error : "Message " + (msg.status === "queued" ? "queued" : msg.status)); done(); },
    });
  }

  /* ========================================================= FOLLOW-UPS */
  C.views.tasks = {
    title: "Follow-ups",
    async render(page, r, alive) {
      const status = r.params.status || "overdue", owner = r.params.owner || (isMgr() ? "" : "me");
      const rows = await API.call("listTasks", { status: status === "upcoming" ? "open" : status, owner }); if (!alive()) return;
      const list = status === "upcoming" ? rows.filter(t => Date.parse(t.due_at) >= Date.now()) : rows;
      page.innerHTML = `<div class="c-row"><div class="c-seg">${[["overdue", "Overdue"], ["today", "Today"], ["upcoming", "Upcoming"], ["done", "Done"]].map(([k, lb]) => `<button data-st="${k}" class="${status === k ? "on" : ""}">${lb}</button>`).join("")}</div><span class="sp"></span>${isMgr() ? sel("owner", [["", "Whole team"], ["me", "Mine"]].concat(salesUsers().map(u => [u.id, u.name])), owner, 'id="tOwner" style="width:auto"') : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:820px"><thead><tr><th>Due</th><th>Follow-up</th><th>Lead</th><th>Stage</th>${isMgr() ? "<th>Owner</th>" : ""}<th></th></tr></thead><tbody>
        ${list.map(t => `<tr><td><span class="mono ${t.overdue ? "c-wait late" : ""}">${fDT(t.due_at)}</span><small>${ago(t.due_at)}</small></td><td><b>${esc(t.title)}</b><small>${esc(t.type)}${t.auto ? " · automatic" : ""}${t.done_at ? " · " + esc(t.outcome) + " " + ago(t.done_at) : ""}</small></td><td><a href="${C.href("lead/" + t.lead.id)}">${esc(t.lead.name)}</a><small>${esc(t.lead.dial_code)} ${esc(t.lead.phone)} · ${esc(t.lead.country)}</small></td><td>${stagePill(t.lead.stage)}</td>${isMgr() ? `<td>${esc(t.owner_name)}</td>` : ""}<td class="r" style="white-space:nowrap">${t.done_at ? "" : `<a class="c-btn sm pri" href="${C.href("call/" + t.lead.id)}">Call</a> <button class="c-btn sm good" data-done="${esc(t.id)}">Done</button>`}</td></tr>`).join("")}
        </tbody></table></div>${list.length ? "" : `<div class="c-empty"><b>${status === "overdue" ? "Nothing overdue" : "No follow-ups here"}</b></div>`}</div>`;
      $$("[data-st]").forEach(b => b.addEventListener("click", () => C.go("tasks", { status: b.dataset.st, owner })));
      const o = $("#tOwner"); if (o) o.addEventListener("change", () => C.go("tasks", { status, owner: o.value }));
      $$("[data-done]").forEach(b => b.addEventListener("click", async () => { try { await API.call("completeTask", b.dataset.done, "done"); toast("Done"); C.render(); } catch (e) { toast(e.message); } }));
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };
})();
