/* Absel CRM — Automations, Templates, Messages, Territories, Team, Import, Settings */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, fDT, ago, isAdmin, isMgr, isMktMgr, roleLabel, salesUsers, toast, modal, confirmBox, field, inp, sel, chips, listInput, splitList, readForm } = C;
  const meta = () => C.state.meta;
  const stageOpts = () => meta().stages.map(s => [s.id, s.label]);
  const TRIG = { lead_created: "A new lead arrives", lead_assigned: "A lead is assigned to an agent", stage_changed: "A lead moves to a stage", call_logged: "A call is logged with an outcome", no_contact: "Nobody has spoken to the lead after X hours", inactive: "An open lead has had no activity for X days", stage_stuck: "A lead stays in a stage for X days (no deposit yet)", whatsapp_reply: "The client replies on WhatsApp", deposit_submitted: "An agent submits a first deposit for verification", demo_given: "A demo account is given", demo_idle: "A demo hasn't been traded for X days", bonus_credited: "A company-funded account is credited", bonus_expiring: "A company-funded account expires within X days", bonus_ended: "A company-funded account ends without a deposit" };
  const ACT = { send_email: "Send email", send_whatsapp: "Send WhatsApp", create_task: "Create follow-up for owner", notify_owner: "Notify the owner", notify_managers: "Notify managers", change_stage: "Move to stage", reassign: "Re-route by territory" };
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  /* ======================================================= AUTOMATIONS */
  function describe(a, tpls) {
    const t = a.trigger || {}, c = a.conditions || {};
    let when = TRIG[t.type] || t.type;
    if (t.type === "stage_changed" && t.stages && t.stages.length) when = "A lead moves to " + t.stages.map(s => C.stage(s).label).join(" or ");
    if (t.type === "call_logged" && t.outcomes && t.outcomes.length) when = "A call ends as " + t.outcomes.map(C.outcomeLabel).join(", ");
    if (t.type === "no_contact") when = `Nobody has spoken to the lead after ${plural(t.hours || 24, "hour")}`;
    if (t.type === "inactive") when = `No activity for ${plural(t.days || 7, "day")}`;
    if (t.type === "stage_stuck") when = `A lead stays ${t.stages && t.stages.length ? t.stages.map(s => C.stage(s).label).join(" or ") : "in any open stage"} for ${plural(t.days || 2, "day")}`;
    if (t.type === "demo_idle") when = `A demo hasn't been traded for ${plural(t.days || 2, "day")}`;
    if (t.type === "bonus_expiring") when = `A company-funded account expires within ${plural(t.days || 5, "day")}`;
    const ifs = [];
    if (c.stages && c.stages.length) ifs.push("stage is " + c.stages.map(s => C.stage(s).label).join("/"));
    if (c.countries && c.countries.length) ifs.push("country is " + c.countries.join("/"));
    if (c.interests && c.interests.length) ifs.push("interest is " + c.interests.join("/"));
    if (c.sources && c.sources.length) ifs.push("source is " + c.sources.join("/"));
    if (c.temperatures && c.temperatures.length) ifs.push("lead is " + c.temperatures.join("/"));
    const then = (a.actions || []).map(x => { const tp = tpls.find(y => y.id === x.template_id); return x.type === "send_email" || x.type === "send_whatsapp" ? `${ACT[x.type]} “${tp ? tp.name : "missing template"}”` : x.type === "create_task" ? `create ${x.task_type} follow-up${x.due_in_hours ? " due in " + plural(x.due_in_hours, "hour") : ""}` : x.type === "change_stage" ? "move to " + C.stage(x.stage).label : (ACT[x.type] || x.type).toLowerCase(); });
    return `<b>When</b> ${esc(when)}${ifs.length ? ` <b>and</b> ${esc(ifs.join(", "))}` : ""}${a.delay_minutes ? ` <b>wait</b> ${esc(a.delay_minutes >= 60 ? (a.delay_minutes / 60).toFixed(a.delay_minutes % 60 ? 1 : 0) + " h" : a.delay_minutes + " min")}` : ""} <b>then</b> ${esc(then.join(", then "))}${a.once_per_lead !== false ? " · once per lead" : ""}`;
  }
  C.views.automations = {
    title: "Automations", mgr: true,
    async render(page, r, alive) {
      const [list, tpls, rep, st] = await Promise.all([API.call("listAutomations"), API.call("listTemplates"), API.call("report", "automation", {}), API.call("getSettings").catch(() => null)]); if (!alive()) return;
      const stats = Object.fromEntries(rep.rules.map(x => [x.id, x]));
      const ch = st && st.channels;
      page.innerHTML = `<div class="c-row"><p class="muted" style="max-width:720px">Automations send WhatsApp and email, book follow-ups and alert people when something happens to a lead. They never message leads marked Do not contact, and messages wait until quiet hours end (${st ? esc(st.quiet.start) + "–" + esc(st.quiet.end) : "settings"}).</p><span class="sp"></span><button class="c-btn pri" id="aNew">New automation</button></div>
        ${ch ? `<div class="c-banner ${ch.email.configured && ch.whatsapp.configured ? "" : "warn"}">Email: <b>${ch.email.configured ? "connected (" + esc(ch.email.provider) + ")" : ch.email.simulated ? "simulated in this prototype" : "not connected yet"}</b> · WhatsApp: <b>${ch.whatsapp.configured ? "connected" : ch.whatsapp.simulated ? "simulated in this prototype" : "not connected yet"}</b>${!ch.email.configured && !ch.email.simulated ? ". Until a provider is connected, messages are logged as skipped. See Settings." : ""}</div>` : ""}
        <div class="c-tbox">${list.map(a => { const s = stats[a.id] || {}; return `<div class="c-rule"><label class="c-switch" title="${a.active ? "On" : "Off"}"><input type="checkbox" data-toggle="${esc(a.id)}" ${a.active ? "checked" : ""} aria-label="Turn ${esc(a.name)} on or off"></label><div style="min-width:0"><h4>${esc(a.name)}</h4><div class="sum">${describe(a, tpls)}</div><div class="sum mono" style="font-size:11.5px">Last 30 days: ran ${num(s.done || 0)} · skipped ${num(s.skipped || 0)} · waiting ${num(s.pending || 0)} · sent ${num(s.sent || 0)}${s.failed ? " · failed " + num(s.failed) : ""}</div></div><div class="c-row"><button class="c-btn sm" data-edit="${esc(a.id)}">Edit</button></div></div>`; }).join("") || '<div class="c-empty"><b>No automations yet</b></div>'}</div>`;
      $("#aNew").addEventListener("click", () => editor(null, tpls));
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => editor(list.find(x => x.id === b.dataset.edit), tpls)));
      $$("[data-toggle]").forEach(b => b.addEventListener("change", async () => { const a = list.find(x => x.id === b.dataset.toggle); try { await API.call("saveAutomation", Object.assign({}, a, { active: b.checked })); toast(b.checked ? "Automation on" : "Automation off"); } catch (e) { toast(e.message); b.checked = !b.checked; } }));
    },
  };
  function actionRow(i, a, tpls) {
    a = a || { type: "send_email" };
    const tplSel = ch => sel(`actions.${i}.template_id`, [["", "Choose template"]].concat(tpls.filter(t => t.channel === ch).map(t => [t.id, t.name])), a.template_id);
    const params = {
      send_email: tplSel("email"), send_whatsapp: tplSel("whatsapp"),
      create_task: `<div class="c-row" style="flex-wrap:nowrap">${sel(`actions.${i}.task_type`, [["call", "Call"], ["whatsapp", "WhatsApp"], ["email", "Email"]], a.task_type)}${inp(`actions.${i}.title`, a.title || "Follow-up call", 'placeholder="Title"')}${inp(`actions.${i}.due_in_hours`, a.due_in_hours || 0, 'type="number" min="0" style="width:80px" title="Due in hours"')}</div>`,
      notify_owner: inp(`actions.${i}.text`, a.text || "", 'placeholder="Message, e.g. {{full_name}} is waiting"'), notify_managers: inp(`actions.${i}.text`, a.text || "", 'placeholder="Message"'),
      change_stage: `<div class="c-row" style="flex-wrap:nowrap">${sel(`actions.${i}.stage`, stageOpts(), a.stage || "lost")}${inp(`actions.${i}.lost_reason`, a.lost_reason || "", 'placeholder="Lost reason (if Lost)"')}</div>`, reassign: '<span class="muted">Uses the territory rules</span>',
    }[a.type] || "";
    return `<div class="c-actrow" data-row="${i}">${sel(`actions.${i}.type`, Object.entries(ACT), a.type, 'data-atype')}<div>${params}</div><button type="button" class="c-btn sm ghost" data-rm="${i}" aria-label="Remove action">${C.ICONS.x}</button></div>`;
  }
  function editor(a, tpls) {
    const isNew = !a; a = a || { name: "", active: true, trigger: { type: "lead_created" }, conditions: {}, delay_minutes: 0, once_per_lead: true, actions: [{ type: "send_email" }] };
    const t = a.trigger, c = a.conditions || {};
    let rows = (a.actions || []).slice();
    const m = modal({
      title: isNew ? "New automation" : "Edit automation", wide: true, submit: "Save automation",
      extra: isNew ? "" : '<button type="button" class="c-btn danger" id="aDel">Delete</button>',
      body: `<div class="c-grid">${field("Name", inp("name", a.name, 'placeholder="e.g. WhatsApp after missed call"'), "full")}
        ${field("When", sel("trigger.type", Object.entries(TRIG), t.type, 'id="aTrig"'), "full")}
        <div class="full" data-tp="stage_changed stage_stuck">${field("Stages", chips("trigger.stages", stageOpts(), t.stages || []))}</div>
        <div class="full" data-tp="call_logged">${field("Outcomes", chips("trigger.outcomes", meta().outcomes.map(o => [o.id, o.label]), t.outcomes || []))}</div>
        <div data-tp="no_contact">${field("Hours without speaking to the client", inp("trigger.hours", t.hours || 24, 'type="number" min="1"'))}</div>
        <div data-tp="inactive stage_stuck demo_idle bonus_expiring">${field("Days", inp("trigger.days", t.days || ({ stage_stuck: 2, demo_idle: 2, bonus_expiring: 5 }[t.type] || 7), 'type="number" min="1"'))}</div></div>
        <details ${Object.values(c).some(v => v && v.length) ? "open" : ""} style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><summary style="cursor:pointer;font-weight:700">Only for some leads (optional)</summary><div class="c-grid" style="margin-top:12px">
          ${field("Current stage is", chips("conditions.stages", stageOpts(), c.stages || []), "full")}
          ${field("Lead temperature", chips("conditions.temperatures", [["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]], c.temperatures || []), "full")}
          ${field("Countries", listInput("conditions.countries", c.countries, "e.g. Nigeria, Kenya"))}${field("Sources", listInput("conditions.sources", c.sources, "e.g. google, facebook"))}
          ${field("Interests", listInput("conditions.interests", c.interests, "e.g. ECN account"), "full")}</div></details>
        <div class="c-grid">${field("Wait before acting (minutes)", inp("delay_minutes", a.delay_minutes || 0, 'type="number" min="0"'))}<div class="c-field"><span>Options</span><label class="c-switch"><input type="checkbox" name="once_per_lead" ${a.once_per_lead !== false ? "checked" : ""}><span>Run once per lead</span></label><label class="c-switch"><input type="checkbox" name="active" ${a.active !== false ? "checked" : ""}><span>Automation is on</span></label></div></div>
        <div><span style="font-size:12px;font-weight:700;color:var(--muted)">THEN DO</span><div class="c-actlist" id="aActs" style="margin-top:6px"></div><button type="button" class="c-btn sm" id="aAdd" style="margin-top:8px">Add action</button></div>
        <p class="muted" style="font-size:12.5px">Before running, conditions are checked again. If the lead has moved on, the automation skips it.</p>`,
      onOpen: el => {
        const trig = $("#aTrig", el), upd = () => $$("[data-tp]", el).forEach(x => (x.hidden = !x.dataset.tp.split(" ").includes(trig.value)));
        trig.addEventListener("change", upd); upd();
        const box = $("#aActs", el);
        const draw = () => { box.innerHTML = rows.map((x, i) => actionRow(i, x, tpls)).join(""); };
        const sync = () => { const v = readForm($("form", el)); rows = Object.values(v.actions || {}); };
        draw();
        box.addEventListener("change", e => { if (e.target.matches("[data-atype]")) { sync(); const i = Number(e.target.closest("[data-row]").dataset.row); rows[i] = { type: e.target.value }; draw(); } });
        box.addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { sync(); rows.splice(Number(b.dataset.rm), 1); draw(); } });
        $("#aAdd", el).addEventListener("click", () => { sync(); rows.push({ type: "send_whatsapp" }); draw(); });
        const del = $("#aDel", el); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete automation", `Delete “${a.name}”? Waiting runs are cancelled.`, "Delete"))) return; await API.call("deleteAutomation", a.id); m.close(); toast("Deleted"); C.render(); });
      },
      onSubmit: async v => {
        const payload = { id: a.id, name: v.name, active: v.active, once_per_lead: v.once_per_lead, delay_minutes: v.delay_minutes, trigger: v.trigger, conditions: Object.assign({}, v.conditions, { countries: splitList(v.conditions.countries), sources: splitList(v.conditions.sources), interests: splitList(v.conditions.interests) }), actions: Object.values(v.actions || {}) };
        await API.call("saveAutomation", payload); toast("Automation saved"); C.render();
      },
    });
  }

  /* ========================================================= TEMPLATES */
  const SAMPLE = { first_name: "Kwame", last_name: "Mensah", full_name: "Kwame Mensah", reference: "AG-7K2QX9", interest: "ECN account", country: "Ghana", city: "Accra", agent_name: "Daniel Kariuki", agent_phone: "+971 50 555 0111", agent_email: "daniel@abselglobal.com", company: "Absel Global", register_url: "https://client.abselmarkets.com/register", login_url: "https://client.abselmarkets.com", whatsapp_number: "+447576077989" };
  const fill = s => String(s || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => SAMPLE[k] != null ? SAMPLE[k] : "{{" + k + "}}");
  C.views.templates = {
    title: "Templates", mgr: true,
    async render(page, r, alive) {
      const list = await API.call("listTemplates"); if (!alive()) return;
      page.innerHTML = `<div class="c-row"><p class="muted" style="max-width:720px">Messages agents and automations send. Use variables like <span class="c-kbd">{{first_name}}</span>. WhatsApp templates must also be approved in Meta Business Manager under the same name.</p><span class="sp"></span><button class="c-btn pri" id="tNew">New template</button></div>
        <div class="c-tbox"><table class="c-table"><thead><tr><th>Template</th><th>Channel</th><th>Preview</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td><b>${esc(t.name)}</b>${t.channel === "whatsapp" ? `<small class="mono">${t.wa_template_name ? "Meta name: " + esc(t.wa_template_name) : "No Meta template: only usable inside the 24-hour window"}</small>` : `<small>${esc(t.subject)}</small>`}</td><td>${t.channel === "email" ? "Email" : "WhatsApp"}</td><td style="max-width:420px;color:var(--muted)">${esc(fill(t.body).slice(0, 140))}…</td><td class="r"><button class="c-btn sm" data-edit="${esc(t.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`;
      $("#tNew").addEventListener("click", () => tplEditor(null));
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => tplEditor(list.find(x => x.id === b.dataset.edit))));
    },
  };
  function tplEditor(t) {
    const isNew = !t; t = t || { channel: "whatsapp", name: "", subject: "", body: "", wa_template_name: "", wa_language: "en", wa_params: [] };
    const m = modal({
      title: isNew ? "New template" : "Edit template", wide: true, submit: "Save template",
      extra: isNew ? "" : '<button type="button" class="c-btn danger" id="tDel">Delete</button>',
      body: `<div class="c-grid">${field("Name", inp("name", t.name))}${field("Channel", sel("channel", [["whatsapp", "WhatsApp"], ["email", "Email"]], t.channel, 'id="tCh"'))}
        <label class="c-field full" data-ch="email"><span>Subject</span>${inp("subject", t.subject)}</label>
        <label class="c-field full"><span>Message</span><textarea class="c-ta" name="body" id="tBody" rows="8">${esc(t.body)}</textarea></label>
        <div class="full"><span style="font-size:12px;font-weight:700;color:var(--muted)">INSERT VARIABLE</span><div class="c-varchips" style="margin-top:6px">${meta().template_vars.map(v => `<button type="button" data-var="${v}">{{${v}}}</button>`).join("")}</div></div>
        <label class="c-field" data-ch="whatsapp"><span>Approved Meta template name</span>${inp("wa_template_name", t.wa_template_name, 'placeholder="e.g. absel_intro"')}</label>
        <label class="c-field" data-ch="whatsapp"><span>Template language</span>${inp("wa_language", t.wa_language, 'placeholder="en"')}</label>
        <label class="c-field full" data-ch="whatsapp"><span>Values for {{1}}, {{2}}… in order</span>${listInput("wa_params", t.wa_params, "e.g. first_name, agent_name")}</label></div>
        <div><span style="font-size:12px;font-weight:700;color:var(--muted)">PREVIEW WITH A SAMPLE LEAD</span><div class="c-preview" id="tPrev" style="margin-top:6px"></div></div>`,
      onOpen: el => {
        const ch = $("#tCh", el), body = $("#tBody", el);
        const upd = () => { $$("[data-ch]", el).forEach(x => (x.hidden = x.dataset.ch !== ch.value)); const pv = $("#tPrev", el); pv.className = "c-preview" + (ch.value === "whatsapp" ? " wa" : ""); pv.textContent = (ch.value === "email" ? "Subject: " + fill($("[name=subject]", el).value) + "\n\n" : "") + fill(body.value); };
        el.addEventListener("input", upd); ch.addEventListener("change", upd); upd();
        $$("[data-var]", el).forEach(b => b.addEventListener("click", () => { const s = body.selectionStart || body.value.length, tok = "{{" + b.dataset.var + "}}"; body.value = body.value.slice(0, s) + tok + body.value.slice(body.selectionEnd || s); body.focus(); body.selectionStart = body.selectionEnd = s + tok.length; upd(); }));
        const del = $("#tDel", el); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete template", `Delete “${t.name}”? Automations using it will skip that step.`, "Delete"))) return; await API.call("deleteTemplate", t.id); m.close(); toast("Deleted"); C.render(); });
      },
      onSubmit: async v => { await API.call("saveTemplate", Object.assign({ id: t.id, active: true }, v, { wa_params: splitList(v.wa_params) })); toast("Template saved"); C.render(); },
    });
  }

  /* ========================================================== MESSAGES */
  C.views.messages = {
    title: "Messages", mgr: true,
    async render(page, r, alive) {
      const p = r.params, list = await API.call("listMessages", p); if (!alive()) return;
      page.innerHTML = `<div class="c-filters">${sel("channel", [["", "All channels"], ["whatsapp", "WhatsApp"], ["email", "Email"]], p.channel || "", 'id="mCh"')}${sel("direction", [["", "In and out"], ["out", "Sent"], ["in", "Replies from clients"]], p.direction || "", 'id="mDir"')}${sel("status", [["", "Any status"], ["queued", "Queued"], ["sent", "Sent"], ["delivered", "Delivered"], ["read", "Read"], ["received", "Received"], ["simulated", "Simulated"], ["skipped", "Skipped"], ["blocked", "Blocked"], ["failed", "Failed"]], p.status || "", 'id="mSt"')}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>When</th><th>Lead</th><th>Channel</th><th>Message</th><th>Status</th><th>Sent by</th></tr></thead><tbody>${list.map(x => `<tr class="click" data-lead="${esc(x.lead_id)}"><td class="mono">${fDT(x.created_at)}<small>${ago(x.created_at)}</small></td><td>${esc(x.lead ? x.lead.name : "")}<small>${esc(x.to || (x.lead ? x.lead.country : ""))}</small></td><td>${x.channel === "email" ? "Email" : "WhatsApp"}<small>${x.direction === "in" ? "Reply" : "Outgoing"}</small></td><td style="max-width:420px">${x.subject ? `<b>${esc(x.subject)}</b><br>` : ""}<span class="muted">${esc((x.body || "").slice(0, 140))}</span></td><td><span class="c-pill plain" style="--c:${C.msgColor(x.status)}">${esc(x.status)}</span>${x.error ? `<small>${esc(x.error)}</small>` : ""}</td><td>${x.rule_name ? "Automation<small>" + esc(x.rule_name) + "</small>" : x.direction === "in" ? "Client" : esc(C.userName(x.user_id))}</td></tr>`).join("")}</tbody></table></div>${list.length ? "" : '<div class="c-empty"><b>No messages</b></div>'}</div>`;
      [["mCh", "channel"], ["mDir", "direction"], ["mSt", "status"]].forEach(([id, k]) => $("#" + id).addEventListener("change", e => C.go("messages", Object.assign({}, p, { [k]: e.target.value }))));
      $$("tr[data-lead]").forEach(tr => tr.addEventListener("click", () => C.go("lead/" + tr.dataset.lead)));
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ======================================================= TERRITORIES */
  const INTERESTS = ["ECN account", "STP account", "Islamic (swap-free) account", "Cent account", "Introducing Broker (IB)", "PAMM / MAM"];
  C.views.territories = {
    title: "Territories", mgr: true,
    async render(page, r, alive) {
      const [rules, users, st] = await Promise.all([API.call("listRules"), API.call("listUsers"), API.call("getSettings").catch(() => ({}))]); if (!alive()) return;
      const agents = users.filter(u => u.role === "agent" || u.role === "manager");
      const name = id => (users.find(u => u.id === id) || {}).name || "Removed user";
      const sum = rl => { const m = rl.match || {}, parts = []; [["countries", "Country"], ["cities", "City"], ["areas", "Area"], ["sources", "Source"], ["interests", "Interest"], ["languages", "Language"]].forEach(([k, lb]) => { if (m[k] && m[k].length) parts.push(`<b>${lb}:</b> ${esc(m[k].join(", "))}`); }); return parts.join(" · ") || "<b>Any lead</b>"; };
      page.innerHTML = `<div class="c-row"><p class="muted" style="max-width:760px">A new lead goes to the first territory it matches, top to bottom. Put specific rules (a city) above general ones (a country). Agents only see leads assigned to them. Leads that match nothing ${st.fallback === "round_robin_all" ? "are shared round-robin across all agents" : "wait in the Unassigned pool"} (change this in Settings).</p><span class="sp"></span><button class="c-btn" id="tPool">Assign unassigned leads now</button><button class="c-btn pri" id="tNew">New territory</button></div>
        <div class="c-tbox">${rules.map((rl, i) => `<div class="c-rule"><div style="display:grid;gap:4px"><button class="c-btn sm ghost" data-up="${i}" ${i ? "" : "disabled"} aria-label="Move up">▲</button><button class="c-btn sm ghost" data-down="${i}" ${i < rules.length - 1 ? "" : "disabled"} aria-label="Move down">▼</button></div><div style="min-width:0"><h4>${i + 1}. ${esc(rl.name)} ${rl.active ? "" : '<span class="c-tag">OFF</span>'}</h4><div class="sum">${sum(rl)}</div><div class="sum"><b>Agents:</b> ${rl.agents.length ? rl.agents.map(id => esc(name(id))).join(", ") : '<span style="color:var(--down)">none, so leads skip this territory</span>'} · ${rl.method === "least_loaded" ? "fewest open leads first" : "round robin"}</div></div><button class="c-btn sm" data-edit="${esc(rl.id)}">Edit</button></div>`).join("") || '<div class="c-empty"><b>No territories yet</b>Create one per country, city or desk.</div>'}</div>
        <div class="c-card"><h3>Test routing</h3><div class="c-filters"><input class="c-in" id="trC" placeholder="Country, e.g. Nigeria"><input class="c-in" id="trCity" placeholder="City, e.g. Lagos"><input class="c-in" id="trS" placeholder="Source, e.g. google"><button class="c-btn" id="trGo">Check</button></div><p id="trOut" class="muted" style="margin-top:10px"></p></div>`;
      $("#tNew").addEventListener("click", () => ruleEditor(null, agents, rules.length));
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => ruleEditor(rules.find(x => x.id === b.dataset.edit), agents)));
      const move = async (i, j) => { const a = rules[i], b = rules[j]; await API.call("saveRule", Object.assign({}, a, { priority: j })); await API.call("saveRule", Object.assign({}, b, { priority: i })); for (let k = 0; k < rules.length; k++) if (k !== i && k !== j && rules[k].priority !== k) await API.call("saveRule", Object.assign({}, rules[k], { priority: k })); C.render(); };
      $$("[data-up]").forEach(b => b.addEventListener("click", () => move(Number(b.dataset.up), Number(b.dataset.up) - 1)));
      $$("[data-down]").forEach(b => b.addEventListener("click", () => move(Number(b.dataset.down), Number(b.dataset.down) + 1)));
      $("#tPool").addEventListener("click", async () => { try { const x = await API.call("reassignPool"); toast(x.assigned ? `${x.assigned} leads assigned` : "No unassigned leads matched a territory"); } catch (e) { toast(e.message); } });
      $("#trGo").addEventListener("click", () => {
        const lead = { country: $("#trC").value.trim().toLowerCase(), city: $("#trCity").value.trim().toLowerCase(), source: $("#trS").value.trim().toLowerCase() || "direct" };
        const ok = (list, v) => !list || !list.length || list.map(x => x.toLowerCase()).includes(v);
        const hit = rules.find(rl => rl.active && ok(rl.match.countries, lead.country) && ok(rl.match.cities, lead.city) && ok(rl.match.sources, lead.source) && !(rl.match.areas || []).length && !(rl.match.interests || []).length && !(rl.match.languages || []).length && rl.agents.some(id => { const u = users.find(x => x.id === id); return u && u.active && u.accepts_leads; }));
        $("#trOut").innerHTML = hit ? `Goes to <b>${esc(hit.name)}</b>: ${hit.agents.map(id => esc(name(id))).join(", ")} (${hit.method === "least_loaded" ? "fewest open leads" : "round robin"}).` : `No territory matches, so the lead ${st.fallback === "round_robin_all" ? "is shared round-robin across all agents" : "waits in the Unassigned pool"}.`;
      });
    },
  };
  function ruleEditor(rl, agents, count) {
    const isNew = !rl; rl = rl || { name: "", active: true, method: "round_robin", match: {}, agents: [], priority: count || 0 };
    const mt = rl.match || {};
    const m = modal({
      title: isNew ? "New territory" : "Edit territory", wide: true, submit: "Save territory",
      extra: isNew ? "" : '<button type="button" class="c-btn danger" id="rDel">Delete</button>',
      body: `<div class="c-grid">${field("Name", inp("name", rl.name, 'placeholder="e.g. Nigeria · Lagos"'))}${field("Share leads", sel("method", [["round_robin", "Round robin (take turns)"], ["least_loaded", "Fewest open leads first"]], rl.method))}
        ${field("Countries", listInput("countries", mt.countries, "e.g. Nigeria"), "full")}
        ${field("Cities (optional)", listInput("cities", mt.cities, "e.g. Lagos, Abuja"))}${field("Areas (optional)", listInput("areas", mt.areas, "e.g. Lekki, Ikeja"))}
        ${field("Sources (optional)", listInput("sources", mt.sources, "e.g. google, ib-partner"))}${field("Languages (optional)", listInput("languages", mt.languages, "e.g. Arabic"))}
        ${field("Interests (optional)", chips("interests", INTERESTS, mt.interests || []), "full")}
        ${field("Agents in this territory", agents.length ? chips("agents", agents.map(u => [u.id, u.name + (u.active ? "" : " (inactive)")]), rl.agents) : '<p class="muted">Add agents in Team first.</p>', "full")}
        <label class="c-switch full"><input type="checkbox" name="active" ${rl.active ? "checked" : ""}><span>Territory is active</span></label></div>
        <p class="muted" style="font-size:12.5px">Empty fields match any lead. Every filled field must match.</p>`,
      onOpen: el => { const del = $("#rDel", el); if (del) del.addEventListener("click", async () => { if (!(await confirmBox("Delete territory", `Delete “${rl.name}”? Existing leads keep their owner.`, "Delete"))) return; await API.call("deleteRule", rl.id); m.close(); toast("Deleted"); C.render(); }); },
      onSubmit: async v => { await API.call("saveRule", { id: rl.id, name: v.name, method: v.method, active: v.active, priority: rl.priority, agents: v.agents || [], match: { countries: splitList(v.countries), cities: splitList(v.cities), areas: splitList(v.areas), sources: splitList(v.sources), languages: splitList(v.languages), interests: v.interests || [] } }); toast("Territory saved"); C.render(); },
    });
  }

  /* ============================================================== TEAM */
  const EVENT = { login_ok: ["Signed in", "var(--up)"], login_bad_password: ["Wrong password", "var(--warn)"], login_bad_code: ["Wrong 2-step code", "var(--warn)"], login_unknown: ["Unknown username", "var(--warn)"], login_unknown_user: ["Unknown username", "var(--warn)"], login_locked: ["Tried while locked", "var(--down)"], login_inactive: ["Inactive account tried", "var(--warn)"], account_locked: ["Account locked", "var(--down)"], password_changed: ["Changed password", "var(--cta)"], password_change_failed: ["Wrong current password", "var(--warn)"], "2fa_enabled": ["Turned on 2-step", "var(--up)"], "2fa_disabled": ["Turned off 2-step", "var(--warn)"], admin_unlock: ["Unlocked by admin", "var(--cta)"], admin_signout: ["Signed out everywhere", "var(--cta)"], admin_reset_2fa: ["2-step reset by admin", "var(--warn)"], user_created: ["Account created", "var(--cta)"], user_updated: ["Account changed by admin", "var(--cta)"], profile_updated: ["Own account updated", "var(--cta)"], backup_downloaded: ["Downloaded full backup", "var(--warn)"] };
  const badges = u => [u.locked ? '<span class="c-tag">LOCKED</span>' : "", u.totp_enabled ? '<span class="c-tag info">2-STEP</span>' : "", u.must_change_password ? '<span class="c-tag">TEMP PASSWORD</span>' : "", !u.has_password ? '<span class="c-tag">NO PASSWORD</span>' : "", u.sample ? '<span class="c-tag info">SAMPLE</span>' : ""].join("");
  C.views.team = {
    title: "Team", mgr: true,
    async render(page, r, alive) {
      const tab = r.params.tab === "security" && isAdmin() ? "security" : "people";
      const users = await API.call("listUsers"); const logins = tab === "security" ? await API.call("listLogins", {}) : []; if (!alive()) return;
      page.innerHTML = `<nav class="c-tabs"><a href="${C.href("team")}" class="${tab === "people" ? "on" : ""}">People</a>${isAdmin() ? `<a href="${C.href("team?tab=security")}" class="${tab === "security" ? "on" : ""}">Sign-in activity</a>` : ""}</nav>` + (tab === "people" ? `
        <div class="c-row"><p class="muted" style="max-width:860px"><b>Sales agents</b> call and convert only their own leads. <b>Sales managers</b> see every lead, verify deposits, review calls and run territories. <b>Marketing executives</b> run campaigns and draft broadcasts; <b>marketing managers</b> also approve broadcasts and import or export leads. Marketing can view leads but can't call or move them. <b>Admins</b> manage the team, security and settings.</p><span class="sp"></span>${isAdmin() ? '<button class="c-btn pri" id="uNew">Add team member</button>' : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>Name</th><th>Role</th><th>Territories</th><th class="r">Open leads</th><th>New leads</th><th>FTD target</th><th>Last sign-in</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td style="white-space:nowrap"><b>${esc(u.name)}</b>${badges(u)}<small>${esc(u.username)}${u.email ? " · " + esc(u.email) : ""}</small></td><td>${esc(roleLabel(u.role))}${u.active ? "" : '<small style="color:var(--down)">Inactive</small>'}<small>${esc(u.team || "")}${u.extension ? " · ext " + esc(u.extension) : ""}</small></td><td>${esc(u.territories.join(", ") || "—")}</td><td class="num">${num(u.open_leads)}</td><td>${!["agent", "manager"].includes(u.role) ? "—" : u.accepts_leads ? "Receiving" : '<span style="color:var(--warn)">Paused</span>'}</td><td class="mono">${u.target_ftd || "—"}</td><td>${u.last_login_at ? ago(u.last_login_at) : "Never"}</td><td class="r">${isAdmin() ? `<button class="c-btn sm" data-edit="${esc(u.id)}">Manage</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>` : `
        <p class="muted">Every sign-in, failed attempt, lockout and security change, newest first. Repeated failures from one IP can mean someone is guessing passwords.</p>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:900px"><thead><tr><th>When</th><th>Event</th><th>Account</th><th>IP address</th><th>Device</th><th>By</th></tr></thead><tbody>${logins.map(l => { const ev = EVENT[l.event] || [l.event, "var(--muted)"]; return `<tr><td class="mono">${fDT(l.created_at)}<small>${ago(l.created_at)}</small></td><td><span class="c-pill plain" style="--c:${ev[1]}">${esc(ev[0])}</span></td><td>${esc(l.name || "")}<small class="mono">${esc(l.username || "")}</small></td><td class="mono">${esc(l.ip || "—")}</td><td style="max-width:280px"><small>${esc((l.ua || "").slice(0, 90))}</small></td><td>${esc(l.by_name || "")}</td></tr>`; }).join("")}</tbody></table></div>${logins.length ? "" : '<div class="c-empty"><b>No sign-in activity yet</b></div>'}</div>`);
      const nb = $("#uNew"); if (nb) nb.addEventListener("click", () => userEditor(null));
      $$("[data-edit]").forEach(b => b.addEventListener("click", () => userEditor(users.find(x => x.id === b.dataset.edit))));
    },
  };
  function userEditor(u) {
    const isNew = !u, self = u && u.id === C.state.user.id; u = u || { role: "agent", active: true, accepts_leads: true, languages: [] };
    const acts = isNew ? "" : `<div class="c-card" style="background:var(--bg);display:grid;gap:10px"><b>Security</b><div class="c-row" style="font-size:13px">${u.locked ? `<span style="color:var(--down)">Locked until ${esc(fDT(u.locked_until))}</span>` : `<span class="muted">Not locked</span>`} · <span class="muted">${u.totp_enabled ? "Two-step verification on" : "Two-step verification off"}</span> · <span class="muted">Password ${u.password_changed_at ? "changed " + esc(ago(u.password_changed_at)) : u.has_password ? "set" : "not set"}</span></div>
      <div class="c-row">${u.locked ? '<button type="button" class="c-btn sm" data-ua="unlock">Unlock now</button>' : ""}${!self ? '<button type="button" class="c-btn sm" data-ua="signout">Sign out everywhere</button>' : ""}${u.totp_enabled && !self ? '<button type="button" class="c-btn sm danger" data-ua="reset_2fa">Reset two-step</button>' : ""}</div></div>`;
    const m = modal({
      title: isNew ? "Add team member" : u.name, wide: true, submit: isNew ? "Add" : "Save",
      body: `<div class="c-grid">${field("Full name", inp("name", u.name || ""))}${field("Username (for sign-in)", inp("username", u.username || "", 'autocomplete="off" autocapitalize="none"'))}
        ${field("Email", inp("email", u.email || "", 'type="email"'))}${field("Phone (shown to clients in messages)", inp("phone", u.phone || ""))}
        ${field("Role", sel("role", [["agent", "Sales agent"], ["manager", "Sales manager"], ["marketing", "Marketing executive"], ["marketing_manager", "Marketing manager"], ["operations", "Operations"], ["compliance", "Compliance"], ["admin", "Admin"]], u.role, self ? "disabled" : ""))}${field("Team / desk", inp("team", u.team || "", 'placeholder="e.g. West Africa desk"'))}
        ${field("Languages", listInput("languages", u.languages, "e.g. Arabic, English"))}${field("Phone extension (click-to-call)", inp("extension", u.extension || "", 'placeholder="e.g. 201"'))}
        ${field("Monthly FTD target", inp("target_ftd", u.target_ftd || "", 'type="number" min="0"'))}${field("Monthly FTD amount target (USD)", inp("target_amount", u.target_amount || "", 'type="number" min="0" step="500"'))}
        ${self ? "" : `${field(isNew ? "Starting password" : "Set a new password (leave empty to keep the current one)", '<input class="c-in" type="password" name="password" autocomplete="new-password">', "full")}
        <p class="muted full" style="font-size:12.5px">At least 10 characters, with letters and numbers. Share it with the person privately, e.g. in person or by phone, not by email.</p>
        <label class="c-switch full"><input type="checkbox" name="must_change_password" checked><span>Ask them to choose their own password at first sign-in</span></label>`}
        <label class="c-switch"><input type="checkbox" name="active" ${u.active ? "checked" : ""} ${self ? "disabled" : ""}><span>Active (can sign in)</span></label><label class="c-switch"><input type="checkbox" name="accepts_leads" ${u.accepts_leads ? "checked" : ""}><span>Receives new leads</span></label></div>
        ${self ? '<p class="muted" style="font-size:12.5px">Change your own password and two-step verification from the account menu at the top right.</p>' : ""}${acts}`,
      onOpen: el => $$("[data-ua]", el).forEach(b => b.addEventListener("click", async () => {
        const a = b.dataset.ua, msg = { unlock: ["Unlock account", `Let ${u.name} try signing in again now?`, "Unlock"], signout: ["Sign out everywhere", `End all of ${u.name}'s sessions on every device? They'll need to sign in again.`, "Sign out"], reset_2fa: ["Reset two-step verification", `Remove ${u.name}'s authenticator? Use this if they lost their phone. If their role requires two-step, they'll set it up again at next sign-in.`, "Reset"] }[a];
        if (!(await confirmBox(msg[0], msg[1], msg[2], a === "reset_2fa"))) return;
        try { await API.call("adminUserAction", u.id, a); toast("Done"); m.close(); C.render(); } catch (e) { toast(e.message); }
      })),
      onSubmit: async v => { const payload = Object.assign({ id: u.id }, v, { languages: splitList(v.languages) }); if (!payload.password) { delete payload.password; delete payload.must_change_password; } await API.call("saveUser", payload); toast(isNew ? "Account created" : "Saved"); await C.updateBadges(); C.render(); },
    });
  }

  /* ============================================================ IMPORT */
  function parseCsv(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === "," || ch === ";" || ch === "\t") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  const MAP = { first_name: ["first name", "firstname", "first_name", "name"], last_name: ["last name", "lastname", "last_name", "surname"], email: ["email", "e-mail", "mail"], dial_code: ["dial code", "dial_code", "country code", "code"], phone: ["phone", "mobile", "phone number", "whatsapp", "tel"], country: ["country"], city: ["city", "town"], area: ["area", "region", "district"], interest: ["interest", "product", "account type"], utm_source: ["source", "utm_source", "lead source"], utm_campaign: ["campaign", "utm_campaign"], language: ["language"] };
  C.views.import = {
    title: "Import leads", mgr: true,
    async render(page) {
      page.innerHTML = `<div class="c-card" style="display:grid;gap:12px;max-width:900px"><h3>Import from a spreadsheet</h3><p class="muted">Upload a CSV (save your Excel or Google Sheet as CSV). Columns are matched by header: first name, last name, email, dial code, phone, country, city, area, interest, source, campaign. Each lead is routed by territory unless you choose an owner. Repeat emails or phones are flagged.</p>
        <input type="file" accept=".csv,text/csv" id="iFile" class="c-in"><textarea class="c-ta" id="iText" rows="6" placeholder="…or paste CSV here, header row first"></textarea>
        <div class="c-row">${sel("owner", [["", "Route by territory"]].concat(salesUsers().map(u => [u.id, "Assign all to " + u.name])), "", 'id="iOwner" style="width:auto"')}<span class="sp"></span><button class="c-btn" id="iPrev">Preview</button></div>
        <div id="iOut"></div></div>`;
      let parsed = [];
      $("#iFile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("#iText").value = String(rd.result); preview(); }; rd.readAsText(f); });
      const preview = () => {
        const rows = parseCsv($("#iText").value.trim()); if (rows.length < 2) { $("#iOut").innerHTML = '<p class="muted">Add a header row and at least one lead.</p>'; return; }
        const head = rows[0].map(h => h.trim().toLowerCase()), idx = {};
        Object.entries(MAP).forEach(([k, names]) => { const i = head.findIndex(h => names.includes(h)); if (i >= 0) idx[k] = i; });
        parsed = rows.slice(1).map(r => { const o = {}; Object.entries(idx).forEach(([k, i]) => (o[k] = (r[i] || "").trim())); if (o.first_name && !o.last_name && o.first_name.includes(" ")) { const p = o.first_name.split(" "); o.first_name = p.shift(); o.last_name = p.join(" "); } if (o.phone && !o.dial_code && o.phone.startsWith("+")) { o.dial_code = "+"; } return o; });
        const cols = Object.keys(idx);
        $("#iOut").innerHTML = `<p><b>${parsed.length} rows</b> · matched columns: ${cols.map(esc).join(", ") || "none"}${!idx.phone || !idx.country ? ' <span style="color:var(--warn)">Phone and country are required.</span>' : ""}</p><div class="c-scroll"><table class="c-table"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${parsed.slice(0, 5).map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p style="margin-top:10px"><button class="c-btn pri" id="iGo">Import ${parsed.length} leads</button></p>`;
        $("#iGo").addEventListener("click", async () => { $("#iGo").disabled = true; try { const res = await API.call("importLeads", parsed, { owner_id: $("#iOwner").value || undefined }); $("#iOut").innerHTML = `<div class="c-banner"><b>${plural(res.created, "lead")} imported.</b>${res.failed.length ? ` ${plural(res.failed.length, "row")} skipped.` : ""}</div>${res.failed.length ? `<table class="c-table" style="margin-top:8px"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${res.failed.slice(0, 50).map(f => `<tr><td class="mono">${f.row}</td><td>${esc(f.error)}</td></tr>`).join("")}</tbody></table>` : ""}<p style="margin-top:10px"><a class="c-btn" href="${C.href("leads")}">View leads</a></p>`; C.updateBadges(); } catch (e) { toast(e.message); $("#iGo").disabled = false; } });
      };
      $("#iPrev").addEventListener("click", preview);
    },
  };

  /* ========================================================== SETTINGS */
  C.views.settings = {
    title: "Settings", mgr: true,
    async render(page, r, alive) {
      const s = await API.call("getSettings"); if (!alive()) return;
      const ch = s.channels || {};
      const tzs = [[-300, "UTC−05:00"], [0, "UTC±00:00 (London winter)"], [60, "UTC+01:00"], [120, "UTC+02:00"], [180, "UTC+03:00 (Riyadh)"], [240, "UTC+04:00 (Dubai, Mauritius)"], [300, "UTC+05:00 (Maldives, Uzbekistan)"], [330, "UTC+05:30 (India)"], [420, "UTC+07:00 (Bangkok)"], [480, "UTC+08:00 (Kuala Lumpur)"]];
      page.innerHTML = `<form class="c-card" id="sForm" style="display:grid;gap:16px;max-width:900px" novalidate>
        <h3>Company and links</h3><div class="c-grid">${field("Company name", inp("company", s.company))}${field("Support email", inp("support_email", s.support_email))}${field("Registration link", inp("register_url", s.register_url), "full")}${field("Client area link", inp("login_url", s.login_url), "full")}${field("Company WhatsApp number", inp("whatsapp_number", s.whatsapp_number))}${field("Reporting time zone", sel("tz_offset_min", tzs, s.tz_offset_min))}</div>
        <h3>Calling rules</h3><div class="c-grid">${field("Call new leads within (minutes)", inp("sla_minutes", s.sla_minutes, 'type="number" min="1"'))}${field("Give up after this many unanswered attempts", inp("max_attempts", s.max_attempts, 'type="number" min="1"'))}${field("Retry unanswered calls after (hours, in order)", inp("retry_hours", (s.retry_hours || []).join(", ")), "full")}</div>
        <h3>Lead routing</h3>${field("Leads that match no territory", sel("fallback", [["pool", "Wait in the Unassigned pool for a manager"], ["round_robin_all", "Share round-robin across all agents"]], s.fallback))}
        <h3>Automation quiet hours</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="quiet.enabled" ${s.quiet && s.quiet.enabled ? "checked" : ""}><span>Don't message clients at night</span></label>${field("From", `<input class="c-in" type="time" name="quiet.start" value="${esc(s.quiet ? s.quiet.start : "21:00")}">`)}${field("Until", `<input class="c-in" type="time" name="quiet.end" value="${esc(s.quiet ? s.quiet.end : "09:00")}">`)}</div>
        <h3>First deposits</h3><label class="c-switch"><input type="checkbox" name="deposit_approval" ${s.deposit_approval ? "checked" : ""}><span>A sales manager must verify each first deposit before the lead counts as funded</span></label>
        <div class="c-grid g3">${field("Stuck after (days) · Qualified", inp("stuck_days.qualified", s.stuck_days.qualified, 'type="number" min="1"'))}${field("Registered", inp("stuck_days.registered", s.stuck_days.registered, 'type="number" min="1"'))}${field("KYC verified", inp("stuck_days.kyc", s.stuck_days.kyc, 'type="number" min="1"'))}</div>
        <h3>Company-funded account (optional)</h3><p class="muted" style="font-size:12.5px">A small live balance the company credits for a verified client who wants proof before depositing. It never counts as an FTD; only the client's own deposit does.</p>
        <div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="bonus.enabled" ${s.bonus.enabled ? "checked" : ""}><span>Agents can offer it</span></label>${field("Amount (USD)", inp("bonus.amount", s.bonus.amount, 'type="number" min="1"'))}${field("Expires after (days)", inp("bonus.expiry_days", s.bonus.expiry_days, 'type="number" min="1"'))}
          ${field("Lots before profit can be withdrawn", inp("bonus.min_lots", s.bonus.min_lots, 'type="number" min="0" step="0.1"'))}${field("Most profit withdrawable (USD)", inp("bonus.max_profit", s.bonus.max_profit, 'type="number" min="0"'))}${field("Most per month (0 = no limit)", inp("bonus.monthly_cap", s.bonus.monthly_cap, 'type="number" min="0"'))}
          <label class="c-switch"><input type="checkbox" name="bonus.require_kyc" ${s.bonus.require_kyc ? "checked" : ""}><span>Only after KYC is verified</span></label><label class="c-switch"><input type="checkbox" name="bonus.withdraw_needs_deposit" ${s.bonus.withdraw_needs_deposit ? "checked" : ""}><span>Profit withdrawable only after the client's own deposit</span></label></div>
        <h3>Speed-to-lead reassignment</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="sla_reassign.enabled" ${s.sla_reassign.enabled ? "checked" : ""}><span>Move uncalled new leads to an online colleague</span></label>${field("After (minutes)", inp("sla_reassign.minutes", s.sla_reassign.minutes, 'type="number" min="5"'))}${field("At most (times per lead)", inp("sla_reassign.max", s.sla_reassign.max, 'type="number" min="1" max="5"'))}</div>
        <h3>Recycle lost leads</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="recycle.enabled" ${s.recycle.enabled ? "checked" : ""}><span>Reopen lost leads automatically for a different agent</span></label>${field("After (days lost)", inp("recycle.days", s.recycle.days, 'type="number" min="1"'))}${field("At most (times per lead)", inp("recycle.max", s.recycle.max, 'type="number" min="1" max="5"'))}</div>${field("Only these lost reasons", chips("recycle.reasons", s.lost_reasons, s.recycle.reasons || []))}
        <h3>Broadcasts (marketing)</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="broadcast_approval" ${s.broadcast_approval ? "checked" : ""}><span>Marketing executives need a marketing manager's approval</span></label>${field("Send at most (messages per minute)", inp("broadcast_rate_per_min", s.broadcast_rate_per_min, 'type="number" min="0"'))}${field("One broadcast per client every (days)", inp("broadcast_cap_days", s.broadcast_cap_days, 'type="number" min="0"'))}</div>
        ${field("Public website address (for unsubscribe links)", inp("site_url", s.site_url))}
        <h3>Daily MIS email</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="mis_email.enabled" ${s.mis_email.enabled ? "checked" : ""}><span>Email yesterday's summary every morning</span></label>${field("Send at (hour, company time)", inp("mis_email.hour", s.mis_email.hour, 'type="number" min="0" max="23"'))}${field("Recipients (comma separated)", inp("mis_email.recipients", (s.mis_email.recipients || []).join(", ")))}</div>${isAdmin() ? '<p><button type="button" class="c-btn sm" id="sMis">Send yesterday\'s summary now</button></p>' : ""}
        <h3>Sign-in security</h3>${field("Require two-step verification for", chips("require_2fa_roles", [["admin", "Admins"], ["manager", "Sales managers"], ["agent", "Sales agents"], ["marketing_manager", "Marketing managers"], ["marketing", "Marketing executives"], ["operations", "Operations"], ["compliance", "Compliance"]], s.require_2fa_roles || []))}<p class="muted" style="font-size:12.5px">People in these roles must set up an authenticator app at their next sign-in. Passwords need 10+ characters with letters and numbers. Accounts lock for 15 minutes after 5 wrong attempts.</p>
        <h3>Lost reasons</h3>${field("One per line", `<textarea class="c-ta" name="lost_reasons" rows="6">${esc((s.lost_reasons || []).join("\n"))}</textarea>`)}
        <p class="err-msg" style="color:var(--warn)" hidden></p><div class="c-row"><span class="sp"></span>${isAdmin() ? '<button class="c-btn pri" type="submit">Save settings</button>' : '<span class="muted">Only admins can change settings.</span>'}</div></form>
        <div class="c-card" style="max-width:900px"><h3>Email and WhatsApp connections</h3>
          ${ch.email && ch.email.simulated ? '<p class="muted">In this prototype, messages are simulated: they appear in each lead\'s timeline and in Messages, but nothing is sent.</p>' : `<dl class="c-dl"><dt>Email</dt><dd>${ch.email && ch.email.configured ? `<b style="color:var(--up)">Connected</b> via ${esc(ch.email.provider)} from ${esc(ch.email.from)}` : '<b style="color:var(--warn)">Not connected.</b> Set EMAIL_PROVIDER, EMAIL_FROM and the provider keys in the server .env file.'}</dd><dt>WhatsApp</dt><dd>${ch.whatsapp && ch.whatsapp.configured ? `<b style="color:var(--up)">Connected</b> · phone number ID ${esc(ch.whatsapp.phone_number_id)}${ch.whatsapp.webhook ? " · replies webhook on" : " · set WHATSAPP_VERIFY_TOKEN to receive replies"}` : '<b style="color:var(--warn)">Not connected.</b> Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env. Webhook URL for replies: <span class="mono">https://your-domain/webhooks/whatsapp</span>'}</dd></dl><p class="muted" style="font-size:12.5px;margin-top:8px">Keys live in the server's .env file, never in the database, so they can't leak through the CRM.</p>`}</div>`;
      if (isAdmin()) page.insertAdjacentHTML("beforeend", `<div class="c-card" style="max-width:900px"><h3>Full backup</h3><p class="muted" style="margin-bottom:12px">Downloads every lead, call, note, message, user (with password hashes, not passwords) and setting as one file. Use it to move to a new server with <span class="mono">node tools/import-backup.js</span>. It contains client data, so store it securely.</p><button class="c-btn" id="sBackup">Download full backup</button></div>`);
      const bk = $("#sBackup"); if (bk) bk.addEventListener("click", async () => { try { const data = await API.call("exportAll"); await API.download("absel-crm-backup-" + C.todayStr() + ".json", JSON.stringify(data), "application/json"); toast("Backup downloaded"); } catch (e) { toast(e.message); } });
      const f = $("#sForm");
      const mb = $("#sMis"); if (mb) mb.addEventListener("click", async () => { if (API.mode === "prototype") return toast("The daily email is sent by the live server."); try { const x = await API.call("sendMisNow"); toast(`Sent to ${x.sent} recipient(s)`); } catch (err) { toast(err.message); } });
      f.addEventListener("submit", async e => { e.preventDefault(); const v = readForm(f), er = $(".err-msg", f); er.hidden = true; v.lost_reasons = v.lost_reasons.split("\n").map(x => x.trim()).filter(Boolean); v.recycle = Object.assign({}, v.recycle, { reasons: (v.recycle && v.recycle.reasons) || [] }); v.require_2fa_roles = v.require_2fa_roles || []; try { await API.call("saveSettings", v); toast("Settings saved"); await C.updateBadges(); } catch (err) { er.textContent = err.message; er.hidden = false; } });
      if (!isAdmin()) $$("input,select,textarea", f).forEach(x => (x.disabled = true));
    },
  };
})();
