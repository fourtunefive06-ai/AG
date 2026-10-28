/* Absel CRM — Sales workspace extras: Inbox, Deposit pipeline, Deposits, Targets, Team live, Call quality, Lead hygiene */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, pct, fDate, fTime, fDT, ago, dur, minsTxt, isMgr, isAdmin, isSales, seesAll, salesUsers, stagePill, tempTag, outcomeLabel, userName, toast, modal, confirmBox, field, inp, sel, chips, ICONS, todayStr } = C;
  const meta = () => C.state.meta;
  const kpi = (label, val, sub, cls = "") => `<div class="c-kpi ${cls}"><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></div>`;
  const tabs = (path, cur, list) => `<nav class="c-tabs">${list.map(([k, lb, n]) => `<a href="${C.href(path + (k ? "?tab=" + k : ""))}" class="${cur === k ? "on" : ""}">${esc(lb)}${n ? ` <b class="c-count">${n}</b>` : ""}</a>`).join("")}</nav>`;

  /* ============================================================== INBOX */
  C.views.inbox = {
    title: "Inbox",
    async render(page, r, alive) {
      const p = Object.assign({ box: "replies" }, r.params);
      const [list, conv] = await Promise.all([API.call("listConversations", p), r.id ? API.call("getConversation", r.id) : null]); if (!alive()) return;
      if (conv) C.updateBadges();
      const item = c => `<a class="c-conv ${c.unread ? "unread" : ""} ${r.id === c.lead.id ? "on" : ""}" href="${C.href("inbox/" + c.lead.id + "?" + new URLSearchParams(p))}"><div class="c-row" style="gap:6px;flex-wrap:nowrap"><b>${esc(c.lead.name)}</b>${c.unread ? '<i class="dot"></i>' : ""}<span class="sp"></span><small>${esc(ago(c.last.created_at))}</small></div><small class="pv">${c.last.direction === "in" ? "" : "You: "}${esc(c.last.body)}</small><small>${c.window_open ? '<span class="c-pill plain" style="--c:var(--up)">24h open</span> ' : ""}${stagePill(c.lead.stage)}${seesAll() ? " · " + esc(c.owner_name) : ""}</small></a>`;
      const thread = conv ? threadHtml(conv) : `<div class="c-empty" style="align-self:center"><b>Pick a conversation</b>Client replies on WhatsApp land here. Unread ones are at the top.</div>`;
      page.innerHTML = `<div class="c-inbox ${r.id ? "has-thread" : ""}"><div class="c-inlist"><div class="c-filters" style="padding:10px"><div class="c-seg">${[["unread", "Unread"], ["replies", "Client replied"], ["open", "24h window"], ["all", "All"]].map(([k, lb]) => `<button data-box="${k}" class="${p.box === k ? "on" : ""}">${lb}</button>`).join("")}</div>${seesAll() ? sel("owner", [["", "Everyone"], ["me", "Mine"], ["none", "Unassigned"]].concat(salesUsers().map(u => [u.id, u.name])), p.owner || "", 'id="iOwn" style="width:auto"') : ""}<input class="c-in grow" type="search" id="iQ" placeholder="Search" value="${esc(p.q || "")}"></div>
        <div class="c-convs">${list.length ? list.map(item).join("") : `<p class="muted" style="padding:14px">${p.box === "unread" ? "No unread replies. You're up to date." : "No conversations here."}</p>`}</div></div>
        <div class="c-thread">${thread}</div></div>`;
      const go = patch => C.go("inbox" + (r.id ? "/" + r.id : ""), Object.assign({}, p, patch));
      $$("[data-box]").forEach(b => b.addEventListener("click", () => go({ box: b.dataset.box })));
      const io = $("#iOwn"); if (io) io.addEventListener("change", () => go({ owner: io.value }));
      $("#iQ").addEventListener("input", C.debounce(e => go({ q: e.target.value.trim() }), 400));
      if (conv) wireThread(page, conv, () => C.render());
      const box = $(".c-msgs"); if (box) box.scrollTop = box.scrollHeight;
    },
    refresh(page, r, alive) { if (!$(".c-compose textarea:focus")) return this.render(page, r, alive); },
  };
  function threadHtml(c) {
    const l = c.lead, tpls = meta().templates;
    const bubble = m => `<div class="c-bub ${m.direction === "in" ? "in" : "out"} ${m.channel}"><div>${m.subject ? `<b>${esc(m.subject)}</b><br>` : ""}${esc(m.body)}</div><small>${m.channel === "email" ? "Email · " : ""}${m.direction === "in" ? "" : esc(m.user_name) + " · "}${esc(fDT(m.created_at))}${m.direction === "out" ? ` · <span style="color:${C.msgColor(m.status)}">${esc(m.status)}</span>` : ""}${m.error ? " · " + esc(m.error) : ""}</small></div>`;
    const wa = tpls.filter(t => t.channel === "whatsapp" && (c.window_open || t.wa_template_name)), em = tpls.filter(t => t.channel === "email");
    return `<header class="c-row"><a class="c-btn ghost sm c-back" href="${C.href("inbox")}">←</a><div style="min-width:0"><b style="font-size:16px">${esc(l.name)}</b> ${stagePill(l.stage)}<small class="muted" style="display:block">${esc(l.dial_code)} ${esc(l.phone)} · ${esc(l.email || "no email")} · owner ${esc(c.owner)}</small></div><span class="sp"></span><a class="c-btn sm" href="${C.href("lead/" + l.id)}">Lead</a>${c.can_reply ? `<a class="c-btn sm pri" href="${C.href("call/" + l.id)}">${ICONS.phone} Call</a>` : ""}</header>
      <div class="c-msgs">${c.messages.length ? c.messages.map(bubble).join("") : '<p class="muted">No messages yet.</p>'}</div>
      ${l.dnc ? '<div class="c-banner warn">Do not contact. Replies are disabled.</div>' : !c.can_reply ? '<div class="c-banner">View only. The lead owner replies.</div>' : `<form class="c-compose" novalidate>
        <div class="c-row" style="gap:8px">${sel("channel", [["whatsapp", "WhatsApp"], ["email", "Email"]], "whatsapp", 'style="width:auto" id="cCh"')}${sel("template_id", [], "", 'style="flex:1;min-width:160px" id="cTpl"')}
          <span class="muted" style="font-size:12px" id="cWin">${c.window_open ? "24-hour window open: free text allowed" : "Outside the 24-hour window: approved templates only"}</span></div>
        <input class="c-in" name="subject" placeholder="Subject" hidden>
        <textarea class="c-ta" name="text" rows="2" placeholder="Type a reply"></textarea>
        <div class="c-row"><span class="muted" style="font-size:12px">${(l.unsubscribed || {}).whatsapp ? "Client opted out of WhatsApp broadcasts; direct replies are still allowed." : ""}</span><span class="sp"></span>${API.mode === "prototype" ? '<button type="button" class="c-btn sm ghost" id="cSim">Simulate client reply</button>' : ""}<button class="c-btn pri" type="submit">${ICONS.send} Send</button></div></form>`}`;
  }
  function wireThread(page, c, reload) {
    const f = $(".c-compose", page); if (!f) return;
    const tpls = meta().templates, ch = $("#cCh", f), tp = $("#cTpl", f);
    const fill = () => {
      const isWa = ch.value === "whatsapp", list = tpls.filter(t => t.channel === ch.value && (!isWa || c.window_open || t.wa_template_name));
      const free = isWa ? c.window_open : true;
      tp.innerHTML = (free ? [["", isWa ? "Free text" : "Write your own email"]] : []).concat(list.map(t => [t.id, "Template: " + t.name])).map(([v, lb]) => `<option value="${esc(v)}">${esc(lb)}</option>`).join("");
      upd();
    };
    const upd = () => { const t = tp.value; f.text.hidden = !!t; f.subject.hidden = ch.value !== "email" || !!t; $("#cWin", f).hidden = ch.value !== "whatsapp"; };
    ch.addEventListener("change", fill); tp.addEventListener("change", upd); fill();
    f.text.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const v = C.readForm(f), btn = $('button[type="submit"]', f);
      if (!v.template_id && !String(v.text || "").trim()) return toast("Write a message or pick a template.");
      btn.disabled = true;
      try { const m = await API.call("sendMessage", c.lead.id, { channel: v.channel, template_id: v.template_id || undefined, text: v.text, subject: v.subject }); toast(m.status === "blocked" ? "Not sent: " + m.error : "Sent"); reload(); }
      catch (err) { toast(err.message); btn.disabled = false; }
    });
    const sim = $("#cSim", f); if (sim) sim.addEventListener("click", () => modal({ title: "Simulate a client reply", body: `<p class="muted">Prototype only: pretends the client wrote on WhatsApp, so you can try the inbox, the 24-hour window and reply automations.</p>${field("Client's message", inp("text", "Hi, can you call me after 5pm?"))}`, submit: "Add reply", onSubmit: async v => { await API.call("simulateInbound", c.lead.id, v.text); toast("Reply added"); reload(); } }));
  }

  /* =================================================== DEPOSIT PIPELINE */
  C.views.pipeline = {
    title: "Deposit pipeline",
    async render(page, r, alive) {
      const p = Object.assign({}, r.params), d = await API.call("listPipeline", p); if (!alive()) return;
      const steps = meta().checklist;
      let rows = d.rows; if (p.next) rows = rows.filter(x => x.next === p.next); if (p.stuck) rows = rows.filter(x => x.stuck); if (p.stage) rows = rows.filter(x => x.stage === p.stage);
      page.innerHTML = `<p class="muted" style="max-width:820px">Everyone who said yes but hasn't funded yet. Work the <b>stuck</b> ones first: they've been in their stage longer than the limit in Settings. Tick steps on the lead page or in Calling mode.</p>
        <div class="c-kpis">${kpi("In the pipeline", num(d.rows.length), `${num(d.by_stage.qualified || 0)} qualified · ${num(d.by_stage.registered || 0)} registered · ${num(d.by_stage.kyc || 0)} KYC`)}${kpi("Stuck", num(d.stuck), "over the stage time limit", d.stuck ? "alert" : "good")}${kpi("Waiting verification", num(d.pending), "deposit submitted")}${kpi("Promised deposits", money(d.promised_total), "amount clients committed to")}${kpi("Expected (from calls)", money(d.expected_total), "what clients said they'd start with")}</div>
        <div class="c-filters">${seesAll() ? sel("owner", [["", "Whole team"], ["me", "Mine"]].concat(salesUsers().map(u => [u.id, u.name])), p.owner || "", 'id="pOwn" style="width:auto"') : ""}${sel("stage", [["", "All stages"], ["qualified", "Qualified"], ["registered", "Registered"], ["kyc", "KYC verified"]], p.stage || "", 'id="pStage" style="width:auto"')}<label class="c-chip"><input type="checkbox" id="pStuck" ${p.stuck ? "checked" : ""}>Stuck only</label></div>
        <div class="c-chips">${Object.entries(d.by_next).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="c-chip ${p.next === k ? "on" : ""}" data-next="${esc(k)}">${esc(k)} <b>${n}</b></button>`).join("")}${p.next ? '<button class="c-chip" data-next="">Clear</button>' : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1050px"><thead><tr><th>Lead</th><th>Stage</th><th>Steps</th><th>Next step</th><th class="r">In stage</th><th>Promised</th>${seesAll() ? "<th>Owner</th>" : ""}<th>Next follow-up</th><th></th></tr></thead><tbody>
        ${rows.map(x => `<tr><td><a href="${C.href("lead/" + x.id)}"><b>${esc(x.name)}</b></a>${C.journeyTags(x.journey)}<small>${esc(x.city ? x.city + ", " : "")}${esc(x.country)} · ${esc(x.interest || "")}</small></td><td>${stagePill(x.stage)}</td>
          <td><span class="c-dots" title="${x.done} of ${x.steps} steps">${steps.map(st => `<i class="${x.checklist[st.id] ? "on" : ""}" title="${esc(st.label)}"></i>`).join("")}</span></td>
          <td>${x.deposit_pending ? '<span class="c-pill plain" style="--c:var(--warn)">Waiting verification</span>' : esc(x.next)}</td>
          <td class="num ${x.stuck ? "c-wait late" : ""}">${x.days_in_stage} d</td><td>${x.promised_amount ? `<b class="mono">${money(x.promised_amount)}</b><small>${fDate(x.promised_at)}</small>` : x.expected_deposit ? `<span class="muted mono">~${money(x.expected_deposit)}</span>` : "—"}</td>
          ${seesAll() ? `<td>${esc(x.owner_name)}</td>` : ""}<td>${x.next_follow_up_at ? `<span class="${Date.parse(x.next_follow_up_at) < Date.now() ? "c-wait late" : ""}">${ago(x.next_follow_up_at)}</span>` : '<span class="muted">none booked</span>'}</td>
          <td class="r" style="white-space:nowrap">${isSales() ? `<a class="c-btn sm pri" href="${C.href("call/" + x.id)}">${ICONS.phone} Call</a>` : ""}</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>Nothing here</b>Leads appear once a call marks them Interested.</div>'}</div>`;
      const go = patch => C.go("pipeline", Object.assign({}, p, patch));
      const o = $("#pOwn"); if (o) o.addEventListener("change", () => go({ owner: o.value }));
      $("#pStage").addEventListener("change", e => go({ stage: e.target.value }));
      $("#pStuck").addEventListener("change", e => go({ stuck: e.target.checked ? "1" : "" }));
      $$("[data-next]").forEach(b => b.addEventListener("click", () => go({ next: b.dataset.next })));
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* =========================================================== DEPOSITS */
  C.views.deposits = {
    title: "First deposits",
    async render(page, r, alive) {
      const tab = r.params.tab || "pending", rows = await API.call("listDeposits", { status: tab === "all" ? "" : tab }); if (!alive()) return;
      const pend = meta().deposits_pending;
      page.innerHTML = tabs("deposits", tab, [["pending", "Waiting verification", isMgr() ? pend : 0], ["verified", "Verified"], ["rejected", "Rejected"], ["all", "All"]]) +
        `<p class="muted" style="max-width:820px">${isMgr() ? "Check each proof against the back-office or bank before verifying. Verified deposits move the lead to Funded and count on the agent's target." : "Deposits you submitted. A manager verifies each one before it counts as your FTD. Submit a deposit from the lead page or when you save a call."}</p>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1000px"><thead><tr><th>Submitted</th><th>Client</th><th class="r">Amount</th><th>Method / reference</th><th>Deposit date</th><th>Agent</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(d => `<tr><td class="mono">${fDT(d.created_at)}<small>${esc(d.created_by_name)}</small></td><td><a href="${C.href("lead/" + d.lead_id)}"><b>${esc(d.lead ? d.lead.name : "")}</b></a><small>${esc(d.lead ? d.lead.country : "")} · ${esc(d.source)}${d.campaign ? " / " + esc(d.campaign) : ""}</small></td><td class="num"><b>${money(d.amount)}</b></td><td>${esc(d.method || "—")}<small class="mono">${esc(d.tx_ref || "no reference")}${d.account_id ? " · acc " + esc(d.account_id) : ""}</small></td><td>${fDate(d.deposited_at)}</td><td>${esc(d.owner_name)}</td>
          <td><span class="c-pill plain" style="--c:${C.depColor(d.status)}">${esc(d.status)}</span>${d.status === "rejected" ? `<small>${esc(d.reject_reason)}</small>` : d.verified_by_name ? `<small>by ${esc(d.verified_by_name)} ${ago(d.verified_at)}</small>` : ""}${d.note ? `<small>“${esc(d.note)}”</small>` : ""}</td>
          <td class="r" style="white-space:nowrap">${d.proof_file_id ? `<button class="c-btn sm" data-file="${esc(d.proof_file_id)}">Proof</button> ` : '<span class="muted" style="font-size:12px">no proof </span>'}${d.status === "pending" && isMgr() ? `<button class="c-btn sm" data-rej="${esc(d.id)}">Reject</button> <button class="c-btn sm good" data-ver="${esc(d.id)}">Verify</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : `<div class="c-empty"><b>${tab === "pending" ? "Nothing waiting" : "No deposits here"}</b></div>`}</div>`;
      C.wireDeposits(page, rows, () => { C.updateBadges(); C.render(); });
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ============================================================ TARGETS */
  C.views.targets = {
    title: "Targets & leaderboard",
    async render(page, r, alive) {
      const month = r.params.month || todayStr().slice(0, 7), d = await API.call("targets", { month }); if (!alive()) return;
      const me = d.rows.find(x => x.me), t = d.total;
      const bar = (v, max) => `<div class="c-progress" style="flex:1"><i style="width:${Math.min(100, max ? (v / max) * 100 : 0)}%"></i></div>`;
      page.innerHTML = `<div class="c-filters"><input class="c-in" type="month" id="tMonth" value="${esc(month)}" aria-label="Month"><span class="muted">${d.elapsed ? `Day ${d.elapsed} of ${d.days_in_month}: on pace means ${d.expected_pct}% of target by today.` : "Month hasn't started."}${d.total.ib_ftd ? ` · ${d.total.ib_ftd} IB-referred FTD${d.total.ib_ftd > 1 ? "s" : ""} (${C.money(d.total.ib_ftd_amount)}) not counted in targets` : ""}</span><span style="flex:1"></span>${isMgr() ? '<button class="c-btn" id="tSet">Set targets</button>' : ""}</div>
        ${me ? `<div class="c-card c-myt"><div><span class="muted" style="font-size:12px;font-weight:700">MY MONTH</span><h2 style="font-size:30px" class="mono">${me.ftd}${me.target_ftd ? `<small class="muted" style="font-size:16px"> / ${me.target_ftd} FTD</small>` : " FTD"}</h2><div class="c-row" style="flex-wrap:nowrap">${bar(me.ftd, me.target_ftd)}<span class="mono" style="font-size:12px">${me.pct == null ? "no target" : me.pct + "%"}</span></div><small class="muted">${money(me.amount)}${me.target_amount ? " of " + money(me.target_amount) : ""} · ${me.pending} waiting verification · projected ${me.projection} by month end</small></div><div class="c-rank">#${me.rank}<small>of ${d.rows.length}</small></div></div>` : ""}
        <div class="c-kpis">${kpi("Team FTDs", num(t.ftd) + (t.target_ftd ? `<small style="font-size:14px"> / ${num(t.target_ftd)}</small>` : ""), t.pct == null ? "no team target" : t.pct + "% of target · expected " + d.expected_pct + "%", t.pct != null && t.pct < d.expected_pct ? "alert" : "good")}${kpi("FTD amount", money(t.amount), t.target_amount ? pct(Math.round(t.amount / t.target_amount * 100)) + " of " + money(t.target_amount) : "")}${kpi("Waiting verification", num(t.pending), "count once a manager verifies")}${kpi("Projected", num(t.projection), "FTDs by month end at this pace")}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:860px"><thead><tr><th class="r">#</th><th>Agent</th><th class="r">FTD</th><th style="width:28%">Progress to target</th><th class="r">Amount</th><th class="r">Pending</th><th class="r">Calls</th><th class="r">Projected</th></tr></thead><tbody>
        ${d.rows.map(x => `<tr class="${x.me ? "me" : ""}"><td class="num">${x.rank <= 3 && x.ftd ? ["🥇", "🥈", "🥉"][x.rank - 1] : x.rank}</td><td><b>${esc(x.name)}</b><small>${esc(x.team)}</small></td><td class="num"><b>${x.ftd}</b>${x.target_ftd ? `<small>of ${x.target_ftd}</small>` : ""}</td><td><div class="c-row" style="flex-wrap:nowrap;gap:8px">${bar(x.ftd, x.target_ftd)}<span class="mono" style="font-size:12px;min-width:36px">${x.pct == null ? "—" : x.pct + "%"}</span></div>${x.target_ftd && d.elapsed ? `<small class="${x.pct >= d.expected_pct ? "" : "c-wait late"}">${x.pct >= d.expected_pct ? "on pace" : "behind pace"}</small>` : ""}</td><td class="num">${money(x.amount)}${x.target_amount ? `<small>of ${money(x.target_amount)}</small>` : ""}</td><td class="num">${x.pending || ""}</td><td class="num">${num(x.calls)}</td><td class="num">${x.projection}</td></tr>`).join("")}</tbody></table></div></div>
        ${d.teams.length > 1 ? `<div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Desks</h3><div class="c-scroll"><table class="c-table"><thead><tr><th>Desk</th><th class="r">People</th><th class="r">FTD</th><th class="r">Target</th><th class="r">%</th><th class="r">Amount</th><th class="r">Pending</th></tr></thead><tbody>${d.teams.map(x => `<tr><td><b>${esc(x.team)}</b></td><td class="num">${x.people}</td><td class="num">${x.ftd}</td><td class="num">${x.target_ftd || "—"}</td><td class="num">${x.pct == null ? "—" : x.pct + "%"}</td><td class="num">${money(x.amount)}</td><td class="num">${x.pending || ""}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
        <p class="muted" style="font-size:12px">Counts verified first deposits by deposit date, credited to the lead owner when the deposit was submitted.</p>`;
      $("#tMonth").addEventListener("change", e => C.go("targets", { month: e.target.value }));
      const ts = $("#tSet"); if (ts) ts.addEventListener("click", () => modal({ title: "Monthly targets", wide: true, submit: "Save targets",
        body: `<p class="muted">Targets apply every month until you change them.</p><table class="c-table"><thead><tr><th>Person</th><th>FTDs per month</th><th>FTD amount (USD)</th></tr></thead><tbody>${d.rows.map(x => `<tr><td><b>${esc(x.name)}</b><small>${esc(x.team)}</small></td><td>${inp("t." + x.id + ".n", x.target_ftd || "", 'type="number" min="0"')}</td><td>${inp("t." + x.id + ".a", x.target_amount || "", 'type="number" min="0" step="500"')}</td></tr>`).join("")}</tbody></table>`,
        onSubmit: async v => { for (const x of d.rows) { const n = v.t[x.id]; if (Number(n.n || 0) !== x.target_ftd || Number(n.a || 0) !== x.target_amount) await API.call("setTarget", x.id, n.n, n.a); } toast("Targets saved"); C.render(); } }));
    },
  };

  /* ========================================================== TEAM LIVE */
  C.views.live = {
    title: "Team live",
    async render(page, r, alive) {
      const rows = await API.call("liveBoard"); if (!alive()) return;
      const n = k => rows.filter(x => x.status === k).length;
      page.innerHTML = `<div class="c-kpis">${kpi("Online now", num(n("online")), "signed in, last 5 minutes", "good")}${kpi("On break", num(n("break")), "", n("break") ? "" : "")}${kpi("Offline", num(n("offline")))}${kpi("Calls today", num(rows.reduce((s, x) => s + x.calls, 0)), num(rows.reduce((s, x) => s + x.connected, 0)) + " connected")}${kpi("New leads waiting", num(rows.reduce((s, x) => s + x.waiting_new, 0)), "never called", rows.some(x => x.waiting_new) ? "alert" : "")}</div>
        <div class="c-livegrid">${rows.map(x => `<div class="c-card c-agent ${x.status}"><div class="c-row" style="flex-wrap:nowrap"><i class="c-dot ${x.status}"></i><b>${esc(x.name)}</b><span class="sp"></span><small class="muted">${esc(x.team)}</small></div>
          <p class="st">${x.status === "online" ? "Online" : x.status === "break" ? "On break: " + esc(x.break_reason) : "Offline"}${x.since ? ` <span class="muted">· ${x.status === "offline" ? "last seen " + esc(ago(x.since)) : "since " + esc(fTime(x.since))}</span>` : ""}</p>
          <dl class="c-dl"><dt>Calls today</dt><dd class="mono">${x.calls} <span class="muted">(${x.connected} connected)</span></dd><dt>Talk time</dt><dd class="mono">${x.talk_min} min</dd><dt>Last call</dt><dd>${x.last_call_at ? esc(ago(x.last_call_at)) : "—"}</dd><dt>Online / break</dt><dd class="mono">${minsTxt(x.online_min)} / ${minsTxt(x.break_min)}</dd><dt>Waiting new</dt><dd class="mono ${x.waiting_new ? "c-wait late" : ""}">${x.waiting_new}</dd><dt>Overdue</dt><dd class="mono ${x.overdue ? "c-wait late" : ""}">${x.overdue}</dd><dt>Open leads</dt><dd class="mono">${x.open_leads}</dd></dl></div>`).join("")}</div>
        <p class="muted" style="font-size:12px">Updates every 30 seconds. “Online” means the CRM is open; breaks are set by the agent from the status button at the top. History is in Reports → Agent activity.</p>`;
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ======================================================== CALL QUALITY */
  C.views.quality = {
    title: "Call quality",
    async render(page, r, alive) {
      if (!isMgr()) return myReviews(page, alive);
      const tab = r.params.tab || "review", p = r.params;
      const data = tab === "scores" ? await API.call("report", "qa", { from: todayStr(-29), to: todayStr() }) : await API.call("listCallsForReview", { status: tab === "done" ? "reviewed" : "unreviewed", agent: p.agent || "", from: p.from || todayStr(-6), to: todayStr(), min_sec: p.min || "" }); if (!alive()) return;
      let html = tabs("quality", tab, [["review", "Calls to review"], ["done", "Reviewed"], ["scores", "Scores (30 days)"]]);
      if (tab === "scores") {
        html += `<div class="c-kpis">${kpi("Reviews", num(data.count))}${kpi("Average score", data.avg == null ? "–" : data.avg + "%")}${kpi("Compliance issues", num(data.compliance_fails), "promised profits, no risk warning…", data.compliance_fails ? "alert" : "good")}</div>
          <div class="c-cols c2"><div class="c-card"><h3>Team average by skill <small>1–5</small></h3>${C.hbars(data.criteria.filter(c => c.avg != null).map(c => ({ k: c.label, n: c.avg })))}</div>
          <div class="c-card"><h3>By agent</h3><table class="c-table"><thead><tr><th>Agent</th><th class="r">Reviews</th><th class="r">Avg</th><th class="r">Compliance</th><th>Coach on</th></tr></thead><tbody>${data.agents.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="num">${a.reviews}</td><td class="num">${a.avg}%</td><td class="num ${a.compliance_fails ? "c-wait late" : ""}">${a.compliance_fails || "—"}</td><td>${esc(a.weakest)}</td></tr>`).join("")}</tbody></table></div></div>`;
      } else {
        html += `<div class="c-filters">${sel("agent", [["", "All agents"]].concat(salesUsers().map(u => [u.id, u.name])), p.agent || "", 'id="qAg" style="width:auto"')}${sel("min", [["", "Any length"], ["120", "2 min+"], ["300", "5 min+"]], p.min || "", 'id="qMin" style="width:auto"')}<span class="muted">Connected calls from ${fDate(data.from + "T12:00:00")}</span></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>When</th><th>Agent</th><th>Client</th><th>Outcome</th><th class="r">Length</th><th>Notes</th><th>Recording</th><th></th></tr></thead><tbody>
        ${data.rows.map(c => `<tr><td class="mono">${fDT(c.at)}</td><td>${esc(c.agent)}</td><td>${c.lead ? `<a href="${C.href("lead/" + c.lead.id)}">${esc(c.lead.name)}</a>` : ""}</td><td>${esc(outcomeLabel(c.outcome))}</td><td class="num">${dur(c.duration_sec)}</td><td style="max-width:300px">${esc(c.notes || "")}</td><td>${c.recording_url ? `<audio controls preload="none" src="${esc(c.recording_url)}" style="height:32px;max-width:200px"></audio>` : '<span class="muted" style="font-size:12px">none</span>'}</td><td class="r">${c.review ? `<b class="mono">${c.review.total}%</b> <button class="c-btn sm" data-rv="${esc(c.activity_id)}">Edit</button>` : `<button class="c-btn sm pri" data-rv="${esc(c.activity_id)}">Review</button>`}</td></tr>`).join("")}</tbody></table></div>${data.rows.length ? "" : '<div class="c-empty"><b>Nothing to review</b>Connected calls from the last 7 days appear here.</div>'}</div>`;
      }
      page.innerHTML = html;
      const go = patch => C.go("quality", Object.assign({}, p, { tab }, patch));
      const ag = $("#qAg"); if (ag) ag.addEventListener("change", () => go({ agent: ag.value }));
      const mn = $("#qMin"); if (mn) mn.addEventListener("change", () => go({ min: mn.value }));
      $$("[data-rv]").forEach(b => b.addEventListener("click", () => reviewModal(data.rows.find(c => c.activity_id === b.dataset.rv))));
    },
  };
  function reviewModal(c) {
    const crit = meta().qa_criteria, rv = c.review || { scores: {}, compliance_ok: true };
    const scale = (id, v) => `<div class="c-scale" role="radiogroup">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="scores.${id}" value="${n}" ${Number(v) === n ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>`;
    modal({ title: `Review call: ${c.agent} with ${c.lead ? c.lead.name : "client"}`, wide: true, submit: "Save review",
      body: `<p class="muted">${fDT(c.at)} · ${esc(outcomeLabel(c.outcome))} · ${dur(c.duration_sec)}</p>${c.recording_url ? `<audio controls src="${esc(c.recording_url)}" style="width:100%"></audio>` : '<div class="c-banner">No recording linked. Score from the notes, or listen in the phone system.</div>'}
        ${c.notes ? `<div class="c-preview">${esc(c.notes)}</div>` : ""}
        <table class="c-table"><thead><tr><th>Skill</th><th>1 poor · 5 excellent</th></tr></thead><tbody>${crit.map(k => `<tr><td>${esc(k.label)}</td><td>${scale(k.id, rv.scores[k.id])}</td></tr>`).join("")}</tbody></table>
        <label class="c-switch"><input type="checkbox" name="compliance_ok" ${rv.compliance_ok !== false ? "checked" : ""}><span>Compliant: no profit promises, risk explained, no pressure. Unticking makes the score 0%.</span></label>
        <div class="c-grid">${field("What went well", `<textarea class="c-ta" name="strengths" rows="2">${esc(rv.strengths || "")}</textarea>`)}${field("What to improve (the agent sees this)", `<textarea class="c-ta" name="improve" rows="2">${esc(rv.improve || "")}</textarea>`)}</div>`,
      onSubmit: async v => { const r = await API.call("saveReview", { activity_id: c.activity_id, scores: v.scores || {}, compliance_ok: !!v.compliance_ok, strengths: v.strengths, improve: v.improve }); toast("Review saved: " + r.total + "%"); C.render(); } });
  }
  async function myReviews(page, alive) {
    C.setTitle("My call reviews");
    const rows = await API.call("listReviews", {}); if (!alive()) return;
    const crit = meta().qa_criteria, avg = rows.length ? Math.round(rows.reduce((s, x) => s + x.total, 0) / rows.length) : null;
    page.innerHTML = `<div class="c-kpis">${kpi("Reviews", num(rows.length))}${kpi("My average", avg == null ? "–" : avg + "%", "", avg >= 75 ? "good" : "")}${kpi("New", num(rows.filter(x => !x.acknowledged_at).length), "read and acknowledge")}</div>
      ${rows.map(x => `<div class="c-card" style="display:grid;gap:8px"><div class="c-row"><b class="mono" style="font-size:20px;color:${x.total >= 75 ? "var(--up)" : x.total >= 50 ? "var(--warn)" : "var(--down)"}">${x.total}%</b><div><b>${esc(x.lead ? x.lead.name : "Call")}</b><small class="muted" style="display:block">${fDT(x.call.at)} · ${esc(outcomeLabel(x.call.outcome))} · ${dur(x.call.duration_sec)} · reviewed by ${esc(x.reviewer)}</small></div><span class="sp"></span>${x.acknowledged_at ? '<span class="muted" style="font-size:12px">Acknowledged</span>' : `<button class="c-btn sm pri" data-ack="${esc(x.id)}">Got it</button>`}</div>
        ${x.compliance_ok ? "" : '<div class="c-banner warn"><b>Compliance issue.</b> Talk to your manager about this call.</div>'}
        <div class="c-chips">${crit.map(k => `<span class="c-chip">${esc(k.label)} <b>${x.scores[k.id]}</b>/5</span>`).join("")}</div>
        ${x.strengths ? `<p><b>Went well:</b> ${esc(x.strengths)}</p>` : ""}${x.improve ? `<p><b>To improve:</b> ${esc(x.improve)}</p>` : ""}${x.call.recording_url ? `<audio controls preload="none" src="${esc(x.call.recording_url)}"></audio>` : ""}</div>`).join("") || '<div class="c-card c-empty"><b>No reviews yet</b>Your manager scores some of your calls each week.</div>'}`;
    $$("[data-ack]").forEach(b => b.addEventListener("click", async () => { await API.call("ackReview", b.dataset.ack); C.updateBadges(); C.render(); }));
  }

  /* ======================================================= LEAD HYGIENE */
  C.views.hygiene = {
    title: "Lead hygiene",
    async render(page, r, alive) {
      const tab = r.params.tab || "dups";
      const [data, st] = await Promise.all([tab === "dups" ? API.call("duplicateGroups") : tab === "recycle" ? API.call("listRecycle") : null, API.call("getSettings")]); if (!alive()) return;
      let html = tabs("hygiene", tab, [["dups", "Duplicates"], ["recycle", "Recycle lost leads"], ["sla", "Speed rules"]]);
      if (tab === "dups") {
        html += `<p class="muted" style="max-width:820px">Leads with the same phone or email. Merging keeps one record: calls, notes, messages, follow-ups and deposits move onto it, empty fields are filled from the others, and the furthest stage wins. The others are deleted.</p>` +
          (data.length ? data.map((g, gi) => `<div class="c-card" data-g="${gi}"><table class="c-table"><thead><tr><th>Keep</th><th>Lead</th><th>Received</th><th>Stage</th><th>Owner</th><th>Source</th><th class="r">Calls</th></tr></thead><tbody>${g.map((x, i) => `<tr><td><input type="radio" name="keep${gi}" value="${esc(x.id)}" ${i === 0 ? "checked" : ""} aria-label="Keep ${esc(x.name)}"></td><td><a href="${C.href("lead/" + x.id)}"><b>${esc(x.name)}</b></a><small class="mono">${esc(x.reference)} · ${esc(x.dial_code)} ${esc(x.phone)} · ${esc(x.email || "")}</small></td><td>${fDT(x.created_at)}</td><td>${stagePill(x.stage)}</td><td>${esc(x.owner_name)}</td><td>${esc(x.source)}</td><td class="num">${x.attempts}</td></tr>`).join("")}</tbody></table><div class="c-row" style="margin-top:8px"><span class="sp"></span><button class="c-btn pri sm" data-merge="${gi}">Merge ${g.length} into the selected one</button></div></div>`).join("") : '<div class="c-card c-empty"><b>No duplicates</b>Repeat enquiries are flagged as they arrive.</div>');
      } else if (tab === "recycle") {
        const rc = data.settings;
        html += `<div class="c-banner ${rc.enabled ? "" : "warn"}">Automatic recycling is <b>${rc.enabled ? "on" : "off"}</b>: lost leads with reason ${esc(rc.reasons.join(", "))} are reopened after <b>${rc.days} days</b> and given to a different agent, at most ${rc.max} time(s). ${isAdmin() ? `<a href="${C.href("settings")}">Change in Settings</a>` : ""}</div>
          <div class="c-tbox"><div class="c-row" style="padding:10px 12px"><b id="rcN">0 selected</b><span class="sp"></span><button class="c-btn pri sm" id="rcGo" disabled>Recycle selected now</button></div><div class="c-scroll"><table class="c-table" style="min-width:820px"><thead><tr><th><input type="checkbox" id="rcAll" aria-label="Select all"></th><th>Lead</th><th>Lost reason</th><th class="r">Days lost</th><th>Last owner</th><th class="r">Times recycled</th></tr></thead><tbody>${data.rows.map(x => `<tr><td><input type="checkbox" class="rcSel" value="${esc(x.id)}" aria-label="Select ${esc(x.name)}"></td><td><a href="${C.href("lead/" + x.id)}"><b>${esc(x.name)}</b></a><small>${esc(x.country)} · ${x.connected_calls ? "spoke before" : "never reached"}</small></td><td>${esc(x.lost_reason)}</td><td class="num">${x.lost_days}</td><td>${esc(x.owner_name)}</td><td class="num">${x.recycled}</td></tr>`).join("")}</tbody></table></div>${data.rows.length ? "" : '<div class="c-empty"><b>Nothing to recycle</b></div>'}</div>`;
      } else {
        const sla = st.sla_reassign || {};
        html += `<div class="c-card" style="display:grid;gap:10px;max-width:820px"><h3>Speed-to-lead reassignment</h3><p>Status: <b>${sla.enabled ? "on" : "off"}</b>. ${sla.enabled ? `A new lead that isn't called within <b>${sla.minutes} minutes</b> moves to another agent in the same territory who is online now (up to ${sla.max} time(s)). The first agent is told why. If nobody else is online, managers get an alert instead.` : "New leads stay with their first owner however long they wait."}</p><p class="muted">Agents on a break don't receive leads. ${isAdmin() ? `<a href="${C.href("settings")}">Change in Settings</a>` : "Ask an admin to change this in Settings."}</p></div>
          <div class="c-card" style="display:grid;gap:10px;max-width:820px"><h3>Stuck in stage</h3><p>A pipeline lead counts as stuck after <b>${st.stuck_days.qualified} days</b> qualified, <b>${st.stuck_days.registered}</b> registered or <b>${st.stuck_days.kyc}</b> KYC-verified without a deposit. Automations “Registered 2 days, no KYC” and “KYC approved 2 days, no deposit” chase these by WhatsApp and book a call.</p></div>`;
      }
      page.innerHTML = html;
      $$("[data-merge]").forEach(b => b.addEventListener("click", async () => {
        const gi = Number(b.dataset.merge), g = data[gi], keep = $(`input[name="keep${gi}"]:checked`).value;
        if (!(await confirmBox("Merge leads", `Keep ${g.find(x => x.id === keep).reference} and merge ${g.length - 1} other record(s) into it? This can't be undone.`, "Merge", false))) return;
        try { await API.call("mergeLeads", keep, g.map(x => x.id).filter(id => id !== keep)); toast("Merged"); C.render(); } catch (e) { toast(e.message); }
      }));
      if (tab === "recycle") {
        const sel2 = new Set(), upd = () => { $("#rcN").textContent = sel2.size + " selected"; $("#rcGo").disabled = !sel2.size; };
        $$(".rcSel").forEach(c => c.addEventListener("change", () => { c.checked ? sel2.add(c.value) : sel2.delete(c.value); upd(); }));
        $("#rcAll").addEventListener("change", e => { $$(".rcSel").forEach(c => { c.checked = e.target.checked; c.checked ? sel2.add(c.value) : sel2.delete(c.value); }); upd(); });
        $("#rcGo").addEventListener("click", async () => { try { const x = await API.call("recycleLeads", [...sel2]); toast(x.recycled + " leads reopened and reassigned"); C.render(); } catch (e) { toast(e.message); } });
      }
    },
  };
})();
