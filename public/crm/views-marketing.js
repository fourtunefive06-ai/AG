/* Absel CRM — Marketing workspace: overview, campaigns & spend, broadcasts, lead sources, opt-outs & DNC */
(function () {
  "use strict";
  const JOURNEY_SEG = [["", "Any"], ["demo_not_traded", "Demo given, never traded"], ["demo_any", "Had a demo"], ["no_demo", "No demo"], ["bonus_active", "Company-funded account live"], ["bonus_expired", "Company-funded account ended, no deposit"]];
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, pct, fDate, fDT, ago, isMgr, isAdmin, isMkt, isMktMgr, stagePill, toast, modal, confirmBox, field, inp, sel, chips, listInput, splitList, ICONS, todayStr, bars, hbars } = C;
  const meta = () => C.state.meta;
  const kpi = (label, val, sub, cls = "") => `<div class="c-kpi ${cls}"><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></div>`;
  const money2 = n => (n == null ? "–" : "$" + (Number(n) < 100 ? Number(n).toFixed(2) : Math.round(n).toLocaleString()));
  const tabs = (path, cur, list) => `<nav class="c-tabs">${list.map(([k, lb, n]) => `<a href="${C.href(path + (k ? "?tab=" + k : ""))}" class="${cur === k ? "on" : ""}">${esc(lb)}${n ? ` <b class="c-count">${n}</b>` : ""}</a>`).join("")}</nav>`;
  const RANGES = [["7d", "7 days", 6], ["30d", "30 days", 29], ["90d", "90 days", 89]];
  const range = p => { const r = RANGES.find(x => x[0] === (p.range || "30d")) || RANGES[1]; return { from: todayStr(-r[2]), to: todayStr(), exclude_samples: false }; };
  const rangeSeg = (path, p) => `<div class="c-seg">${RANGES.map(([k, lb]) => `<button data-range="${k}" class="${(p.range || "30d") === k ? "on" : ""}">${lb}</button>`).join("")}</div>`;
  const wireRange = (path, p) => $$("[data-range]").forEach(b => b.addEventListener("click", () => C.go(path, Object.assign({}, p, { range: b.dataset.range }))));
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const trackUrl = (c, base) => { const u = new URL(c.landing_url || base || meta().settings.site_url || "https://abselglobal.com"); if (c.utm_source) u.searchParams.set("utm_source", c.utm_source); if (c.utm_medium) u.searchParams.set("utm_medium", c.utm_medium); if (c.utm_campaign) u.searchParams.set("utm_campaign", c.utm_campaign); return u.toString(); };
  const copy = t => { try { navigator.clipboard.writeText(t); toast("Copied"); } catch (e) { toast("Copy failed. Select and copy manually."); } };

  /* ============================================================ OVERVIEW */
  C.views.mkt = {
    title: "Marketing overview",
    async render(page, r, alive) {
      const p = r.params, f = range(p);
      const [cs, q, bc] = await Promise.all([API.call("report", "campaigns", f), API.call("report", "quality", f), API.call("report", "broadcasts", f)]); if (!alive()) return;
      const t = cs.total, pend = meta().broadcasts_pending;
      const ser = cs.daily;
      page.innerHTML = `<div class="c-filters">${rangeSeg("mkt", p)}<span style="flex:1"></span><a class="c-btn" href="${C.href("campaigns")}">${ICONS.megaphone} Campaigns & spend</a><a class="c-btn pri" href="${C.href("broadcasts/new")}">${ICONS.send} New broadcast</a></div>
        ${pend && isMktMgr() ? `<div class="c-banner warn"><b>${pend} broadcast${pend > 1 ? "s" : ""} waiting for your approval.</b> <a href="${C.href("broadcasts")}">Review now</a></div>` : ""}
        <div class="c-kpis">${kpi("Ad spend", money(t.spend), "logged in period")}${kpi("Leads", num(t.leads), `${pct(t.connected_pct)} reached by sales`)}${kpi("Cost per lead", money2(t.cpl), "spend ÷ leads")}${kpi("FTDs from these leads", num(t.funded), money(t.ftd_amount) + " deposited", "good")}${kpi("Cost per FTD", money2(t.cost_per_ftd), "spend ÷ FTDs")}${kpi("Deposits per $1 spent", t.roas == null ? "–" : "$" + t.roas.toFixed(2), "first deposits ÷ spend")}</div>
        <div class="c-cols c2"><div class="c-card"><h3>Spend and leads per day</h3>${bars(ser.map(x => ({ label: shortDay(x.d), value: x.leads, value2: Math.round(x.spend / 10) })), { name: "Leads", name2: "Spend ($10s)", label: "Spend and leads per day" })}</div>
        <div class="c-card"><h3>By channel</h3><table class="c-table"><thead><tr><th>Channel</th><th class="r">Spend</th><th class="r">Leads</th><th class="r">CPL</th><th class="r">FTD</th><th class="r">Cost/FTD</th></tr></thead><tbody>${cs.by_channel.map(x => `<tr><td><b>${esc(x.key)}</b></td><td class="num">${money(x.spend)}</td><td class="num">${num(x.leads)}</td><td class="num">${money2(x.cpl)}</td><td class="num">${num(x.funded)}</td><td class="num">${money2(x.cost_per_ftd)}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Add campaigns to see channel costs.</td></tr>'}</tbody></table></div></div>
        <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Campaigns <small class="muted">best cost per FTD first</small></h3><div class="c-scroll">${campTable(cs.rows.slice().sort((a, b) => (a.cost_per_ftd ?? 1e9) - (b.cost_per_ftd ?? 1e9)))}</div></div>
        ${cs.untracked.length ? `<div class="c-card"><h3>Leads not linked to a campaign <small>${num(cs.untracked.reduce((s, x) => s + x.leads, 0))} leads</small></h3><p class="muted" style="font-size:13px;margin-bottom:8px">These utm values don't match any campaign, so their cost is unknown. Create a campaign with the same source and utm_campaign to track them.</p>${hbars(cs.untracked.slice(0, 10).map(x => ({ k: x.key, n: x.leads, sub: x.funded + " FTD" })))}</div>` : ""}
        <div class="c-cols c2"><div class="c-card"><h3>Lead quality by source <small>what sales found</small></h3><table class="c-table"><thead><tr><th>Source</th><th class="r">Leads</th><th class="r">Reached</th><th class="r">Invalid</th><th class="r">Qualified</th><th class="r">FTD</th></tr></thead><tbody>${q.sources.slice(0, 10).map(x => `<tr><td><b>${esc(x.key)}</b><small>${x.top_lost ? "top lost reason: " + esc(x.top_lost) : ""}</small></td><td class="num">${num(x.leads)}</td><td class="num">${pct(x.connected_pct)}</td><td class="num ${x.invalid_pct > 10 ? "c-wait late" : ""}">${pct(x.invalid_pct)}</td><td class="num">${pct(x.qualified_pct)}</td><td class="num">${pct(x.funded_pct)}</td></tr>`).join("")}</tbody></table></div>
        <div class="c-card"><h3>Broadcasts in period</h3>${bc.rows.length ? `<div class="c-kpis" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">${kpi("Sent", num(bc.total.sent))}${kpi("Replies", num(bc.total.replies))}${kpi("Registered after", num(bc.total.registered), "within 14 days")}${kpi("Funded after", num(bc.total.funded), "within 14 days", "good")}</div><p style="margin-top:8px"><a href="${C.href("broadcasts")}">All broadcasts →</a></p>` : `<p class="muted">No broadcasts yet. <a href="${C.href("broadcasts/new")}">Create one</a> to re-engage old leads.</p>`}</div></div>`;
      wireRange("mkt", p);
    },
  };
  function campTable(rows, actions) {
    if (!rows.length) return '<div class="c-empty"><b>No campaigns yet</b>Create one per ad campaign so spend and results line up.</div>';
    return `<table class="c-table" style="min-width:1150px"><thead><tr><th>Campaign</th><th>Status</th><th class="r">Spend</th><th class="r">Leads</th><th class="r">CPL</th><th class="r">Reached</th><th class="r">Invalid</th><th class="r">Registered</th><th class="r">FTD</th><th class="r">FTD amount</th><th class="r">Cost/FTD</th><th class="r">Dep./$</th>${actions ? "<th></th>" : ""}</tr></thead><tbody>${rows.map(x => `<tr><td><b>${esc(x.key)}</b><small class="mono">${esc(x.utm_source || "any source")} / ${esc(x.utm_campaign)} · ${esc(x.channel || "")}</small></td><td><span class="c-pill plain" style="--c:${x.status === "active" ? "var(--up)" : x.status === "paused" ? "var(--warn)" : "var(--muted)"}">${esc(x.status || "")}</span></td><td class="num">${money(x.spend)}${x.budget ? `<small>of ${money(x.budget)}</small>` : ""}</td><td class="num">${num(x.leads)}</td><td class="num ${x.target_cpl && x.cpl > x.target_cpl ? "c-wait late" : ""}">${money2(x.cpl)}</td><td class="num">${pct(x.connected_pct)}</td><td class="num ${x.invalid_pct > 10 ? "c-wait late" : ""}">${pct(x.invalid_pct)}</td><td class="num">${num(x.registered)}</td><td class="num">${num(x.funded)}</td><td class="num">${money(x.ftd_amount)}</td><td class="num ${x.target_cpa && x.cost_per_ftd > x.target_cpa ? "c-wait late" : ""}">${money2(x.cost_per_ftd)}</td><td class="num">${x.roas == null ? "–" : x.roas.toFixed(2)}</td>${actions ? `<td class="r" style="white-space:nowrap"><button class="c-btn sm" data-spend="${esc(x.id)}">Spend</button> <button class="c-btn sm" data-edit="${esc(x.id)}">Edit</button></td>` : ""}</tr>`).join("")}</tbody></table>`;
  }

  /* =========================================================== CAMPAIGNS */
  C.views.campaigns = {
    title: "Campaigns & spend",
    async render(page, r, alive) {
      const p = r.params, f = range(p);
      const [list, cs] = await Promise.all([API.call("listCampaigns"), API.call("report", "campaigns", f)]); if (!alive()) return;
      page.innerHTML = `<div class="c-filters">${rangeSeg("campaigns", p)}<span style="flex:1"></span><button class="c-btn" id="cImp">${ICONS.upload} Import spend CSV</button><button class="c-btn" id="cSp">Log spend</button><button class="c-btn pri" id="cNew">New campaign</button></div>
        <p class="muted" style="max-width:860px">Each campaign is matched to leads by its <b>utm_source</b> and <b>utm_campaign</b>. Use the tracking link from the campaign in your ads. Log spend daily (or import it from the ad platform's CSV) to see cost per lead and cost per FTD.</p>
        <div class="c-tbox"><div class="c-scroll">${campTable(cs.rows, true)}</div></div>
        ${cs.untracked.length ? `<div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Untracked utm values <small class="muted">click to create a campaign</small></h3><div class="c-scroll"><table class="c-table"><thead><tr><th>Source / campaign</th><th class="r">Leads</th><th class="r">FTD</th><th></th></tr></thead><tbody>${cs.untracked.map((x, i) => `<tr><td class="mono">${esc(x.key)}</td><td class="num">${num(x.leads)}</td><td class="num">${num(x.funded)}</td><td class="r">${x.utm_campaign ? `<button class="c-btn sm" data-mk="${i}">Create campaign</button>` : '<span class="muted" style="font-size:12px">no utm_campaign</span>'}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
      wireRange("campaigns", p);
      $("#cNew").addEventListener("click", () => campEditor(null));
      $("#cSp").addEventListener("click", () => spendModal(list, null));
      $("#cImp").addEventListener("click", () => importSpend());
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => campEditor(list.find(c => c.id === b.dataset.edit))));
      $$("[data-spend]").forEach(b => b.addEventListener("click", () => spendModal(list, b.dataset.spend)));
      $$("[data-mk]").forEach(b => b.addEventListener("click", () => { const x = cs.untracked[Number(b.dataset.mk)]; campEditor({ name: x.utm_campaign, utm_source: x.utm_source, utm_campaign: x.utm_campaign, status: "active" }, true); }));
    },
  };
  function campEditor(c, preset) {
    const isNew = !c || preset; c = c || { status: "active", channel: "Facebook / Instagram" };
    const m = modal({
      title: isNew ? "New campaign" : "Edit campaign", wide: true, submit: "Save campaign",
      extra: !isNew && isMktMgr() ? '<button type="button" class="c-btn danger" id="cDel">Delete</button>' : "",
      body: `<div class="c-grid">${field("Name", inp("name", c.name || "", 'placeholder="e.g. Meta Lead Ads · Islamic · GCC"'), "full")}
        ${field("Channel", sel("channel", meta().campaign_channels, c.channel))}${field("Status", sel("status", [["planned", "Planned"], ["active", "Active"], ["paused", "Paused"], ["ended", "Ended"]], c.status))}
        ${field("utm_source", inp("utm_source", c.utm_source || "", 'placeholder="facebook, google, tiktok"'))}${field("utm_medium", inp("utm_medium", c.utm_medium || "", 'placeholder="cpc, paid-social, email"'))}
        ${field("utm_campaign (must match the ad links)", inp("utm_campaign", c.utm_campaign || "", 'placeholder="lead-ads-islamic"'), "full")}
        ${field("Landing page", inp("landing_url", c.landing_url || meta().settings.site_url || "", 'placeholder="https://abselglobal.com/"'), "full")}
        ${field("Budget (USD, whole campaign)", inp("budget", c.budget || "", 'type="number" min="0"'))}${field("Start date", `<input class="c-in" type="date" name="start_date" value="${esc(c.start_date || "")}">`)}
        ${field("Target cost per lead (USD)", inp("target_cpl", c.target_cpl || "", 'type="number" min="0" step="0.5"'))}${field("Target cost per FTD (USD)", inp("target_cpa", c.target_cpa || "", 'type="number" min="0"'))}
        ${field("Notes", `<textarea class="c-ta" name="notes" rows="2">${esc(c.notes || "")}</textarea>`, "full")}</div>
        <div><span class="muted" style="font-size:12px;font-weight:700">TRACKING LINK FOR THE ADS</span><div class="c-row" style="margin-top:6px;flex-wrap:nowrap"><code class="c-code" id="cUrl"></code><button type="button" class="c-btn sm" id="cCopy">Copy</button></div><p class="muted" style="font-size:12px;margin-top:4px">For Meta and Google lead forms, the webhook fills utm_campaign with the ad platform's campaign name, so use that exact name here.</p></div>`,
      onOpen: el => {
        const upd = () => { if (!el.isConnected) return; const v = C.readForm($("form", el)); try { $("#cUrl", el).textContent = trackUrl(v); } catch (e) { $("#cUrl", el).textContent = "Enter a valid landing page URL"; } };
        el.addEventListener("input", upd); upd();
        $("#cCopy", el).addEventListener("click", () => copy($("#cUrl", el).textContent));
        const del = $("#cDel", el); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete campaign", `Delete “${c.name}” and its spend log? Leads keep their utm values.`, "Delete"))) return; await API.call("deleteCampaign", c.id); m.close(); toast("Deleted"); C.render(); });
      },
      onSubmit: async v => { await API.call("saveCampaign", Object.assign({ id: preset ? undefined : c.id }, v)); toast("Campaign saved"); await C.updateBadges(); C.render(); },
    });
  }
  async function spendModal(list, campaignId) {
    if (!list.length) return toast("Create a campaign first.");
    const entries = campaignId ? await API.call("listSpend", campaignId) : [];
    const c = list.find(x => x.id === campaignId);
    modal({
      title: c ? "Spend: " + c.name : "Log ad spend", wide: !!c, submit: "Save spend",
      body: `<div class="c-grid">${field("Campaign", sel("campaign_id", list.map(x => [x.id, x.name]), campaignId || list[0].id))}${field("Date", `<input class="c-in" type="date" name="date" value="${todayStr(-1)}">`)}${field("Amount spent (USD)", inp("amount", "", 'type="number" min="0" step="0.01"'))}${field("Note", inp("note", ""))}</div><p class="muted" style="font-size:12.5px">One amount per campaign per day. Saving the same day again replaces it.</p>
        ${c ? `<div class="c-scroll" style="max-height:260px"><table class="c-table"><thead><tr><th>Date</th><th class="r">Amount</th><th>Note</th><th></th></tr></thead><tbody>${entries.map(e => `<tr><td class="mono">${esc(e.date)}</td><td class="num">${money2(e.amount)}</td><td>${esc(e.note || "")}</td><td class="r"><button type="button" class="c-btn sm ghost" data-del="${esc(e.id)}">Remove</button></td></tr>`).join("") || '<tr><td colspan="4" class="muted">No spend logged yet.</td></tr>'}</tbody></table></div>` : ""}`,
      onOpen: el => $$("[data-del]", el).forEach(b => b.addEventListener("click", async () => { await API.call("deleteSpend", b.dataset.del); b.closest("tr").remove(); toast("Removed"); })),
      onSubmit: async v => { await API.call("addSpend", v); toast("Spend saved"); C.render(); },
    });
  }
  function importSpend() {
    modal({ title: "Import ad spend", wide: true, submit: "Import",
      body: `<p class="muted">Paste or upload a CSV with columns <b>date</b>, <b>campaign</b> and <b>amount</b> (export from Meta Ads Manager or Google Ads and keep those three). The campaign column can hold the campaign name or its utm_campaign. Dates as YYYY-MM-DD or DD/MM/YYYY.</p><input type="file" accept=".csv,text/csv" class="c-in" id="spF"><textarea class="c-ta" name="csv" rows="7" placeholder="date,campaign,amount&#10;2026-10-01,lead-ads-islamic,42.50"></textarea>`,
      onOpen: el => $("#spF", el).addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("[name=csv]", el).value = String(rd.result); }; rd.readAsText(f); }),
      onSubmit: async v => {
        const lines = String(v.csv || "").trim().split(/\r?\n/).map(l => l.split(/[,;\t]/).map(x => x.trim().replace(/^"|"$/g, "")));
        if (lines.length < 2) throw new Error("Add a header row and at least one line.");
        const h = lines[0].map(x => x.toLowerCase()), di = h.findIndex(x => /date|day/.test(x)), ci = h.findIndex(x => /campaign/.test(x)), ai = h.findIndex(x => /amount|spend|cost/.test(x));
        if (di < 0 || ci < 0 || ai < 0) throw new Error("Couldn't find date, campaign and amount columns.");
        const res = await API.call("importSpend", lines.slice(1).map(r => ({ date: r[di], campaign: r[ci], amount: r[ai] })));
        toast(`${res.saved} lines saved${res.failed.length ? ", " + res.failed.length + " skipped: " + res.failed[0].error : ""}`); C.render();
      } });
  }

  /* ========================================================== BROADCASTS */
  const BSTAT = { draft: ["Draft", "var(--muted)"], pending_approval: ["Waiting approval", "var(--warn)"], scheduled: ["Scheduled", "var(--cta)"], sending: ["Sending", "var(--cta)"], done: ["Sent", "var(--up)"], cancelled: ["Stopped", "var(--down)"] };
  C.views.broadcasts = {
    title: "Broadcasts",
    async render(page, r, alive) {
      if (r.id === "new" || r.sub === "edit") { const all = r.sub === "edit" ? await API.call("listBroadcasts") : []; if (!alive()) return; return editor(page, all.find(b => b.id === r.id) || null); }
      if (r.id) return detail(page, r.id, alive);
      const list = await API.call("listBroadcasts"); if (!alive()) return;
      page.innerHTML = `<div class="c-row"><p class="muted" style="max-width:760px">Send one WhatsApp or email to a group of leads: re-engage lost leads, announce a promotion, remind registered clients to fund. Do-not-contact and unsubscribed clients are always skipped, and nobody gets more than one broadcast every ${esc(String(C.state.meta.settings.broadcast_cap_days || 3))} days.${meta().settings.broadcast_approval ? " Marketing executives' broadcasts need a marketing manager's approval." : ""}</p><span class="sp"></span><a class="c-btn pri" href="${C.href("broadcasts/new")}">${ICONS.send} New broadcast</a></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1050px"><thead><tr><th>Broadcast</th><th>Status</th><th class="r">Audience</th><th class="r">Sent</th><th class="r">Delivered</th><th class="r">Read</th><th class="r">Replies</th><th class="r">Registered</th><th class="r">Funded</th><th class="r">Opt-outs</th><th></th></tr></thead><tbody>
        ${list.map(b => { const s = b.stats, st = BSTAT[b.status] || [b.status, "var(--muted)"]; return `<tr class="click" data-open="${esc(b.id)}"><td><b>${esc(b.name)}</b><small>${b.channel === "email" ? "Email" : "WhatsApp"} · ${esc(b.template_name)} · by ${esc(b.created_by_name)} ${ago(b.created_at)}</small></td><td><span class="c-pill plain" style="--c:${st[1]}">${st[0]}</span>${b.status === "scheduled" ? `<small>${fDT(b.scheduled_at)}</small>` : b.status === "sending" ? `<small>${b.cursor || 0} of ${b.total}</small>` : b.reject_reason && b.status === "draft" ? `<small style="color:var(--warn)">Sent back: ${esc(b.reject_reason)}</small>` : ""}</td><td class="num">${num(b.total || b.estimated || 0)}</td><td class="num">${num(s.sent)}</td><td class="num">${num(s.delivered)}</td><td class="num">${num(s.read)}</td><td class="num">${num(s.replies)}</td><td class="num">${num(s.registered)}</td><td class="num">${num(s.funded)}</td><td class="num">${num(s.unsubscribed)}</td>
          <td class="r" style="white-space:nowrap">${b.status === "pending_approval" && isMktMgr() ? `<button class="c-btn sm" data-rej="${esc(b.id)}">Send back</button> <button class="c-btn sm good" data-ok="${esc(b.id)}">Approve</button>` : b.status === "draft" ? `<a class="c-btn sm" href="${C.href("broadcasts/" + b.id + "/edit")}">Edit</a>` : ""}</td></tr>`; }).join("")}</tbody></table></div>${list.length ? "" : '<div class="c-empty"><b>No broadcasts yet</b></div>'}</div>
        <p class="muted" style="font-size:12px">Replies count within 72 hours; registered and funded count within 14 days of the message.</p>`;
      $$("tr[data-open]").forEach(tr => tr.addEventListener("click", e => { if (e.target.closest("button,a")) return; C.go("broadcasts/" + tr.dataset.open); }));
      $$("[data-ok]").forEach(b => b.addEventListener("click", async () => { const x = list.find(y => y.id === b.dataset.ok); if (!(await confirmBox("Approve broadcast", `Send “${x.name}” to about ${x.estimated} clients by ${x.channel}${x.scheduled_at && Date.parse(x.scheduled_at) > Date.now() ? " at " + fDT(x.scheduled_at) : " now"}?`, "Approve and send", false))) return; try { await API.call("approveBroadcast", x.id, true); toast("Approved"); C.updateBadges(); C.render(); } catch (e) { toast(e.message); } }));
      $$("[data-rej]").forEach(b => b.addEventListener("click", () => modal({ title: "Send back for changes", body: field("What needs changing?", '<textarea class="c-ta" name="reason" rows="3"></textarea>'), submit: "Send back", onSubmit: async v => { await API.call("approveBroadcast", b.dataset.rej, false, v.reason); toast("Sent back to the creator"); C.updateBadges(); C.render(); } })));
    },
    refresh(page, r, alive) { if (!r.id) return this.render(page, r, alive); },
  };
  async function detail(page, id, alive) {
    const [b, msgs] = await Promise.all([API.call("getBroadcast", id), API.call("listMessages", { broadcast_id: id })]); if (!alive()) return;
    const s = b.stats, st = BSTAT[b.status] || [b.status, ""], g = b.segment || {};
    C.setTitle("Broadcast: " + b.name);
    const aud = [g.stages.length ? "Stages: " + g.stages.map(x => C.stage(x).label).join(", ") : "All stages except funded and invalid", g.temperatures.length && "Temperature: " + g.temperatures.join(", "), g.countries.length && "Countries: " + g.countries.join(", "), g.cities.length && "Cities: " + g.cities.join(", "), g.sources.length && "Sources: " + g.sources.join(", "), g.campaigns.length && "Campaigns: " + g.campaigns.join(", "), g.interests.length && "Interest: " + g.interests.join(", "), g.created_from && "Received from " + g.created_from, g.created_to && "Received until " + g.created_to, g.inactive_days && "No activity for " + g.inactive_days + "+ days", g.journey && "Journey: " + (JOURNEY_SEG.find(x => x[0] === g.journey) || [0, g.journey])[1]].filter(Boolean);
    page.innerHTML = `<div class="c-row"><a class="c-btn sm" href="${C.href("broadcasts")}">← All broadcasts</a><span class="c-pill plain" style="--c:${st[1]}">${st[0]}</span><span class="sp"></span>${["scheduled", "sending", "pending_approval"].includes(b.status) ? '<button class="c-btn danger" id="bStop">Stop</button>' : ""}${b.status === "draft" ? `<a class="c-btn" href="${C.href("broadcasts/" + b.id + "/edit")}">Edit draft</a>` : ""}</div>
      <div class="c-kpis">${kpi("Audience", num(b.total || b.estimated || 0), b.excluded ? `skipped: ${b.excluded.dnc} DNC, ${b.excluded.unsubscribed} opted out, ${b.excluded.recently_messaged} recently messaged` : "")}${kpi("Sent", num(s.sent), s.failed ? s.failed + " failed or blocked" : "")}${kpi("Delivered / read", num(s.delivered) + " / " + num(s.read))}${kpi("Replies", num(s.replies), "within 72 h")}${kpi("Registered after", num(s.registered), "within 14 days")}${kpi("Funded after", num(s.funded), "within 14 days", "good")}</div>
      <div class="c-cols c2"><div class="c-card"><h3>Message</h3><p class="muted" style="font-size:13px">${b.channel === "email" ? "Email" : "WhatsApp"} · template “${esc(b.template_name)}”</p><div class="c-preview ${b.channel === "whatsapp" ? "wa" : ""}" style="margin-top:8px">${esc(msgs[0] ? (msgs[0].subject ? "Subject: " + msgs[0].subject + "\n\n" : "") + msgs[0].body : "Preview appears once sending starts.")}</div></div>
      <div class="c-card"><h3>Audience</h3><ul style="margin:0;padding-left:18px">${aud.map(x => `<li>${esc(x)}</li>`).join("")}</ul><dl class="c-dl" style="margin-top:10px"><dt>Created</dt><dd>${esc(b.created_by_name)} · ${fDT(b.created_at)}</dd>${b.approved_by_name ? `<dt>Approved</dt><dd>${esc(b.approved_by_name)} · ${fDT(b.approved_at)}</dd>` : ""}${b.started_at ? `<dt>Started</dt><dd>${fDT(b.started_at)}</dd>` : ""}${b.done_at ? `<dt>Finished</dt><dd>${fDT(b.done_at)}</dd>` : ""}</dl></div></div>
      <div class="c-tbox"><h3 style="padding:14px 14px 0;font-size:14px;font-family:var(--f-body)">Recipients <small class="muted">latest 300</small></h3><div class="c-scroll"><table class="c-table"><thead><tr><th>Client</th><th>To</th><th>Status</th><th>When</th></tr></thead><tbody>${msgs.map(m => `<tr class="click" data-lead="${esc(m.lead_id)}"><td>${esc(m.lead ? m.lead.name : "")}<small>${m.lead ? esc(C.stage(m.lead.stage).label) : ""}</small></td><td class="mono">${esc(m.to)}</td><td><span class="c-pill plain" style="--c:${C.msgColor(m.status)}">${esc(m.status)}</span>${m.error ? `<small>${esc(m.error)}</small>` : ""}</td><td>${fDT(m.created_at)}</td></tr>`).join("")}</tbody></table></div></div>`;
    $$("tr[data-lead]").forEach(tr => tr.addEventListener("click", () => C.go("lead/" + tr.dataset.lead)));
    const stop = $("#bStop"); if (stop) stop.addEventListener("click", async () => { if (!(await confirmBox("Stop broadcast", "Stop sending? Messages already sent can't be recalled.", "Stop"))) return; await API.call("cancelBroadcast", b.id); toast("Stopped"); C.render(); });
  }
  async function editor(page, b) {
    const m = meta(), tpls = await API.call("listTemplates"), g = (b && b.segment) || { stages: ["lost"], inactive_days: 7 };
    C.setTitle(b ? "Edit broadcast" : "New broadcast");
    const tplOpts = ch => [["", "Choose a template"]].concat(tpls.filter(t => t.channel === ch && t.active !== false).map(t => [t.id, t.name + (ch === "whatsapp" && !t.wa_template_name ? " (not Meta-approved)" : "")]));
    const ch0 = b ? b.channel : "whatsapp";
    page.innerHTML = `<form class="c-cols side" id="bForm" novalidate><div style="display:grid;gap:16px;align-content:start">
      <div class="c-card" style="display:grid;gap:12px"><h3>1. Message</h3><div class="c-grid">${field("Broadcast name (internal)", inp("name", b ? b.name : "", 'placeholder="e.g. October: re-engage lost Nigeria leads"'), "full")}${field("Channel", sel("channel", [["whatsapp", "WhatsApp"], ["email", "Email"]], ch0, 'id="bCh"'))}${field("Template", sel("template_id", tplOpts(ch0), b ? b.template_id : "", 'id="bTpl"'))}</div>
        <p class="muted" style="font-size:12.5px" id="bTplHint">WhatsApp broadcasts must use a template Meta approved for marketing. Edit wording in Templates.</p><div class="c-preview" id="bPrev">Choose a template.</div></div>
      <div class="c-card" style="display:grid;gap:12px"><h3>2. Audience</h3>
        ${field("Stages (none ticked = everyone except funded and invalid)", chips("segment.stages", m.stages.filter(s => s.id !== "invalid").map(s => [s.id, s.label]), g.stages || []))}
        ${field("Lead temperature", chips("segment.temperatures", [["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]], g.temperatures || []))}
        <div class="c-grid">${field("Countries", listInput("segment.countries", g.countries, "e.g. Nigeria, Kenya"))}${field("Cities", listInput("segment.cities", g.cities, "e.g. Lagos, Nairobi"))}
        ${field("Sources", listInput("segment.sources", g.sources, "e.g. facebook, google"))}${field("utm_campaign", listInput("segment.campaigns", g.campaigns, "e.g. lead-ads-islamic"))}
        ${field("Received from", `<input class="c-in" type="date" name="segment.created_from" value="${esc(g.created_from || "")}">`)}${field("Received until", `<input class="c-in" type="date" name="segment.created_to" value="${esc(g.created_to || "")}">`)}
        ${field("Only leads quiet for at least (days)", inp("segment.inactive_days", g.inactive_days || "", 'type="number" min="0"'))}${field("Interest", listInput("segment.interests", g.interests, "e.g. Islamic (swap-free) account"))}${field("Demo / company-funded account", sel("segment.journey", JOURNEY_SEG, g.journey || ""))}</div></div>
      <div class="c-card" style="display:grid;gap:12px"><h3>3. When</h3><div class="c-grid">${field("Send", sel("when", [["now", "As soon as approved / submitted"], ["later", "At a set time"]], b && b.scheduled_at ? "later" : "now", 'id="bWhen"'))}<label class="c-field" id="bAt" ${b && b.scheduled_at ? "" : "hidden"}><span>Date and time</span><input class="c-in" type="datetime-local" name="scheduled_at" value="${C.localInput(b && b.scheduled_at ? b.scheduled_at : new Date(Date.now() + 3600e3).toISOString())}"></label></div>
        <p class="muted" style="font-size:12.5px">Messages go out gradually (about ${esc(String(m.settings.broadcast_rate_per_min || "unlimited"))} a minute) and pause during quiet hours.</p></div>
      </div>
      <div style="display:grid;gap:16px;align-content:start;position:sticky;top:76px"><div class="c-card" style="display:grid;gap:10px"><h3>Audience size</h3><b class="mono" style="font-size:34px" id="bCount">…</b><div id="bEx" class="muted" style="font-size:12.5px"></div><div id="bSample"></div></div>
        <div class="c-card" style="display:grid;gap:8px"><p class="err-msg" style="color:var(--warn);font-size:13px" hidden></p><button type="button" class="c-btn" id="bSave">Save draft</button><button type="submit" class="c-btn pri lg">${isMktMgr() || !m.settings.broadcast_approval ? "Save and send" : "Submit for approval"}</button>${b ? '<button type="button" class="c-btn ghost" id="bDel">Delete draft</button>' : ""}<a class="c-btn ghost" href="${C.href("broadcasts")}">Cancel</a></div></div></form>`;
    const f = $("#bForm"), ch = $("#bCh"), tp = $("#bTpl"), er = $(".err-msg", f);
    const sample = { first_name: "Kwame", last_name: "Mensah", full_name: "Kwame Mensah", company: m.settings.company, register_url: m.settings.register_url, whatsapp_number: "+" + m.settings.whatsapp_number, agent_name: "Daniel Kariuki", unsubscribe_url: (m.settings.site_url || "") + "/unsubscribe?t=…" };
    const prev = () => { const t = tpls.find(x => x.id === tp.value); $("#bPrev").className = "c-preview" + (ch.value === "whatsapp" ? " wa" : ""); $("#bPrev").textContent = t ? (t.subject ? "Subject: " + t.subject + "\n\n" : "") + String(t.body).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => sample[k] != null ? sample[k] : "") : "Choose a template."; $("#bTplHint").hidden = ch.value !== "whatsapp"; };
    ch.addEventListener("change", () => { tp.innerHTML = tplOpts(ch.value).map(([v, lb]) => `<option value="${esc(v)}">${esc(lb)}</option>`).join(""); prev(); count(); });
    tp.addEventListener("change", prev); prev();
    $("#bWhen").addEventListener("change", e => { $("#bAt").hidden = e.target.value !== "later"; });
    const payload = () => { const v = C.readForm(f), sg = v.segment || {}; return { id: b ? b.id : undefined, name: v.name, channel: v.channel, template_id: v.template_id, scheduled_at: v.when === "later" ? C.fromLocalInput(v.scheduled_at) : null, segment: Object.assign({}, sg, { countries: splitList(sg.countries), cities: splitList(sg.cities), sources: splitList(sg.sources), campaigns: splitList(sg.campaigns), interests: splitList(sg.interests), stages: sg.stages || [], temperatures: sg.temperatures || [] }) }; };
    const count = C.debounce(async () => { if (!f.isConnected) return; try { const pv = await API.call("previewSegment", payload().segment, ch.value); if (!f.isConnected) return; $("#bCount").textContent = num(pv.count); const ex = pv.excluded; $("#bEx").innerHTML = `Skipped automatically: ${ex.dnc} do-not-contact · ${ex.unsubscribed} opted out · ${ex.no_address} without ${ch.value === "email" ? "email" : "phone"} · ${ex.recently_messaged} messaged recently` + (pv.by_stage.length ? `<br>${pv.by_stage.map(x => esc(C.stage(x.k).label) + " " + x.n).join(" · ")}` : ""); $("#bSample").innerHTML = pv.sample.length ? `<span class="muted" style="font-size:12px;font-weight:700">EXAMPLES</span>` + pv.sample.map(l => `<div style="font-size:12.5px">${esc(l.name)} <span class="muted">· ${esc(l.country)} · ${esc(C.stage(l.stage).label)}</span></div>`).join("") : ""; } catch (e) { if (f.isConnected) $("#bCount").textContent = "–"; } }, 350);
    f.addEventListener("input", count); f.addEventListener("change", count); count();
    const save = async () => { er.hidden = true; try { return await API.call("saveBroadcast", payload()); } catch (e) { er.textContent = e.message; er.hidden = false; C.showErrors(f, e.fields); return null; } };
    $("#bSave").addEventListener("click", async () => { const x = await save(); if (x) { toast("Draft saved"); C.go("broadcasts"); } });
    const del = $("#bDel"); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete draft", "Delete this draft?", "Delete"))) return; await API.call("cancelBroadcast", b.id); toast("Deleted"); C.go("broadcasts"); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const x = await save(); if (!x) return;
      if (!(await confirmBox("Send broadcast", `${isMktMgr() || !m.settings.broadcast_approval ? "Send" : "Submit for approval:"} “${x.name}” to about ${$("#bCount").textContent} clients by ${x.channel === "email" ? "email" : "WhatsApp"}?`, isMktMgr() || !m.settings.broadcast_approval ? "Send" : "Submit", false))) return;
      try { const s = await API.call("submitBroadcast", x.id); toast(s.status === "pending_approval" ? "Submitted. A marketing manager will approve it" : "Scheduled. Sending starts within a minute"); C.go("broadcasts/" + x.id); } catch (err) { er.textContent = err.message; er.hidden = false; }
    });
  }

  /* ======================================================== LEAD SOURCES */
  C.views.sources = {
    title: "Lead sources",
    async render(page, r, alive) {
      const [st, rep] = await Promise.all([API.call("getSettings"), API.call("report", "sources", { from: todayStr(-29), to: todayStr() })]); if (!alive()) return;
      const ig = st.integrations || {}, proto = API.mode === "prototype", origin = proto ? (st.site_url || "https://abselglobal.com") : location.origin;
      const card = (title, ok, body) => `<div class="c-card" style="display:grid;gap:8px"><div class="c-row"><h3>${title}</h3><span class="sp"></span><span class="c-pill plain" style="--c:${ok ? "var(--up)" : "var(--muted)"}">${ok ? "Connected" : proto ? "Live server only" : "Not set up"}</span></div>${body}</div>`;
      const code = t => `<div class="c-row" style="flex-wrap:nowrap"><code class="c-code">${esc(t)}</code><button class="c-btn sm" data-copy="${esc(t)}">Copy</button></div>`;
      page.innerHTML = `<p class="muted" style="max-width:860px">Every way leads reach the CRM. All of them are routed by territory, deduplicated, get the welcome automations, and keep their source and campaign for reporting. Keys are set by your developer in the server's .env file.</p>
        <div class="c-cols c2">
          ${card("Website forms (abselglobal.com)", true, `<p style="font-size:13px">The hero form and pop-up send leads with their utm values. Add <span class="mono">?utm_source=…&utm_campaign=…</span> to every ad link (Campaigns builds the link for you).</p>${code(origin + "/api/leads")}`)}
          ${card("Meta Lead Ads (Facebook / Instagram)", ig.meta_leads, `<p style="font-size:13px">Instant forms arrive in seconds. In the Meta app, subscribe the Page's <b>leadgen</b> webhook to this URL with the verify token from .env (META_VERIFY_TOKEN, META_PAGE_TOKEN, META_APP_SECRET).</p>${code(origin + "/webhooks/meta-leads")}`)}
          ${card("Google Ads lead forms", ig.google_leads, `<p style="font-size:13px">In the lead form asset, set the webhook URL below and the key from GOOGLE_LEAD_KEY. Google's “Send test data” should create a lead tagged Test.</p>${code(origin + "/webhooks/google-leads")}`)}
          ${card("Zapier, Make, partner sites (lead API)", ig.lead_api, `<p style="font-size:13px">POST JSON with header <span class="mono">X-Api-Key</span>. Fields: first_name, last_name (or full_name), email, phone, dial_code, country, city, utm_source, utm_campaign.</p>${code(origin + "/api/inbound/lead")}`)}
          ${card("WhatsApp (incoming messages)", st.channels && st.channels.whatsapp && st.channels.whatsapp.webhook, `<p style="font-size:13px">A WhatsApp message from an unknown number creates a lead with source “whatsapp”.</p>${code(origin + "/webhooks/whatsapp")}`)}
          ${card("Phone system (incoming calls)", ig.telephony_webhook, `<p style="font-size:13px">Calls from unknown numbers create a lead with source “phone”; missed calls book a call-back for the owner.</p>${code(origin + "/webhooks/calls")}`)}
        </div>
        <div class="c-card"><h3>Leads by source <small>last 30 days</small></h3>${hbars(rep.sources.map(s => ({ k: s.key, n: s.leads, sub: s.funded + " FTD · " + s.conversion + "%" })))}</div>`;
      $$("[data-copy]").forEach(b => b.addEventListener("click", () => copy(b.dataset.copy)));
    },
  };

  /* ===================================================== OPT-OUTS & DNC */
  C.views.optouts = {
    title: "Opt-outs & do-not-contact",
    async render(page, r, alive) {
      const tab = r.params.tab || "dnc", rows = tab === "dnc" ? await API.call("listDnc") : await API.call("listOptOuts"); if (!alive()) return;
      const can = isMgr() || isMktMgr();
      let html = `<nav class="c-tabs"><a href="${C.href("optouts")}" class="${tab === "dnc" ? "on" : ""}">Do-not-contact list</a><a href="${C.href("optouts?tab=unsub")}" class="${tab === "unsub" ? "on" : ""}">Unsubscribed from marketing</a></nav>`;
      if (tab === "dnc") html += `<div class="c-row"><p class="muted" style="max-width:760px">People who must never be called or messaged. New leads with these numbers or emails are flagged automatically, and every call screen shows the warning. Marking a lead “Do not contact” adds it here.</p><span class="sp"></span>${can ? '<button class="c-btn pri" id="dAdd">Add number or email</button>' : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table"><thead><tr><th>Phone</th><th>Email</th><th>Name</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>${rows.map(d => `<tr><td class="mono">${esc(d.phone || "—")}</td><td>${esc(d.email || "—")}</td><td>${esc(d.name || "")}</td><td>${esc(d.reason)}</td><td>${fDate(d.created_at)}<small>${esc(d.by_name)}</small></td><td class="r">${can ? `<button class="c-btn sm" data-rm="${esc(d.id)}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>The list is empty</b></div>'}</div>`;
      else html += `<p class="muted" style="max-width:760px">Clients who unsubscribed from marketing emails (link in every broadcast email) or replied STOP on WhatsApp. Broadcasts and automations skip them; their agent can still reply to them directly.</p>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table"><thead><tr><th>Client</th><th>Email</th><th>WhatsApp</th><th>Stage</th><th>Owner</th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-lead="${esc(x.id)}"><td><b>${esc(x.name)}</b><small>${esc(x.email || "")}</small></td><td>${x.unsubscribed.email ? "Unsubscribed" : "—"}</td><td>${x.unsubscribed.whatsapp ? "Opted out" : "—"}</td><td>${stagePill(x.stage)}</td><td>${esc(x.owner_name)}</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>Nobody has opted out</b></div>'}</div>`;
      page.innerHTML = html;
      const add = $("#dAdd"); if (add) add.addEventListener("click", () => modal({ title: "Add to do-not-contact", body: `<div class="c-grid">${field("Dial code", inp("dial_code", "+", 'placeholder="+234"'))}${field("Phone", inp("phone", ""))}${field("Email", inp("email", "", 'type="email"'), "full")}${field("Name (optional)", inp("name", ""))}${field("Reason", inp("reason", "Asked not to be contacted"))}</div>`, submit: "Add", onSubmit: async v => { const x = await API.call("addDnc", v); toast(x.leads_updated ? `Added. ${x.leads_updated} existing lead(s) flagged` : "Added"); C.render(); } }));
      $$("[data-rm]").forEach(b => b.addEventListener("click", async () => { if (!(await confirmBox("Remove from list", "Allow calls and messages to this contact again?", "Remove"))) return; await API.call("removeDnc", b.dataset.rm); toast("Removed"); C.render(); }));
      $$("tr[data-lead]").forEach(tr => tr.addEventListener("click", () => C.go("lead/" + tr.dataset.lead)));
    },
  };
})();
