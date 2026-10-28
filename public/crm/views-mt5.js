/* Absel CRM — MT5 Web API screens for operations: connection status card, unlinked MT5 accounts, MT5 reconciliation. */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, fDate, fDT, ago, toast, modal, confirmBox, field, inp, sel } = C;
  const meta = () => C.state.meta;
  const { isOps } = C;
  const mt5 = () => meta().mt5 || { mode: "manual" };
  const kpi = (label, val, sub, cls = "") => `<div class="c-kpi ${cls}"><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></div>`;

  /* ------------------------------------------------------------ status card (Client area settings, operations desk) */
  C.mt5Card = (st, o = {}) => {
    const a = st.api || {}, sy = st.sync || {}, api = st.mode === "api";
    const pill = !api ? '<span class="c-pill plain">Manual mode</span>' : sy.failing_since ? '<span class="c-pill plain" style="--c:var(--down)">Sync failing</span>' : a.connected || sy.last_ok_at ? '<span class="c-pill plain" style="--c:var(--up)">Connected</span>' : '<span class="c-pill plain" style="--c:var(--warn)">Not connected yet</span>';
    const groups = (st.groups || []), found = sy.groups_found || [];
    return `<div class="c-card" style="max-width:980px;overflow-wrap:anywhere" id="mt5Card"><div class="c-row"><b>MT5 Web API</b> ${pill}${api && st.writes_enabled ? ' <span class="c-pill plain" style="--c:var(--cta)">Writes on</span>' : ""}<span class="sp"></span>${api && isOps() ? `<button type="button" class="c-btn sm" id="mt5Sync">${st.syncing ? "Syncing…" : "Sync now"}</button>` : ""}</div>
      ${api ? `<dl class="c-dl" style="margin-top:8px"><dt>Server</dt><dd class="mono">${esc(a.server || "not set")}${a.manager ? " · manager " + esc(a.manager) : ""}${a.tls_insecure ? ' · <b style="color:var(--down)">certificate not checked</b>' : ""}</dd>
        <dt>Login range</dt><dd class="mono">${a.range_ok ? esc(a.range.from) + "–" + esc(a.range.to) : '<b style="color:var(--down)">not set (MT5_LOGIN_FROM / MT5_LOGIN_TO)</b>'}</dd>
        <dt>Last sync</dt><dd>${sy.last_ok_at ? fDT(sy.last_ok_at) + " (" + ago(sy.last_ok_at) + ")" : "never"}${a.sync_seconds ? " · every " + esc(a.sync_seconds) + "s" : ""}${sy.last_result ? ` · ${num(sy.last_result.accounts)} accounts, ${num(sy.last_result.deals_new)} new deals, ${num(sy.last_result.positions)} open positions` : ""}</dd>
        ${sy.last_error ? `<dt>Error</dt><dd style="color:var(--down)">${esc(sy.last_error)}${sy.failing_since ? " · since " + fDT(sy.failing_since) : ""}</dd>` : ""}
        <dt>Groups</dt><dd>${groups.length ? groups.map(g => { const f = found.find(x => x.group === g.group); return `<span class="mono">${esc(g.group)}</span> <small class="muted">${esc(g.kind)} ${esc(g.type)}${f ? f.error ? ' · <span style="color:var(--down)">' + esc(f.error) + "</span>" : " · " + num(f.logins) + " accounts" + (f.outside ? ", " + num(f.outside) + " outside the range" : "") : ""}</small>`; }).join("<br>") : '<span class="muted">none yet. Set the MT5 group per account type below.</span>'}</dd>
        <dt>Synced</dt><dd>${num(st.deals || 0)} deals · ${num(st.positions || 0)} open positions · ${st.unlinked ? `<a href="${C.href("mt5unlinked")}">${num(st.unlinked)} unlinked accounts</a>` : "no unlinked accounts"}</dd></dl>
        ${(st.alerts || []).length ? `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12.5px">Recent alerts (${st.alerts.length})</summary>${st.alerts.map(x => `<p style="font-size:12.5px">${fDT(x.at)} · ${esc(x.text)}</p>`).join("")}</details>` : ""}`
      : `<p class="muted" style="font-size:12.5px">MT5_MODE=manual: operations opens accounts and moves money in MT5 Manager and records it here, and balances come from the daily import. To connect, add the MT5_* values from Absel Markets to .env, check them with <span class="mono">node tools/mt5-check.js</span>, then set MT5_MODE=api and restart.</p>`}
      ${o.extra || ""}</div>`;
  };
  C.wireMt5Card = (page, after) => {
    const b = $("#mt5Sync", page); if (!b) return;
    b.addEventListener("click", async () => { b.disabled = true; b.textContent = "Syncing…"; try { const r = await API.call("mt5SyncNow"); toast(`Synced: ${r.accounts ? r.accounts.updated : 0} accounts updated, ${r.deals ? r.deals.new : 0} new deals`); } catch (e) { toast(e.message); } (after || C.render)(); });
  };

  /* ------------------------------------------------------------ unlinked MT5 accounts */
  C.views.mt5unlinked = {
    title: "Unlinked MT5 accounts",
    async render(page, r, alive) {
      const st = r.params.status || "open", rows = await API.call("listMt5Unlinked", { status: st, q: r.params.q || "" }); if (!alive()) return;
      page.innerHTML = `<div class="c-banner">These accounts are in Absel Global's MT5 login range, but no client in the back office owns them. They may have been opened by hand in MT5 Manager, or before the client area existed. Link each one to the right client. Nothing is linked automatically.</div>
        <div class="c-row"><div class="c-seg">${[["open", "To link"], ["linked", "Linked"], ["ignored", "Not client accounts"]].map(([k, l]) => `<button data-st="${k}" class="${st === k ? "on" : ""}">${l}</button>`).join("")}</div><span class="sp"></span><input class="c-in" style="width:240px" type="search" id="uQ" placeholder="Search login, name or email" value="${esc(r.params.q || "")}"></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:960px"><thead><tr><th>MT5 login</th><th>Name in MT5</th><th>Group</th><th class="r">Balance</th><th>First seen</th><th>${st === "open" ? "Possible client" : st === "linked" ? "Linked" : "Reason"}</th><th></th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="mono"><b>${esc(x.login)}</b><small>1:${esc(x.leverage || "?")}</small></td><td>${esc(x.name || "—")}<small>${esc(x.email || "")}${x.country ? " · " + esc(x.country) : ""}</small></td><td class="mono" style="font-size:12px">${esc(x.group)}</td>
          <td class="num">${x.balance == null ? "—" : money(x.balance)}${x.equity != null && x.equity !== x.balance ? `<small>equity ${money(x.equity)}</small>` : ""}</td><td>${fDate(x.first_seen_at)}<small>seen ${ago(x.last_seen_at)}</small></td>
          <td>${st === "open" ? (x.suggest ? `<a href="${C.href("client/" + x.suggest.id)}">${esc(x.suggest.name)}</a><small>same email</small>` : '<span class="muted">no match by email</span>') : st === "linked" ? `${esc(x.linked_by_name)}<small>${fDT(x.linked_at)}</small>` : esc(x.ignored_reason || "")}</td>
          <td class="r" style="white-space:nowrap">${st === "open" && isOps() ? `<button class="c-btn sm" data-ign="${esc(x.id)}">Not a client account</button> <button class="c-btn sm pri" data-link="${esc(x.id)}">Link to client</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : `<div class="c-empty"><b>${st === "open" ? "Every MT5 account is linked" : "Nothing here"}</b></div>`}</div>`;
      $$("[data-st]").forEach(b => b.addEventListener("click", () => C.go("mt5unlinked", { status: b.dataset.st })));
      $("#uQ").addEventListener("input", C.debounce(e => C.go("mt5unlinked", { status: st, q: e.target.value.trim() }), 400));
      const find = id => rows.find(x => x.id === id), types = meta().portal.account_types;
      $$("[data-link]").forEach(b => b.addEventListener("click", () => {
        const x = find(b.dataset.link), guess = types.find(t => t.mt5_group === x.group || t.mt5_demo_group === x.group), kind = guess && guess.mt5_demo_group === x.group ? "demo" : "live";
        modal({ title: `Link MT5 ${x.login} to a client`, wide: true, submit: "Link account",
          body: `<p class="muted">${esc(x.name || "No name")} · ${esc(x.email || "no email")} · <span class="mono">${esc(x.group)}</span></p>
            <div class="c-grid">${field("Find the client (name, email or phone)", `<input class="c-in" type="search" id="lQ" value="${esc(x.suggest ? x.suggest.email : x.email || "")}" autocomplete="off">`, "full")}
            <div class="full" id="lRes" style="display:grid;gap:6px"></div><input type="hidden" name="client_id" value="${esc(x.suggest ? x.suggest.id : "")}">
            ${field("Account type", sel("type", types.map(t => [t.id, t.name]), guess ? guess.id : types[0].id))}${field("Live or demo", sel("kind", [["live", "Live"], ["demo", "Demo"]], kind))}</div>
            <p class="muted" style="font-size:12.5px">The client sees the account in the client area at once. They aren't emailed, because the account already exists. Its earlier synced trades are attached to the client.</p>`,
          onOpen: el => {
            const pick = (id, name) => { $("[name=client_id]", el).value = id; $$("[data-cid]", el).forEach(z => z.classList.toggle("pri", z.dataset.cid === id)); toast("Selected " + name); };
            const search = async q => { if (q.length < 2) { $("#lRes", el).innerHTML = ""; return; } try { const cs = await API.call("listClients", { q }); $("#lRes", el).innerHTML = cs.slice(0, 8).map(c => `<button type="button" class="c-btn sm ${$("[name=client_id]", el).value === c.id ? "pri" : ""}" data-cid="${esc(c.id)}" data-cn="${esc(c.name)}" style="justify-content:flex-start">${esc(c.name)} · ${esc(c.email)} · ${esc(c.country)}</button>`).join("") || '<span class="muted">No client found</span>'; $$("[data-cid]", el).forEach(z => z.addEventListener("click", () => pick(z.dataset.cid, z.dataset.cn))); } catch (e) { toast(e.message); } };
            $("#lQ", el).addEventListener("input", C.debounce(e => search(e.target.value.trim()), 300)); search($("#lQ", el).value.trim());
          },
          onSubmit: async v => { if (!v.client_id) throw new Error("Choose the client first."); await API.call("mt5LinkAccount", x.id, { client_id: v.client_id, type: v.type, kind: v.kind }); toast("Linked. The client sees the account now"); C.updateBadges(); C.render(); } });
      }));
      $$("[data-ign]").forEach(b => b.addEventListener("click", () => modal({ title: "Not a client account", body: field("Why (e.g. house account, test account)", inp("reason", "")), submit: "Save", onSubmit: async v => { await API.call("mt5IgnoreUnlinked", b.dataset.ign, v.reason); toast("Saved"); C.updateBadges(); C.render(); } })));
    },
    refresh(page, r, alive) { if (!document.querySelector(".c-modal")) return this.render(page, r, alive); },
  };

  /* ------------------------------------------------------------ MT5 reconciliation */
  C.views.mt5recon = {
    title: "MT5 reconciliation",
    async render(page, r, alive) {
      const p = r.params, f = C.reportFilters(p), d = await API.call("mt5Reconcile", { from: f.from, to: f.to }); if (!alive()) return;
      const t = d.totals, rows = p.only === "all" ? d.rows : d.rows.filter(x => x.diff || x.outside.length || x.ours_unmatched.length);
      page.innerHTML = C.rangeBar("mt5recon", p, { agent: false, source: false, country: false }) + `
        ${d.mode !== "api" ? `<div class="c-banner warn">MT5 is in manual mode, so MT5 deals aren't read and the MT5 side of this report stays empty. Our completed requests are listed as not found in MT5.</div>` : `<p class="muted" style="font-size:12.5px">MT5 deals synced up to ${d.last_deal_time ? fDT(d.last_deal_time) : "—"} · last sync ${d.last_ok_at ? ago(d.last_ok_at) : "never"}.</p>`}
        <div class="c-kpis">${kpi("Matched by reference", num(t.matched), "our request ↔ MT5 balance deal", "good")}${kpi("Ours, not found in MT5", num(t.unmatched), "completed here, no deal with the reference", t.unmatched ? "alert" : "")}${kpi("Made outside the system", num(t.outside), "MT5 balance deals without our reference", t.outside ? "alert" : "")}${kpi("Logins with a difference", num(t.with_difference), `MT5 in ${money(t.mt5_in)} · out ${money(t.mt5_out)}`)}</div>
        <div class="c-row"><div class="c-seg"><button data-only="diff" class="${p.only !== "all" ? "on" : ""}">Only differences</button><button data-only="all" class="${p.only === "all" ? "on" : ""}">All logins</button></div><span class="sp"></span><button class="c-btn sm" id="rcCsv">Export CSV</button></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1050px"><thead><tr><th>MT5 login</th><th>Client</th><th class="r">Ours in</th><th class="r">MT5 in</th><th class="r">Ours out</th><th class="r">MT5 out</th><th class="r">Difference</th><th>Details</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="mono"><b>${esc(x.login || "—")}</b></td><td>${x.client ? `<a href="${C.href("client/" + x.client.id)}">${esc(x.client.name)}</a>` : '<span class="muted">not linked</span>'}</td>
          <td class="num">${money(x.ours_in)}</td><td class="num">${money(x.mt5_in)}</td><td class="num">${money(x.ours_out)}</td><td class="num">${money(x.mt5_out)}</td>
          <td class="num"><b style="color:${x.diff ? "var(--down)" : "var(--up)"}">${x.diff ? money(x.diff) : "✓"}</b><small>${num(x.matched)} matched</small></td>
          <td style="font-size:12.5px">${x.ours_unmatched.map(o => `<div>⚠ <b class="mono">${esc(o.ref)}</b> ${esc(o.type)} ${money(o.amount)}: ${esc(o.why)}</div>`).join("")}${x.outside.map(o => `<div>⚠ MT5 deal <span class="mono">#${esc(o.ticket)}</span> ${money(o.amount)} ${fDT(o.time)}${o.comment ? " · “" + esc(o.comment) + "”" : ""}: made outside the system${o.possible ? ` (same amount as <b class="mono">${esc(o.possible)}</b>)` : ""}</div>`).join("")}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : `<div class="c-empty"><b>${d.rows.length ? "No differences in this period" : "No money movements in this period"}</b></div>`}</div>
        <p class="muted" style="font-size:12.5px">Each completed deposit, withdrawal and transfer is matched to an MT5 balance deal whose comment contains its reference (DEP, WD, TRF-OUT and TRF-IN followed by the reference). Balance deals without one of our references were made by hand in MT5 Manager: check them and record any missing request.</p>`;
      C.wireRange("mt5recon", p);
      $$("[data-only]").forEach(b => b.addEventListener("click", () => C.go("mt5recon", Object.assign({}, p, { only: b.dataset.only === "all" ? "all" : "" }))));
      $("#rcCsv").addEventListener("click", () => C.downloadCsv("absel-mt5-reconciliation-" + d.from + "-" + d.to, ["Login", "Client", "Ours in", "MT5 in", "Ours out", "MT5 out", "Difference", "Matched", "Not found in MT5", "Made outside"], d.rows.map(x => [x.login, x.client ? x.client.name : "", x.ours_in, x.mt5_in, x.ours_out, x.mt5_out, x.diff, x.matched, x.ours_unmatched.map(o => o.ref + " " + o.amount).join("; "), x.outside.map(o => "#" + o.ticket + " " + o.amount + " " + o.comment).join("; ")])));
    },
  };
})();
