/* Absel CRM — Dashboard, Reports & MIS */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, pct, fDate, fDT, ago, dur, minsTxt, isMgr, isMkt, isSales, canComm, salesUsers, stagePill, outcomeLabel, toast, sel, todayStr, bars, hbars, heat } = C;
  const meta = () => C.state.meta;

  /* ------------------------------------------------------- range bar */
  function monthStart(off = 0) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function monthEnd(off = 0) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off + 1); d.setDate(0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  const PRESETS = [["today", "Today", () => [todayStr(), todayStr()]], ["7d", "7 days", () => [todayStr(-6), todayStr()]], ["30d", "30 days", () => [todayStr(-29), todayStr()]], ["mtd", "This month", () => [monthStart(0), todayStr()]], ["lm", "Last month", () => [monthStart(-1), monthEnd(-1)]], ["90d", "90 days", () => [todayStr(-89), todayStr()]]];
  function filters(p) {
    const pr = PRESETS.find(x => x[0] === (p.range || "30d"));
    const [from, to] = p.range === "custom" ? [p.from || todayStr(-29), p.to || todayStr()] : (pr || PRESETS[2])[2]();
    return { from, to, agent: p.agent || "", source: p.source || "", country: p.country || "", group: p.group || "day", exclude_samples: p.samples === "hide" };
  }
  function rangeBar(path, p, o = {}) {
    const m = meta(), f = filters(p), range = p.range || "30d";
    return `<div class="c-filters">
      <div class="c-seg">${PRESETS.map(([k, lb]) => `<button data-range="${k}" class="${range === k ? "on" : ""}">${lb}</button>`).join("")}</div>
      <input class="c-in" type="date" id="rFrom" value="${f.from}" aria-label="From"><span class="muted">to</span><input class="c-in" type="date" id="rTo" value="${f.to}" aria-label="To">
      ${(isMgr() || (isMkt() && o.agentForMkt)) && o.agent !== false ? sel("agent", [["", "All agents"]].concat(salesUsers().map(u => [u.id, u.name])), p.agent || "", 'id="rAgent" aria-label="Agent"') : ""}
      ${o.source !== false ? sel("source", [["", "All sources"]].concat(m.sources), p.source || "", 'id="rSource" aria-label="Source"') : ""}
      ${o.country !== false ? sel("country", [["", "All countries"]].concat(m.countries), p.country || "", 'id="rCountry" aria-label="Country"') : ""}
      ${o.group ? sel("group", [["day", "By day"], ["week", "By week"], ["month", "By month"]], p.group || "day", 'id="rGroup" aria-label="Group by"') : ""}
      <span style="flex:1"></span>${o.exportBtn ? '<button class="c-btn" id="rExport">Export CSV</button>' : ""}
    </div>`;
  }
  function wireRange(path, p) {
    const go = patch => C.go(path, Object.assign({}, p, patch));
    $$("[data-range]").forEach(b => b.addEventListener("click", () => go({ range: b.dataset.range, from: "", to: "" })));
    ["rFrom", "rTo"].forEach(id => $("#" + id).addEventListener("change", () => go({ range: "custom", from: $("#rFrom").value, to: $("#rTo").value })));
    [["rAgent", "agent"], ["rSource", "source"], ["rCountry", "country"], ["rGroup", "group"]].forEach(([id, k]) => { const el = $("#" + id); if (el) el.addEventListener("change", () => go({ [k]: el.value })); });
  }
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const kpi = (label, val, sub, cls = "", go = "") => `<${go ? "button" : "div"} class="c-kpi ${cls}" ${go ? `data-go="${esc(go)}"` : ""}><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></${go ? "button" : "div"}>`;
  function wireGo(page) { $$("[data-go]", page).forEach(b => b.addEventListener("click", () => { const [path, qs] = b.dataset.go.split("?"); C.go(path, Object.fromEntries(new URLSearchParams(qs || ""))); })); }

  Object.assign(C, { rangeBar, wireRange, reportFilters: filters });
  /* -------------------------------------------------------- dashboard */
  C.views.dashboard = {
    title: "Sales dashboard",
    async render(page, r, alive) {
      const p = r.params, d = await API.call("report", "dashboard", filters(p)); if (!alive()) return;
      const k = d.kpis, mgr = isMgr();
      const ser = d.series.length > 62 ? d.series.filter((x, i) => i % Math.ceil(d.series.length / 62) === 0) : d.series;
      page.innerHTML = rangeBar("dashboard", p) + `
        <div class="c-kpis">
          ${kpi("New leads", num(k.leads), `${num(k.contacted)} called · ${pct(k.leads ? Math.round(k.contacted / k.leads * 100) : 0)}`)}
          ${kpi("Speed to lead", minsTxt(k.median_speed_min), `median · ${pct(k.within_sla)} within ${meta().settings.sla_minutes} min`, k.median_speed_min > meta().settings.sla_minutes ? "alert" : "good")}
          ${kpi("Calls", num(k.calls), `${num(k.connected_calls)} connected · ${k.talk_hours} h talk`)}
          ${kpi("Registered", num(k.registered_in_range), "accounts opened in period")}
          ${kpi("FTDs", num(k.funded_in_range), money(k.ftd_in_range) + " verified first deposits", "good", "reports/deposits")}
          ${kpi("Lead → FTD", pct(k.conversion), "of leads received in period")}
        </div>
        <div class="c-kpis">
          ${kpi("Never called", num(k.uncontacted_now), "open leads, right now", k.uncontacted_now ? "alert" : "", "leads?untouched=1")}
          ${kpi("Overdue follow-ups", num(k.overdue_now), "right now", k.overdue_now ? "alert" : "", mgr ? "tasks?status=overdue" : "tasks?status=overdue&owner=me")}
          ${mgr ? kpi("Unassigned", num(k.unassigned_now), "no territory matched", k.unassigned_now ? "alert" : "", "leads?owner=none") : ""}
          ${kpi("Hot leads", num(k.hot_now), "score 55+", "", "leads?temperature=hot")}
        </div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Leads and FTDs per day</h3>${bars(ser.map(x => ({ label: shortDay(x.d), title: fDate(x.d + "T12:00:00"), value: x.leads, value2: x.funded })), { name: "New leads", name2: "FTDs", label: "Leads and FTDs per day" })}</div>
          <div class="c-card"><h3>Calls per day</h3>${bars(ser.map(x => ({ label: shortDay(x.d), title: fDate(x.d + "T12:00:00"), value: x.calls })), { name: "Calls", label: "Calls per day" })}</div>
        </div>
        <div class="c-cols c3">
          <div class="c-card"><h3>Pipeline now <small>all leads</small></h3>${hbars(d.pipeline.filter(x => x.n).map(x => ({ k: x.k, label: x.label, n: x.n, color: `var(--s-${x.k})` })))}</div>
          <div class="c-card"><h3>Lead sources <small>in period</small></h3>${hbars(d.sources.map(x => ({ k: x.k, n: x.n, sub: x.funded + " FTD" })))}</div>
          ${mgr ? `<div class="c-card"><h3>Top agents <small>by FTDs</small></h3>${d.agents.length ? `<table class="c-table"><thead><tr><th>Agent</th><th class="r">Calls</th><th class="r">FTD</th><th class="r">Amount</th></tr></thead><tbody>${d.agents.map(a => `<tr><td>${esc(a.name)}</td><td class="num">${num(a.calls)}</td><td class="num">${num(a.funded)}</td><td class="num">${money(a.ftd_amount)}</td></tr>`).join("")}</tbody></table><p style="margin-top:10px"><a href="${C.href("reports/agents")}">Full agent report →</a></p>` : '<p class="muted">No agents yet.</p>'}</div>` : `<div class="c-card"><h3>Funnel <small>your leads</small></h3>${hbars([["Leads", k.leads], ["Called", k.contacted], ["Spoke", k.connected], ["Qualified", k.qualified], ["Registered", k.registered], ["Funded", k.funded]].map(([l, n]) => ({ k: l, n })))}</div>`}
        </div>`;
      wireRange("dashboard", p); wireGo(page);
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ---------------------------------------------------------- reports */
  // [id, label, who sees it]
  const ALL = () => true, MGR = () => isMgr() || C.isMktMgr() || (isMkt() && !isSales()), SALES = () => isSales(), SMGR = () => isMgr(), MKT = () => isMkt() || isMgr(), COMM = () => canComm() || isMkt();
  const TABS = [["funnel", "Funnel", ALL], ["deposits", "First deposits", ALL], ["journey", "Journey & $100", SALES], ["agents", "Agent performance", SALES], ["activity", "Agent activity", SALES], ["calls", "Call activity", SALES], ["qa", "Call quality", SALES], ["discovery", "Discovery & objections", SALES],
    ["campaigns", "Campaign ROI", MKT], ["quality", "Lead quality", MGR], ["sources", "Sources & campaigns", MGR], ["geo", "Geography & territories", MGR], ["lost", "Lost reasons", MGR], ["broadcasts", "Broadcasts", COMM], ["mis", "Daily MIS", ALL], ["automation", "Automation", COMM]];
  const metricCols = [["leads", "Leads"], ["contacted", "Called"], ["connected", "Spoke"], ["qualified", "Qualified"], ["registered", "Registered"], ["funded", "FTD"], ["ftd_amount", "FTD amount", money], ["conversion", "Lead→FTD", pct], ["median_speed_min", "Speed to lead", minsTxt]];
  function metricTable(rows, keyLabel, extra = []) {
    if (!rows.length) return '<div class="c-empty"><b>No data for this period</b></div>';
    const cols = extra.concat(metricCols);
    return `<div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>${esc(keyLabel)}</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.key)}</b>${r.agents ? `<small>${esc(r.agents)}</small>` : ""}</td>${cols.map(c => `<td class="num">${(c[2] || num)(r[c[0]])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  const metricCsv = (rows, keyLabel) => [[keyLabel].concat(metricCols.map(c => c[1])), rows.map(r => [r.key].concat(metricCols.map(c => r[c[0]])))];

  const RENDER = {
    journey(d) {
      const p = d.programme, max = Math.max(1, d.steps[0].n);
      const gt = (rows, label) => rows.length ? `<div class="c-scroll"><table class="c-table"><thead><tr><th>${esc(label)}</th><th class="r">Credited</th><th class="r">Converted</th><th class="r">Conversion</th><th class="r">Cost</th><th class="r">Cost per FTD</th><th class="r">FTD amount</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.k)}</b></td><td class="num">${num(r.credited)}</td><td class="num">${num(r.converted)}</td><td class="num">${pct(r.conversion)}</td><td class="num">${money(r.cost)}</td><td class="num">${r.cost_per_ftd == null ? "—" : money(r.cost_per_ftd)}</td><td class="num">${money(r.ftd_amount)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted" style="font-size:13px">No company-funded accounts in this period.</p>';
      return { html: `<div class="c-kpis">${kpi("Funded accounts credited", num(p.credited), `${num(p.requested)} requested · ${num(p.rejected)} rejected`)}${kpi("Converted to own deposit", num(p.converted), pct(p.conversion) + " of credited", "good")}${kpi("Programme cost", money(p.total_cost), `${money(p.issued_cost)} credited + ${money(p.profit_paid)} profit paid`)}${kpi("Cost per converted FTD", p.cost_per_ftd == null ? "–" : money(p.cost_per_ftd), money(p.ftd_amount) + " deposited by them")}${kpi("Days to convert", p.median_days == null ? "–" : p.median_days + " d", "median, credit → own deposit")}${kpi("Live now", num(p.active), `${num(p.traded)} traded · ${num(p.expired)} ended without deposit`, p.expired > p.converted ? "alert" : "")}</div>
        <div class="c-cols c2"><div class="c-card"><h3>Client journey <small>leads received in the period</small></h3><div class="c-funnel">${d.steps.map(s => `<div><span>${esc(s.label)}</span><span class="bar" style="width:${Math.max(1, s.n / max * 100)}%">${num(s.n)}</span><small>${s.of_total}%</small></div>`).join("")}</div><p class="muted" style="font-size:12px;margin-top:8px">Demo and the company-funded account are optional steps; the last line is the goal.</p></div>
        <div class="c-card"><h3>Does the journey help? <small>lead → own deposit</small></h3><table class="c-table"><thead><tr><th>Route</th><th class="r">Leads</th><th class="r">Funded</th><th class="r">Conversion</th><th class="r">FTD amount</th></tr></thead><tbody>${d.routes.map(r => `<tr><td><b>${esc(r.label)}</b></td><td class="num">${num(r.leads)}</td><td class="num">${num(r.funded)}</td><td class="num">${pct(r.conversion)}</td><td class="num">${money(r.ftd_amount)}</td></tr>`).join("")}</tbody></table><p class="muted" style="font-size:12px;margin-top:8px">Clients offered a demo or funded account are often already warmer, so compare with care.</p></div></div>
        <div class="c-cols c2"><div class="c-card"><h3>Funded accounts by agent</h3>${gt(d.by_agent, "Agent")}</div><div class="c-card"><h3>By country</h3>${gt(d.by_country, "Country")}</div></div>
        <div class="c-card"><h3>By source / campaign</h3>${gt(d.by_source, "Source / campaign")}</div>`,
        csv: [["Step", "Leads", "% of leads"], d.steps.map(s => [s.label, s.n, s.of_total])] };
    },
    funnel(d) {
      const max = Math.max(1, d.steps[0].n);
      return { html: `<div class="c-kpis">${kpi("Leads", num(d.metrics.leads))}${kpi("Spoke to client", pct(d.metrics.leads ? Math.round(d.metrics.connected / d.metrics.leads * 100) : 0))}${kpi("Lead → registered", pct(d.metrics.leads ? Math.round(d.metrics.registered / d.metrics.leads * 1000) / 10 : 0))}${kpi("Lead → FTD", pct(d.metrics.conversion), money(d.metrics.ftd_amount), "good")}${kpi("Speed to lead", minsTxt(d.metrics.median_speed_min), pct(d.metrics.within_sla) + " within SLA")}</div>
        <div class="c-card"><h3>Conversion funnel <small>leads received in the period and how far they got</small></h3><div class="c-funnel">${d.steps.map(s => `<div><span>${esc(s.label)}</span><span class="bar" style="width:${Math.max(1, s.n / max * 100)}%">${num(s.n)}</span><small>${s.of_total}% · step ${s.of_prev}%</small></div>`).join("")}</div></div>`,
        csv: [["Step", "Leads", "% of total", "% of previous step"], d.steps.map(s => [s.label, s.n, s.of_total, s.of_prev])] };
    },
    agents(d) {
      const cols = [["assigned", "Leads"], ["open_leads", "Open"], ["contacted_pct", "Called %", pct], ["calls", "Calls"], ["calls_per_day", "Calls/day"], ["connected", "Connected"], ["connect_rate", "Connect %", pct], ["talk_min", "Talk min"], ["avg_call_sec", "Avg call", dur], ["median_speed_min", "Speed to lead", minsTxt], ["tasks_done", "Follow-ups done"], ["overdue_now", "Overdue now"], ["registered", "Registered"], ["funded", "FTD"], ["ftd_amount", "FTD amount", money], ["conversion", "Lead→FTD", pct]];
      const top = d.rows.filter(r => r.funded || r.calls);
      return { html: `<div class="c-cols c2"><div class="c-card"><h3>FTD leaderboard</h3>${hbars(top.map(r => ({ k: r.name, n: r.funded, sub: money(r.ftd_amount), color: "var(--up)" })))}</div><div class="c-card"><h3>Calls and connect rate</h3>${hbars(top.slice().sort((a, b) => b.calls - a.calls).map(r => ({ k: r.name, n: r.calls, sub: r.connect_rate + "% connected" })))}</div></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1400px"><thead><tr><th>Agent</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join("")}<th>Monthly FTD target</th></tr></thead><tbody>${d.rows.map(r => `<tr><td style="white-space:nowrap"><b>${esc(r.name)}</b><small>${esc(r.team || r.role)}${r.active ? "" : " · inactive"}</small></td>${cols.map(c => `<td class="num ${c[0] === "overdue_now" && r.overdue_now ? "c-wait late" : ""}">${(c[2] || num)(r[c[0]])}</td>`).join("")}<td>${r.target_ftd ? `<div class="c-row" style="gap:6px;flex-wrap:nowrap"><div class="c-progress" style="flex:1"><i style="width:${Math.min(100, r.target_pct)}%"></i></div><span class="mono" style="font-size:12px">${r.funded}/${r.target_ftd}</span></div>` : '<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>${d.rows.length ? "" : '<div class="c-empty"><b>No agents yet</b></div>'}</div>`,
        csv: [["Agent", "Team"].concat(cols.map(c => c[1])).concat(["Target FTD"]), d.rows.map(r => [r.name, r.team].concat(cols.map(c => r[c[0]])).concat([r.target_ftd]))] };
    },
    sources(d) {
      return { html: `<div class="c-card"><h3>Leads and FTDs by source</h3>${hbars(d.sources.map(s => ({ k: s.key, n: s.leads, sub: s.funded + " FTD · " + s.conversion + "%" })))}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By source</h3>${metricTable(d.sources, "Source")}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By campaign</h3>${metricTable(d.campaigns, "Source / campaign")}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By product interest</h3>${metricTable(d.interests, "Interest")}</div>`,
        csv: metricCsv(d.campaigns, "Source / campaign") };
    },
    geo(d) {
      return { html: `<div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Territories</h3>${metricTable(d.territories, "Territory")}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Countries</h3>${metricTable(d.countries, "Country")}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Cities</h3>${metricTable(d.cities, "City")}</div>`,
        csv: metricCsv(d.countries.concat(d.cities), "Country / city") };
    },
    calls(d) {
      const ser = d.daily;
      return { html: `<div class="c-kpis">${kpi("Calls", num(d.total))}${kpi("Connected", num(d.connected), pct(d.connect_rate) + " connect rate")}${kpi("Average conversation", dur(d.avg_talk_sec))}</div>
        <div class="c-cols c2"><div class="c-card"><h3>Call outcomes</h3>${hbars(d.outcomes.filter(o => o.n).map(o => ({ k: o.label, n: o.n, color: o.connected ? "var(--up)" : "var(--muted)" })))}</div>
        <div class="c-card"><h3>Calls and connections per day</h3>${bars(ser.map(x => ({ label: shortDay(x.d), title: fDate(x.d + "T12:00:00"), value: x.calls, value2: x.connected })), { name: "Calls", name2: "Connected" })}</div></div>
        <div class="c-cols c2"><div class="c-card"><h3>When calls happen <small>company time · darker = more</small></h3>${heat(d.heat)}</div><div class="c-card"><h3>When clients pick up <small>connected calls</small></h3>${heat(d.heat_connected)}</div></div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Latest calls</h3><div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>When</th><th>Agent</th><th>Lead</th><th>Outcome</th><th class="r">Length</th><th>Notes</th></tr></thead><tbody>${d.recent.map(c => `<tr class="click" data-lead="${esc(c.lead && c.lead.id)}"><td class="mono">${fDT(c.at)}</td><td>${esc(c.agent)}</td><td>${esc(c.lead ? c.lead.name : "")}<small>${esc(c.lead ? c.lead.country : "")}</small></td><td>${esc(outcomeLabel(c.outcome))}</td><td class="num">${dur(c.duration_sec)}</td><td style="max-width:360px">${esc(c.notes || "")}</td></tr>`).join("")}</tbody></table></div></div>`,
        csv: [["Date", "Calls", "Connected", "Talk minutes"], d.daily.map(x => [x.d, x.calls, x.connected, x.talk_min])] };
    },
    discovery(d) {
      return { html: `<div class="c-cols c2"><div class="c-card"><h3>Concerns clients raise <small>and how often those leads still funded</small></h3>${hbars(d.objections.map(o => ({ k: o.k, n: o.n, sub: o.converted_pct + "% funded", color: "var(--warn)" })))}</div>
        <div class="c-card"><h3>Capital clients plan to invest</h3>${hbars(d.capital)}</div></div>
        <div class="c-cols c3"><div class="c-card"><h3>Markets they want</h3>${hbars(d.instruments)}</div><div class="c-card"><h3>When they plan to start</h3>${hbars(d.timeline)}</div><div class="c-card"><h3>Account type wanted</h3>${hbars(d.account_type)}</div></div>
        <div class="c-cols c2"><div class="c-card"><h3>Current broker <small>who you're competing with</small></h3>${hbars(d.brokers)}</div><div class="c-card"><h3>Trading experience</h3>${hbars(d.experience)}</div></div>
        <div class="c-card"><h3>What clients asked <small>latest</small></h3>${d.questions.length ? `<ul class="c-tl">${d.questions.map(q => `<li><span class="ic note">${C.ICONS.msg}</span><div><div class="hd"><b>${esc(q.lead ? q.lead.name : "")}</b> · ${esc(q.agent)}<small> · ${ago(q.at)}</small></div><div class="bd">${esc(q.text)}</div></div></li>`).join("")}</ul>` : '<p class="muted">Agents record client questions in the call form.</p>'}</div>`,
        csv: [["Concern", "Times raised", "% of those leads funded"], d.objections.map(o => [o.k, o.n, o.converted_pct])] };
    },
    lost(d) {
      return { html: `<div class="c-kpis">${kpi("Lost in period", num(d.total))}${kpi("Invalid (all time)", num(d.invalid))}</div><div class="c-cols c2"><div class="c-card"><h3>Why leads were lost</h3>${hbars(d.reasons.map(x => ({ k: x.k, n: x.n, color: "var(--s-lost)" })))}</div><div class="c-card"><h3>Lost by owner</h3>${hbars(d.by_agent)}</div></div>`,
        csv: [["Reason", "Leads"], d.reasons.map(x => [x.k, x.n])] };
    },
    mis(d) {
      const cols = [["new_leads", "New leads"], ["contacted", "First calls"], ["calls", "Calls"], ["connected", "Connected"], ["talk_min", "Talk min"], ["qualified", "Qualified"], ["registered", "Registered"], ["funded", "FTD"], ["ftd_amount", "FTD amount", money], ["messages", "Messages sent"]];
      const lab = k => d.group === "month" ? new Date(k + "-01T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }) : d.group === "week" ? "Week of " + fDate(k + "T12:00:00") : new Date(k + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
      return { html: `<div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1000px"><thead><tr><th>Period</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join("")}<th class="r">Connect %</th></tr></thead><tbody>${d.rows.slice().reverse().map(r => `<tr><td>${esc(lab(r.period))}</td>${cols.map(c => `<td class="num">${(c[2] || num)(r[c[0]])}</td>`).join("")}<td class="num">${pct(r.calls ? Math.round(r.connected / r.calls * 100) : 0)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td>${cols.map(c => `<td class="num">${(c[2] || num)(d.total[c[0]])}</td>`).join("")}<td class="num">${pct(d.total.calls ? Math.round(d.total.connected / d.total.calls * 100) : 0)}</td></tr></tfoot></table></div></div>`,
        csv: [["Period"].concat(cols.map(c => c[1])), d.rows.map(r => [r.period].concat(cols.map(c => r[c[0]]))).concat([["Total"].concat(cols.map(c => d.total[c[0]]))])] };
    },
    deposits(d) {
      const tbl = (rows, label) => rows.length ? `<table class="c-table"><thead><tr><th>${label}</th><th class="r">FTDs</th><th class="r">Amount</th><th class="r">Average</th></tr></thead><tbody>${rows.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="num">${num(x.n)}</td><td class="num">${money(x.amount)}</td><td class="num">${money(x.avg)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No verified deposits in this period.</p>';
      const ser = d.daily.length > 62 ? d.daily.filter((x, i) => i % Math.ceil(d.daily.length / 62) === 0) : d.daily;
      return { html: `<div class="c-kpis">${kpi("Verified FTDs", num(d.count), money(d.amount), "good")}${kpi("Average first deposit", money(d.avg))}${kpi("Lead → FTD", pct(d.conversion), `${d.cohort_funded} of ${d.cohort_leads} leads received in period`)}${kpi("Days from lead to FTD", d.median_days == null ? "–" : d.median_days + " d", "median · average " + (d.avg_days == null ? "–" : d.avg_days + " d"))}${kpi("Waiting verification", num(d.pending), money(d.pending_amount), d.pending ? "alert" : "")}${kpi("Rejected", num(d.rejected), "in period")}</div>
        <div class="c-cols c2"><div class="c-card"><h3>FTDs per day</h3>${bars(ser.map(x => ({ label: shortDay(x.d), title: fDate(x.d + "T12:00:00"), value: x.n })), { name: "FTDs", label: "FTDs per day" })}</div><div class="c-card"><h3>Deposit size</h3>${hbars(d.buckets.map(b => ({ k: b.k, n: b.n, color: "var(--up)" })))}<h3 style="margin-top:14px">Method</h3>${hbars(d.by_method.map(x => ({ k: x.k, n: x.n, sub: money(x.amount) })))}</div></div>
        <div class="c-cols c2"><div class="c-card"><h3>By agent</h3>${tbl(d.by_agent, "Agent")}</div><div class="c-card"><h3>By desk</h3>${tbl(d.by_team, "Desk")}</div></div>
        <div class="c-cols c2"><div class="c-card"><h3>By source</h3>${tbl(d.by_source, "Source")}</div><div class="c-card"><h3>By campaign</h3>${tbl(d.by_campaign.slice(0, 15), "Source / campaign")}</div></div>
        <div class="c-cols c2"><div class="c-card"><h3>By country</h3>${tbl(d.by_country, "Country")}</div><div class="c-card"><h3>By city</h3>${tbl(d.by_city, "City")}</div></div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Verified first deposits</h3><div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>Deposit date</th><th>Client</th><th class="r">Amount</th><th>Method</th><th>Agent</th><th>Source / campaign</th><th>Verified by</th></tr></thead><tbody>${d.rows.map(x => `<tr class="click" data-lead="${esc(x.lead_id)}"><td class="mono">${fDate(x.deposited_at)}</td><td>${esc(x.lead ? x.lead.name : "")}<small>${esc(x.lead ? x.lead.country : "")}</small></td><td class="num">${money(x.amount)}</td><td>${esc(x.method || "—")}</td><td>${esc(x.owner_name)}</td><td>${esc(x.source)}<small>${esc(x.campaign)}</small></td><td>${esc(x.verified_by_name)}</td></tr>`).join("")}</tbody></table></div></div>`,
        csv: [["Deposit date", "Reference", "Client", "Country", "Amount", "Method", "Tx ref", "Agent", "Source", "Campaign", "Verified by"], d.rows.map(x => [x.deposited_at.slice(0, 10), x.lead ? x.lead.reference : "", x.lead ? x.lead.name : "", x.lead ? x.lead.country : "", x.amount, x.method, x.tx_ref, x.owner_name, x.source, x.campaign, x.verified_by_name])] };
    },
    qa(d) {
      return { html: `<div class="c-kpis">${kpi("Calls reviewed", num(d.count))}${kpi("Average score", d.avg == null ? "–" : d.avg + "%")}${kpi("Compliance issues", num(d.compliance_fails), "", d.compliance_fails ? "alert" : "good")}</div><div class="c-cols c2"><div class="c-card"><h3>Average by skill <small>1–5</small></h3>${hbars(d.criteria.filter(c => c.avg != null).map(c => ({ k: c.label, n: c.avg })))}</div><div class="c-card"><h3>By agent</h3><table class="c-table"><thead><tr><th>Agent</th><th class="r">Reviews</th><th class="r">Average</th><th class="r">Compliance</th><th>Coach on</th></tr></thead><tbody>${d.agents.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="num">${a.reviews}</td><td class="num">${a.avg}%</td><td class="num">${a.compliance_fails || "—"}</td><td>${esc(a.weakest)}</td></tr>`).join("")}</tbody></table></div></div>`,
        csv: [["Agent", "Reviews", "Average %", "Compliance issues", "Weakest skill"], d.agents.map(a => [a.name, a.reviews, a.avg, a.compliance_fails, a.weakest])] };
    },
    activity(d) {
      const hm = iso => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "–");
      return { html: `<p class="muted" style="font-size:13px">Online time counts while the CRM is open (checked every 30 seconds). Idle = online minus talk time minus breaks. Calls per hour use online hours.</p>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>Agent</th><th class="r">Days</th><th class="r">Online h</th><th class="r">Break h</th><th class="r">Calls</th><th class="r">Calls / hour</th><th class="r">Talk h</th><th class="r">Talk % of online</th><th>Typical start</th></tr></thead><tbody>${d.agents.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="num">${a.days}</td><td class="num">${a.online_h}</td><td class="num">${a.break_h}</td><td class="num">${num(a.calls)}</td><td class="num">${a.calls_per_hour == null ? "–" : a.calls_per_hour}</td><td class="num">${a.talk_h}</td><td class="num">${a.talk_pct == null ? "–" : a.talk_pct + "%"}</td><td class="mono">${hm(a.avg_start)}</td></tr>`).join("")}</tbody></table></div>${d.agents.length ? "" : '<div class="c-empty"><b>No activity yet</b></div>'}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Day by day</h3><div class="c-scroll"><table class="c-table" style="min-width:1000px"><thead><tr><th>Day</th><th>Agent</th><th>First seen</th><th>Last seen</th><th class="r">Online</th><th class="r">Breaks</th><th class="r">Calls</th><th class="r">Talk</th><th class="r">Idle</th><th class="r">Calls / hour</th></tr></thead><tbody>${d.rows.slice(0, 300).map(x => `<tr><td class="mono">${esc(x.day)}</td><td>${esc(x.name)}</td><td class="mono">${hm(x.first_at)}</td><td class="mono">${hm(x.last_at)}</td><td class="num">${minsTxt(x.online_min)}</td><td class="num">${minsTxt(x.break_min)}</td><td class="num">${x.calls}</td><td class="num">${minsTxt(x.talk_min)}</td><td class="num">${minsTxt(x.idle_min)}</td><td class="num">${x.calls_per_hour == null ? "–" : x.calls_per_hour}</td></tr>`).join("")}</tbody></table></div></div>`,
        csv: [["Day", "Agent", "First seen", "Last seen", "Online min", "Break min", "Calls", "Connected", "Talk min", "Idle min", "Calls per hour"], d.rows.map(x => [x.day, x.name, x.first_at, x.last_at, x.online_min, x.break_min, x.calls, x.connected, x.talk_min, x.idle_min, x.calls_per_hour])] };
    },
    campaigns(d) {
      const t = d.total, cols = [["spend", "Spend", money], ["leads", "Leads"], ["cpl", "CPL", v => v == null ? "–" : "$" + v], ["connected_pct", "Reached", pct], ["invalid_pct", "Invalid", pct], ["registered", "Registered"], ["funded", "FTD"], ["ftd_amount", "FTD amount", money], ["cost_per_ftd", "Cost / FTD", v => v == null ? "–" : money(v)], ["roas", "Deposits per $1", v => v == null ? "–" : v.toFixed(2)]];
      const tbl = (rows, label) => `<div class="c-scroll"><table class="c-table" style="min-width:1000px"><thead><tr><th>${label}</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.key)}</b>${r.channel ? `<small>${esc(r.channel)}</small>` : ""}</td>${cols.map(c => `<td class="num">${(c[2] || num)(r[c[0]])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      return { html: `<div class="c-kpis">${kpi("Spend", money(t.spend))}${kpi("Leads", num(t.leads))}${kpi("Cost per lead", t.cpl == null ? "–" : "$" + t.cpl)}${kpi("FTDs", num(t.funded), money(t.ftd_amount), "good")}${kpi("Cost per FTD", t.cost_per_ftd == null ? "–" : money(t.cost_per_ftd))}${kpi("Deposits per $1", t.roas == null ? "–" : "$" + t.roas.toFixed(2))}</div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Campaigns</h3>${tbl(d.rows, "Campaign")}</div>${d.untracked.length ? `<div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Not linked to a campaign</h3>${tbl(d.untracked, "Source / campaign")}</div>` : ""}<p class="muted" style="font-size:12px">Leads and their FTDs are counted for leads received in the period; spend is the spend logged for those days. Deposits per $1 compares first deposits with ad spend; it isn't revenue.</p>`,
        csv: [["Campaign"].concat(cols.map(c => c[1])), d.rows.concat(d.untracked).map(r => [r.key].concat(cols.map(c => r[c[0]])))] };
    },
    quality(d) {
      const cols = [["leads", "Leads", num], ["connected_pct", "Reached", pct], ["unreached_pct", "Never reached (3+ tries)", pct], ["invalid_pct", "Invalid", pct], ["duplicate_pct", "Repeat", pct], ["qualified_pct", "Qualified", pct], ["funded_pct", "FTD", pct], ["avg_score", "Avg score", num]];
      const tbl = (rows, label) => `<div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>${label}</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join("")}<th>Top lost reason</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.key)}</b></td>${cols.map(c => `<td class="num">${c[2](r[c[0]])}</td>`).join("")}<td>${esc(r.top_lost || "")}</td></tr>`).join("")}</tbody></table></div>`;
      return { html: `<p class="muted" style="font-size:13px">How good each source's leads are once sales calls them. High “never reached” or “invalid” means fake numbers or poor targeting.</p><div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By source</h3>${tbl(d.sources, "Source")}</div><div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By campaign</h3>${tbl(d.campaigns, "Source / campaign")}</div><div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">By country</h3>${tbl(d.countries, "Country")}</div>`,
        csv: [["Source"].concat(cols.map(c => c[1])), d.sources.map(r => [r.key].concat(cols.map(c => r[c[0]])))] };
    },
    broadcasts(d) {
      return { html: `<div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>Broadcast</th><th>Channel</th><th class="r">Audience</th><th class="r">Sent</th><th class="r">Read</th><th class="r">Replies</th><th class="r">Registered</th><th class="r">Funded</th><th class="r">Opt-outs</th></tr></thead><tbody>${d.rows.map(b => `<tr><td><b>${esc(b.name)}</b><small>${esc(b.status)} · ${fDT(b.started_at || b.created_at)}</small></td><td>${b.channel}</td><td class="num">${num(b.total || 0)}</td><td class="num">${num(b.stats.sent)}</td><td class="num">${num(b.stats.read)}</td><td class="num">${num(b.stats.replies)}</td><td class="num">${num(b.stats.registered)}</td><td class="num">${num(b.stats.funded)}</td><td class="num">${num(b.stats.unsubscribed)}</td></tr>`).join("")}</tbody></table></div>${d.rows.length ? "" : '<div class="c-empty"><b>No broadcasts in this period</b></div>'}</div>`,
        csv: [["Broadcast", "Channel", "Status", "Audience", "Sent", "Read", "Replies", "Registered", "Funded", "Opt-outs"], d.rows.map(b => [b.name, b.channel, b.status, b.total, b.stats.sent, b.stats.read, b.stats.replies, b.stats.registered, b.stats.funded, b.stats.unsubscribed])] };
    },
    automation(d) {
      return { html: `<div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:800px"><thead><tr><th>Automation</th><th class="r">Triggered</th><th class="r">Ran</th><th class="r">Skipped</th><th class="r">Waiting</th><th class="r">Messages sent</th><th class="r">Failed / blocked</th></tr></thead><tbody>${d.rules.map(r => `<tr><td><b>${esc(r.name)}</b><small>${r.active ? "On" : "Off"}</small></td><td class="num">${num(r.scheduled)}</td><td class="num">${num(r.done)}</td><td class="num">${num(r.skipped)}</td><td class="num">${num(r.pending)}</td><td class="num">${num(r.sent)}</td><td class="num">${num(r.failed)}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table"><thead><tr><th>Channel</th><th class="r">Outgoing</th><th class="r">Sent</th><th class="r">Delivered</th><th class="r">Read</th><th class="r">Failed / blocked</th><th class="r">Replies</th></tr></thead><tbody>${d.channels.map(c => `<tr><td><b>${c.k === "email" ? "Email" : "WhatsApp"}</b></td><td class="num">${num(c.total)}</td><td class="num">${num(c.sent)}</td><td class="num">${num(c.delivered)}</td><td class="num">${num(c.read)}</td><td class="num">${num(c.failed)}</td><td class="num">${num(c.replies)}</td></tr>`).join("")}</tbody></table></div></div>`,
        csv: [["Automation", "Triggered", "Ran", "Skipped", "Waiting", "Sent", "Failed"], d.rules.map(r => [r.name, r.scheduled, r.done, r.skipped, r.pending, r.sent, r.failed])] };
    },
  };

  C.views.reports = {
    title: "Reports & MIS",
    async render(page, r, alive) {
      const tabs = TABS.filter(t => t[2]()), type = tabs.some(t => t[0] === r.id) ? r.id : "funnel", p = r.params;
      const d = await API.call("report", type, filters(p)); if (!alive()) return;
      const out = RENDER[type](d);
      page.innerHTML = `<nav class="c-tabs">${tabs.map(([k, lb]) => `<a href="${C.href("reports/" + k)}" class="${k === type ? "on" : ""}">${lb}</a>`).join("")}</nav>${rangeBar("reports/" + type, p, { group: type === "mis", agent: !["automation", "campaigns", "broadcasts", "quality"].includes(type), agentForMkt: type === "deposits", exportBtn: true })}${out.html}<p class="muted" style="font-size:12px">Period ${fDate(d.range.from + "T12:00:00")} – ${fDate(d.range.to + "T12:00:00")}, company time. Lead counts use the date the lead arrived; calls, registrations and FTDs use the date they happened.</p>`;
      wireRange("reports/" + type, p);
      $("#rExport").addEventListener("click", () => C.downloadCsv("absel-" + type, out.csv[0], out.csv[1]));
      $$("tr[data-lead]").forEach(tr => tr.addEventListener("click", () => tr.dataset.lead && C.go("lead/" + tr.dataset.lead)));
    },
  };
})();
