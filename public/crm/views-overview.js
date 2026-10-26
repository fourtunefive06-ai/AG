/* Absel back office — Business overview (whole brokerage), Client journey (lifecycle work lists), Trading accounts */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, pct, fDate, fDT, ago, isMgr, isAdmin, isSales, isOps, isKyc, salesUsers, stagePill, toast, sel, bars, hbars, confirmBox } = C;
  const meta = () => C.state.meta;
  const kpi = (label, val, sub, cls = "", go = "") => `<${go ? "a" : "div"} class="c-kpi ${cls}" ${go ? `href="${C.href(go)}" style="text-decoration:none"` : ""}><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></${go ? "a" : "div"}>`;
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const LCC = { lead: "var(--s-contacted)", onboarding: "var(--s-registered)", conversion: "var(--s-kyc)", client: "var(--up)", closed: "var(--s-lost)" };
  C.lifecyclePill = lc => lc ? `<span class="c-pill plain" style="--c:${LCC[(meta().lifecycle.find(x => x.id === lc.id || x.id === lc) || {}).group] || "var(--muted)"}">${esc(lc.label || (meta().lifecycle.find(x => x.id === lc) || {}).label || lc)}</span>` : "";

  /* ============================================================ BUSINESS OVERVIEW */
  C.views.overview = {
    title: "Business overview",
    async render(page, r, alive) {
      const p = r.params, [d, pay] = await Promise.all([API.call("report", "business", C.reportFilters(p)), API.call("report", "payments", C.reportFilters(p)).catch(() => null)]); if (!alive()) return;
      const k = d.kpi, q = d.queues, b = d.base;
      const ser = d.trend.length > 62 ? d.trend.filter((x, i) => i % Math.ceil(d.trend.length / 62) === 0) : d.trend;
      const max = Math.max(1, d.steps[0].n);
      page.innerHTML = C.rangeBar("overview", p) + `
        <div class="c-kpis">
          ${kpi("New leads", num(k.leads), "received in period", "", "leads")}
          ${kpi("Client-area sign-ups", num(k.registrations), `${num(k.kyc_approved)} KYC approved`, "", "clients")}
          ${kpi("Accounts opened", num(k.accounts_opened), "live MT5 accounts", "", "trading")}
          ${kpi("First deposits (FTD)", num(k.ftd), money(k.ftd_amount), "good", "reports/deposits")}
          ${kpi("Lead → FTD", pct(k.conversion), "of leads received in period")}
        </div>
        <div class="c-kpis">
          ${kpi("Deposits", money(k.deposit_amount), `${num(k.deposits)} client-area deposits${k.redeposits ? " · " + num(k.redeposits) + " repeat" : ""}`, "good", "money?type=deposit&status=completed")}
          ${kpi("Withdrawals", money(k.withdrawal_amount), num(k.withdrawals) + " paid", "", "money?type=withdrawal&status=completed")}
          ${kpi("Net deposits", money(k.net), "deposits − withdrawals", k.net < 0 ? "alert" : "")}
          ${kpi("Active traders", num(k.active_traders), "traded or deposited recently", "", "lifecycle?segment=active")}
          ${kpi("Client balances", money(b.balance), `${num(b.live_accounts)} live accounts · equity ${money(b.equity)}`, "", "trading")}
        </div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Customer journey <small>leads received in the period, by the furthest step reached</small></h3><div class="c-funnel">${d.steps.map(s => `<div><span>${esc(s.label)}</span><span class="bar" style="width:${Math.max(1, s.n / max * 100)}%">${num(s.n)}</span><small>${s.of_total}%</small></div>`).join("")}</div></div>
          <div class="c-card"><h3>Needs attention now <small>whole client book</small></h3>
            <div class="c-attn">${d.segments.map(s => `<a href="${C.href("lifecycle?segment=" + s.id)}" class="${s.id === "active" ? "good" : s.n ? "" : "zero"}"><b class="mono">${num(s.n)}</b><span>${esc(s.label)}</span></a>`).join("")}</div>
            <h3 style="margin-top:16px">Operations queues</h3>
            <div class="c-attn">${[["KYC to review", q.kyc, "kyc"], ["Accounts to open", q.accounts, "openacc"], ["Deposits to confirm", q.deposits, "money?type=deposit"], ["Withdrawals " + (q.withdrawal_amount ? money(q.withdrawal_amount) : ""), q.withdrawals, "money?type=withdrawal"], ["FTDs to verify", q.ftd_verify, "deposits"], ["New leads waiting", q.new_waiting, "leads?untouched=1"], ["Overdue follow-ups", q.overdue_tasks, "tasks?status=overdue"], ["Unassigned leads", q.unassigned, "leads?owner=none"]].map(([l, n, go]) => `<a href="${C.href(go)}" class="${n ? "warn" : "zero"}"><b class="mono">${num(n)}</b><span>${esc(l)}</span></a>`).join("")}</div></div>
        </div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Leads and sign-ups per day</h3>${bars(ser.map(x => ({ label: shortDay(x.day), title: fDate(x.day + "T12:00:00"), value: x.leads, value2: x.registrations })), { name: "New leads", name2: "Client-area sign-ups", label: "Leads and sign-ups per day" })}</div>
          <div class="c-card"><h3>Money in and out per day</h3>${bars(ser.map(x => ({ label: shortDay(x.day), title: fDate(x.day + "T12:00:00"), value: x.deposits, value2: x.withdrawals })), { name: "Deposits", name2: "Withdrawals", label: "Deposits and withdrawals per day", fmt: v => "$" + (v >= 1000 ? Math.round(v / 1000) + "k" : v) })}</div>
        </div>
        ${C.paymentsCard(pay)}
        <div class="c-cols c2">
          <div class="c-card"><h3>Client book by stage <small>everyone, right now</small></h3>${hbars(d.book.filter(x => x.n).map(x => ({ k: x.id, label: x.label, n: x.n, color: LCC[x.group] })))}</div>
          <div class="c-card"><h3>Client base</h3><dl class="c-dl"><dt>Client-area accounts</dt><dd class="mono">${num(b.clients)}</dd><dt>Funded clients</dt><dd class="mono">${num(b.funded_clients)}</dd><dt>Live MT5 accounts</dt><dd class="mono">${num(b.live_accounts)}</dd><dt>Balance / equity</dt><dd class="mono">${money(b.balance)} / ${money(b.equity)}</dd><dt>Deposits, all time</dt><dd class="mono">${money(b.deposits_all)}</dd><dt>Withdrawals, all time</dt><dd class="mono">${money(b.withdrawals_all)}</dd><dt>New leads today</dt><dd class="mono">${num(b.today_leads)}</dd></dl>
            <p class="muted" style="font-size:12px;margin-top:8px">Balances come from the daily trading-data import. Deposits and withdrawals here are client-area money; FTDs also include deposits recorded by sales.</p></div>
        </div>
        <div class="c-cols c2">
          <div class="c-card"><h3>By source <small>leads received in period</small></h3>${d.sources.length ? `<div class="c-scroll"><table class="c-table"><thead><tr><th>Source</th><th class="r">Leads</th><th class="r">Signed up</th><th class="r">FTD</th><th class="r">FTD amount</th><th class="r">Conversion</th></tr></thead><tbody>${d.sources.slice(0, 12).map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="num">${num(x.leads)}</td><td class="num">${num(x.registered)}</td><td class="num">${num(x.ftd)}</td><td class="num">${money(x.ftd_amount)}</td><td class="num">${pct(x.conversion)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No leads in this period.</p>'}</div>
          <div class="c-card"><h3>Top agents <small>by FTD amount</small></h3>${d.agents.length ? `<div class="c-scroll"><table class="c-table"><thead><tr><th>Agent</th><th class="r">Leads</th><th class="r">FTD</th><th class="r">Amount</th><th class="r">Conversion</th></tr></thead><tbody>${d.agents.map(a => `<tr><td>${esc(a.name)}</td><td class="num">${num(a.leads)}</td><td class="num">${num(a.ftd)}</td><td class="num">${money(a.ftd_amount)}</td><td class="num">${pct(a.conversion)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No sales activity in this period.</p>'}</div>
        </div>`;
      C.wireRange("overview", p);
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };


  /* ============================================================ PAYMENT PERFORMANCE */
  const OC = { credited: "var(--up)", received: "var(--s-qualified)", open: "var(--s-new)", review: "var(--warn)", declined: "var(--down)", abandoned: "var(--s-lost)", cancelled: "var(--s-invalid)", error: "var(--s-attempting)", rejected: "var(--brand-deep)" };
  const PROV = { manual: "Manual", b2binpay: "B2BINPAY", cyrafa: "CyrafaPay" };
  const rate = v => v == null ? '<span class="muted">—</span>' : `<b style="color:${v >= 75 ? "var(--up)" : v >= 50 ? "var(--warn)" : "var(--down)"}">${pct(v)}</b>`;
  const mins = v => v == null ? "—" : v < 60 ? v + " min" : Math.round(v / 6) / 10 + " h";
  const hrs = v => v == null ? "—" : v < 1 ? Math.round(v * 60) + " min" : v < 48 ? v + " h" : Math.round(v / 24) + " days";
  const stack = (by, outcomes) => { const t = outcomes.reduce((a, o) => a + (by[o.id] || 0), 0) || 1; return `<div class="c-stack">${outcomes.filter(o => by[o.id]).map(o => `<i style="width:${by[o.id] / t * 100}%;background:${OC[o.id]}" title="${esc(o.label)}: ${num(by[o.id])}"></i>`).join("")}</div>`; };
  const legend = outcomes => `<div class="c-legend" style="flex-wrap:wrap">${outcomes.map(o => `<span><i style="background:${OC[o.id]}"></i>${esc(o.label)}</span>`).join("")}</div>`;
  C.paymentsCard = d => d && d.total.attempts ? `<div class="c-card"><h3>Deposit success by method <small>attempts started in the period · <a href="${C.href("payperf")}">Payment performance →</a></small></h3>
      <div class="c-scroll"><table class="c-table"><thead><tr><th>Method</th><th class="r">Attempts</th><th class="r">Success</th><th style="min-width:140px">Outcomes</th><th class="r">Received</th></tr></thead><tbody>
      ${d.by_method.map(m => `<tr><td><b>${esc(m.name)}</b></td><td class="num">${num(m.attempts)}</td><td class="num">${rate(m.success_rate)}</td><td>${stack(m.by, d.outcomes)}</td><td class="num">${money(m.ok_amount)}</td></tr>`).join("")}
      <tr><td><b>All methods</b></td><td class="num"><b>${num(d.total.attempts)}</b></td><td class="num">${rate(d.total.success_rate)}</td><td>${stack(d.total.by, d.outcomes)}</td><td class="num"><b>${money(d.total.ok_amount)}</b></td></tr></tbody></table></div>
      ${d.recovery.lost_clients ? `<p class="muted" style="font-size:12.5px;margin-top:8px">${num(d.recovery.lost_clients)} client${d.recovery.lost_clients === 1 ? "" : "s"} tried to deposit, failed and haven't paid since (about ${money(d.recovery.lost_amount)}). <a href="${C.href("payperf")}">See why</a></p>` : ""}</div>` : "";

  C.views.payperf = {
    title: "Payment performance",
    async render(page, r, alive) {
      const p = r.params, d = await API.call("report", "payments", C.reportFilters(p)); if (!alive()) return;
      const t = d.total, rc = d.recovery, w = d.withdrawals, nw = d.now, max = Math.max(1, d.funnel[0].n);
      const ser = d.trend.length > 62 ? d.trend.filter((x, i) => i % Math.ceil(d.trend.length / 62) === 0) : d.trend;
      const cmp = (label, a) => `<tr><td>${esc(label)}</td><td class="num">${num(a.attempts)}</td><td class="num">${rate(a.success_rate)}</td><td class="num">${a.avg_ticket == null ? "—" : money(a.avg_ticket)}</td><td class="num">${money(a.ok_amount)}</td></tr>`;
      page.innerHTML = C.rangeBar("payperf", p) + `
        <div class="c-kpis">
          ${kpi("Deposit attempts", num(t.attempts), `${num(t.clients)} clients · ${money(t.tried_amount)} tried`)}
          ${kpi("Success rate", t.success_rate == null ? "—" : pct(t.success_rate), "of finished attempts: money received", t.success_rate != null && t.success_rate < 60 ? "alert" : "good")}
          ${kpi("Clients who paid", t.client_success == null ? "—" : pct(t.client_success), "of clients who tried, in any attempt")}
          ${kpi("Recovered", rc.failed_clients ? `${num(rc.recovered)} / ${num(rc.failed_clients)}` : "—", rc.failed_clients ? `failed then paid later · ${money(rc.recovered_amount)}${rc.switched_method ? " · " + num(rc.switched_method) + " by another method" : ""}` : "no failed attempts")}
          ${kpi("Lost after a failure", money(rc.lost_amount), `${num(rc.lost_clients)} client${rc.lost_clients === 1 ? "" : "s"} haven't paid since`, rc.lost_clients ? "alert" : "")}
          ${kpi("Time to credit", hrs(t.median_credit_h), "median: money received → credited in MT5")}
        </div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Deposit funnel <small>clients, in the period</small></h3><div class="c-funnel">${d.funnel.map(s => `<div><span>${esc(s.label)}</span><span class="bar" style="width:${Math.max(1, s.n / max * 100)}%">${num(s.n)}</span><small>${s.of_total}%</small></div>`).join("")}</div>
            <p class="muted" style="font-size:12px;margin-top:10px">Clients who open the deposit page but never start are the easiest win: a call from their agent or a reminder usually converts them. Page visits are counted from this version on.</p></div>
          <div class="c-card"><h3>Right now <small>all open deposits</small></h3>
            <div class="c-attn">
              <a href="${C.href("money?type=deposit")}" class="${nw.to_credit ? "" : "zero"}"><b class="mono">${num(nw.to_credit)}</b><span>to confirm / credit in MT5 · ${money(nw.to_credit_amount)}${nw.oldest_h != null ? " · oldest " + hrs(nw.oldest_h) : ""}</span></a>
              <a href="${C.href("money?type=deposit")}" class="${nw.review ? "" : "zero"}"><b class="mono">${num(nw.review)}</b><span>need a decision (late, partial, unconfirmed card)</span></a>
              <a href="${C.href("money?type=deposit")}" class="zero"><b class="mono">${num(nw.awaiting_client)}</b><span>waiting for the client to pay</span></a>
            </div>
            <h3 style="margin-top:16px">First deposit vs repeat</h3>
            <div class="c-scroll"><table class="c-table"><thead><tr><th></th><th class="r">Attempts</th><th class="r">Success</th><th class="r">Avg ticket</th><th class="r">Received</th></tr></thead><tbody>${cmp("First deposit", d.first)}${cmp("Repeat deposits", d.repeat)}</tbody></table></div></div>
        </div>
        <div class="c-card"><h3>By payment method <small>attempts started in the period</small></h3>${legend(d.outcomes)}
          ${d.by_method.length ? `<div class="c-scroll"><table class="c-table"><thead><tr><th>Method</th><th class="r">Attempts</th><th class="r">Clients</th><th class="r">Success</th><th style="min-width:160px">Outcomes</th><th class="r">Declined</th><th class="r">Not paid</th><th class="r">Cancelled</th><th class="r">Errors</th><th class="r">Rejected</th><th class="r">Client pays in</th><th class="r">Credited in</th><th class="r">Avg ticket</th><th class="r">Received</th></tr></thead><tbody>
          ${d.by_method.map(m => `<tr><td><b>${esc(m.name)}</b><br><span class="muted" style="font-size:11.5px">${m.providers.map(x => PROV[x] || x).join(" + ")}</span></td><td class="num">${num(m.attempts)}</td><td class="num">${num(m.clients)}</td><td class="num">${rate(m.success_rate)}</td><td>${stack(m.by, d.outcomes)}</td><td class="num">${num(m.by.declined)}</td><td class="num">${num(m.by.abandoned)}</td><td class="num">${num(m.by.cancelled)}</td><td class="num">${num(m.by.error)}</td><td class="num">${num(m.by.rejected)}</td><td class="num">${mins(m.median_pay_min)}</td><td class="num">${hrs(m.median_credit_h)}</td><td class="num">${m.avg_ticket == null ? "—" : money(m.avg_ticket)}</td><td class="num">${money(m.ok_amount)}</td></tr>`).join("")}
          </tbody></table></div>` : '<p class="muted">No deposit attempts in this period.</p>'}</div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Why deposits fail <small>finished attempts without money</small></h3>${d.reasons.length ? `<div class="c-scroll"><table class="c-table"><thead><tr><th>Reason</th><th>Method</th><th class="r">Attempts</th><th class="r">Amount</th></tr></thead><tbody>${d.reasons.map(x => `<tr><td>${esc(x.reason)}</td><td>${esc(x.method)}</td><td class="num">${num(x.n)}</td><td class="num">${money(x.amount)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No failed attempts in this period.</p>'}</div>
          <div class="c-card"><h3>By payment provider</h3><div class="c-scroll"><table class="c-table"><thead><tr><th>Provider</th><th class="r">Attempts</th><th class="r">Success</th><th class="r">Errors</th><th class="r">Received</th></tr></thead><tbody>${d.by_provider.map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="num">${num(x.attempts)}</td><td class="num">${rate(x.success_rate)}</td><td class="num">${num(x.by.error)}</td><td class="num">${money(x.ok_amount)}</td></tr>`).join("")}</tbody></table></div>
            <h3 style="margin-top:16px">Withdrawals <small>manual, requested in the period</small></h3>
            <dl class="c-dl"><dt>Requests</dt><dd class="mono">${num(w.requests)}</dd><dt>Paid</dt><dd class="mono">${num(w.paid)} · ${money(w.paid_amount)}</dd><dt>Median time to pay</dt><dd class="mono">${hrs(w.median_h)}</dd><dt>Paid within 24 h</dt><dd class="mono">${w.within_24h == null ? "—" : pct(w.within_24h)}</dd><dt>Rejected / cancelled</dt><dd class="mono">${num(w.rejected)} / ${num(w.cancelled)}</dd><dt>Still open</dt><dd class="mono">${num(w.open)}</dd></dl></div>
        </div>
        <div class="c-card"><h3>Attempts and successful deposits per day</h3>${bars(ser.map(x => ({ label: shortDay(x.day), title: fDate(x.day + "T12:00:00") + (x.success_rate != null ? " · success " + x.success_rate + "%" : ""), value: x.attempts, value2: x.ok })), { name: "Attempts", name2: "Money received", label: "Deposit attempts and successes per day" })}</div>
        <p class="muted" style="font-size:12px">An attempt is one deposit the client started in the client area. <b>Success rate</b> counts finished attempts only (in progress and needing a decision are left out). <b>Not paid</b> = the client left the payment page or the payment window ran out. FTDs recorded by sales outside the client area aren't included here.</p>`;
      C.wireRange("payperf", p);
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ============================================================ CLIENT JOURNEY (lifecycle work lists) */
  C.views.lifecycle = {
    title: "Client journey",
    async render(page, r, alive) {
      const seg = r.params.segment || "uncontacted", owner = r.params.owner || "";
      const d = await API.call("listLifecycle", { segment: seg, owner }); if (!alive()) return;
      const cur = d.segments.find(s => s.id === seg) || d.segments[0], selected = new Set(), mgr = isMgr();
      page.innerHTML = `<div class="c-attn tabs">${d.segments.map(s => `<a href="${C.href("lifecycle?segment=" + s.id + (owner ? "&owner=" + owner : ""))}" class="${s.id === seg ? "on" : ""} ${s.n ? "" : "zero"}"><b class="mono">${num(s.n)}</b><span>${esc(s.label)}</span></a>`).join("")}</div>
        <div class="c-row"><p class="muted" style="font-size:13px">${esc(cur.hint)}${d.total > d.rows.length ? ` · showing the ${d.rows.length} longest waiting of ${num(d.total)}` : ""}</p><span class="sp"></span>
          ${mgr ? sel("owner", [["", "Whole team"], ["me", "Mine"]].concat(salesUsers().map(u => [u.id, u.name])), owner, 'id="lfOwner" style="width:auto" aria-label="Owner"') : ""}</div>
        ${mgr ? `<div class="c-row" id="lfBulk" hidden style="background:var(--cta-soft);border-radius:10px;padding:8px 12px"><b id="lfN"></b><span class="sp"></span>${sel("bulk_owner", [["", "Assign to…"]].concat(salesUsers().map(u => [u.id, u.name])), "", 'id="lfAssign" style="width:auto"')}</div>` : ""}
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1050px"><thead><tr>${mgr ? '<th><input type="checkbox" id="lfAll" aria-label="Select all"></th>' : ""}<th>Client</th><th>Stage</th><th class="r">Days</th><th>Client area</th><th class="r">Deposited</th><th>Owner</th><th>Source</th><th>Next follow-up</th><th></th></tr></thead><tbody>
        ${d.rows.map(x => `<tr>${mgr ? `<td><input type="checkbox" class="lfSel" value="${esc(x.id)}" aria-label="Select ${esc(x.name)}"></td>` : ""}<td><a href="${C.href("lead/" + x.id)}"><b>${esc(x.name)}</b></a><small>${esc(x.dial_code)} ${esc(x.phone)} · ${esc(x.country)}</small></td>
          <td>${C.lifecyclePill(x.lifecycle)}<small>${stagePill(x.stage)}</small></td><td class="num"><span class="${x.days > 7 ? "c-wait late" : ""}">${x.days == null ? "—" : x.days}</span></td>
          <td>${x.client_id ? `${x.email_verified ? "Email ✓" : "Email not confirmed"}<small>KYC: ${esc(x.kyc)}</small>` : '<span class="muted">not registered</span>'}</td>
          <td class="num">${x.deposited ? money(x.deposited) : "—"}${x.balance ? `<small>bal ${money(x.balance)}</small>` : ""}</td><td>${esc(x.owner_name)}</td><td>${esc(x.source)}<small>${esc(x.campaign)}</small></td>
          <td>${x.next_task ? `<span class="${Date.parse(x.next_task.due_at) < Date.now() ? "c-wait late" : ""}">${esc(x.next_task.title)}</span><small>${ago(x.next_task.due_at)}</small>` : '<span class="muted">none booked</span>'}</td>
          <td class="r" style="white-space:nowrap">${isSales() ? `<a class="c-btn sm pri" href="${C.href("call/" + x.id)}">Call</a>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${d.rows.length ? "" : `<div class="c-empty"><b>Nobody here</b>${seg === "active" ? "No active traders yet." : "Nice: nothing waiting in this step."}</div>`}</div>`;
      const o = $("#lfOwner"); if (o) o.addEventListener("change", () => C.go("lifecycle", { segment: seg, owner: o.value }));
      if (mgr) {
        const upd = () => { $("#lfBulk").hidden = !selected.size; $("#lfN").textContent = selected.size + " selected"; };
        $$(".lfSel").forEach(c => c.addEventListener("change", () => { c.checked ? selected.add(c.value) : selected.delete(c.value); upd(); }));
        const all = $("#lfAll"); if (all) all.addEventListener("change", e => { $$(".lfSel").forEach(c => { c.checked = e.target.checked; c.checked ? selected.add(c.value) : selected.delete(c.value); }); upd(); });
        $("#lfAssign").addEventListener("change", async e => { if (!e.target.value) return; try { const r2 = await API.call("assignLeads", [...selected], e.target.value); toast(r2.updated + " assigned"); C.render(); } catch (err) { toast(err.message); } });
      }
    },
    refresh(page, r, alive) { if (!$$(".lfSel:checked").length) return this.render(page, r, alive); },
  };

  /* ============================================================ TRADING ACCOUNTS */
  const ACT = { unfunded: ["Not funded", "var(--muted)"], not_trading: ["Funded, not trading", "var(--warn)"], active: ["Active", "var(--up)"], dormant: ["Dormant", "var(--down)"] };
  C.views.trading = {
    title: "Trading accounts",
    async render(page, r, alive) {
      const p = r.params, d = await API.call("listTradingAccounts", { activity: p.activity || "", q: p.q || "", kind: p.kind || "live" }); if (!alive()) return;
      const t = d.totals, can = isOps() || isMgr();
      page.innerHTML = `<div class="c-kpis">${kpi("Accounts", num(t.accounts), p.kind === "demo" ? "demo" : "live, open")}${kpi("Balance", money(t.balance), "equity " + money(t.equity))}${kpi("Deposited", money(t.deposits), "withdrawn " + money(t.withdrawals))}${kpi("Lots traded", num(Math.round(t.lots * 100) / 100), "from the daily import")}</div>
        <div class="c-filters"><div class="c-seg">${[["", "All"]].concat(d.by_activity.map(x => [x.k, (ACT[x.k] || [x.k])[0] + " " + x.n])).map(([k, l]) => `<button data-a="${k}" class="${(p.activity || "") === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
          <input class="c-in grow" type="search" id="tQ" value="${esc(p.q || "")}" placeholder="Search MT5 login, name or email">${sel("kind", [["live", "Live"], ["demo", "Demo"]], p.kind || "live", 'id="tK" aria-label="Kind"')}${isOps() ? `<a class="c-btn" href="${C.href("balances")}">Import trading data</a>` : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1100px"><thead><tr><th>MT5 login</th><th>Client</th><th>Account</th><th class="r">Balance</th><th class="r">Equity</th><th class="r">Lots</th><th>Last trade</th><th class="r">Net deposits</th><th>Status</th><th>Owner</th><th></th></tr></thead><tbody>
        ${d.rows.map(a => { const [al, ac] = ACT[a.activity] || [a.activity, "var(--muted)"]; return `<tr><td class="mono"><b>${esc(a.login)}</b><small>${esc(a.server || "")}</small></td><td>${a.client ? `<a href="${C.href("client/" + a.client.id)}">${esc(a.client.name)}</a><small>${esc(a.client.country)}</small>` : "—"}</td><td>${esc(a.type_name)}<small>1:${esc(a.leverage)} · ${esc(a.currency)}</small></td>
          <td class="num">${a.balance_at || a.kind === "demo" ? money(a.balance) : "—"}${a.balance_at ? `<small>${ago(a.balance_at)}</small>` : ""}</td><td class="num">${a.equity == null ? "—" : money(a.equity)}</td><td class="num">${a.lots_total ? num(a.lots_total) : "—"}</td><td>${a.last_trade_at ? fDate(a.last_trade_at) : '<span class="muted">none recorded</span>'}</td>
          <td class="num">${money(a.net)}<small>in ${money(a.deposits)} · out ${money(a.withdrawals)}</small></td><td><span class="c-pill plain" style="--c:${ac}">${esc(al)}</span></td><td>${esc(a.owner_name)}</td>
          <td class="r">${can && a.kind === "live" && !a.trading_started_at ? `<button class="c-btn sm" data-tr="${esc(a.id)}">Mark trading</button>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>${d.rows.length ? "" : '<div class="c-empty"><b>No accounts</b></div>'}</div>
        <p class="muted" style="font-size:12.5px">There's no live MT5 connection: trading activity comes from the daily trading-data import (lots, last trade, or equity different from balance), or operations marks it here.</p>`;
      const go = patch => C.go("trading", Object.assign({}, p, patch));
      $$("[data-a]").forEach(b => b.addEventListener("click", () => go({ activity: b.dataset.a })));
      $("#tQ").addEventListener("input", C.debounce(e => go({ q: e.target.value.trim() }), 400)); $("#tK").addEventListener("change", e => go({ kind: e.target.value, activity: "" }));
      $$("[data-tr]").forEach(b => b.addEventListener("click", async () => { if (!(await confirmBox("Mark trading started", "Record that this client has started trading on this account? Their sales owner is told.", "Mark", false))) return; try { await API.call("markTradingStarted", b.dataset.tr); toast("Recorded"); C.render(); } catch (e) { toast(e.message); } }));
    },
  };
})();
