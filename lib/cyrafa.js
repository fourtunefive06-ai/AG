/* CyrafaPay Visa / Mastercard hosted checkout (API guide v1.3).
   - POST {base}/checkout/sessions with the X-Partner-Id header → checkout_url (valid 15 minutes)
   - the client pays on Cyrafa's page with 3-D Secure; card details never touch our server
   - one webhook per payment (payment.succeeded / payment.failed), signed HMAC-SHA256(timestamp + "." + raw body, partner secret),
     sent once with no retries, so the success redirect is also recorded as a hint for operations
   - only AED is supported: USD deposits are converted at CYRAFA_FX_RATE (AED per USD) */
"use strict";
const crypto = require("crypto");

const env = k => (process.env[k] || "").trim();
const cfg = () => ({
  base: (env("CYRAFA_API_URL") || "https://merchant-visamaster-qa.cyrafa.com/api/v1/cp/psp/visa-master").replace(/\/+$/, ""),
  partner: env("CYRAFA_PARTNER_ID"), merchant: env("CYRAFA_MERCHANT_ID"), secret: env("CYRAFA_PARTNER_SECRET"),
  currency: (env("CYRAFA_CURRENCY") || "AED").toUpperCase(), rate: Number(env("CYRAFA_FX_RATE")) || 3.6725,
});
const configured = () => { const c = cfg(); return !!(c.partner && c.merchant); };
const status = () => { const c = cfg(); return { configured: configured(), test: /-qa\.|crm-visamaster/.test(c.base), base: c.base, currency: c.currency, rate: c.rate, webhook_secret: !!c.secret }; };
const round2 = n => Math.round(Number(n) * 100) / 100;
const toLocal = usd => round2(usd * (cfg().currency === "USD" ? 1 : cfg().rate));
const toUsd = local => round2(Number(local) / (cfg().currency === "USD" ? 1 : cfg().rate));

// session id from https://checkout.cyrafa.com/s/<id>?t=...
const sessionIdOf = url => { const m = String(url || "").match(/\/s\/([A-Za-z0-9_-]+)/); return m ? m[1] : ""; };

async function createSession({ paymentId, reference, amountUsd, name, email, billing, successUrl, cancelUrl, notifyUrl, clientId }) {
  const c = cfg();
  if (!configured()) { const e = new Error("Card payments are not configured (set CYRAFA_PARTNER_ID and CYRAFA_MERCHANT_ID in .env)"); e.notConfigured = true; throw e; }
  const amount = toLocal(amountUsd);
  const body = {
    merchantId: c.merchant, amount: Number(amount.toFixed(2)), currency: c.currency, name: String(name).slice(0, 120), email,
    billingAddress: { address1: billing.address1, city: billing.city, country: billing.country || "", postalCode: billing.postalCode || "" },
    success_url: successUrl, cancel_url: cancelUrl, notify_url: notifyUrl,
    metadata: { orderId: paymentId, reference, customerId: clientId, description: "Trading account deposit " + reference },
  };
  // The docs require two decimals ("100.00"); JSON numbers drop trailing zeros, so the amount is written with toFixed(2)
  const json = JSON.stringify(body).replace(/"amount":[0-9.]+/, '"amount":' + amount.toFixed(2));
  const r = await fetch(c.base + "/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/json", "X-Partner-Id": c.partner, "Idempotency-Key": `cp-${reference}-${amount.toFixed(2)}-${Date.now()}` }, body: json, signal: AbortSignal.timeout(20000) });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok || !j || !j.result || !j.result.checkout_url) {
    const why = j ? (j.error || (j.upstreamError && j.upstreamError.message) || j.code) : txt.slice(0, 200);
    const e = new Error(`Cyrafa ${r.status}: ${why || "no checkout URL"}`); e.status = r.status; throw e;
  }
  return { ext_id: sessionIdOf(j.result.checkout_url), payment_page: j.result.checkout_url, expires_at: j.result.expires_at || new Date(Date.now() + 15 * 60e3).toISOString(), currency: c.currency, target: amount.toFixed(2), rate: c.rate };
}

// Signature check on the raw body exactly as received
function verifyWebhook(raw, headers) {
  const c = cfg(), sig = String(headers["x-signature"] || "").trim(), ts = String(headers["x-timestamp"] || "").trim();
  if (!c.secret) return { ok: false, why: "CYRAFA_PARTNER_SECRET is not set" };
  if (!sig || !ts) return { ok: false, why: "missing headers" };
  if (!/^\d{9,11}$/.test(ts)) return { ok: false, why: "invalid timestamp" };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, why: "stale" };
  if (headers["x-partner-id"] && c.partner && String(headers["x-partner-id"]) !== c.partner) return { ok: false, why: "wrong partner" };
  const mac = crypto.createHmac("sha256", c.secret).update(ts + "." + raw.toString("utf8")).digest();
  let got = null;
  if (/^[0-9a-f]{64}$/i.test(sig)) got = Buffer.from(sig, "hex");
  else { try { got = Buffer.from(sig, "base64"); } catch (e) {} }
  if (!got || got.length !== mac.length) return { ok: false, why: "bad signature" };
  return crypto.timingSafeEqual(got, mac) ? { ok: true } : { ok: false, why: "bad signature" };
}
function parseWebhook(body) {
  const ok = body.event === "payment.succeeded", failed = body.event === "payment.failed";
  return { ref: body.metadata && body.metadata.orderId, ext_id: body.session_id, state: ok ? "paid" : failed ? "failed" : "", amount_local: Number(body.amount) || 0, amount_after_fees: Number(body.amountAfterFees) || 0, currency: body.currency || cfg().currency, txid: body.transactionId || "", note: body.message || "" };
}

module.exports = { configured, status, createSession, verifyWebhook, parseWebhook, toLocal, toUsd, sessionIdOf };
