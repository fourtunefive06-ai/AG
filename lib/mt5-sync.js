/* One MT5 sync run (read-only): accounts, deals and open positions for Absel Global's groups and known logins.
   Reads MT5 through lib/mt5.js, then hands the rows to the core inside database transactions.
   Logins outside the login range are never read (the range lock in lib/mt5.js refuses them). */
"use strict";

async function runSync({ mt5, crm, store }) {
  const plan = store.transaction(() => crm.mt5SyncPlan());
  const c = mt5.cfg(), range = { from: c.from, to: c.to }, out = { groups: [], accounts: null, deals: null, positions: null };
  try {
    if (!mt5.configured()) throw Object.assign(new Error("MT5 is not configured (MT5_SERVER, MT5_MANAGER_LOGIN, MT5_WEBAPI_PASSWORD)"), { notConfigured: true });
    if (!(c.from && c.to)) throw new Error("Set MT5_LOGIN_FROM and MT5_LOGIN_TO (the Absel Global login range) in .env");
    // 1. which logins: everything in our groups, plus the logins we already know
    const groupOf = new Map();
    for (const g of plan.groups) {
      try { const r = await mt5.listLogins(g); out.groups.push({ group: g, logins: r.logins.length, outside: r.outside }); r.logins.forEach(l => groupOf.set(l, g)); }
      catch (e) { if (e.network || e.timeout || e.notConfigured || e.auth) throw e; out.groups.push({ group: g, error: e.message }); }
    }
    const known = plan.logins.filter(mt5.inRange), outside = plan.logins.length - known.length;
    const all = [...new Set([...groupOf.keys(), ...known])];
    // 2. account details and balances
    const users = all.length ? await mt5.getUsersBatch(all) : [], accs = all.length ? await mt5.getAccountsBatch(all) : [];
    const am = new Map(accs.map(a => [a.login, a]));
    const rows = users.map(u => Object.assign({}, u, am.get(u.login) || {}, { group: u.group }));
    out.accounts = store.transaction(() => crm.mt5IngestAccounts(rows, { groups_found: out.groups, range }));
    // 3. deals since the last sync (by group, plus our logins outside those groups)
    const deals = [], rest = known.filter(l => !groupOf.has(l));
    for (const g of plan.groups) if (!(out.groups.find(x => x.group === g) || {}).error) deals.push(...await mt5.dealsBatch({ group: g, from: plan.deals_from, to: plan.deals_to }));
    if (rest.length) deals.push(...await mt5.dealsBatch({ logins: rest, from: plan.deals_from, to: plan.deals_to }));
    out.deals = store.transaction(() => crm.mt5IngestDeals(deals));
    // 4. open positions (snapshot)
    const pos = [];
    for (const g of plan.groups) if (!(out.groups.find(x => x.group === g) || {}).error) pos.push(...await mt5.positionsBatch({ group: g }));
    if (rest.length) pos.push(...await mt5.positionsBatch({ logins: rest }));
    out.positions = store.transaction(() => crm.mt5IngestPositions(pos, all));
    out.outside_range = outside;
    store.transaction(() => crm.mt5SyncDone({ ok: true, summary: { at: new Date().toISOString(), accounts: rows.length, updated: out.accounts.updated, unlinked: out.accounts.unlinked, deals_new: out.deals.new, positions: out.positions.open, outside_range: outside } }));
    return out;
  } catch (e) {
    store.transaction(() => crm.mt5SyncDone({ ok: false, error: e.message }));
    throw e;
  }
}

module.exports = { runSync };
