/* B2BINPAY API v3 (crypto payments, e.g. USDT). Docs: https://docs.b2binpay.com/b2binpay-business/api-guide/api-overview
   - JSON:API requests with a Bearer token from POST /token/ (refreshed by asking again before it expires)
   - one deposit (invoice) per client deposit request, with a hosted payment page and a callback
   - callbacks are signed; we also re-read the deposit from the API before trusting it
   Settings come from .env; nothing here is stored in the database. */
"use strict";
const crypto = require("crypto");

const env = k => (process.env[k] || "").trim();
const cfg = () => ({
  base: (env("B2BINPAY_API_URL") || "https://v3.api-sandbox.b2binpay.com").replace(/\/+$/, ""),
  key: env("B2BINPAY_API_KEY"), secret: env("B2BINPAY_API_SECRET"), callbackSecret: env("B2BINPAY_CALLBACK_SECRET"),
  wallet: env("B2BINPAY_WALLET_ID"), timeLimit: Number(env("B2BINPAY_TIME_LIMIT")) || 3600, inaccuracy: env("B2BINPAY_INACCURACY") || "1",
  confirmations: env("B2BINPAY_CONFIRMATIONS"),
});
const configured = () => { const c = cfg(); return !!(c.key && c.secret); };
const status = () => { const c = cfg(); return { configured: configured(), sandbox: /sandbox/.test(c.base), base: c.base, wallet: c.wallet || null, callback_secret: !!c.callbackSecret }; };

let token = null, tokenExp = 0;
async function call(method, path, body, retry = true) {
  const c = cfg();
  if (!configured()) { const e = new Error("B2BINPAY is not configured (set B2BINPAY_API_KEY and B2BINPAY_API_SECRET in .env)"); e.notConfigured = true; throw e; }
  if (path !== "/token/" && (!token || Date.now() > tokenExp)) await auth();
  const r = await fetch(c.base + path, { method, headers: Object.assign({ "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json" }, path === "/token/" ? {} : { Authorization: "Bearer " + token }), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch (e) {}
  if (r.status === 401 && retry && path !== "/token/") { token = null; return call(method, path, body, false); }
  if (!r.ok) {
    const err = json && json.errors && json.errors[0];
    const e = new Error(`B2BINPAY ${r.status}: ${err ? [err.code, err.detail || err.title].filter(Boolean).join(" ") : txt.slice(0, 200)}`); e.status = r.status; throw e;
  }
  return json;
}
async function auth() {
  const c = cfg();
  const j = await call("POST", "/token/", { data: { type: "auth-token", attributes: { client_id: c.key, client_secret: c.secret } } });
  const a = j.data.attributes; token = a.access; tokenExp = Date.now() + Math.max(60, (Number(a.expires_in) || 3600) - 60) * 1000;
}

// Create the invoice for one deposit request. amount is in the wallet currency (USDT for a USDT wallet).
async function createDeposit({ walletId, amount, trackingId, label, callbackUrl, redirectUrl, buttonText }) {
  const c = cfg(), wallet = String(walletId || c.wallet || "");
  if (!wallet) throw new Error("Set the B2BINPAY wallet ID on the payment method or B2BINPAY_WALLET_ID in .env");
  const attributes = { label: String(label || "").slice(0, 32), tracking_id: String(trackingId).slice(0, 128), callback_url: callbackUrl, payment_page_redirect_url: redirectUrl, payment_page_button_text: (buttonText || "Back to Absel Global").slice(0, 64), target_amount_requested: String(amount), time_limit: c.timeLimit, inaccuracy: c.inaccuracy };
  if (c.confirmations) attributes.confirmations_needed = Number(c.confirmations);
  const j = await call("POST", "/deposit/", { data: { type: "deposit", attributes, relationships: { wallet: { data: { type: "wallet", id: wallet } } } } });
  return toInfo(j.data, j.included);
}
async function getDeposit(id) { const j = await call("GET", "/deposit/" + encodeURIComponent(id)); return toInfo(j.data, j.included); }
async function wallets() { const j = await call("GET", "/wallet/?page[size]=100"); return (j.data || []).map(w => ({ id: w.id, label: w.attributes.label, type: w.attributes.type, status: w.attributes.status, balance: w.attributes.balance_confirmed, currency: w.relationships && w.relationships.currency && w.relationships.currency.data && w.relationships.currency.data.id })); }

function toInfo(d, included) {
  const a = (d && d.attributes) || {}, cur = (included || []).find(x => x.type === "currency");
  const expires = a.time_limit && a.created_at ? new Date(Date.parse(a.created_at) + Number(a.time_limit) * 1000).toISOString() : null;
  return { ext_id: d.id, status_code: a.status, address: a.address || (a.destination && a.destination.address) || "", network: a.address_type || "", currency: cur ? cur.attributes.alpha : "", payment_page: a.payment_page || "", target: a.target_amount_requested, paid: a.target_paid, paid_pending: a.target_paid_pending, tracking_id: a.tracking_id, expires_at: expires };
}

// Deposit status: 2 created / partly paid, 3 paid, 4 cancelled or expired, 5 unresolved (late, overpaid, paid twice)
// Transfer status: -3 cancelled, -2 blocked by AML, -1 failed, 0 created, 1 unconfirmed, 2 confirmed
function stateOf(info, transfer) {
  if (transfer && Number(transfer.risk_status) === 3) return { state: "review", note: "Flagged high risk by the AML check" };
  if (transfer && Number(transfer.status) === -2) return { state: "review", note: "Blocked by the AML check, pending B2BINPAY compliance" };
  const s = Number(info.status_code);
  if (s === 3) return { state: "paid" };
  if (s === 4) return { state: "expired" };
  if (s === 5) return { state: "review", note: "Unresolved at B2BINPAY: late, overpaid or repeated payment" };
  if (Number(info.paid) > 0) return { state: "partial" };
  return { state: "waiting" };
}

/* Callback authentication. The docs describe an HMAC-SHA256 over
   transfer.status + transfer.amount + deposit.tracking_id + meta.time (with a transfer), or
   deposit.status + deposit.tracking_id + meta.time (status change only), compared with meta.sign.
   The key is the callback secret; older accounts use sha256(api key + api secret). Each candidate key is
   derived from our own secrets, so accepting any of them is safe. Confirm which one matches on the first sandbox callback. */
function verifyCallback(body) {
  const c = cfg(), meta = body && body.meta, d = body && body.data;
  if (!meta || !meta.sign || !d) return false;
  const tr = (body.included || []).find(x => x.type === "transfer");
  const da = d.attributes || {};
  const msg = tr ? String(tr.attributes.status) + String(tr.attributes.amount) + String(da.tracking_id || "") + String(meta.time) : String(da.status) + String(da.tracking_id || "") + String(meta.time);
  const keys = [];
  if (c.callbackSecret) keys.push(Buffer.from(c.callbackSecret), crypto.createHash("sha256").update(c.callbackSecret).digest());
  if (c.key && c.secret) keys.push(crypto.createHash("sha256").update(c.key + c.secret).digest());
  const want = Buffer.from(String(meta.sign).toLowerCase());
  return keys.some(k => { const got = Buffer.from(crypto.createHmac("sha256", k).update(msg).digest("hex")); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}
function parseCallback(body) {
  const d = body.data || {}, tr = (body.included || []).find(x => x.type === "transfer"), cur = (body.included || []).find(x => x.type === "currency");
  const info = toInfo(d, body.included), t = tr ? tr.attributes : null;
  return { info, transfer: t, txid: t ? t.txid : "", currency: cur ? cur.attributes.alpha : "" };
}

module.exports = { configured, status, createDeposit, getDeposit, wallets, verifyCallback, parseCallback, stateOf, _reset: () => { token = null; tokenExp = 0; } };
