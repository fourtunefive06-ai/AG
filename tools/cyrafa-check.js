#!/usr/bin/env node
/* Checks the Cyrafa settings in .env by creating one small test checkout session (nothing is charged unless someone pays it).
   Run on the server:  node tools/cyrafa-check.js            (USD 1 → AED 3.67)
                       node tools/cyrafa-check.js 10          (another USD amount) */
"use strict";
const fs = require("fs"), path = require("path");
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const cy = require("../lib/cyrafa.js");
(async () => {
  const st = cy.status();
  console.log("API:", st.base, st.test ? "(test)" : "(LIVE)");
  console.log("Partner ID set:", !!process.env.CYRAFA_PARTNER_ID, "· Merchant ID set:", !!process.env.CYRAFA_MERCHANT_ID, "· webhook secret set:", st.webhook_secret, "· currency:", st.currency, "@", st.rate);
  if (!st.configured) { console.error("✖ Add CYRAFA_PARTNER_ID and CYRAFA_MERCHANT_ID to .env"); process.exit(1); }
  const id = "check-" + Date.now().toString(36), site = (process.env.CHECK_SITE_URL || "https://abselglobal.com").replace(/\/+$/, "");
  try {
    const s = await cy.createSession({ paymentId: id, reference: id, amountUsd: Number(process.argv[2]) || 1, clientId: "check", name: "Test Client", email: "test@example.com",
      billing: { address1: "1 Test Street", city: "Dubai", country: "United Arab Emirates", postalCode: "00000" },
      successUrl: site + "/portal/#history", cancelUrl: site + "/portal/#history", notifyUrl: site + "/webhooks/payments/cyrafa" });
    console.log("✔ Credentials work. Test checkout:", s.payment_page, "\n  amount", s.currency, s.target, "· expires", s.expires_at);
  } catch (e) {
    console.error("✖", e.message);
    if (e.status === 401 || e.status === 403) console.error("  The partner ID was refused. Try CYRAFA_PARTNER_ID=clientPortal (capital P) or ask Cyrafa for the exact value.");
    process.exit(1);
  }
})();
