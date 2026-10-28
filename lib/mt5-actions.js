/* Sends the MT5 operations the core has approved and reports each result back to the core.
   - balance: before a retry (or a "Check MT5 again") look for a balance deal with the same comment on that login; if it's there,
     record it and don't send again. Debits check the live free margin first. A call that times out or loses its connection
     after sending is "unknown" (never retried blindly).
   - create_account: strong main and investor passwords generated here; only the main one goes to the core (shown once to the client).
   - leverage: update the user in MT5. */
"use strict";
const crypto = require("crypto");

// MT5 password rules: 8–16 characters with lower case, upper case, a digit and a special character
function strongPassword(len = 12) {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "#@!$%&*?"], all = sets.join(""), pick = s => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick); while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
// Errors before anything reached MT5 are definite failures; a timeout or a dropped connection after sending is unknown
const isUnknown = e => !!(e.timeout || (e.network && /ECONNRESET|EPIPE|socket hang up|closed the connection/i.test(String(e.code || "") + " " + e.message)));
const toResult = e => ({ ok: false, error: e.message, retcode: e.retcode != null ? e.retcode : null, unknown: isUnknown(e), range: !!e.range });

async function findDeal(mt5, op) {
  const deals = await mt5.dealsBatch({ logins: [op.login], from: op.since, to: new Date(Date.now() + 864e5).toISOString() });
  return deals.find(d => d.action === 2 && d.comment === op.comment && Math.sign(d.profit) === Math.sign(op.amount)) || null;
}
async function findCreated(mt5, op) {
  const listed = await mt5.listLogins(op.group), users = listed.logins.length ? await mt5.getUsersBatch(listed.logins) : [];
  const email = String(op.email || "").toLowerCase();
  return users.filter(u => email && u.email.toLowerCase() === email && (!u.registered_at || u.registered_at >= op.since)).sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at)))[0] || null;
}

// Runs one operation (and the next one the core asks for, e.g. a transfer's credit leg). Returns the core's last answer.
async function execute({ mt5, crm, store }, op) {
  let last = null;
  while (op) {
    let res = null, secret = null;
    try {
      if (op.kind === "balance") {
        if (op.check_first || op.check_only) { const d = await findDeal(mt5, op); if (d) res = { ok: true, ticket: d.ticket, found_existing: true }; else if (op.check_only) { last = store.transaction(() => crm.mt5OpNotFound(op.op_id)); return Object.assign({ checked: true, found: false }, last); } }
        if (!res && op.need_margin) {
          const a = await mt5.getAccount(op.login), free = a.margin_free != null ? a.margin_free : a.balance;
          if (free == null || free < op.need_margin) res = { ok: false, margin: true, error: `Not enough free margin on ${op.login}: $${free == null ? "?" : free} free, $${op.need_margin} needed. Ask the client to close trades or lower the amount.` };
        }
        if (!res) { const r = await mt5.balance({ login: op.login, amount: op.amount, comment: op.comment, approval: op.approval }); res = { ok: true, ticket: r.ticket, retcode: r.retcode }; }
      } else if (op.kind === "create_account") {
        if (op.check_first || op.check_only) { const u = await findCreated(mt5, op); if (u) res = { ok: true, login: u.login, group: u.group, found_existing: true }; else if (op.check_only) { last = store.transaction(() => crm.mt5OpNotFound(op.op_id)); return Object.assign({ checked: true, found: false }, last); } }
        if (!res) {
          secret = strongPassword(12); const investor = strongPassword(12);
          const u = await mt5.createUser({ group: op.group, name: op.name, leverage: op.leverage, email: op.email, country: op.country, passMain: secret, passInvestor: investor });
          res = { ok: true, login: u.login, group: u.group };
        }
      } else if (op.kind === "leverage") {
        await mt5.updateUser(op.login, { leverage: op.leverage }); res = { ok: true };
      } else res = { ok: false, error: "Unknown MT5 operation " + op.kind };
    } catch (e) { res = toResult(e); } // a login MT5 created outside our range stays a failure (already alerted): never recorded
    last = store.transaction(() => crm.mt5OpResult(op.op_id, res, secret));
    secret = null;
    op = last && last.next;
  }
  return last;
}

module.exports = { execute, strongPassword };
