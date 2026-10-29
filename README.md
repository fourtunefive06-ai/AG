# Absel Global — website, client app and brokerage back office

Website, client area and CRM for **Absel Global**, a trading name of Absel Markets (FSC Mauritius, licence GB25205423). Clients only ever see the Absel Global brand; accounts and money are handled at Absel Markets by your operations team.

* **Website** (`public/index.html`): landing page with hero form and popup form. "Log in" and "Open account" go to the client area. There is **no link to the CRM** anywhere on it.
* **Client area** (`public/portal/`, at `/portal/`): clients register, confirm their email, upload KYC documents, request live and demo MT5 accounts, deposit, withdraw, transfer between accounts and see their history. Two-step login, password reset, account lockout.
* **Client app:** the client area is a Progressive Web App. Clients can install it on Android, iPhone (Safari → Share → Add to Home Screen), Windows and Mac; it opens full-screen, starts on their dashboard, loads instantly and shows an offline screen without a connection. Account and money data are never cached on the device. Installing needs the site on HTTPS (as in the go-live steps).
* **Back office** (`public/crm/`, formerly "the CRM"): served at a secret path you choose (`CRM_PATH`), e.g. `https://abselglobal.com/team-desk/`. It is not indexed by search engines.
* **Backend** (`server.js` + `lib/`): no npm packages. It uses only Node.js built-ins, including Node's own SQLite.

---

## How the client area works with Absel Markets

The client area doesn't connect to MT5 or a payment provider. Every client request lands in a queue in the CRM; operations does the step at Absel Markets and records it, and the client sees the result at once (and gets an email).

| Client does | Queue (CRM → Operations) | Operations does at Absel Markets, then records |
|---|---|---|
| Uploads ID and proof of address | **KYC review** (compliance) | Checks the documents; approve, ask for new ones, or reject. Approving moves the sales lead to "KYC verified" |
| Requests a live or demo account | **Account opening** | Opens it in MT5 Manager; enters login, server, group and a first password, which the client sees **once** (never stored after that, never emailed) |
| Sends a deposit (with receipt) | **Client money → Deposits** | Confirms the money arrived and credits MT5 (in MT5 Manager); enters the bank/PSP reference. The client's first deposit becomes a **verified FTD** for the sales agent automatically |
| Requests a withdrawal | **Client money → Withdrawals** | Approves (two different people above the limit, default $1,000), pays, enters the payment reference |
| Requests a transfer | **Client money → Transfers** | Moves the balance in MT5, marks it done |
| Sees balances | **Balance import**, or automatic with the MT5 Web API | Uploads the daily CSV (Login, Balance, Equity) from Absel Markets; clients see dated balances and can't withdraw more than that. With `MT5_MODE=api` balances, trades and positions are read from MT5 every few minutes (see below) |

Rules: KYC before a live account (switchable), KYC before any withdrawal, minimum first deposit per account type, method minimums and maximums, withdrawals held against the balance while pending. Bank details, wallet addresses, payment links, account types, leverages and the legal line are set in **CRM → Client area settings**.

**Roles:** *Operations* (all queues, clients, balances), *Compliance* (KYC review only). Sales agents see their own clients' client-area status on the lead page; managers see all.

**What clients see of Absel Markets:** only the legal line ("Absel Global is a trading name of Absel Markets…") in the footer and legal documents. Bank transfer details must name the licensed company's segregated account, and card statements and the MT5 server show whatever names Absel Markets' providers use; ask them for "Absel Global" names where possible. Have compliance approve the legal line, client agreement and privacy policy before go-live.

## Payment performance

*Funding → Payment performance* (managers, operations, marketing manager; a summary card is on the Business overview) shows how well deposits convert, for any date range, agent or source:

- **Deposit funnel by client:** opened the deposit page → started a deposit → money received → credited to MT5.
- **Per method and per provider:** attempts, success rate (finished attempts that brought money), outcomes (credited, received, in progress, needs a decision, declined, not paid, cancelled, provider error, rejected), how long clients take to pay, how long operations takes to credit, average ticket.
- **Why deposits fail:** decline reasons from the card provider, expired crypto invoices, abandoned payment pages, provider outages, operations rejections.
- **Recovery:** clients whose attempt failed and who paid later (and whether they switched method), and clients lost after a failure with the amount.
- First deposit vs repeat, a daily trend, what is open right now, and manual withdrawal speed (median time to pay, % within 24 h).

Use it to spot a weak card provider or BIN declines, to call clients who failed and haven't paid, and to keep crediting fast. Deposit-page visits are counted from v5.2 on.

## Card deposits with CyrafaPay (Visa / Mastercard)

The client chooses *Visa / Mastercard*, an account, an amount and the card's billing address (saved to their profile for next time). The server creates a Cyrafa checkout session and sends the client to Cyrafa's hosted page, where they pay with 3-D Secure: card numbers never reach our server. Cyrafa charges in AED only, so the USD amount is converted at `CYRAFA_FX_RATE` (3.6725, the dirham peg) and the client sees the AED amount before paying. Cyrafa sends one signed notification to `https://<your site>/webhooks/payments/cyrafa` (HMAC-SHA256 of `timestamp.body` with the partner secret, checked, and refused if older than 5 minutes). A successful payment shows "Paid, credit MT5" with the USD and AED amounts, the amount after fees and the transaction ID; operations credits MT5 and confirms with one click. A failed payment closes the request and tells the client they can try again.

Cyrafa sends each notification once, with no retries and no status API. If the client comes back from a successful payment but the notification never arrives, the request goes to operations for review after the session expires (instead of being cancelled), so check the Cyrafa merchant panel and confirm or reject it by hand.

**Set-up:** 1) put `CYRAFA_PARTNER_ID`, `CYRAFA_MERCHANT_ID` and `CYRAFA_PARTNER_SECRET` in `.env` (QA URL first) and restart; 2) give Cyrafa the webhook URL shown in Client area settings; 3) on the *Visa / Mastercard* payment method choose *CyrafaPay (cards)*; 4) run `node tools/cyrafa-check.js` on the server: it creates one small test checkout and tells you if the IDs are accepted; 5) make a test deposit with a Cyrafa test card. For live, switch `CYRAFA_API_URL` to the production URL and use the live IDs.

## Crypto deposits with B2BINPAY (USDT)

The client chooses USDT, an account and an amount. The server creates a B2BINPAY deposit (invoice) for that request: the client gets a payment page, an address with QR code, the exact amount and a countdown. B2BINPAY calls `https://<your site>/webhooks/payments/b2binpay` when money arrives; the callback signature is checked and the deposit is re-read from the B2BINPAY API before anything changes. The request then shows "Paid, credit MT5" in Deposits & withdrawals with the amount and transaction hash filled in: operations credits MT5 at Absel Markets and confirms with one click (a first deposit becomes the agent's verified FTD). Partly paid, late, overpaid and AML-flagged payments are held for a decision; unpaid invoices close when their time runs out; open payments are re-checked every 10 minutes in case a callback was missed. Withdrawals in USDT stay manual (two-person approval) for now.

**Set-up:** 1) put the B2BINPAY settings in `.env` (see `.env.example`), sandbox first, and restart; 2) in B2BINPAY, register the callback URL shown in Client area settings; 3) in Client area settings click *Find wallet IDs*, and on the USDT payment method choose *B2BINPAY (crypto)* and enter the Merchant wallet ID; 4) run `node tools/b2binpay-check.js` on the server: it signs in, lists the wallets and (with `<walletId> 10`) creates a test invoice, and says what to fix if a step fails; 5) make a sandbox deposit. A failed deposit also shows the provider's error in red on the request under Deposits & withdrawals → Cancelled. On the first real callback, check the server log: if it says "bad signature", tell your developer (the docs don't spell out the exact key format; the code accepts the common variants).

## MT5 Web API connection (read-only sync)

Absel Markets gives Absel Global an MT5 manager account with Web API access, limited to Absel Global's groups and login series. With `MT5_MODE=api` the back office reads MT5 itself; with `MT5_MODE=manual` (the default) nothing changes and operations keeps working in MT5 Manager.

**Our system never moves money in MT5.** It only reads (balance, equity, trades, positions) and, when switched on, creates accounts and changes leverage. There is no credit, debit, bonus-credit or trade function anywhere: `lib/mt5.js` checks every request against an allow-list of commands (sign-in, test, user get/add/update, account get, logins, deal and position batches, group get) and refuses anything else before it reaches the network, and `user/update` may only change name, email, phone, country, comment and leverage. `tools/mt5-test.mjs` and `tools/mt5-actions-test.mjs` prove a balance call is impossible. Ask Absel Markets not to give the Web API manager balance or credit rights, so the rule is enforced on the MT5 side as well.

**What it reads (every `MT5_SYNC_SECONDS`, default 120 s):**
- **Balances:** balance, equity, margin, free margin, leverage and group for every account with a login. This replaces the daily balance import, which stays available as a fallback.
- **Deals:** read since the last synced deal, minus 10 minutes of overlap, and stored once per ticket in `mt5_deals`. Trading deals feed the existing activity logic: lots traded, last trade, "started trading" (the sales owner is told), Active trader and Dormant. Balance deals feed the reconciliation.
- **Open positions:** a snapshot per account (count and floating profit), shown on the client page and in Trading accounts.
- **Unlinked MT5 accounts** (*Trading → Unlinked MT5 accounts*, operations): logins inside our range that no client owns. Operations links each one to a client, or marks it as not a client account. Nothing is ever linked automatically.
- **MT5 reconciliation** (*Trading → MT5 reconciliation*, operations and admin): for a period, our completed deposits, withdrawals, transfers, partner payouts and $100 accounts per login against MT5 balance deals. A deal whose comment contains our reference matches (for display). Any other balance deal is listed as "made outside the system", and differences are highlighted.

**Safety:**
- Every call that touches an account is checked against `MT5_LOGIN_FROM`–`MT5_LOGIN_TO`. Out-of-range calls are refused before anything is sent, logged, and alerted to operations.
- Group names come only from *Client area settings* (MT5 group per account type, live and demo).
- The Web API password is never logged. Every MT5 call goes to the `mt5_ops` log: command, parameters without secrets, retcode, staff user and time. Calls a person started (Sync now, account actions) are kept call by call; the timer's routine reads are summed per hour and kept 90 days.
- A failing sync alerts operations once, shows the error on the Operations desk and the settings card, and announces when it recovers.
- Phase A is read-only. Account creation (Phase B) also needs **Client area settings → MT5 → Create MT5 accounts**, which is off by default.

**Set-up:**
1. Put the values from Absel Markets in `.env` (see `.env.example`), keeping `MT5_MODE=manual` for now.
2. Run `node tools/mt5-check.js`. It checks, step by step, that the server is reachable, the sign-in works, the test account and the groups can be read, and the last 7 days of deals come back. For each failure it prints the fix (IP not whitelisted, wrong password, wrong port, login outside the range). Compare the lot sizes it prints with MT5 Manager.
3. In *Client area settings*, enter the MT5 group (live and demo) for each account type, then run the check again. It reads the groups from the database.
4. Set `MT5_MODE=api` and restart. The settings page shows the status card with the server, login range, last sync, groups found and alerts, plus a **Sync now** button.

**Try it without Absel Markets:** `node tools/mt5-mock.js --seed` starts a mock MT5 Web API and prints the `.env` lines to use it. Tests: `node tools/mt5-test.mjs` runs the client, sync and core against the mock. `node tools/simulate.js` includes the MT5 assertions.

**To confirm with Absel Markets:**
- the Web API port and server build (`MT5_BUILD`)
- the server time zone (`MT5_TIME_OFFSET_MIN`: MT5 deal times are server time)
- that the manager can read users, accounts, deals and positions for Absel Global's groups
- that our server IP is whitelisted

The endpoint and field names follow the MetaQuotes Web API documentation (`/api/user/get`, `/api/user/account/get`, `/api/user/logins`, `/api/deal/get_batch`, `/api/position/get_batch`). Confirm them on the first connection with `tools/mt5-check.js`.

## MT5 accounts, and matching the money operations done in MT5 Manager

Deposits, withdrawals, transfers, $100 bonus accounts and partner payouts keep today's approval flow. **Operations does the money in MT5 Manager**, with our reference in the comment; the sync finds that balance deal and the back office shows **Seen in MT5 · deal #… · $500 · 14:02** with a one-click confirm. A match is never applied on its own. Matching needs only `MT5_MODE=api`; with `MT5_MODE=manual` everything works exactly as before.

| Request | Comment in MT5 Manager | In the back office |
|---|---|---|
| Deposit | `DEP <reference>` | Once the money is confirmed, operations credits it in MT5 Manager. When the sync sees the deal: **Confirm deposit** (one click). The request completes with the deal ticket as the reference; the FTD, emails and reports work as before. |
| Withdrawal | `WD <reference>` | Same approvals as before (two people above `second_approval_over`). The approval shows the live free margin from the sync, for information. After approval operations debits in MT5 Manager and pays the client by bank or USDT; with **Debit seen in MT5**, **Mark paid** takes the payout reference. An open withdrawal stops holding the client's balance once MT5 shows the debit. |
| Transfer | `TRF-OUT <reference>` on the source, `TRF-IN <reference>` on the target | **Confirm transfer** once both sides are seen. |
| $100 company-funded account | `BONUS <id>` (done by Absel Markets) | The sales manager confirms the matched deal. Our system never touches the MT5 credit field. |
| Partner payout to MT5 | `IB <reference>` | Same approvals as a withdrawal, then **Confirm payout** once seen. Bank and USDT payouts are "Mark paid" as before. |

**Warnings** on the request and the Operations desk: the amount in MT5 differs, the deal is on a different login, two deals carry the same reference (flagged, neither is picked), nothing in MT5 after *X* hours (*Client area settings → MT5*, default 2), money moved in MT5 before the approval was complete, and balance deals with one of our prefixes but a reference we don't know. Operations is notified when a deal appears. Operations can still confirm without a match, but must say why (for example "MT5 comment missing"); the reason is logged on the request and the lead. Rejecting a request whose money already moved in MT5 tells operations to reverse it in MT5 Manager.

### Automatic MT5 account opening

With `MT5_MODE=api` and **Client area settings → MT5 → Create accounts in MT5 automatically when approved** (off by default), nobody types a login or password any more. With `MT5_MODE=manual` or the switch off, account opening works exactly as before (*Record as opened*).

**Set-up (admin, Client area settings):**
- For each account type: the **MT5 group (live)** and **MT5 group (demo)**, exactly as in MT5, e.g. `real\absel-global\ecn` and `demo\absel-global\ecn`. The MT5 status card checks each group in MT5 (`group/get`) and shows ✓ exists or ✕ not found.
- **Create accounts in MT5 automatically when approved**, and **Approve demo accounts automatically** (default off; needs the first switch).

**Account opening (operations or admin):** each request has **Approve and create in MT5** (primary), **Reject** (with a reason, as before) and **Record manually** (the old form, for when MT5 is down).

On Approve the back office:
1. checks the user is operations or admin, the request is still waiting, the client's KYC is still approved (live accounts), the leverage is allowed for the type, and the type has an MT5 group (otherwise: “Set the MT5 group for ECN in settings”);
2. locks the request as **creating** in the same database transaction, with who approved and when, so a double click or a second person gets “This account is already being opened in MT5”;
3. generates two different passwords (10–12 characters, upper and lower case, a digit and one of `#@!$%`, from `crypto.randomInt`);
4. calls `user/add` with the type's group, the leverage, name, email, country, city and phone, comment `ABSEL <request id>`, and login 0 (MT5 assigns the next login of the manager's series);
5. on success checks the login is inside `MT5_LOGIN_FROM`–`MT5_LOGIN_TO` (outside: alert, not linked) and opens the request through the same code as the manual form: the client is notified, the account email goes out, and the lead timeline, sales checklist and reports update. The client sees the main password once (*Show my MT5 password*), then it's erased. The investor password is never stored or logged, and operations never sees either.
6. on failure the request goes back to waiting, with the MT5 error and its time in red, plus **Retry** and **Record manually**. Errors are in plain words: group not found, no permission, server unreachable, login series full.

**No blind retries.** If MT5's answer is lost (timeout or dropped connection), the group is searched for a user whose comment is `ABSEL <request id>` (`user/logins`, then `user/get_batch`). Found: it's linked as a success (with the password generated for it). Not found: the request is marked failed and can be retried; a retry searches again first. A request still *being opened* when the server stopped is checked the same way when the server starts, or with **Check MT5 again**.

**Demo accounts** use the same function with the demo group, straight away when *Approve demo accounts automatically* is on. Our system never funds them: in API mode the client area doesn't offer a practice balance. The client sees “Your demo account is ready; if it shows a zero balance, contact support”, and operations sees “Fund demo in MT5 Manager if needed”.

**Client area statuses (API mode):** waiting → “Waiting for approval”, creating → “Being opened…”, open → the account card with login, server and the one-time *Show my MT5 password*.

**Audit.** Every MT5 call is in `mt5_ops` (view `v_mt5_ops`): who, request id, command, retcode, login and time, with no passwords.

**Absolute rule.** No money moves in MT5 from our system (see *MT5 Web API connection* above): the allow-list in `lib/mt5.js` refuses `trade/balance` and every credit, order or position command before any request, and `tools/mt5-test.mjs` proves it.

**Check before going live:** `node tools/mt5-check.js` (reachable → signed in → `MT5_TEST_LOGIN` read → each configured group exists, with a plain fix for each failure). Tests: `node tools/mt5-actions-test.mjs` against the mock (lock, KYC, failure, timeout → found by comment, group missing, out-of-range login, passwords, demo switches).

**To confirm with Absel Markets:**
- the group names per account type, live and demo
- that auto-assigned logins (login 0) are allowed for this manager
- whether the demo groups give a starting balance
- the server's password policy (we send 10–12 characters with upper, lower, a digit and one of `#@!$%`)
- that the manager has no balance or credit rights

Leverage changes (client page, operations) are also made in MT5 with `user/update`, only from the type's list, and logged.

Tests: `node tools/mt5-actions-test.mjs` (against the mock, where "operations in MT5 Manager" is simulated) and the Phase B block in `tools/simulate.js`. The `v_mt5_ops` view has the call log for BI.

## IB / partner programme

Clients become **partners (IBs)** with the same client-area login. Commission is calculated by the system from real MT5 deals (synced through the Web API). Operations pays it after approval.

**Becoming a partner.** A KYC-approved client opens *Partner* in the client area (or the "Become a partner" card) and applies as an individual or a company. They say how they'll find clients and accept the agreement; its version, date and IP are recorded. Companies upload company documents, which compliance reviews. The **Partnerships manager** (a new role; admins can do it too) approves in *Partners → Applications*: picks the commission plan, the master IB (two levels) and whether they can recruit sub-IBs. Approving creates the code and emails the partner. Rejecting needs a reason, which the applicant is told. The website's Partners section links to "Register, then apply" and "Sign in to apply"; `/partners` goes there.

**Links and attribution.**
- `https://abselglobal.com/r/CODE` (or `/r/CODE/campaign`) logs a click (hashed IP, once per visitor per 30 minutes) and sends the visitor to the website with `?ib=CODE`.
- `/r/CODE?join=partner` is the sub-IB recruitment link.
- The code is kept as first touch for 90 days and prefilled in the register form's "Partner code" field.
- When someone registers with a valid code, the client and the lead are attributed: `utm_source = ib`, an "IB client · CODE" pill.
- Leads from the lead API, Meta or Google with an `ib` or `partner` field are attributed the same way.
- The IB's own email or phone is never attributed. A duplicate keeps its first attribution.
- Attribution is permanent. Only partnerships or an admin can reassign a client, with a reason. It's logged, and both IBs are told without client details.
- IB clients still get a sales agent, but their FTDs are **not** counted in agent targets or leaderboards. They're shown as "IB-referred FTD" instead.

**Commission engine** (after every deal sync, network-free in the core):
- Each closing trade (out, in/out, out-by) on a live account of an attributed client makes a level 1 line: lots × the plan's rate for the account type and symbol group. Symbol groups are regular expressions in the programme settings.
- If the IB has an approved master, a level 2 line goes to the master at its plan's override.
- **Held** with a reason: trades closed in under the plan's minimum (default 2 minutes); trading on the IB's or the master's own account; a client sharing a sign-up or login IP, or payout details, with the IB (flagged to partnerships).
- **CPA** (optional per plan): one line when the first deposit is at least the minimum, KYC is approved, and the client trades the minimum lots within the window. It's held for the holdback period, then becomes payable if the first deposit wasn't charged back or withdrawn.
- A chargeback (recorded by operations on the client page), a deal changed in MT5, or a deal MT5 no longer returns on the next sync (kept and marked missing, with an alert) **reverses** lines. A line already in an open payout isn't reversed by the sync; the partnerships team is told instead. Lines are never deleted. One line per partner, level and deal, so a re-sync never duplicates.
- A suspended partner gets no new clients and no new lines. Approved commission can still be paid.

**Month close and payouts.**
- After a month ends, *Partners → Month close* shows each IB's pending and held lines. The partnerships manager holds, releases, reverses or adjusts lines (always with a reason), then approves. Approving emails the partner their statement.
- The partner requests a payout of their approved balance (minimum $50) to their own MT5 live account, a bank or USDT. It becomes a payment of type **IB payout** in *Deposits & withdrawals*, with the same approval rule as withdrawals (two people above the limit).
- To MT5, operations credits it by hand in MT5 Manager with comment `IB <reference>`; the sync matches the deal and operations confirms it. Bank and USDT are "Mark paid" with the reference.
- Paid lines are marked paid. A rejected payout puts its lines back to approved. Pending and held lines are never paid.

**What the partner sees (client area → Partner).**
- **Overview:** clicks, sign-ups, KYC approved, FTDs, net deposits, lots, commission pending, approved and paid, and a daily chart.
- **Links:** main link, code, campaign link builder, QR code, and the recruitment link if allowed.
- **Clients:** first name and last initial, country, status, account type, deposits, lots and commission. **Never** email, phone, documents, MT5 login or balance.
- **Sub-IBs** and the override earned on them.
- **Commissions:** monthly statement grouped by client and symbol group with CSV export. Held lines show the reason in plain words.
- **Payouts**, **Materials** (banners uploaded by staff), and the **Agreement** they accepted.

**Back office.**
- *Partners:* applications, the partner list, and a profile per partner. The profile has the hierarchy, clients with full details for staff, the ledger with filters and actions, payouts, notes, the audit trail, reassign and suspend.
- *Commission plans:* an editor with a "1 lot pays $X to the IB and $Y to the master" preview, plus the programme settings (agreement text and version, payout minimum, symbol groups) and materials.
- *Month close*, and the *IB report*: clicks → sign-ups → FTD, net deposits, lots, commission, commission as % of net deposits, cost per FTD and top symbols.
- The Business overview has an IB card. Operations sees *IB payouts*.
- Plans, approvals, plan and master changes, reassignments, line actions, adjustments and payouts are all in the partner's audit trail.

Tests: the IB block in `tools/simulate.js` (four IBs, every stage, holds, CPA, month close, payouts, and a check that Partner views carry no email or phone), and `node tools/ib-test.mjs` (MT5 deal → commission → approval → payout request → credited by hand in MT5 Manager → matched → confirmed with the deal ticket). BI views: `v_partners`, `v_commissions`.

## The back office, organised around the brokerage lifecycle

### Navigating the back office

- **Side rail (hubs).** A narrow rail on the left holds the main areas: **Home**, **Sales**, **Clients**, **Money**, **Marketing**, **Partners**, **Insights**, with **All tools**, **Settings**, **Help** and your profile at the bottom. You only see the areas that hold at least one page your role can open; an agent sees Home, Sales, Clients and Insights. A red number on an area adds up the to-dos inside it.
- **Page menu.** Choosing an area opens its pages next to the rail, grouped (for example *My work*, *Pipeline*, *Team* under Sales). An area reopens the last page you used in it. Hide or show the menu with the button left of the page title; your choice is remembered in this browser. On a tablet the menu opens over the page when you choose an area.
- **Home** opens your usual start page (Business overview for managers, My day for agents, Marketing overview for marketing, Operations desk for operations, KYC review for compliance, Partners for partnerships). Above it: tabs for the Business, Sales and Operations views you can open, a **To do** row with everything waiting for you, and your **pinned tools**.
- **All tools** lists every page you can open, by area, with a one-line description and a search box. Press ☆ to pin up to 5 tools; pins appear in the rail and on Home. Shortcut: **G** then **A**.
- **Search (Ctrl K, or ⌘ K on a Mac)** jumps to any page by name ("deposits", "kyc", "payouts") and searches leads and clients by name, phone, email, reference or MT5 login. Arrow keys and Enter pick a result, Esc closes. With an empty box it shows your recent pages. Payment references aren't searchable yet; use the filters on Deposits & withdrawals.
- **+ Create** opens the existing forms: new lead, import leads, new campaign, new broadcast, new template (only the ones your role can use).
- **Phone:** a bottom bar with Home, your three main areas and **More** (All tools as a sheet); the pages of the current area scroll across under the title.
- Every page address (`#/leads`, `#/lead/…`, `#/money?type=withdrawal` and so on) is unchanged, so bookmarks and links in notifications and emails keep working. Pins, the hidden-menu choice, last pages and recent pages are kept per user in this browser only.
- `node tools/nav-routes.js` lists which pages each role can open; `--save before.json` and `--compare before.json` prove a navigation change didn't give or take away access.

**Business overview** (home for admins and sales managers): leads, client-area sign-ups, accounts opened, FTDs, deposits, withdrawals, net deposits, active traders and client balances for any period; the customer journey from lead to repeat deposit; what needs attention now (people stuck at each step, operations queues); daily leads/sign-ups and money in/out; the client book by lifecycle stage; results by source and agent.

**Client lifecycle.** Every person is one lead record from first contact onwards; the client-area account, MT5 accounts, deposits and withdrawals link to it. Stages: new lead → lead in progress → registered (onboarding incomplete) → KYC under review / needs attention → verified → account open → funded, not trading → active trader → dormant. The **Client journey** screen lists who is stuck at each step (not reached, registration incomplete, KYC pending, KYC needs attention, verified but not funded, funded but not trading, dormant, active) with owner, days waiting and next follow-up; managers can reassign in bulk. Agents see their own clients there and on My day.

**Lead capture.** Every client-area sign-up becomes a lead: matched to the existing lead by email, then phone (never a second copy), a lost lead is reopened, an owner is assigned by territory, and the welcome-call task is created. Campaign, referral and landing page are captured from the link, the website (which passes its stored campaign to sign-up links) and a 30-day first-touch record kept in the browser; if someone fills the website form first, the sign-up form is pre-filled and links to that lead. Merging duplicates keeps the client-area account, MT5 accounts and money with the kept lead.

**Lifecycle automations** (all editable in Automations): sign-up → welcome call; registration incomplete after 24 h → email + WhatsApp + call task; KYC rejected → help call; KYC approved → account and first-deposit call; funded but not trading after 3 days → first-trade email + walkthrough call; dormant (30 days without a deposit or trade, set in Settings) → re-engagement email + call.

**Trading activity** without an MT5 connection: the daily trading data import (Login, Balance, optional Equity, Lots, Last trade) updates balances, marks clients as active traders when lots rise, a last-trade date is given or equity differs from balance (open positions), and also matches accounts opened by sales before the client area via the lead's trading account number. Operations can also mark trading started by hand.

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

### Database: SQLite file or Postgres on Neon
Without `DATABASE_URL` the app keeps everything in the SQLite file `DB_FILE`, as before. With `DATABASE_URL` set to a Neon connection string, Postgres is the database. Nothing to install: the app talks to Neon over HTTPS.
* **Same layout on both.** There's one table per collection (`id`, `data` as JSONB, `updated_at`), and the reporting views from `db/schema.sql` are translated to Postgres automatically. Tables for new features are created at start, and existing data is never changed by the setup.
* **How writes work.** All records are loaded into memory at start. Each request's changes are written to a local journal (`DATABASE_JOURNAL`) and then sent to Neon in one transaction. If Neon can't be reached, the changes wait in the journal and are sent when it's back, including after a restart. Stopping the app with Ctrl+C or `pm2 stop` sends anything still waiting first.
* **Run one app instance per database.** Each instance keeps its own copy in memory, so two servers writing to the same database would overwrite each other's changes.
* **Check the connection:** `node tools/pg-check.js` reports the tables, views, row counts and unsent changes. `--apply` creates anything missing without touching data, and `--print` shows the Postgres view SQL. `node tools/pg-store-test.mjs` runs the store test in a throwaway schema that is dropped afterwards.
* BI tools (Metabase, Power BI, Looker Studio) can connect to Neon directly and read the `v_*` views.

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
lib/b2binpay.js        B2BINPAY API v3: token, deposits (invoices), callbacks
lib/cyrafa.js          CyrafaPay card checkout sessions and signed webhooks
db/schema.sql          reporting views
public/index.html      website
public/portal/         client app (index.html, portal.js, manifest.webmanifest, sw.js service worker)
public/crm/            CRM app: app.js (shell: hubs, page menu, All tools, search, roles), views-work.js (queue, calling, leads, lead page), views-sales.js (inbox, pipeline,
                       deposits, targets, team live, call quality, hygiene), views-marketing.js (overview, campaigns, broadcasts,
                       lead sources, opt-outs), views-insights.js (dashboard, reports), views-admin.js (automations, templates, team, settings),
                       views-journey.js (demo and $100 account), views-ops.js (operations: KYC, accounts, client money, clients, balances),
                       views-overview.js (business overview, client journey, trading accounts)
tools/simulate.js      30-day call-centre simulation: self-test incl. security checks (`npm test`) and demo data (`npm run demo`)
tools/import-backup.js load a CRM backup into the server database
tools/nav-routes.js    pages and routes each back-office role can open (compare before and after a navigation change)
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
