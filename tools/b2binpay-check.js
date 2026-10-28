#!/usr/bin/env node
/* Checks the B2BINPAY settings in .env step by step: API address, sign-in with the key, wallets, and (optionally) a test invoice.
   Run on the server:  node tools/b2binpay-check.js                 (sign-in + wallet list)
                       node tools/b2binpay-check.js <walletId> 10   (also creates a 10 USDT test invoice in that wallet) */
"use strict";
const fs = require("fs"), path = require("path");
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const b2b = require("../lib/b2binpay.js");
const hint = msg => {
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|aborted|timeout/i.test(msg)) return "The server can't reach B2BINPAY. Check B2BINPAY_API_URL (sandbox: https://v3.api-sandbox.b2binpay.com) and that the server has internet access / no firewall blocking outgoing HTTPS.";
  if (/whitelist|not allowed|forbidden|403/i.test(msg)) return "B2BINPAY refused this server's IP. Add the server's public IP (run: curl ifconfig.me) to the API access whitelist in the B2BINPAY back office.";
  if (/401|invalid|credentials|auth|token/i.test(msg)) return "The API key or secret was refused. Copy them again from the B2BINPAY sandbox back office (sandbox and live keys are different).";
  if (/wallet/i.test(msg)) return "Wrong or missing wallet ID. Use one of the wallet IDs listed above, set it on the USDT method in Client area settings (or B2BINPAY_WALLET_ID in .env).";
  return "Send this message to your developer or B2BINPAY support.";
};
(async () => {
  const st = b2b.status();
  console.log("API:", st.base, st.sandbox ? "(sandbox)" : "(LIVE)");
  console.log("API key set:", !!process.env.B2BINPAY_API_KEY, "· secret set:", !!process.env.B2BINPAY_API_SECRET, "· callback secret set:", st.callback_secret, "· default wallet:", st.wallet || "(none)");
  if (!st.configured) { console.error("✖ Add B2BINPAY_API_KEY and B2BINPAY_API_SECRET to .env"); process.exit(1); }
  let wallets;
  try { wallets = await b2b.wallets(); console.log("✔ Signed in to B2BINPAY"); }
  catch (e) { console.error("✖", e.message, "\n ", hint(e.message)); process.exit(1); }
  if (!wallets.length) console.log("! No wallets on this account. Create a USDT (TRC20) wallet in the B2BINPAY back office.");
  wallets.forEach(w => console.log(`  wallet ${w.id} · ${w.currency || "?"} · ${w.label || ""} · ${w.status || ""}`));
  const wid = process.argv[2] || st.wallet;
  if (!wid) { console.log("Next: pick the USDT wallet ID above and run  node tools/b2binpay-check.js <walletId> 10"); return; }
  try {
    const site = (process.env.CHECK_SITE_URL || "https://abselglobal.com").replace(/\/+$/, "");
    const d = await b2b.createDeposit({ walletId: wid, amount: Number(process.argv[3]) || 10, trackingId: "check-" + Date.now().toString(36), label: "Connection check", callbackUrl: site + "/webhooks/payments/b2binpay", redirectUrl: site + "/portal/#history" });
    console.log("✔ Test invoice created:", d.ext_id, "· pay to", d.address, d.network || "", "·", d.target, d.currency, "\n  payment page:", d.payment_page);
  } catch (e) { console.error("✖ Creating the invoice failed:", e.message, "\n ", hint(e.message)); process.exit(1); }
})();
