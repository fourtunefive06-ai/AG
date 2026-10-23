/* Absel CRM — optional client journey: demo account and company-funded account.
   Both are side-steps. The deal is only won when the client deposits their own money (verified FTD). */
(function () {
  "use strict";
  const C = window.CRM, API = C.API;
  const { esc, $, $$, num, money, fDate, fDT, ago, isMgr, isSales, seesAll, salesUsers, stagePill, toast, modal, confirmBox, field, inp, sel } = C;
  const meta = () => C.state.meta;
  const cfg = () => (meta() && meta().bonus) || { amount: 100, min_lots: 2, max_profit: 100, expiry_days: 30, enabled: true };
  const amt = () => "$" + cfg().amount;
  const BSTATUS = { requested: ["Waiting approval", "var(--warn)"], credited: ["Credited", "var(--cta)"], traded: ["Trading", "var(--cta)"], converted: ["Converted to own deposit", "var(--up)"], expired: ["Expired", "var(--muted)"], used_up: ["Used up", "var(--muted)"], cancelled: ["Cancelled", "var(--muted)"], rejected: ["Rejected", "var(--down)"] };
  const bPill = s => { const [lb, c] = BSTATUS[s] || [s, "var(--muted)"]; return `<span class="c-pill plain" style="--c:${c}">${esc(lb)}</span>`; };
  C.bonusPill = bPill;

  // Small tags for lists and calling mode
  C.journeyTags = j => {
    if (!j) return "";
    const t = [];
    if (j.demo) t.push(`<span class="c-tag info" title="Demo account">${j.demo === "active" ? "DEMO ACTIVE" : j.demo === "traded" ? "DEMO TRADED" : "DEMO"}</span>`);
    if (j.bonus === "requested") t.push(`<span class="c-tag" title="Company-funded account waiting approval">${esc(amt())} PENDING</span>`);
    if (j.bonus === "credited" || j.bonus === "traded") t.push(`<span class="c-tag good" title="Company-funded account live">${esc(amt())} LIVE${j.bonus_days_left != null ? " · " + j.bonus_days_left + "D" : ""}${j.bonus_profit > 0 ? " · +$" + j.bonus_profit : ""}</span>`);
    if (j.bonus === "expired" || j.bonus === "used_up") t.push(`<span class="c-tag" title="Company-funded account ended without a deposit">${esc(amt())} ENDED</span>`);
    return t.join("");
  };

  /* ------------------------------------------------ lead page cards */
  const STEP = (on, label, sub) => `<div class="c-checkrow ${on ? "on" : ""}" style="cursor:default"><span class="c-jdot ${on ? "on" : ""}" aria-hidden="true"></span><span>${esc(label)}${sub ? `<small>${sub}</small>` : ""}</span></div>`;
  function demoCard(d) {
    const l = d.lead, dm = l.demo || {}, work = d.can_work && !["lost", "invalid"].includes(l.stage);
    if (!dm.given_at && (!work || l.stage === "funded")) return "";
    const next = !dm.given_at ? "" : !dm.walkthrough_at && !dm.first_trade_at ? "walkthrough" : !dm.first_trade_at ? "traded" : !dm.active_at ? "active" : "";
    return `<div class="c-card" data-jcard="demo"><h3>Demo account <small>optional</small>${work && dm.given_at ? '<button class="c-btn sm" data-j="demo-feedback">Note</button>' : ""}</h3>
      ${dm.given_at ? `${STEP(true, "Demo given", `${esc(dm.platform || "MT5")} · login <span class="mono">${esc(dm.login)}</span>${dm.server ? " · " + esc(dm.server) : ""} · ${ago(dm.given_at)}`)}
        ${STEP(!!dm.walkthrough_at, "Walkthrough call done", dm.walkthrough_at ? ago(dm.walkthrough_at) : "Show the platform and place one practice trade together")}
        ${STEP(!!dm.first_trade_at, "First practice trade", dm.first_trade_at ? ago(dm.first_trade_at) : "")}
        ${STEP(!!dm.active_at, "Trading regularly", dm.active_at ? ago(dm.active_at) : "Ready for the real account conversation")}
        ${dm.feedback ? `<p style="font-size:13px;margin-top:8px"><b>Feedback:</b> ${esc(dm.feedback)}</p>` : ""}
        ${work && next ? `<div class="c-row" style="margin-top:10px"><button class="c-btn sm" data-j="demo-${next}">${{ walkthrough: "Mark walkthrough done", traded: "Mark first trade", active: "Mark trading regularly" }[next]}</button>${next !== "active" ? '<button class="c-btn sm" data-j="demo-active">Trading regularly</button>' : ""}</div>` : ""}
        ${dm.active_at && l.stage !== "funded" ? '<p class="muted" style="font-size:12.5px;margin-top:8px">They like the platform. Now move them to a real account and their first deposit.</p>' : ""}`
      : `<p class="muted" style="font-size:13px">For a lead who wants to try the platform before committing. Practice money only; keep the conversation moving to a real account.</p><button class="c-btn sm" data-j="demo-give" style="margin-top:8px">Give demo account</button>`}
    </div>`;
  }
  function bonusCard(d) {
    const l = d.lead, c = d.bonus_settings || cfg(), b = (d.bonuses || [])[0], el = d.bonus_eligibility, work = d.can_work;
    if (!b && (!c.enabled || !el || ["lost", "invalid", "funded"].includes(l.stage))) return "";
    const A = "$" + c.amount;
    let body = "";
    if (b && b.status !== "rejected" && b.status !== "cancelled") {
      const lotsPct = Math.min(100, Math.round((b.lots || 0) / Math.max(0.01, c.min_lots) * 100)), live = ["credited", "traded"].includes(b.status);
      const avail = Math.max(0, Math.min(b.profit - (b.withdrawals || []).filter(w => w.status !== "rejected").reduce((s, w) => s + w.amount, 0), c.max_profit - (b.withdrawals || []).filter(w => w.status !== "rejected").reduce((s, w) => s + w.amount, 0)));
      body = `<div class="c-row" style="gap:8px">${bPill(b.status)}${b.days_left != null ? `<span class="muted" style="font-size:12.5px">${b.days_left > 0 ? b.days_left + " days left" : "expires today"}</span>` : ""}</div>
        <dl class="c-dl" style="margin-top:8px"><dt>Account</dt><dd class="mono">${esc(b.account_id || "—")}</dd>${b.credited_at ? `<dt>Credited</dt><dd>${fDate(b.credited_at)} by ${esc(b.approved_by_name)}</dd><dt>Expires</dt><dd>${fDate(b.expires_at)}</dd>` : `<dt>Requested</dt><dd>${fDT(b.created_at)} by ${esc(b.requested_by_name)}</dd>`}
          ${b.credited_at ? `<dt>Lots traded</dt><dd><span class="mono">${b.lots} / ${c.min_lots}</span><div class="c-progress" style="margin-top:4px"><i style="width:${lotsPct}%"></i></div></dd><dt>Profit</dt><dd class="mono" style="color:${b.profit > 0 ? "var(--up)" : b.profit < 0 ? "var(--down)" : "inherit"}">${b.profit >= 0 ? "+" : ""}${money(b.profit)}</dd><dt>Balance</dt><dd class="mono">${money(b.balance)}</dd><dt>Profit paid out</dt><dd class="mono">${money(b.paid_out || 0)}</dd>` : ""}</dl>
        ${(b.withdrawals || []).map(w => `<div class="c-qitem"><div><b class="mono">${money(w.amount)}</b> <span class="c-pill plain" style="--c:${w.status === "paid" ? "var(--up)" : w.status === "rejected" ? "var(--down)" : "var(--warn)"}">${w.status === "requested" ? "withdrawal waiting" : esc(w.status)}</span><small>${fDT(w.requested_at)}${w.reason ? " · " + esc(w.reason) : ""}</small></div>${w.status === "requested" && isMgr() ? `<div class="acts"><button class="c-btn sm" data-j="w-reject" data-w="${esc(w.id)}">Reject</button><button class="c-btn sm good" data-j="w-pay" data-w="${esc(w.id)}">Paid</button></div>` : ""}</div>`).join("")}
        ${b.status === "converted" ? '<div class="c-banner" style="margin-top:8px">Converted: the client deposited their own money.</div>' : ""}
        <div class="c-row" style="margin-top:10px">
          ${b.status === "requested" && isMgr() ? `<button class="c-btn sm" data-j="b-reject">Reject</button><button class="c-btn sm good" data-j="b-approve">Approve & credit</button>` : ""}
          ${b.status === "requested" && !isMgr() ? '<span class="muted" style="font-size:12.5px">A sales manager approves and credits it.</span>' : ""}
          ${live && work ? `<button class="c-btn sm" data-j="b-progress">Update trading</button>${b.lots >= c.min_lots && avail > 0 ? `<button class="c-btn sm" data-j="b-withdraw">Profit withdrawal</button>` : ""}` : ""}
          ${(live && isMgr()) || (b.status === "requested" && work) ? '<button class="c-btn sm danger" data-j="b-cancel">Cancel</button>' : ""}
        </div>
        ${live && l.stage !== "funded" ? `<p class="muted" style="font-size:12.5px;margin-top:8px">${b.profit > 0 ? "They're in profit. Best moment to ask for their own deposit." : b.lots ? "Keep them trading, then ask for their own deposit before it expires." : "Book a first-trade call. A client who trades the " + A + " is far more likely to deposit."}</p>` : ""}`;
    } else if (el) {
      const last = b ? `<p class="muted" style="font-size:12.5px;margin-bottom:8px">Last request ${esc(b.status)}${b.reject_reason ? ": " + esc(b.reject_reason) : ""}.</p>` : "";
      body = `${last}<p class="muted" style="font-size:13px">Optional. A ${A} live account in the client's name, funded by the company, for a verified client who wants proof before depositing. The ${A} can't be withdrawn; profit can, after ${c.min_lots} lots, up to $${c.max_profit}.</p>
        <div style="margin-top:8px">${el.checks.map(ch => `<div class="c-elig ${ch.ok ? "ok" : "no"}"><span aria-hidden="true">${ch.ok ? "✓" : "✕"}</span><span>${esc(ch.label)}${ch.detail ? `<small>${esc(ch.detail)}</small>` : ""}</span></div>`).join("")}</div>
        ${work ? `<button class="c-btn sm ${el.ok ? "good" : ""}" data-j="b-request" style="margin-top:10px" ${el.ok ? "" : "disabled"}>Offer ${A} account</button>` : ""}`;
    }
    return `<div class="c-card" data-jcard="bonus"><h3>${A} company-funded account <small>optional</small></h3>${body}</div>`;
  }
  C.journeyCards = d => demoCard(d) + bonusCard(d);

  function termsHtml(terms) { return `<ul class="c-terms">${(terms || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul>`; }
  C.wireJourney = (host, d, reload) => {
    const l = d.lead, b = (d.bonuses || [])[0], A = "$" + (d.bonus_settings || cfg()).amount;
    const call = async (fn, ...args) => { try { const r = await API.call(fn, ...args); reload(); return r; } catch (e) { toast(e.message); } };
    $$("[data-j]", host).forEach(btn => btn.addEventListener("click", async () => {
      const k = btn.dataset.j;
      if (k === "demo-give") modal({ title: "Give demo account", body: `<p class="muted">Create the demo in the back-office, then record it here. The client gets the details on WhatsApp and a walkthrough call is booked.</p><div class="c-grid">${field("Demo login (account number)", inp("login", ""))}${field("Server", inp("server", "AbselMarkets-Demo"))}${field("Platform", sel("platform", ["MT5", "MT5 Web", "MT5 Mobile"], "MT5"))}</div>`, submit: "Save", onSubmit: async v => { await API.call("setDemo", l.id, "give", v); toast("Demo recorded. Walkthrough call booked"); reload(); } });
      else if (k === "demo-feedback") modal({ title: "Demo feedback", body: field("What did the client say about the platform?", `<textarea class="c-ta" name="feedback" rows="4">${esc((l.demo || {}).feedback || "")}</textarea>`), onSubmit: async v => { await API.call("setDemo", l.id, "feedback", v); toast("Saved"); reload(); } });
      else if (k.startsWith("demo-")) { await call("setDemo", l.id, k.slice(5)); toast("Demo updated"); }
      else if (k === "b-request") {
        const el = d.bonus_eligibility;
        modal({ title: `Offer ${A} company-funded account`, wide: true, submit: isMgr() ? "Approve & credit" : "Send for approval",
          body: `<p>Read these terms to the client and make sure they understand them:</p>${termsHtml(el.terms)}<div class="c-grid">${field("Live trading account number", inp("account_id", l.account_id || ""))}${field("Note for the manager (optional)", inp("note", ""))}</div><label class="c-switch" style="margin-top:6px"><input type="checkbox" name="terms_accepted" value="1"><span>The client heard and accepted these terms</span></label><p class="muted" style="font-size:12.5px;margin-top:8px">The goal is still their own deposit. Use this when a verified client needs proof before trusting us with their money.</p>`,
          onSubmit: async v => { if (!v.terms_accepted) throw new Error("Confirm the client accepted the terms."); const r = await API.call("requestBonus", l.id, { account_id: v.account_id, note: v.note, terms_accepted: true, approve: isMgr() }); toast(r.status === "credited" ? A + " credited" : "Sent to a sales manager for approval"); reload(); } });
      }
      else if (k === "b-approve") C.approveBonus(b, reload);
      else if (k === "b-reject") C.rejectBonus(b, reload);
      else if (k === "b-progress") modal({ title: "Update trading on the " + A + " account", body: `<p class="muted">Copy the figures from the back-office or MT5 manager.</p><div class="c-grid">${field("Lots traded (total)", inp("lots", b.lots, 'type="number" step="0.01" min="0"'))}${field("Profit / loss (USD)", inp("profit", b.profit, 'type="number" step="0.01"'))}${field("Balance (USD)", inp("balance", b.balance, 'type="number" step="0.01" min="0"'))}</div><label class="c-switch"><input type="checkbox" name="used_up" value="1"><span>Balance lost: end the account</span></label>`, onSubmit: async v => { await API.call("updateBonus", b.id, { lots: v.lots, profit: v.profit, balance: v.balance, end: v.used_up ? "used_up" : "" }); toast("Updated"); reload(); } });
      else if (k === "b-withdraw") modal({ title: "Profit withdrawal", body: `<p class="muted">Only profit can be withdrawn, never the ${A}. A sales manager approves it.</p>${field("Amount (USD)", inp("amount", "", 'type="number" step="0.01" min="1"'))}`, submit: "Request", onSubmit: async v => { await API.call("requestBonusWithdrawal", b.id, v.amount); toast("Sent for approval"); reload(); } });
      else if (k === "w-pay") { if (await confirmBox("Profit paid", "Confirm the back-office paid this profit to the client?", "Confirm", false)) await call("decideBonusWithdrawal", b.id, btn.dataset.w, true); }
      else if (k === "w-reject") modal({ title: "Reject withdrawal", body: field("Why? The agent sees this.", inp("reason", "")), submit: "Reject", danger: true, onSubmit: async v => { await API.call("decideBonusWithdrawal", b.id, btn.dataset.w, false, v.reason); toast("Rejected"); reload(); } });
      else if (k === "b-cancel") modal({ title: "Cancel " + A + " account", body: field("Reason", inp("reason", "")), submit: "Cancel account", danger: true, onSubmit: async v => { await API.call("cancelBonus", b.id, v.reason); toast("Cancelled"); reload(); } });
    }));
  };
  C.approveBonus = (b, done) => modal({ title: `Approve ${"$" + b.amount} for ${b.lead ? b.lead.name : "client"}`, body: `<p class="muted">Credit the balance in the back-office first, then confirm here. It expires in ${cfg().expiry_days} days.</p>${field("Trading account credited", inp("account_id", b.account_id || ""))}${b.note ? `<p style="font-size:13px">Agent's note: ${esc(b.note)}</p>` : ""}`, submit: "Approve & credit", onSubmit: async v => { await API.call("decideBonus", b.id, true, { account_id: v.account_id }); toast("Credited. The agent was told"); done(); } });
  C.rejectBonus = (b, done) => modal({ title: "Reject request", body: field("Why? The agent sees this.", inp("reason", "", 'placeholder="e.g. Same household as an existing client"')), submit: "Reject", danger: true, onSubmit: async v => { await API.call("decideBonus", b.id, false, { reason: v.reason }); toast("Rejected"); done(); } });

  /* ------------------------------------------ calling scripts and concerns */
  C.journeyObjections = () => {
    const c = cfg(), A = "$" + c.amount;
    return {
      ["Why deposit if I have the free " + A + "?"]: `The ${A} is there so you can feel live trading with no risk. It's small, it can't be withdrawn and it ends after ${c.expiry_days} days. With your own deposit you choose your trade size, keep everything you make and can withdraw any time. Most clients add their own funds once they've seen a few real trades.`,
      ["Can I withdraw the " + A + "?"]: `The ${A} itself stays in the account. Profit you make with it can be withdrawn once you've traded ${c.min_lots} lots, up to $${c.max_profit}. So it's a real chance to earn, not just a test.`,
      ["Is the " + A + " real money?"]: `Yes. It's a live account in your own name with real market prices and real execution, not a demo. The company funds the starting balance.`,
      ["What's the catch?"]: `No catch, just clear rules: one per person, the ${A} can't be withdrawn, it expires after ${c.expiry_days} days, and profit is withdrawable after ${c.min_lots} lots. We do it because clients who try us live usually stay with us.`,
      "I'd rather keep using the demo": "The demo is great for learning the buttons, but it doesn't feel like real trading: no real prices pressure, no real decisions. Starting small with your own funds is the best next step, and I'll be with you on the first trades.",
    };
  };
  C.journeyScript = (l, j) => {
    const c = cfg(), A = "$" + c.amount, first = esc(l.first_name), dm = l.demo || {};
    if (j && (j.bonus === "credited" || j.bonus === "traded")) return j.bonus_profit > 0
      ? `<p><q>${first}, you're up $${j.bonus_profit} on the ${A} account. Well done. You can withdraw that profit once you've traded ${c.min_lots} lots. Imagine the same trades with your own balance: shall we fund your account today so you keep everything you make?</q></p>`
      : `<p><q>${first}, your ${A} account is live${j.bonus_days_left != null ? " for another " + j.bonus_days_left + " days" : ""}. Shall we open your first trade together now? When you're comfortable, we'll move you to your own funded account.</q></p>`;
    if (j && (j.bonus === "expired" || j.bonus === "used_up")) return `<p><q>${first}, your ${A} trial has finished. You've seen how live trading works with us. Ready to continue with your own account? Deposits are 0% fee and I'll help with your first trades.</q></p>`;
    if (dm.given_at && !dm.first_trade_at) return `<p><q>${first}, did you get into the demo? Let's place one practice trade together now: open MT5, log in with ${esc(dm.login)}, and pick gold or EUR/USD.</q></p>`;
    if (dm.given_at) return `<p><q>${first}, how are you finding the demo? You've seen the platform works. The next step is a real account so your results count. Registration takes 3 minutes; shall we do it together?</q></p>`;
    if (["contacted", "qualified"].includes(l.stage)) return `<p class="muted">If they hesitate to register, offer a <b>demo account</b> to try the platform, then book a walkthrough call. ${c.enabled ? `For a <b>verified</b> client who won't deposit yet, a manager can approve a ${A} company-funded account.` : ""}</p>`;
    if (l.stage === "kyc" && c.enabled) return `<p class="muted">Verified but not depositing? Ask for their own deposit first. If they need proof, offer the <b>${A} company-funded account</b> as a last step, and keep asking for their deposit while they trade.</p>`;
    return "";
  };

  /* ------------------------------------------------------- Demo & $100 */
  C.views.bonus = {
    title: "Demo & company-funded accounts",
    async render(page, r, alive) {
      const tab = r.params.tab || (isMgr() ? "requested" : "active"), owner = r.params.owner || "";
      const c = cfg(), A = "$" + c.amount;
      const rows = await API.call("listBonuses", { status: tab === "all" ? "" : tab, owner }); if (!alive()) return;
      const tabs = [["requested", "Waiting approval"], ["withdrawals", "Profit withdrawals"], ["active", "Live"], ["converted", "Converted"], ["ended", "Ended"], ["all", "All"]];
      page.innerHTML = `<div class="c-banner">Demo and ${A} accounts are optional steps. The deal counts only when the client deposits their own money. ${c.enabled ? `Rules: ${c.require_kyc ? "KYC first, " : ""}expires after ${c.expiry_days} days, profit withdrawable after ${c.min_lots} lots up to $${c.max_profit}${c.monthly_cap ? `, ${c.monthly_cap} a month` : ""}.` : `The ${A} programme is switched off in Settings.`} <a href="${C.href("reports/journey")}">Journey report</a></div>
        <div class="c-row"><div class="c-seg">${tabs.map(([k, lb]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${lb}</button>`).join("")}</div><span class="sp"></span>${seesAll() ? sel("owner", [["", "Whole team"]].concat(salesUsers().map(u => [u.id, u.name])), owner, 'id="bOwnerF" style="width:auto"') : ""}</div>
        <div class="c-tbox"><div class="c-scroll"><table class="c-table" style="min-width:980px"><thead><tr><th>Client</th><th>Agent</th><th>Status</th><th>Account</th><th>Credited</th><th class="r">Days left</th><th class="r">Lots</th><th class="r">Profit</th><th class="r">Paid out</th><th></th></tr></thead><tbody>
        ${rows.map(b => { const pend = (b.withdrawals || []).filter(w => w.status === "requested"); return `<tr data-id="${esc(b.id)}"><td><a href="${C.href("lead/" + b.lead_id)}"><b>${esc(b.lead ? b.lead.name : "—")}</b></a><small>${b.lead ? esc(b.lead.reference) + " · " + esc(b.lead.country) : ""}</small></td><td>${esc(b.owner_name)}</td><td>${bPill(b.status)}${b.reject_reason ? `<small>${esc(b.reject_reason)}</small>` : ""}</td><td class="mono">${esc(b.account_id || "—")}</td><td>${b.credited_at ? fDate(b.credited_at) : `<small>requested ${ago(b.created_at)}</small>`}</td><td class="num">${b.days_left != null ? b.days_left : "—"}</td><td class="num">${b.credited_at ? b.lots : "—"}</td><td class="num" style="color:${b.profit > 0 ? "var(--up)" : b.profit < 0 ? "var(--down)" : "inherit"}">${b.credited_at ? money(b.profit) : "—"}</td><td class="num">${b.paid_out ? money(b.paid_out) : "—"}${pend.length ? `<small style="color:var(--warn)">${money(pend[0].amount)} waiting</small>` : ""}</td>
          <td class="r" style="white-space:nowrap">${isMgr() && b.status === "requested" ? `<button class="c-btn sm" data-rej="${esc(b.id)}">Reject</button> <button class="c-btn sm good" data-ok="${esc(b.id)}">Approve</button>` : ""}${isMgr() && pend.length ? `<button class="c-btn sm" data-wrej="${esc(b.id)}">Reject</button> <button class="c-btn sm good" data-wpay="${esc(b.id)}">Paid ${money(pend[0].amount)}</button>` : ""}${!isMgr() || (b.status !== "requested" && !pend.length) ? `<a class="c-btn sm" href="${C.href("lead/" + b.lead_id)}">Open</a>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>${rows.length ? "" : `<div class="c-empty"><b>Nothing here</b>${tab === "requested" ? "Agents request the " + A + " account from a verified client's page." : ""}</div>`}</div>`;
      $$("[data-tab]").forEach(b => b.addEventListener("click", () => C.go("bonus", { tab: b.dataset.tab, owner })));
      const of = $("#bOwnerF"); if (of) of.addEventListener("change", () => C.go("bonus", { tab, owner: of.value }));
      const reload = () => C.render(), find = id => rows.find(x => x.id === id);
      $$("[data-ok]").forEach(b => b.addEventListener("click", () => C.approveBonus(find(b.dataset.ok), reload)));
      $$("[data-rej]").forEach(b => b.addEventListener("click", () => C.rejectBonus(find(b.dataset.rej), reload)));
      $$("[data-wpay]").forEach(b => b.addEventListener("click", async () => { const x = find(b.dataset.wpay), w = x.withdrawals.find(y => y.status === "requested"); if (!(await confirmBox("Profit paid", `Confirm the back-office paid ${money(w.amount)} profit to ${x.lead.name}?`, "Confirm", false))) return; try { await API.call("decideBonusWithdrawal", x.id, w.id, true); toast("Recorded"); reload(); } catch (e) { toast(e.message); } }));
      $$("[data-wrej]").forEach(b => b.addEventListener("click", () => { const x = find(b.dataset.wrej), w = x.withdrawals.find(y => y.status === "requested"); modal({ title: "Reject withdrawal", body: field("Why? The agent sees this.", inp("reason", "")), submit: "Reject", danger: true, onSubmit: async v => { await API.call("decideBonusWithdrawal", x.id, w.id, false, v.reason); toast("Rejected"); reload(); } }); }));
    },
    refresh(page, r, alive) { return this.render(page, r, alive); },
  };
})();
