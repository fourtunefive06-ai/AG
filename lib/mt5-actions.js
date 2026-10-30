/* Sends the MT5 account actions the core has prepared and reports each result back to the core.
   Our system never moves money in MT5: there is no balance, credit or trade action here (lib/mt5.js refuses them too).
   - create_account: two different strong passwords generated here; only the main one goes to the core (shown once to the
     client). The investor password is never stored or logged. The account carries the comment "ABSEL <request id>".
     If MT5's answer is lost (timeout, dropped connection) nothing is sent again blindly: the group is searched for a user
     with that comment; found → linked, not found → failed so operations can retry. A retry searches first too.
   - leverage: update the user in MT5 (non-money field). */
"use strict";
const crypto = require("crypto");
const MAX_LOGIN_TRIES = 200;

// 10–12 characters with lower case, upper case, a digit and one of #@!$% (cryptographically random)
function strongPassword(len = 12) {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "#@!$%"], letters = sets.slice(0, 3).join(""), pick = s => s[crypto.randomInt(s.length)];
  len = Math.max(10, Math.min(12, len));
  const chars = sets.map(pick); while (chars.length < len) chars.push(pick(letters)); // exactly one special character
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
// Errors before anything reached MT5 are definite failures; a timeout or a dropped connection after sending is unknown
const isUnknown = e => !!(e.timeout || (e.network && /ECONNRESET|EPIPE|socket hang up|closed the connection/i.test(String(e.code || "") + " " + e.message)));
// MT5's answer in plain words for operations
function plain(e, op) {
  const m = String(e.message || "");
  if (e.range) return m; // already says which login and range
  if (e.notConfigured) return "MT5 isn't set up on the server (MT5_SERVER, MT5_MANAGER_LOGIN, MT5_WEBAPI_PASSWORD).";
  if (e.network || e.timeout) return isUnknown(e) ? m : `MT5 server unreachable (${m}). Check the server or our IP whitelist, then retry.`;
  if (/group/i.test(m) && /invalid|not found|unknown|\b13 /i.test(m)) return `MT5 group “${op.group}” not found. Check the group name in Client area settings.`;
  if (/\b8 |access denied|no permission|not enough rights/i.test(m)) return `The MT5 manager has no permission for this (group “${op.group}”). Ask Absel Markets to check the manager's rights.`;
  if (/login.*(range|full|exhaust)|no free login|3004|already exists/i.test(m)) return "The MT5 login series is full or the login is taken. Ask Absel Markets for more logins in Absel Global's range.";
  if (/password/i.test(m)) return "MT5 refused the generated password (password policy). Ask Absel Markets for the server's password rules.";
  return m;
}
const toResult = (e, op) => ({ ok: false, error: plain(e, op || {}), retcode: e.retcode != null ? e.retcode : null, unknown: isUnknown(e), range: !!e.range });

// The account MT5 made for this request: a user in the group whose comment is "ABSEL <request id>"
async function findCreated(mt5, op) {
  const listed = await mt5.listLogins(op.group), taken = new Set((op.taken || []).map(String)); // the client's other accounts are never it
  const users = listed.logins.length ? await mt5.getUsersBatch(listed.logins.filter(l => !taken.has(String(l)))) : [];
  return users.filter(u => op.comment && u.comment === op.comment).sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at)))[0] || null;
}

// Logins of our range still to try: after the highest one we know of, then from the start of the range
function* loginCandidates(mt5, used) {
  const { from, to } = mt5.cfg(), known = new Set(used.map(Number)), top = Math.max(from - 1, ...[...known].filter(l => l >= from && l <= to));
  for (let l = top + 1; l <= to; l++) if (!known.has(l)) yield l;
  for (let l = from; l <= top; l++) if (!known.has(l)) yield l;
}
// A login is free only when MT5 itself says "13 Not found". Any other error stops here, so nothing is created on a guess.
async function isFree(mt5, login) {
  try { await mt5.getUser(login); return false; } catch (e) { if (e.retcode === 13) return true; throw e; }
}
// Picks the login itself instead of leaving it to the manager's series (Login 0), which can be outside Absel Global's range.
// If another account took the login between the check and the create, MT5 answers 3004 and the next one is tried.
async function createInRange(mt5, used, fields) {
  const { from, to } = mt5.cfg(), rangeError = msg => Object.assign(new Error(msg), { range: true });
  if (!(from && to && from <= to)) throw rangeError("Set MT5_LOGIN_FROM and MT5_LOGIN_TO (the Absel Global login range) in .env. No account was created.");
  let tries = 0;
  for (const login of loginCandidates(mt5, used)) {
    if (++tries > MAX_LOGIN_TRIES) throw rangeError(`No free MT5 login found after checking ${MAX_LOGIN_TRIES} logins in ${from}–${to}. No account was created. Check the login series at Absel Markets.`);
    if (!(await isFree(mt5, login))) continue;
    try { return await mt5.createUser(Object.assign({ login }, fields)); } catch (e) { if (e.retcode !== 3004) throw e; }
  }
  throw rangeError(`Every MT5 login in ${from}–${to} is taken. No account was created. Ask Absel Markets for more logins in Absel Global's range.`);
}

// Runs one account action. Returns the core's answer.
async function execute({ mt5, crm, store }, op, o = {}) {
  let res = null, secret = null;
  try {
    if (op.kind === "create_account") {
      if (op.check_first || op.check_only) { const u = await findCreated(mt5, op); if (u) res = { ok: true, login: u.login, group: u.group, found_existing: true }; else if (op.check_only) return Object.assign({ checked: true, found: false }, store.transaction(() => crm.mt5OpNotFound(op.op_id))); }
      if (!res) {
        secret = strongPassword(12); let investor = strongPassword(11); while (investor === secret) investor = strongPassword(11);
        try {
          const u = await createInRange(mt5, crm.mt5UsedLogins(), { group: op.group, name: op.name, leverage: op.leverage, email: op.email, country: op.country, city: op.city, phone: op.phone, comment: op.comment, passMain: secret, passInvestor: investor });
          res = { ok: true, login: u.login, group: u.group };
        } catch (e) {
          if (!isUnknown(e)) throw e;
          // the answer was lost: look for the account by its comment instead of creating another
          // if it's there, MT5 made it with the password generated above, so the client still gets it once
          await new Promise(r => setTimeout(r, o.searchDelayMs != null ? o.searchDelayMs : 1500));
          let u = null; try { u = await findCreated(mt5, op); } catch (e2) { res = { ok: false, unknown: true, error: `MT5 didn't answer (${e.message}) and couldn't be searched (${e2.message}). Retry searches MT5 before creating another.` }; }
          if (!u) secret = null;
          if (!res) res = u ? { ok: true, login: u.login, group: u.group, found_existing: true } : { ok: false, error: `MT5 didn't answer (${e.message}) and no account with comment “${op.comment}” is in ${op.group}, so none was created. You can retry.` };
        }
        investor = null;
      }
    } else if (op.kind === "leverage") {
      await mt5.updateUser(op.login, { leverage: op.leverage }); res = { ok: true };
    } else res = { ok: false, error: "Unknown MT5 operation " + op.kind };
  } catch (e) { res = toResult(e, op); } // a login MT5 created outside our range stays a failure (already alerted): never linked
  const last = store.transaction(() => crm.mt5OpResult(op.op_id, res, secret));
  secret = null;
  return last;
}

module.exports = { execute, strongPassword, findCreated };
