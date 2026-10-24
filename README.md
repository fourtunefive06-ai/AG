# Absel Global — website + Absel CRM

Website, client area and CRM for **Absel Global**, a trading name of Absel Markets (FSC Mauritius, licence GB25205423). Clients only ever see the Absel Global brand; accounts and money are handled at Absel Markets by your operations team.

* **Website** (`public/index.html`): landing page with hero form and popup form. "Log in" and "Open account" go to the client area. There is **no link to the CRM** anywhere on it.
* **Client area** (`public/portal/`, at `/portal/`): clients register, confirm their email, upload KYC documents, request live and demo MT5 accounts, deposit, withdraw, transfer between accounts and see their history. Two-step login, password reset, account lockout.
* **CRM** (`public/crm/`): served at a secret path you choose (`CRM_PATH`), e.g. `https://abselglobal.com/team-desk/`. It is not indexed by search engines.
* **Backend** (`server.js` + `lib/`): no npm packages. It uses only Node.js built-ins, including Node's own SQLite.

---

## How the client area works with Absel Markets

The client area doesn't connect to MT5 or a payment provider. Every client request lands in a queue in the CRM; operations does the step at Absel Markets and records it, and the client sees the result at once (and gets an email).

| Client does | Queue (CRM → Operations) | Operations does at Absel Markets, then records |
|---|---|---|
| Uploads ID and proof of address | **KYC review** (compliance) | Checks the documents; approve, ask for new ones, or reject. Approving moves the sales lead to "KYC verified" |
| Requests a live or demo account | **Account opening** | Opens it in MT5 Manager; enters login, server, group and a first password, which the client sees **once** (never stored after that, never emailed) |
| Sends a deposit (with receipt) | **Client money → Deposits** | Confirms the money arrived and credits MT5; enters the bank/PSP reference. The client's first deposit becomes a **verified FTD** for the sales agent automatically |
| Requests a withdrawal | **Client money → Withdrawals** | Approves (two different people above the limit, default $1,000), pays, enters the payment reference |
| Requests a transfer | **Client money → Transfers** | Moves the balance in MT5, marks it done |
| Sees balances | **Balance import** | Uploads the daily CSV (Login, Balance, Equity) from Absel Markets; clients see dated balances and can't withdraw more than that |

Rules: KYC before a live account (switchable), KYC before any withdrawal, minimum first deposit per account type, method minimums and maximums, withdrawals held against the balance while pending. Bank details, wallet addresses, payment links, account types, leverages and the legal line are set in **CRM → Client area settings**.

**Roles:** *Operations* (all queues, clients, balances), *Compliance* (KYC review only). Sales agents see their own clients' client-area status on the lead page; managers see all.

**What clients see of Absel Markets:** only the legal line ("Absel Global is a trading name of Absel Markets…") in the footer and legal documents. Bank transfer details must name the licensed company's segregated account, and card statements and the MT5 server show whatever names Absel Markets' providers use; ask them for "Absel Global" names where possible. Have compliance approve the legal line, client agreement and privacy policy before go-live.

## What the CRM does

The CRM has **two workspaces**, so each team sees only the tools it uses.

| Role | Workspace | What they do |
|---|---|---|
| **Sales agent** | Sales | **My day** queue and monthly FTD progress · **Calling mode** (dial, timer, outcome keys 1–8, discovery, script, auto-dial next lead) · **Inbox** for two-way WhatsApp · **Deposit pipeline** checklist · submit **first deposits** with proof · **Targets** leaderboard · own **call reviews**. Sees only their own leads. |
| **Sales manager** | Sales | Everything agents have, for the whole team, plus: **verify or reject deposits** · **Team live** (online / on break / offline) · **Call quality** scorecards · **Lead hygiene** (merge duplicates, recycle lost leads, speed rules) · territories · targets · all sales reports. |
| **Marketing executive** | Marketing | **Marketing overview** (spend, CPL, cost per FTD) · **Campaigns & spend** with tracking links · **Broadcasts** (drafts need approval) · **Lead sources** · templates · leads **view only** (can't call or move them). |
| **Marketing manager** | Marketing | Everything marketing executives have, plus approving broadcasts, editing automations, the do-not-contact list, and importing/exporting leads. |
| **Admin** | Both | Everything, plus team, security and settings. |

### Sales: from first call to verified first deposit
* **Verified FTD:** an agent submits the deposit (amount, method, reference, date, proof photo or PDF). A sales manager verifies it, and only then does the lead move to Funded and count on targets and reports. Rejections go back to the agent with a reason. This can be switched off in Settings.
* **Deposit pipeline:** six steps per lead: account opened → KYC documents uploaded → KYC approved → method agreed → amount and date promised → deposit verified. Leads over the stage time limit are flagged as **stuck**. Two automations chase them by WhatsApp and book a call.
* **Targets:** monthly FTD count and amount per agent, a leaderboard, desk totals, pace and month-end projection.
* **Inbox:** every WhatsApp and email conversation per lead, with unread first and the 24-hour window shown. Clients who reply STOP are opted out of broadcasts.
* **Phone system:** the Dial button uses the computer's softphone (tel: link) or, when configured, **click-to-call** through your PBX. A call-event webhook attaches **recordings** to calls, logs incoming calls, and books a call-back for missed calls.
* **Call quality:** managers score connected calls on six skills plus a compliance check, and agents read and acknowledge the feedback.
* **Attendance:** online time, breaks (agents set Available / On break) and calls per hour. Leads skip agents on a break.
* **Lead hygiene:** duplicate merge, a do-not-contact list (new leads are flagged automatically), recycling of lost leads to a different agent after X days, and reassignment of new leads not called within X minutes to an online colleague.
* **Change history:** every edit is stored with its old and new value.
* **Optional demo and company-funded account:** both are side-steps; only a verified deposit of the client's own money counts as converted.
  * *Demo account:* the agent records the demo login, then the walkthrough, first practice trade and regular trading. The client gets the details on WhatsApp, a walkthrough call is booked, and a demo not traded in 2 days is nudged.
  * *$100 company-funded account:* the lead page shows the eligibility checks (KYC verified, not yet funded, one per phone and email, not on the do-not-contact list, monthly limit). The agent reads the terms to the client, confirms they accepted, and requests it. A sales manager approves and records the account credited. Agents update lots, profit and balance from the back-office. The $100 can't be withdrawn; profit can, after the minimum lots and up to the limit, with manager approval. It expires automatically, and turns to "converted" when the client's own first deposit is verified.
  * *Follow-up:* My day lists clients in profit, accounts about to expire and idle demos. Calling mode shows journey badges, scripts and answers to "Why deposit if I have the free $100?" and similar. Five automations cover demo given, demo idle, credited, expiring and ended.
  * *Reporting:* the **Demo & $100** screen holds approvals, profit withdrawals and live accounts. The **Journey & $100** report shows the funnel, conversion with and without demo or $100, programme cost, cost per converted FTD and results by agent, country and campaign. Marketing can target "demo never traded" or "$100 ended without deposit" in broadcasts.
  * *Settings:* amount, expiry days, minimum lots, maximum withdrawable profit, monthly limit, KYC requirement, and whether profit withdrawal needs the client's own deposit. Switch the programme off at any time.

### Marketing: campaigns, communication, acquisition
* **Campaigns:** each campaign is matched to leads by utm_source and utm_campaign. Log daily spend or import a CSV to see **cost per lead, cost per registration, cost per FTD and deposits per $1**. Untracked utm values are listed so they can become campaigns.
* **Broadcasts:** bulk WhatsApp (Meta-approved templates) or email to a segment: stage, temperature, country, city, source, campaign, interest, date received, days quiet. Do-not-contact and unsubscribed clients are always skipped, there is a frequency cap, messages are throttled and pause in quiet hours. Results show sent, delivered, read, replies, and registrations and FTDs within 14 days. Every marketing email gets a one-click **unsubscribe** link.
* **Lead sources:** website forms, **Meta Lead Ads**, **Google Ads lead forms**, a generic **lead API** (Zapier, Make, partner sites), WhatsApp and phone calls.
* **Lead quality report:** reached %, never reached, invalid, repeat, qualified and FTD % by source, campaign and country. This is the feedback loop from sales to marketing.

**Lead lifecycle:** New → Attempting → Contacted → Qualified → Registered → KYC verified → Funded (FTD), or Lost (with a reason) or Invalid.

**Lead scoring:** each lead gets a 0–100 score and a hot / warm / cold temperature. The score comes from capital, timeline, experience, expected deposit, call outcomes, WhatsApp replies and stage.

**Territories (routing):** assign leads by country, city, area, source, interest and language. Each territory shares leads round-robin or to the agent with the fewest open leads. Leads that match nothing wait in an Unassigned pool, or are shared across all agents if you choose that in Settings. Repeat enquiries go back to the same owner. Agents can pause new leads with the "Taking leads" switch.

**Reports**

| Report | What it shows |
|---|---|
| Funnel | Conversion from lead to FTD, step by step |
| Agent performance | Calls, connect rate, talk time, speed to lead, follow-ups, registrations, FTDs, FTD amount, monthly target progress |
| Sources & campaigns | Results by UTM source, campaign and product interest |
| Geography & territories | Results by country, city and territory |
| Call activity | Outcomes, heatmaps of best calling hours, latest calls with notes |
| Discovery & objections | Concerns raised and how often those leads still funded, capital, markets, timeline, competitor brokers, the questions clients asked |
| Lost reasons | Why leads were lost, and by which owner |
| First deposits | Verified FTDs by agent, desk, source, campaign, country, city, method and size; days from lead to FTD; pending and rejected |
| Agent activity | Online hours, breaks, calls per hour, talk % and idle time, per agent and per day |
| Call quality | Review scores by skill and agent, compliance issues |
| Campaign ROI | Spend, CPL, cost per FTD and deposits per $1 by campaign and channel |
| Lead quality | How good each source's leads are once called |
| Broadcasts | Results of every broadcast |
| Daily MIS | Totals by day, week or month, and an optional **daily email** to managers |
| Automation | Runs, sends and failures per automation and channel |

**Automations (rules engine)**

* **Triggers:** new lead · lead assigned · stage changed · call logged with an outcome · no contact after X hours · inactive for X days · **stuck in a stage for X days** · client replied on WhatsApp · deposit submitted.
* **Conditions:** stage, country, interest, source, temperature.
* **Actions:** send email · send WhatsApp · create a follow-up · notify the owner · notify managers · move stage · re-route.
* **Timing:** an optional delay, plus quiet hours so clients are never messaged at night.
* **Safety:** leads marked Do not contact are never messaged. WhatsApp follows Meta's rules: only approved templates can be sent outside the 24-hour reply window.
* **Ready-made automations (9):** welcome email, WhatsApp intro from the agent, WhatsApp after a missed call, 24-hour no-contact escalation, "registered → verify and fund", KYC reminder after 2 days, funding nudge after 2 days, thank-you on FTD, and 7-day re-engagement.

---

## 1. Try it locally with demo data

You need **Node.js 22.13 or newer** (`node -v`).

```bash
cp .env.example .env
# set SESSION_SECRET to a long random string, and set DB_FILE=./db/demo.db
npm run demo        # builds db/demo.db: a simulated month of leads, calls and messages
npm start
```

Open `http://localhost:3000/team-desk/`.

* **Demo logins:** `admin` (admin), `sara` (sales manager), the agents `daniel`, `grace`, `chinedu`, `rahul`, `yousef`, `mai`, `nadia` (marketing manager), `omar` (marketing executive), `fatima` and `ali` (operations) and `joy` (compliance).
* **Client area:** `http://localhost:3000/portal/`. Register a test client; without email configured, the verification and reset links are printed in the server console (development only). Demo clients use the password `Client-pass-2026`.
* **Demo password:** `demo-pass-123` for every account. Demo only, never use it on a live server.

## 2. Go live

1. **Server.** Use any Linux VPS with 1–2 GB RAM. Install Node.js 22 LTS (`nvm install 22`).
2. **Upload this folder** to the server, e.g. `/var/www/absel-global`.
3. **Configure `.env`:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   * `SESSION_SECRET`: generate it with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   * `ADMIN_USERNAME` and `ADMIN_PASSWORD`: creates the first admin on first start. The password needs 10+ characters with letters and numbers. You'll be asked to choose a new one at first sign-in; then remove `ADMIN_PASSWORD` from `.env`.
   * `CRM_PATH`: your secret CRM address, e.g. `team-desk`.
   * `NODE_ENV=production` and `TRUST_PROXY=1`
4. **Run it with PM2** so it restarts on reboot:
   ```bash
   npm install -g pm2
   pm2 start server.js --name absel-global
   pm2 save && pm2 startup
   ```
5. **Add the domain and HTTPS with Nginx:**
   ```nginx
   server {
     server_name abselglobal.com www.abselglobal.com;
     client_max_body_size 5m;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   Then: `certbot --nginx -d abselglobal.com -d www.abselglobal.com`
6. **Set up the CRM.** Sign in at `https://abselglobal.com/<CRM_PATH>/`, then:
   1. **Team:** add your agents and managers.
   2. **Territories:** create one per desk or city, e.g. "Nigeria · Lagos" with country Nigeria and city Lagos, assigned to your Lagos agents.
   3. **Templates:** review the wording.
   4. **Automations:** review the rules.
   5. **Settings:** set your speed-to-lead target, retry schedule and quiet hours.

## 3. Connect email

Pick one provider in `.env`:

| Provider | Settings |
|---|---|
| **SMTP** (Microsoft 365, Google Workspace, Zoho, cPanel mail) | `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` |
| **SendGrid / Brevo / Resend** | `EMAIL_PROVIDER=sendgrid` (or `brevo`, `resend`) and `EMAIL_API_KEY` |

Set `EMAIL_FROM` to an address on your own domain. Set up SPF and DKIM for that domain with your provider, or emails will land in spam. Until email is connected, email messages are logged as "skipped".

## 4. Connect WhatsApp (Meta WhatsApp Business Cloud API)

1. In **Meta Business Manager**, open WhatsApp → API setup and add your business phone number.
2. Create a **System User** and give it a **permanent access token** with the `whatsapp_business_messaging` permission. Then set in `.env`:
   * `WHATSAPP_TOKEN` (the access token)
   * `WHATSAPP_PHONE_NUMBER_ID`
3. **Create and get approval for the message templates** in WhatsApp Manager. Use the same names as the CRM templates, with body variables in this order:
   * `absel_intro`: "Hi {{1}}, this is {{2}} from Absel Markets…" ({{1}} = first_name, {{2}} = agent_name)
   * `absel_missed_call`: "Hi {{1}}, {{2}} from Absel Markets here. I just tried to call you…"

   You can rename or add templates in **CRM → Templates**. Set "Approved Meta template name" and the variable order there.
4. **Replies webhook.** In the Meta app, go to WhatsApp → Configuration → Webhook:
   * Callback URL: `https://abselglobal.com/webhooks/whatsapp`
   * Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
   * Subscribe to `messages`
   * Set `WHATSAPP_APP_SECRET` so the server can verify that webhook calls really come from Meta.

Once connected:

* Client replies appear on the lead's timeline and notify the owner.
* Delivered and read ticks update in the CRM.
* A message from an unknown number creates a new lead.

## 5. Daily operations

* **Backups:** the entire CRM is one file. Back it up daily:
  ```bash
  0 3 * * * sqlite3 /var/www/absel-global/db/crm.db ".backup '/var/backups/crm-$(date +\%F).db'"
  ```
* **BI / custom MIS:** `db/schema.sql` creates the SQL views `v_leads`, `v_calls`, `v_tasks`, `v_messages` and `v_users`. Point Metabase or Power BI at the database file, or query it with `sqlite3`.
* **Ad tracking:** tag campaign links like `https://abselglobal.com/?utm_source=google&utm_medium=cpc&utm_campaign=pk-ecn`. For IB partners use `?ref=IB1023`. Every lead keeps its source, campaign, ad, keyword, Google and Meta click IDs and partner code.
* **Conversion tracking:** the website fires `generate_lead` (GTM / GA4) and `fbq('track','Lead')` on every lead.

## 6. Sign-in and security

**Accounts and passwords**
* Each person has their own username and password. Admins create accounts in **Team** with a starting password, and the person must choose their own at first sign-in.
* Passwords need 10+ characters with letters and numbers, and can't contain the username.
* Passwords are stored only as PBKDF2-SHA256 hashes (310,000 rounds), the same format in the prototype and on the server, so accounts move between them with a backup.

**Lockout and limits**
* 5 wrong attempts lock an account for 15 minutes. An admin can unlock it sooner in Team → Manage.
* There is a limit of 60 sign-in attempts per network per 15 minutes, which is enough for a whole office on one IP.
* Wrong usernames and wrong passwords get the same message, so usernames can't be guessed.

**Two-step verification**
* Anyone can turn it on from the account menu (top right) with Google Authenticator, Microsoft Authenticator or Authy.
* Admins can require it for admins, managers and/or agents in **Settings → Sign-in security**.
* If someone loses their phone, an admin uses **Reset two-step** in Team.

**Sessions**
* Sessions last 12 hours (`SESSION_HOURS`).
* Changing a password, deactivating an account, or **Sign out everywhere** ends every session for that person on every device.

**Audit**
* **Team → Sign-in activity** logs every sign-in, failed attempt, lockout, password change, 2-step change, admin action and backup download, with IP address and device.
* The same log is in the `v_logins` database view.

**Permissions**
* Every action is checked on the server. Agents can't open other agents' leads even by guessing links.
* Only admins see the sign-in log, manage users, change settings or download backups.

**Other protections**
* Session cookies are signed, HttpOnly and SameSite=Strict, and HTTPS-only in production.
* Every CRM request must include a header other sites can't add (CSRF protection).
* The CRM pages send a strict Content-Security-Policy and can't be embedded in other sites.
* The website form has a honeypot field that silently drops bots, plus a rate limit.
* Email and WhatsApp keys live only in `.env`, never in the database.
* Restricted countries (UAE, USA, Canada, etc.) are blocked on both the website and the server.

### Upgrading an existing installation
Replace the files and restart. New tables are created automatically, the new automations and templates are added once, and leads already funded get a verified deposit record, so targets and reports stay complete. Version 3.1 adds the demo and $100 automations and templates the same way. Then give people their new roles in Team (marketing staff → Marketing executive or Marketing manager).

### Moving data from the prototype (or another server)
1. In the CRM, go to **Settings → Full backup → Download full backup** (admin only). The file contains client data, so keep it safe.
2. On the server, stop the app and run:
   ```bash
   node tools/import-backup.js absel-crm-backup-YYYY-MM-DD.json
   ```
   Add `--replace` to overwrite an existing database. The old one is kept as `.before-import`.
3. Start the app. Everyone signs in with their same username and password.
4. Remove the sample accounts and sample leads (marked SAMPLE) before going live.

## 7. Files

```
server.js              web server, login, CRM API, WhatsApp webhook, automation worker
lib/core.js            all CRM business logic (leads, routing, calls, scoring, automations, reports)
lib/store-sqlite.js    SQLite persistence
lib/channels.js        email (SMTP, SendGrid, Brevo, Resend) and WhatsApp Cloud API
db/schema.sql          reporting views
public/index.html      website
public/portal/         client area (index.html, portal.js)
public/crm/            CRM app: app.js (shell, roles), views-work.js (queue, calling, leads, lead page), views-sales.js (inbox, pipeline,
                       deposits, targets, team live, call quality, hygiene), views-marketing.js (overview, campaigns, broadcasts,
                       lead sources, opt-outs), views-insights.js (dashboard, reports), views-admin.js (automations, templates, team, settings),
                       views-journey.js (demo and $100 account), views-ops.js (operations: KYC, accounts, client money, clients, balances)
tools/simulate.js      30-day call-centre simulation: self-test incl. security checks (`npm test`) and demo data (`npm run demo`)
tools/import-backup.js load a CRM backup into the server database
```

**Capacity:** the CRM keeps all records in memory for instant reports and writes every change to SQLite immediately. It is comfortable up to about 100,000 leads on a 2 GB server.

## 8. Public API

* `POST /api/leads`: used by the website forms. Body: `firstName, lastName, email, dialCode, phone, country, city, interest, experience, consent:true, form, page, utm{…}`.
  * Success: `201 {ok, reference}`
  * Invalid input: `422 {ok:false, errors}`
* `GET|POST /webhooks/whatsapp`: Meta WhatsApp webhook.
* `POST /api/inbound/lead`: generic lead intake (Zapier, Make, partner sites). Header `X-Api-Key: LEAD_API_KEY`. Body: `first_name, last_name` (or `full_name`), `email, phone` (international, e.g. `+2348012345678`) or `dial_code + phone, country, city, utm_source, utm_campaign`. Returns `201 {ok, reference, duplicate}`.
* `GET|POST /webhooks/meta-leads`: Meta Lead Ads (`leadgen` field). Needs `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_TOKEN`. Lead details are fetched from the Graph API, and utm_campaign is set to the Meta campaign name.
* `POST /webhooks/google-leads`: Google Ads lead form webhook. The key in the form must equal `GOOGLE_LEAD_KEY`.
* `POST /webhooks/calls`: phone system events. Header `X-Webhook-Token: TELEPHONY_WEBHOOK_TOKEN`. Body: `{call_id, direction:"in"|"out", phone, extension, status:"answered"|"missed"|…, duration_sec, recording_url, started_at}`. Outbound events attach the recording to the agent's logged call. Inbound events log the call, create a lead for unknown numbers, and book a call-back when missed.
* `GET|POST /unsubscribe?t=…`: one-click email unsubscribe (signed link, confirmation button).

### Click-to-call
Set `TELEPHONY_CLICK_URL` (and optionally the method, body and auth header) in `.env`, and give each agent their **phone extension** in Team. The Dial button then asks the PBX to ring the agent's phone first and connect the client. Most PBXs (3CX, FreePBX/Asterisk, Zadarma, Twilio via a small function) offer such a URL. Without it, Dial opens the computer's softphone through a `tel:` link.
