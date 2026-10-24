/* Absel CRM — Operations back office for the Absel Global client area:
   KYC review, account opening, client money (deposits, withdrawals, transfers), clients, balance import, client-area settings. */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, fDate, fDT, ago, isAdmin, isSales, toast, modal, confirmBox, field, inp, sel } = C;
  const meta = () => C.state.meta;
  const { isOps, isKyc } = C;
  const hrs = h => h == null ? "—" : h < 1 ? Math.round(h * 60) + " min" : h < 48 ? Math.round(h * 10) / 10 + " h" : Math.round(h / 24) + " d";
  const late = (h, lim) => h != null && h > lim ? "c-wait late" : "";
  const KYC = { none: ["Not uploaded", "var(--muted)"], pending: ["To review", "var(--warn)"], approved: ["Approved", "var(--up)"], rejected: ["Rejected", "var(--down)"], resubmit: ["New documents asked", "var(--down)"] };
  const kycPill = s => { const [l, c] = KYC[s || "none"] || KYC.none; return `<span class="c-pill plain" style="--c:${c}">${esc(l)}</span>`; };
  const PST = { pending: ["Waiting", "var(--warn)"], first_approved: ["1 of 2 approvals", "var(--warn)"], approved: ["Approved, to pay", "var(--cta)"], completed: ["Completed", "var(--up)"], rejected: ["Rejected", "var(--down)"], cancelled: ["Cancelled by client", "var(--muted)"], requested: ["To open", "var(--warn)"], open: ["Open", "var(--up)"], closed: ["Closed", "var(--muted)"] };
  const pPill = s => { const [l, c] = PST[s] || [s, "var(--muted)"]; return `<span class="c-pill plain" style="--c:${c}">${esc(l)}</span>`; };
  const KIND = id => (meta().kyc_kinds.find(k => k.id === id) || { label: id.replace("_", " ") }).label.split(" (")[0];
  C.openClientFile = async id => {
    try {
      const f = await API.call("getClientFile", id);
      if (f.type === "application/pdf") { const bin = atob(f.data.split(",")[1]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank"); return; }
      modal({ title: f.name, wide: true, body: `<img src="${esc(f.data)}" alt="${esc(f.name)}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto">` });
    } catch (e) { toast(e.message); }
  };
  const genPw = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", r = crypto.getRandomValues(new Uint8Array(10)); let s = ""; r.forEach(b => s += a[b % a.length]); return s.slice(0, 4) + "-" + s.slice(4) + "7"; };
  const seg = (route, tabs, cur, params = {}) => `<div class="c-seg">${tabs.map(([k, l, n]) => `<button data-seg="${k}" class="${cur === k ? "on" : ""}">${esc(l)}${n ? ` <b class="mono">${n}</b>` : ""}</button>`).join("")}</div>`;
  const wireSeg = (route, key, params = {}) => $$("[data-seg]").forEach(b => b.addEventListener("click", () => C.go(route, Object.assign({}, params, { [key]: b.dataset.seg }))));
  const kpi = (label, val, sub, cls = "", href = "") => `<${href ? "a" : "div"} class="c-kpi ${cls}" ${href ? `href="${C.href(href)}" style="text-decoration:none"` : ""}><span>${esc(label)}</span><b>${val}</b><small>${sub || ""}</small></${href ? "a" : "div"}>`;

  /* ------------------------------------------------------------ overview */
  C.views.ops = {
    title: "Operations desk",
    async render(page, r, alive) {
      const d = await API.call("opsOverview"); if (!alive()) return;
      const q = d.queues, m = d.money;
      page.innerHTML = `<div class="c-banner">Everything clients ask for in the Absel Global client area lands here. Do the step at Absel Markets (back-office or MT5 Manager), then record it so the client sees it at once.</div>
        <div class="c-kpis">
          ${kpi("Documents to review", num(q.kyc), q.kyc ? "oldest " + hrs(q.kyc_oldest_h) : "all clear", q.kyc_oldest_h > 8 ? "alert" : "", "kyc")}
          ${isOps() ? kpi("Accounts to open", num(q.accounts), q.accounts ? "oldest " + hrs(q.accounts_oldest_h) : "all clear", q.accounts_oldest_h > 8 ? "alert" : "", "openacc") : ""}
          ${isOps() ? kpi("Deposits to confirm", num(q.deposits), q.deposits ? "oldest " + hrs(q.deposits_oldest_h) : "all clear", q.deposits_oldest_h > 4 ? "alert" : "", "money?type=deposit") : ""}
          ${isOps() ? kpi("Withdrawals", num(q.withdrawals), `${money(m.pending_wd)} waiting${q.second_approval ? " · " + q.second_approval + " need a 2nd approval" : ""}`, q.withdrawals_oldest_h > 24 ? "alert" : "", "money?type=withdrawal") : ""}
          ${isOps() ? kpi("Transfers", num(q.transfers), "between client accounts", "", "money?type=transfer") : ""}
        </div>
        <div class="c-kpis">
          ${kpi("Deposits today", money(m.dep_today), "this month " + money(m.dep_month), "good")}${kpi("Withdrawals today", money(m.wd_today), "this month " + money(m.wd_month))}
          ${kpi("Net this month", money(m.dep_month - m.wd_month), "deposits − withdrawals")}
          ${kpi("Clients", num(d.clients.total), `${d.clients.today} new today · ${d.clients.verified} verified · ${d.clients.funded} funded`, "", "clients")}
          ${kpi("MT5 accounts", num(d.accounts.live), d.accounts.demo + " demo")}
        </div>
        ${isOps() ? `<div class="c-card c-row"><div><b>Balances</b><p class="muted" style="font-size:13px">${d.last_balance_import ? "Last import " + fDT(d.last_balance_import) + " (" + ago(d.last_balance_import) + ")" : "Not imported yet."} Import the daily balance report from Absel Markets so clients see up-to-date balances.</p></div><span class="sp"></span><a class="c-btn pri" href="${C.href("balances")}">Import balances</a></div>` : ""}`;
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ------------------------------------------------------------ KYC */
  C.views.kyc = {
    title: "KYC review",
    async render(page, r, alive) {
      const st = r.params.status || "pending", rows = await API.call("listKyc", { status: st }); if (!alive()) return;
      page.innerHTML = `${seg("kyc", [["pending", "To review"], ["resubmit", "Waiting for new documents"], ["rejected", "Rejected"], ["approved", "Approved"], ["none", "Not uploaded"]], st)}
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>Client</th><th>Country</th><th>Documents</th><th>Waiting</th><th>Sales owner</th><th></th></tr></thead><tbody>
        ${rows.map(x => `<tr><td><a href="${C.href("client/" + x.id)}"><b>${esc(x.name)}</b></a><small>${esc(x.email)} · ${esc(x.dial_code)} ${esc(x.phone)}</small>${x.dob ? `<small>Born ${esc(x.dob)}${x.nationality ? " · " + esc(x.nationality) : ""}</small>` : ""}</td><td>${esc(x.country)}<small>${esc([x.address, x.city].filter(Boolean).join(", "))}</small></td>
          <td>${x.docs.length ? x.docs.map(dc => `<button class="c-btn sm" data-doc="${esc(dc.id)}" title="${esc(dc.name)}">${esc(KIND(dc.kind))}${dc.review === "rejected" ? " ✕" : dc.review === "approved" ? " ✓" : ""}</button>`).join(" ") : '<span class="muted">none</span>'}${x.kyc.reason ? `<small>${esc(x.kyc.reason)}</small>` : ""}</td>
          <td><span class="${late(x.waiting_h, 8)}">${x.waiting_h != null ? hrs(x.waiting_h) : "—"}</span></td><td>${esc(x.owner_name)}</td>
          <td class="r" style="white-space:nowrap">${st !== "approved" && x.docs.length ? `<button class="c-btn sm" data-fix="${esc(x.id)}">Ask for new</button> <button class="c-btn sm danger" data-rej="${esc(x.id)}">Reject</button> <button class="c-btn sm good" data-ok="${esc(x.id)}">Approve</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>Nothing here</b></div>'}</div>
        <p class="muted" style="font-size:12.5px">Check the ID is valid and readable, the name matches, the address proof is under 3 months old, and the selfie matches the ID. Approving moves the lead to “KYC verified” and emails the client. Send the KYC pack to Absel Markets as your agreement requires.</p>`;
      wireSeg("kyc", "status");
      $$("[data-doc]").forEach(b => b.addEventListener("click", () => C.openClientFile(b.dataset.doc)));
      const done = () => C.render();
      $$("[data-ok]").forEach(b => b.addEventListener("click", async () => { const x = rows.find(y => y.id === b.dataset.ok); if (!(await confirmBox("Approve documents", `Approve ${x.name}'s identity and address?`, "Approve", false))) return; try { await API.call("decideKyc", x.id, "approved"); toast("Approved. The client and sales owner were told"); done(); } catch (e) { toast(e.message); } }));
      const reasonModal = (id, decision) => modal({ title: decision === "rejected" ? "Reject documents" : "Ask for new documents", body: field("What's wrong? The client sees this.", sel("preset", ["", "The photo is blurry or cut off", "The proof of address is older than 3 months", "The name doesn't match the ID", "The ID has expired", "Upload the back of your ID card"], "", 'id="kP"') + '<textarea class="c-ta" name="reason" id="kR" rows="3" style="margin-top:8px"></textarea>'), submit: decision === "rejected" ? "Reject" : "Send", danger: decision === "rejected", onOpen: el => $("#kP", el).addEventListener("change", e => { $("#kR", el).value = e.target.value; }), onSubmit: async v => { await API.call("decideKyc", id, decision, v.reason); toast("Sent to the client"); done(); } });
      $$("[data-fix]").forEach(b => b.addEventListener("click", () => reasonModal(b.dataset.fix, "resubmit")));
      $$("[data-rej]").forEach(b => b.addEventListener("click", () => reasonModal(b.dataset.rej, "rejected")));
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };

  /* ------------------------------------------------------------ account opening */
  C.views.openacc = {
    title: "Account opening",
    async render(page, r, alive) {
      const st = r.params.status || "requested", rows = await API.call("listAccountRequests", { status: st, q: r.params.q || "" }); if (!alive()) return;
      page.innerHTML = `<div class="c-row">${seg("openacc", [["requested", "To open"], ["open", "Open"], ["rejected", "Declined"], ["closed", "Closed"]], st)}<span class="sp"></span><input class="c-in" style="width:240px" type="search" id="aQ" placeholder="Search name, email or MT5 login" value="${esc(r.params.q || "")}"></div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>Requested</th><th>Client</th><th>KYC</th><th>Account</th><th>MT5 login</th><th>${st === "requested" ? "Waiting" : "Opened by"}</th><th></th></tr></thead><tbody>
        ${rows.map(a => `<tr><td>${fDT(a.created_at)}</td><td>${a.client ? `<a href="${C.href("client/" + a.client.id)}"><b>${esc(a.client.name)}</b></a><small>${esc(a.client.email)} · ${esc(a.client.country)}</small>` : "—"}</td><td>${kycPill(a.client && a.client.kyc)}</td>
          <td><b>${esc(a.type_name)}</b> <span class="c-tag ${a.kind === "live" ? "info" : ""}">${a.kind.toUpperCase()}</span><small>1:${esc(a.leverage)} · ${esc(a.currency)}${a.kind === "demo" ? " · $" + num(a.balance) + " practice" : ""}</small></td>
          <td class="mono">${esc(a.login || "—")}<small>${esc(a.server || "")}${a.group ? " · " + esc(a.group) : ""}</small></td>
          <td>${st === "requested" ? `<span class="${late(a.waiting_h, 8)}">${hrs(a.waiting_h)}</span>` : esc(a.opened_by_name)}${a.reject_reason ? `<small>${esc(a.reject_reason)}</small>` : ""}</td>
          <td class="r" style="white-space:nowrap">${st === "requested" && isOps() ? `<button class="c-btn sm" data-dec="${esc(a.id)}">Decline</button> <button class="c-btn sm pri" data-open="${esc(a.id)}">Record as opened</button>` : st === "open" && isOps() ? `<button class="c-btn sm" data-pw="${esc(a.id)}">New password</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>Nothing here</b></div>'}</div>`;
      wireSeg("openacc", "status");
      $("#aQ").addEventListener("input", C.debounce(e => C.go("openacc", { status: st, q: e.target.value.trim() }), 400));
      const done = () => C.render(), find = id => rows.find(x => x.id === id);
      $$("[data-open]").forEach(b => b.addEventListener("click", () => {
        const a = find(b.dataset.open), lev = (meta().portal.account_types.find(t => t.id === a.type) || {}).leverages || [a.leverage];
        modal({ title: `Record ${a.kind} account for ${a.client ? a.client.name : ""}`, wide: true, submit: "Save and notify client",
          body: `<p class="muted">First create the account at Absel Markets (MT5 Manager): ${esc(a.type_name)}, 1:${esc(a.leverage)}, ${esc(a.currency)}${a.kind === "demo" ? ", practice balance $" + num(a.balance) : ""}. Then enter the details here.</p>
            ${a.client && a.client.kyc !== "approved" && a.kind === "live" ? '<div class="c-banner warn">KYC is not approved for this client.</div>' : ""}
            <div class="c-grid">${field("MT5 login", inp("login", "", 'inputmode="numeric" autocomplete="off"'))}${field("Server", inp("server", meta().portal.default_server || "", 'placeholder="e.g. AbselGlobal-Live"'))}${field("Group (internal)", inp("group", ""))}${field("Leverage", sel("leverage", lev.map(x => [x, "1:" + x]), a.leverage))}
            ${field("First password (shown once to the client)", `<div class="c-row" style="flex-wrap:nowrap">${inp("password", genPw(), 'autocomplete="off" class="c-in mono"')}<button type="button" class="c-btn sm" id="gp">New</button></div>`, "full")}</div>
            <p class="muted" style="font-size:12.5px">The client sees the password once in the client area, then it's deleted. It isn't stored anywhere you can read it again, and it is not emailed.</p>`,
          onOpen: el => $("#gp", el).addEventListener("click", () => { $("[name=password]", el).value = genPw(); }),
          onSubmit: async v => { await API.call("openAccount", a.id, v); toast("Saved. The client was emailed"); done(); } });
      }));
      $$("[data-dec]").forEach(b => b.addEventListener("click", () => modal({ title: "Decline account request", body: field("Reason (the client sees this)", '<textarea class="c-ta" name="reason" rows="3"></textarea>'), submit: "Decline", danger: true, onSubmit: async v => { await API.call("rejectAccount", b.dataset.dec, v.reason); toast("Declined"); done(); } })));
      $$("[data-pw]").forEach(b => b.addEventListener("click", () => modal({ title: "New MT5 password for the client", body: `<p class="muted">Reset the password at Absel Markets first, then enter it here. The client sees it once.</p>${field("New password", inp("password", genPw(), 'class="c-in mono" autocomplete="off"'))}`, submit: "Save", onSubmit: async v => { await API.call("setAccountPassword", b.dataset.pw, v.password); toast("Saved. The client can view it once"); done(); } })));
    },
    refresh(page, r, alive) { if (!document.querySelector(".c-modal")) return this.render(page, r, alive); },
  };

  /* ------------------------------------------------------------ client money */
  C.views.money = {
    title: "Client money",
    async render(page, r, alive) {
      const type = r.params.type || "deposit", st = r.params.status || "open";
      const rows = await API.call("listPayments", { type: type === "all" ? "" : type, status: st }); if (!alive()) return;
      const lim = meta().portal.second_approval_over, me = C.state.user.id;
      const act = p => {
        if (!isOps() || !["pending", "first_approved", "approved"].includes(p.status)) return "";
        const rej = `<button class="c-btn sm danger" data-rej="${esc(p.id)}">Reject</button>`;
        if (p.type === "withdrawal") {
          if (p.status === "approved") return `${rej} <button class="c-btn sm good" data-done="${esc(p.id)}">Mark paid</button>`;
          const mine = (p.approvals || []).some(z => z.by === me);
          return `${rej} ${mine ? '<span class="muted" style="font-size:12px">waiting for a colleague</span>' : `<button class="c-btn sm pri" data-ok="${esc(p.id)}">${p.status === "first_approved" ? "2nd approval" : "Approve"}</button>`}`;
        }
        return `${rej} <button class="c-btn sm good" data-done="${esc(p.id)}">${p.type === "deposit" ? "Confirm received" : "Mark done"}</button>`;
      };
      page.innerHTML = `<div class="c-row">${seg("money", [["deposit", "Deposits"], ["withdrawal", "Withdrawals"], ["transfer", "Transfers"], ["all", "All"]], type, {})}<span class="sp"></span><div class="c-seg">${[["open", "To do"], ["completed", "Completed"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]].map(([k, l]) => `<button data-st="${k}" class="${st === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
        ${type === "withdrawal" && st === "open" ? `<div class="c-banner">Withdrawals over ${money(lim)} need two different people to approve. Check: KYC approved, same name, paid back to the deposit method, enough free margin at Absel Markets, no bonus money included.</div>` : ""}
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1100px"><thead><tr><th>Requested</th><th>Client</th><th>Type</th><th>Account</th><th>Method / details</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td class="mono">${fDT(p.created_at)}<small>${esc(p.reference)}${p.waiting_h != null ? ` · <span class="${late(p.waiting_h, p.type === "deposit" ? 4 : 24)}">${hrs(p.waiting_h)}</span>` : ""}</small></td>
          <td>${p.client ? `<a href="${C.href("client/" + p.client.id)}"><b>${esc(p.client.name)}</b></a><small>${esc(p.client.email)}</small>${p.client.kyc !== "approved" ? `<small>${kycPill(p.client.kyc)}</small>` : ""}` : "—"}</td>
          <td>${esc(p.type)}${p.first_deposit ? ' <span class="c-tag info">FIRST</span>' : ""}</td>
          <td class="mono">${esc(p.account)}${p.to_account ? " → " + esc(p.to_account) : ""}${p.balance_at ? `<small>bal ${money(p.balance)} · ${ago(p.balance_at)}</small>` : ""}</td>
          <td>${esc(p.method_name || "—")}${p.payout_details ? `<small class="mono" style="white-space:pre-wrap">${esc(p.payout_details)}</small>` : ""}${p.note ? `<small>${esc(p.note)}</small>` : ""}${p.proof_file_id ? ` <button class="c-btn sm" data-proof="${esc(p.proof_file_id)}">Receipt</button>` : ""}</td>
          <td class="num"><b>${money(p.amount)}</b>${p.amount_requested && p.amount_requested !== p.amount ? `<small>asked ${money(p.amount_requested)}</small>` : ""}${p.needs_two ? "<small>needs 2 approvals</small>" : ""}</td>
          <td>${pPill(p.status)}${(p.approvals_named || []).map(z => `<small>✓ ${esc(z.name)}</small>`).join("")}${p.ext_reference ? `<small class="mono">${esc(p.ext_reference)}</small>` : ""}${p.reject_reason ? `<small>${esc(p.reject_reason)}</small>` : ""}${p.completed_by_name ? `<small>${esc(p.completed_by_name)} · ${fDT(p.completed_at)}</small>` : ""}</td>
          <td class="r" style="white-space:nowrap">${act(p)}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : `<div class="c-empty"><b>${st === "open" ? "Nothing to do" : "Nothing here"}</b></div>`}
        ${rows.length ? `<div class="c-foot"><span>${rows.length} requests · ${money(rows.reduce((s, p) => s + p.amount, 0))}</span><button class="c-btn sm" id="mCsv">Export CSV</button></div>` : ""}</div>`;
      wireSeg("money", "type", { status: st });
      $$("[data-st]").forEach(b => b.addEventListener("click", () => C.go("money", { type, status: b.dataset.st })));
      const csv = $("#mCsv"); if (csv) csv.addEventListener("click", () => C.downloadCsv("absel-client-money", ["Requested", "Reference", "Client", "Email", "Type", "Account", "To account", "Method", "Amount", "Status", "Bank / back-office ref", "Completed"], rows.map(p => [p.created_at, p.reference, p.client ? p.client.name : "", p.client ? p.client.email : "", p.type, p.account, p.to_account, p.method_name || "", p.amount, p.status, p.ext_reference, p.completed_at || ""])));
      $$("[data-proof]").forEach(b => b.addEventListener("click", () => C.openClientFile(b.dataset.proof)));
      const done = () => C.render(), find = id => rows.find(x => x.id === id);
      $$("[data-ok]").forEach(b => b.addEventListener("click", async () => { const p = find(b.dataset.ok); if (!(await confirmBox("Approve withdrawal", `Approve ${money(p.amount)} to ${p.client.name} by ${p.method_name}?\n\n${p.payout_details}`, "Approve", false))) return; try { const x = await API.call("decidePayment", p.id, "approve"); toast(x.status === "approved" ? "Approved. Send the payment, then mark it paid" : "Approved once. A colleague must approve too"); done(); } catch (e) { toast(e.message); } }));
      $$("[data-done]").forEach(b => b.addEventListener("click", () => {
        const p = find(b.dataset.done);
        modal({ title: p.type === "deposit" ? "Confirm deposit received" : p.type === "withdrawal" ? "Mark withdrawal paid" : "Mark transfer done", submit: "Save and notify client",
          body: `<p>${esc(p.client.name)} · ${esc(p.reference)} · account <b class="mono">${esc(p.account)}</b>${p.to_account ? " → <b class=\"mono\">" + esc(p.to_account) + "</b>" : ""}</p>
            <p class="muted">${p.type === "deposit" ? "Check the money arrived in Absel Markets' account and credit it in MT5 first." : p.type === "withdrawal" ? "Send the payment from Absel Markets and debit MT5 first." : "Move the balance in MT5 first."}${p.first_deposit ? " <b>This is the client's first deposit; it counts as a verified FTD for the sales agent.</b>" : ""}</p>
            <div class="c-grid">${field(p.type === "deposit" ? "Amount received (USD)" : "Amount (USD)", inp("amount", p.amount, 'type="number" step="0.01" min="0.01"'))}${p.type !== "transfer" ? field(p.type === "deposit" ? "Bank / PSP / back-office reference" : "Payment reference", inp("reference", "")) : ""}${field("Internal note (optional)", inp("note", ""), "full")}</div>`,
          onSubmit: async v => { await API.call("decidePayment", p.id, "complete", v); toast("Done. The client was emailed"); done(); } });
      }));
      $$("[data-rej]").forEach(b => b.addEventListener("click", () => modal({ title: "Reject request", body: field("Reason (the client sees this)", sel("preset", ["", "Payment not received", "Payment came from a third party", "Name doesn't match the account holder", "Not enough free margin", "Please withdraw to the method you deposited with"], "", 'id="pP"') + '<textarea class="c-ta" name="reason" id="pR" rows="3" style="margin-top:8px"></textarea>'), submit: "Reject", danger: true, onOpen: el => $("#pP", el).addEventListener("change", e => { $("#pR", el).value = e.target.value; }), onSubmit: async v => { await API.call("decidePayment", b.dataset.rej, "reject", { reason: v.reason }); toast("Rejected. The client was told why"); done(); } })));
    },
    refresh(page, r, alive) { if (!document.querySelector(".c-modal")) return this.render(page, r, alive); },
  };

  /* ------------------------------------------------------------ clients */
  C.views.clients = {
    title: "Clients",
    async render(page, r, alive) {
      const p = r.params, rows = await API.call("listClients", { q: p.q || "", kyc: p.kyc || "", funded: p.funded || "" }); if (!alive()) return;
      page.innerHTML = `<div class="c-filters"><input class="c-in grow" type="search" id="cQ" value="${esc(p.q || "")}" placeholder="Search name, email, phone or MT5 login">${sel("kyc", [["", "Any KYC status"], ["none", "Not uploaded"], ["pending", "To review"], ["approved", "Approved"], ["resubmit", "New documents asked"], ["rejected", "Rejected"]], p.kyc || "", 'id="cK" aria-label="KYC"')}${sel("funded", [["", "Funded or not"], ["yes", "Has deposited"], ["no", "Not deposited yet"]], p.funded || "", 'id="cF" aria-label="Funded"')}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:1000px"><thead><tr><th>Registered</th><th>Client</th><th>Country</th><th>KYC</th><th class="r">Live accounts</th><th class="r">Deposited</th><th class="r">Balance</th><th>Sales owner</th><th>Last sign-in</th></tr></thead><tbody>
        ${rows.map(x => `<tr class="click" data-id="${esc(x.id)}"><td>${fDate(x.created_at)}</td><td><b>${esc(x.name)}</b>${x.status === "blocked" ? ' <span class="c-tag">BLOCKED</span>' : ""}${!x.email_verified_at ? ' <span class="c-tag">EMAIL NOT CONFIRMED</span>' : ""}<small>${esc(x.email)}</small></td><td>${esc(x.country)}</td><td>${kycPill(x.kyc.status)}</td><td class="num">${x.accounts_open}</td><td class="num">${money(x.deposits)}</td><td class="num">${money(x.balance)}</td><td>${esc(x.owner_name)}<small>${esc(x.reference)}</small></td><td>${x.last_login_at ? ago(x.last_login_at) : "—"}</td></tr>`).join("")}
        </tbody></table></div>${rows.length ? "" : '<div class="c-empty"><b>No clients match</b></div>'}</div>`;
      const go = patch => C.go("clients", Object.assign({}, p, patch));
      $("#cQ").addEventListener("input", C.debounce(e => go({ q: e.target.value.trim() }), 350));
      $("#cK").addEventListener("change", e => go({ kyc: e.target.value })); $("#cF").addEventListener("change", e => go({ funded: e.target.value }));
      $$("tr.click").forEach(tr => tr.addEventListener("click", () => C.go("client/" + tr.dataset.id)));
    },
  };
  C.views.client = {
    title: "Client", nav: "clients",
    async render(page, r, alive) {
      const d = await API.call("getClient", r.id); if (!alive()) return;
      const x = d.client; C.setTitle(x.name);
      page.innerHTML = `<div class="c-card c-row" style="align-items:flex-start"><div><h2 style="font-size:22px">${esc(x.name)} ${x.status === "blocked" ? '<span class="c-tag">BLOCKED</span>' : ""}</h2><p class="muted">${esc(x.email)} · ${esc(x.dial_code)} ${esc(x.phone)} · ${esc(x.country)} · registered ${fDT(x.created_at)}</p>
          <p style="margin-top:6px">${kycPill(x.kyc.status)} ${x.email_verified_at ? '<span class="c-pill plain" style="--c:var(--up)">Email confirmed</span>' : '<span class="c-pill plain">Email not confirmed</span>'} ${x.totp_enabled ? '<span class="c-pill plain" style="--c:var(--up)">2-step login on</span>' : ""}</p></div><span class="sp"></span>
          <div class="c-row">${x.lead_id ? `<a class="c-btn" href="${C.href("lead/" + x.lead_id)}">Sales lead ${esc(x.reference)}</a>` : ""}${d.can_ops ? `<button class="c-btn ${x.status === "blocked" ? "" : "danger"}" id="blk">${x.status === "blocked" ? "Unblock" : "Block client area"}</button>` : ""}</div></div>
        <div class="c-cols c2">
          <div class="c-card"><h3>Profile</h3><dl class="c-dl"><dt>Date of birth</dt><dd>${esc(x.dob || "—")}</dd><dt>Nationality</dt><dd>${esc(x.nationality || "—")}</dd><dt>Address</dt><dd>${esc([x.address, x.city, x.postcode].filter(Boolean).join(", ") || "—")}</dd><dt>Sales owner</dt><dd>${esc(x.owner_name || "—")}</dd><dt>Deposited</dt><dd class="mono">${money(x.deposits)}</dd><dt>Referral code</dt><dd class="mono">${esc(x.ref_code)}</dd></dl></div>
          <div class="c-card"><h3>Documents ${kycPill(x.kyc.status)}</h3>${d.docs.length ? d.docs.map(f => `<div class="c-qitem"><div><b>${esc(KIND(f.kind))}</b><small>${esc(f.name)} · ${Math.round(f.size / 1024)} KB · ${fDT(f.created_at)} · ${esc(f.review || "")}</small></div><div class="acts">${d.can_kyc ? `<button class="c-btn sm" data-doc="${esc(f.id)}">Open</button>` : ""}</div></div>`).join("") : '<p class="muted">Nothing uploaded yet.</p>'}${x.kyc.reason ? `<p class="muted" style="font-size:13px;margin-top:8px">Last note: ${esc(x.kyc.reason)}</p>` : ""}${d.can_kyc && x.kyc.status === "pending" ? `<p style="margin-top:10px"><a class="c-btn sm pri" href="${C.href("kyc")}">Review in KYC queue</a></p>` : ""}</div>
        </div>
        <div class="c-card"><h3>Trading accounts</h3>${d.accounts.length ? `<table class="c-table"><thead><tr><th>Account</th><th>MT5 login</th><th>Status</th><th class="r">Balance</th><th></th></tr></thead><tbody>${d.accounts.map(a => `<tr><td><b>${esc(a.type_name)}</b> <span class="c-tag ${a.kind === "live" ? "info" : ""}">${a.kind.toUpperCase()}</span><small>1:${esc(a.leverage)} · ${esc(a.currency)}</small></td><td class="mono">${esc(a.login || "—")}<small>${esc(a.server)}</small></td><td>${pPill(a.status)}${a.has_password ? "<small>first password not viewed yet</small>" : ""}</td><td class="num">${a.balance_at || a.kind === "demo" ? money(a.balance) : "—"}${a.balance_at ? `<small>${ago(a.balance_at)}</small>` : ""}</td><td class="r">${d.can_ops && a.status === "open" ? `<button class="c-btn sm" data-bal="${esc(a.id)}">Set balance</button> <button class="c-btn sm" data-pw="${esc(a.id)}">New password</button> <button class="c-btn sm" data-close="${esc(a.id)}">Close</button>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No accounts.</p>'}</div>
        <div class="c-card"><h3>Money requests</h3>${d.payments.length ? `<table class="c-table"><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Method</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>${d.payments.map(p => `<tr><td>${fDT(p.created_at)}<small class="mono">${esc(p.reference)}</small></td><td>${esc(p.type)}</td><td class="mono">${esc(p.account)}${p.to_account ? " → " + esc(p.to_account) : ""}</td><td>${esc(p.method_name || "—")}</td><td class="num">${money(p.amount)}</td><td>${pPill(p.status)}${p.ext_reference ? `<small class="mono">${esc(p.ext_reference)}</small>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">None.</p>'}</div>
        ${d.logins.length ? `<div class="c-card"><h3>Sign-in history</h3>${d.logins.slice(0, 10).map(g => `<p style="font-size:13px">${fDT(g.at)} · ${esc(g.outcome.replace("_", " "))} · <span class="mono">${esc(g.ip)}</span></p>`).join("")}</div>` : ""}`;
      $$("[data-doc]").forEach(b => b.addEventListener("click", () => C.openClientFile(b.dataset.doc)));
      const done = () => C.render();
      const blk = $("#blk"); if (blk) blk.addEventListener("click", () => x.status === "blocked" ? API.call("setClientStatus", x.id, "active").then(() => { toast("Unblocked"); done(); }, e => toast(e.message)) : modal({ title: "Block client area", body: field("Reason (internal)", inp("reason", "")), submit: "Block", danger: true, onSubmit: async v => { await API.call("setClientStatus", x.id, "blocked", v.reason); toast("Blocked. The client is signed out"); done(); } }));
      $$("[data-bal]").forEach(b => b.addEventListener("click", () => { const a = d.accounts.find(y => y.id === b.dataset.bal); modal({ title: "Set balance for " + a.login, body: `<div class="c-grid">${field("Balance (USD)", inp("balance", a.balance, 'type="number" step="0.01"'))}${field("Equity (optional)", inp("equity", a.equity == null ? "" : a.equity, 'type="number" step="0.01"'))}</div><p class="muted" style="font-size:12.5px">Copy it from MT5 Manager. For many accounts, use Balance import.</p>`, onSubmit: async v => { const p = { balance: v.balance }; if (v.equity !== "") p.equity = v.equity; await API.call("updateAccount", a.id, p); toast("Updated"); done(); } }); }));
      $$("[data-pw]").forEach(b => b.addEventListener("click", () => modal({ title: "New MT5 password", body: `<p class="muted">Reset it at Absel Markets first. The client sees it once.</p>${field("New password", inp("password", genPw(), 'class="c-in mono" autocomplete="off"'))}`, onSubmit: async v => { await API.call("setAccountPassword", b.dataset.pw, v.password); toast("Saved"); done(); } })));
      $$("[data-close]").forEach(b => b.addEventListener("click", async () => { if (!(await confirmBox("Close account", "Mark this account as closed? Close it at Absel Markets too.", "Close"))) return; try { await API.call("updateAccount", b.dataset.close, { status: "closed" }); toast("Closed"); done(); } catch (e) { toast(e.message); } }));
    },
  };

  /* ------------------------------------------------------------ balance import */
  function parseCsv(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim()); if (!lines.length) return [];
    const split = l => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === "," || ch === ";" || ch === "\t") && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const head = split(lines[0]).map(h => h.toLowerCase());
    const iL = head.findIndex(h => /login|account/.test(h)), iB = head.findIndex(h => /^balance/.test(h)), iE = head.findIndex(h => /equity/.test(h)), iV = head.findIndex(h => /lots|volume/.test(h)), iT = head.findIndex(h => /last.?trade/.test(h));
    if (iL < 0 || iB < 0) throw new Error("The file needs columns named Login and Balance (Equity is optional).");
    return lines.slice(1).map(split).map(c => ({ login: c[iL], balance: String(c[iB]).replace(/[^\d.-]/g, ""), equity: iE >= 0 ? String(c[iE]).replace(/[^\d.-]/g, "") : "", lots: iV >= 0 ? String(c[iV]).replace(/[^\d.]/g, "") : "", last_trade: iT >= 0 ? c[iT] : "" })).filter(x => x.login && x.balance !== "");
  }
  C.views.balances = {
    title: "Trading data import",
    render(page) {
      page.innerHTML = `<div class="c-card" style="display:grid;gap:12px;max-width:760px"><h3>Import the daily trading report from Absel Markets</h3>
        <p class="muted">Export the accounts report from MT5 Manager or the back-office as CSV. Required columns: <b>Login</b> and <b>Balance</b>. Optional: <b>Equity</b>, <b>Lots</b> (total traded) and <b>Last trade</b> (date). Clients see the dated balances in the client area, withdrawals above the balance are blocked, and trading activity marks clients as active traders (or dormant).</p>
        <input class="c-in" type="file" id="bf" accept=".csv,text/csv,text/plain"><div id="bp"></div></div><div id="br"></div>`;
      $("#bf").addEventListener("change", async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const rows = parseCsv(await f.text());
          $("#bp").innerHTML = `<p><b>${rows.length}</b> accounts found. First: ${rows.slice(0, 3).map(x => `<span class="mono">${esc(x.login)}</span> ${money(x.balance)}`).join(" · ")}</p><button class="c-btn pri" id="bgo">Import ${rows.length} balances</button>`;
          $("#bgo").addEventListener("click", async () => { try { const res = await API.call("importBalances", rows); $("#br").innerHTML = `<div class="c-card"><h3>Imported</h3><p>${res.updated} accounts updated${res.trading ? `, ${res.trading} with trading activity` : ""}.${res.unknown.length ? ` ${res.unknown.length} logins are not linked to a client (other Absel Markets clients or typos): <span class="mono">${res.unknown.slice(0, 30).map(esc).join(", ")}</span>` : ""}</p>${res.changed.length ? `<h3 style="margin-top:10px">Changed since last time <small>${res.changed.length}</small></h3><table class="c-table"><thead><tr><th>Login</th><th class="r">Before</th><th class="r">Now</th></tr></thead><tbody>${res.changed.slice(0, 50).map(c => `<tr><td class="mono">${esc(c.login)}</td><td class="num">${money(c.before)}</td><td class="num">${money(c.after)}</td></tr>`).join("")}</tbody></table>` : ""}</div>`; $("#bp").innerHTML = ""; toast("Balances imported"); } catch (err) { toast(err.message); } });
        } catch (err) { $("#bp").innerHTML = `<div class="c-banner warn">${esc(err.message)}</div>`; }
      });
    },
  };

  /* ------------------------------------------------------------ client-area settings (admin) */
  C.views.portalsettings = {
    title: "Client area settings",
    async render(page, r, alive) {
      const s = await API.call("getSettings"); if (!alive()) return;
      const p = s.portal || {};
      const tRow = (t, i) => `<div class="c-grid g3 c-card" data-t style="padding:12px;gap:8px">${field("Name", inp("name", t.name))}${field("Code", inp("id", t.id))}${field("Min. first deposit ($)", inp("min_deposit", t.min_deposit, 'type="number" min="0"'))}${field("Description", inp("desc", t.desc || ""), "full")}${field("Leverages", inp("leverages", (t.leverages || []).join(", ")))}${field("Currencies", inp("currencies", (t.currencies || []).join(", ")))}<div class="c-row" style="align-items:end"><button type="button" class="c-btn sm danger" data-del>Remove</button></div></div>`;
      const mRow = m => `<div class="c-grid g3 c-card" data-m style="padding:12px;gap:8px">${field("Name", inp("name", m.name))}${field("Code", inp("id", m.id))}${field("Type", sel("kind", [["bank", "Bank"], ["card", "Card"], ["crypto", "Crypto"], ["ewallet", "E-wallet"], ["other", "Other"]], m.kind))}${field("Min ($)", inp("min", m.min, 'type="number" min="0"'))}${field("Max ($, 0 = none)", inp("max", m.max || 0, 'type="number" min="0"'))}${field("Time to arrive", inp("eta", m.eta || ""))}
        ${field("Payment instructions shown to the client (bank details, wallet address…)", `<textarea class="c-ta" name="instructions" rows="4">${esc(m.instructions || "")}</textarea>`, "full")}${field("Secure payment link (https, optional)", inp("link", m.link || "", 'placeholder="https://"'), "full")}
        <label class="c-switch"><input type="checkbox" name="deposit" ${m.deposit !== false ? "checked" : ""}><span>Deposits</span></label><label class="c-switch"><input type="checkbox" name="withdraw" ${m.withdraw !== false ? "checked" : ""}><span>Withdrawals</span></label><label class="c-switch"><input type="checkbox" name="enabled" ${m.enabled !== false ? "checked" : ""}><span>Shown to clients</span></label><div class="c-row" style="align-items:end"><button type="button" class="c-btn sm danger" data-del>Remove</button></div></div>`;
      page.innerHTML = `<form id="pf" class="c-card" style="display:grid;gap:16px;max-width:980px" novalidate>
        <h3>Brand and legal</h3><div class="c-grid">${field("Brand shown to clients", inp("brand", p.brand))}${field("Support email", inp("support_email", p.support_email || "", 'type="email"'))}${field("Legal line (footer of every page)", `<textarea class="c-ta" name="legal_line" rows="3">${esc(p.legal_line)}</textarea>`, "full")}${field("Risk warning", `<textarea class="c-ta" name="risk_warning" rows="3">${esc(p.risk_warning)}</textarea>`, "full")}</div>
        <p class="muted" style="font-size:12.5px">Have compliance approve these two texts. The licensed company has to be named on the client agreement, the legal line and bank payment details.</p>
        <h3>Rules</h3><div class="c-grid g3"><label class="c-switch"><input type="checkbox" name="enabled" ${p.enabled ? "checked" : ""}><span>Registration open</span></label><label class="c-switch"><input type="checkbox" name="require_kyc_for_live" ${p.require_kyc_for_live ? "checked" : ""}><span>KYC approved before a live account</span></label>${field("Two approvals for withdrawals over ($)", inp("second_approval_over", p.second_approval_over, 'type="number" min="0"'))}${field("Default MT5 server", inp("default_server", p.default_server || "", 'placeholder="e.g. AbselGlobal-Live"'))}</div>
        <h3>Account types <button type="button" class="c-btn sm" id="addT">Add</button></h3><div id="types" style="display:grid;gap:10px">${(p.account_types || []).map(tRow).join("")}</div>
        <h3>Payment methods <button type="button" class="c-btn sm" id="addM">Add</button></h3><div id="methods" style="display:grid;gap:10px">${(p.methods || []).map(mRow).join("")}</div>
        <h3>MetaTrader 5 download links</h3><div class="c-grid">${["windows", "ios", "android", "web"].map(k => field(k === "ios" ? "iPhone" : k[0].toUpperCase() + k.slice(1), inp("pl_" + k, (p.platform_links || {})[k] || ""))).join("")}</div>
        <p class="err-msg" hidden></p><div><button class="c-btn pri" type="submit">Save client area settings</button></div></form>`;
      const wireDel = () => $$("[data-del]").forEach(b => { b.onclick = () => b.closest("[data-t],[data-m]").remove(); });
      wireDel();
      $("#addT").addEventListener("click", () => { $("#types").insertAdjacentHTML("beforeend", tRow({ name: "", id: "", min_deposit: 100, leverages: [100], currencies: ["USD"] })); wireDel(); });
      $("#addM").addEventListener("click", () => { $("#methods").insertAdjacentHTML("beforeend", mRow({ name: "", id: "", kind: "other", min: 50 })); wireDel(); });
      const rd = el => Object.fromEntries($$("[name]", el).map(i => [i.name, i.type === "checkbox" ? i.checked : i.value]));
      $("#pf").addEventListener("submit", async e => {
        e.preventDefault(); const f = e.target, er = $(".err-msg", f); er.hidden = true;
        const top = {}; ["brand", "support_email", "legal_line", "risk_warning", "second_approval_over", "default_server"].forEach(k => top[k] = f.elements[k].value); top.enabled = f.elements.enabled.checked; top.require_kyc_for_live = f.elements.require_kyc_for_live.checked;
        top.account_types = $$("[data-t]", f).map(rd); top.methods = $$("[data-m]", f).map(rd);
        top.platform_links = Object.fromEntries(["windows", "ios", "android", "web"].map(k => [k, f.elements["pl_" + k].value]));
        try { await API.call("saveSettings", { portal: top }); toast("Saved"); await C.updateBadges(); C.render(); } catch (err) { er.textContent = err.message; er.hidden = false; }
      });
    },
  };

  /* ------------------------------------------------------------ lead page card */
  C.portalCard = d => {
    const p = d.portal; if (!p) return "";
    return `<div class="c-card"><h3>Client area ${C.isKyc() ? `<a class="c-btn sm" href="${C.href("client/" + p.client_id)}">Open</a>` : ""}</h3>
      <dl class="c-dl"><dt>Registered</dt><dd>${fDT(p.created_at)}${p.email_verified ? "" : " · email not confirmed"}</dd><dt>Documents</dt><dd>${kycPill(p.kyc)}${p.kyc_reason ? `<small class="muted" style="display:block">${esc(p.kyc_reason)}</small>` : ""}</dd><dt>Last sign-in</dt><dd>${p.last_login_at ? ago(p.last_login_at) : "never"}</dd><dt>Deposited</dt><dd class="mono">${money(p.deposited)}${p.withdrawn ? " · withdrawn " + money(p.withdrawn) : ""}</dd></dl>
      ${p.accounts.length ? p.accounts.map(a => `<div class="c-qitem"><div><b>${esc(a.type_name)}</b> <span class="c-tag ${a.kind === "live" ? "info" : ""}">${a.kind.toUpperCase()}</span> ${pPill(a.status)}<small class="mono">${esc(a.login || "")}${a.balance_at ? " · " + money(a.balance) + " · " + ago(a.balance_at) : ""}</small></div></div>`).join("") : ""}
      ${p.open_requests.length ? `<p style="font-size:13px;margin-top:8px"><b>In progress:</b> ${p.open_requests.map(o => `${esc(o.type)} ${money(o.amount)} (${esc((PST[o.status] || [o.status])[0])})`).join(", ")}</p>` : ""}</div>`;
  };
})();
