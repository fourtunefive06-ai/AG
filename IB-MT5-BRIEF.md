# Absel Global: MT5 Web API connection and IB (partner) system

Development brief for Claude Code. Build it in **three phases**, one at a time, in the order below. Finish each phase, with tests passing and the checklist done, before starting the next.

---

## 0. How to use this brief

Paste one of these prompts into Claude Code in VS Code, from the project root:

**Phase A**
> Read `docs/IB-MT5-BRIEF.md` fully, then implement **Phase A (MT5 Web API connector and read-only sync)** only. Follow section 2 (codebase conventions) and section 3 (non-negotiables) exactly. Build the mock MT5 server first and test against it. Run `node tools/simulate.js` and the new tests before you finish. Show me the list of changed files and anything you had to assume.

**Phase B**
> Read `docs/IB-MT5-BRIEF.md`. Phase A is done. Implement **Phase B (MT5 actions after back-office approval)** only. Same rules and tests.

**Phase C**
> Read `docs/IB-MT5-BRIEF.md`. Phases A and B are done. Implement **Phase C (IB / partner system)**. It's large, so work in the sub-steps C1–C7 and run the tests after each one.

If something in this brief conflicts with the code, the code's existing behaviour wins. Don't remove or change any existing feature. Stop and ask instead of guessing on anything that involves money.

---

## 1. Context

- **Absel Global** is the client-facing brand: website, client area (PWA) and back office (CRM).
- **Absel Markets** (FSC Mauritius licence) runs the MT5 server and holds client money.
- Until now operations did all MT5 work by hand in MT5 Manager and recorded it in our back office:
  - opening accounts
  - crediting deposits
  - debiting withdrawals
  - importing balances daily
- Absel Markets has now given us an **MT5 manager account with Web API access, limited to Absel Global's groups**. It comes with:
  - the manager login
  - the Web API password
  - the server address
  - a reserved **login series** (the account number range for Absel Global)
  - a first test account
- **Business rules decided by the owner:**
  - **Every money movement in MT5 needs back-office approval, even $1.** The system never credits or debits on its own. A person approves, then the system carries out the MT5 balance operation and records the MT5 deal ticket.
  - Withdrawals keep the existing approval rule: two approvals above `second_approval_over`.
  - Opening an account is not a money movement. It can run with one operations click, or automatically for demo accounts.
  - IB commissions come from **real MT5 deals** synced through the API. No CSV is needed.
  - IB setup:
    - per-lot commission plus optional CPA per qualified FTD
    - two levels (IB and sub-IB, the master earning an override)
    - our system calculates commissions and operations pays them
    - the IB uses the same client-area login and gets a **Partner** section
    - IB clients still get a sales agent, but are flagged and kept out of agent FTD targets
    - the IB sees clients masked
    - payouts monthly, $50 minimum, paid to the IB's MT5 account, bank or USDT, with approval

---

## 2. Codebase conventions (follow exactly)

- **Runtime:** Node 22, **zero npm dependencies**. Use `node:sqlite`, `node:crypto`, `node:http` and `fetch` only. Don't add packages or a build step.
- **`lib/core.js`** holds all business logic. It is UMD: it runs in Node and in the browser for the demo and prototype.
  - Keep it free of Node APIs, network calls and timers.
  - Network calls live in `server.js` or small `lib/*.js` modules, like `lib/b2binpay.js` and `lib/cyrafa.js`.
- **Store API inside core:**
  - `store.get(col, id)`, `store.put(col, obj)`, `store.all(col)`, `store.remove(col, id)`, `store.size(col)`, `store.transaction(fn)`
  - Collections are listed in `COLLECTIONS` at the top of `core.js`. Add new ones there; `lib/store-sqlite.js` creates a table per collection automatically.
- **Core helpers:**
  - `newId(prefix)`, `nowIso()`, `nowMs()`, `clean(v, max)`, `money2(v)`, `arr(v)`, `sum`, `pct`, `median`
  - errors: `CrmError(message, status, fields)`
  - access checks: `need(u, check, msg)`
  - roles: `isAdmin`, `isMgr`, `isOps`, `isKyc`, `isSales`
  - messages and logs: `notify(userId, text, leadId, kind)`, `opsUsers()`, `portalLog(client, text, extra)`
  - settings: `settings()`, `portalCfg()`
- **Server RPC:**
  - Staff calls go through `RPC` in `server.js` (`POST /api/crm/rpc`, header `X-Requested-With: absel-crm`). Calls that need the network go in `ASYNC_RPC`.
  - Client-area calls go through `PORTAL_RPC` (`/api/portal/rpc`, header `X-Requested-With: absel-portal`, cookie `ag_client`).
  - Expose every new core function in the `return {…}` export list at the bottom of `createCRM`.
- **Network pattern** (copy B2BINPAY and Cyrafa): the core creates the record in a "creating" state; `server.js` calls the provider; the core records the result through a function like `gatewayAttach` or `gatewayFailed`; failures leave a visible error for operations.
- **Back-office UI:**
  - vanilla JS views in `public/crm/views-*.js`, registered as `C.views.<name> = { title, render(page, r, alive), refresh }`
  - navigation in `NAV` in `public/crm/app.js`, with access functions
  - reuse `C.rangeBar`, `C.reportFilters`, `bars`, `hbars`, `.c-card`, `.c-table`, `.c-kpi`, `.c-attn`, `.c-pill`
- **Client-area UI:**
  - `public/portal/portal.js` views are `VIEWS.<name> = { title, render(pg, r) }`, routed by hash
  - use the existing helpers `rpc`, `modal`, `toast`, `esc`, `money`, `fld`, `inp`
  - must work at 390 px width with no horizontal scroll
- **Tests:**
  - `tools/simulate.js` builds a full demo in memory and asserts behaviour. Add your assertions there.
  - The demo database is built with `node tools/simulate.js --db <file> --shift-to-now`.
  - Add new mocks as `tools/*-mock.js` and integration tests as `tools/*-test.mjs`.
  - Connection checks follow `tools/b2binpay-check.js`: read `.env`, check step by step, print a plain fix for each failure.
- **Database views for BI** go in `db/schema.sql`.
- **Secrets:**
  - only in `.env`; document every new variable in `.env.example`
  - never log passwords or tokens
  - never commit `.env`
- **Wording:** plain English in the UI ("Credit in MT5", not "Execute balance op").
- **Docs:** add a README section per feature.

---

## 3. Non-negotiables

1. **Approval before money.** No code path may call an MT5 balance operation without an approved payment record and the id of the approving staff user. Withdrawals keep the two-person rule above the limit.
2. **Login range lock.** Every MT5 call that touches an account must check that the login is inside `MT5_LOGIN_FROM`–`MT5_LOGIN_TO`. Refuse, log and alert otherwise. Group names come only from our settings; never take them from user input.
3. **Exactly once.** Every balance operation carries our payment reference in its MT5 comment. Before any retry, look in MT5 deals for that comment on that login. If it's there, record it and don't send it again. Store each attempt in an `mt5_ops` ledger: request, response, retcode, deal ticket, staff user, time.
4. **Manual fallback.** Everything still works with `MT5_MODE=manual`, today's behaviour. If MT5 can't be reached in API mode, the action fails with a visible error and operations can retry or record it manually. Nothing is lost silently.
5. **Read before write.** Phase A is read-only. Nothing writes to MT5 until Phase B, and Phase B ships with a settings switch, `mt5.writes_enabled`, that is off by default.
6. **Privacy.** The Partner section never shows a client's email, phone, full name, documents or address.
7. **Audit.** Every MT5 action, IB approval, plan change, client reassignment, commission adjustment and payout is logged with who, when, before and after.

---

## 4. Phase A: MT5 Web API connector and read-only sync

### A1. `lib/mt5.js` (new)

**Environment variables** (add to `.env.example`):
```
MT5_MODE=manual                 # manual | api
MT5_SERVER=                     # host:port of the MT5 Web API, e.g. mt5.example.com:443
MT5_MANAGER_LOGIN=
MT5_WEBAPI_PASSWORD=            # the "Web API Pass" from Absel Markets (not the Manager terminal password)
MT5_LOGIN_FROM=                 # Absel Global login series, inclusive
MT5_LOGIN_TO=
MT5_TEST_LOGIN=                 # first account in this manager, used by tools/mt5-check.js
MT5_SYNC_SECONDS=120            # how often to sync accounts and deals
MT5_AGENT=AbselGlobal
```

**Authentication and session** (MT5 Web API). **Verify every endpoint and field against the official MetaQuotes Web API documentation for the server's build before relying on it, and adjust the mock to match.**
- `GET https://{server}/api/auth/start?version={build}&agent={MT5_AGENT}&login={manager}&type=manager` returns `srv_rand` (hex).
- Compute:
  - `password_hash = MD5( MD5(password as UTF-16LE) + "WebAPI" )` (raw bytes)
  - `srv_rand_answer = hex( MD5( password_hash + bytes(srv_rand) ) )`
  - `cli_rand` = 16 random bytes, hex
- `GET /api/auth/answer?srv_rand_answer=…&cli_rand=…` returns `cli_rand_answer`. Check that it equals `hex(MD5(password_hash + bytes(cli_rand)))`, so we know the server is genuine.
- The session belongs to the TCP connection. Use a dedicated `https.Agent({ keepAlive: true, maxSockets: 1 })`, send all calls one at a time through a queue, ping (`/api/test/access`) every 60 s while idle, and re-authenticate automatically on `retcode` "not authorized" or a socket close.
- Parse `retcode` (e.g. `"0 Done"`). Anything not starting with `0 ` is an error. Turn it into an `Error` carrying the code.
- Allow self-signed TLS **only** if `MT5_TLS_INSECURE=1` is set, with a startup warning. Default off.

**Functions** (one MT5 command each; confirm names in the docs):
- `status()`
- `ping()`
- `getUser(login)` (`/api/user/get`)
- `getAccount(login)` (`/api/user/account/get`: balance, equity, margin, free margin)
- `listLogins(group)` (`/api/user/logins`)
- `getUsersBatch(logins)`
- `dealsBatch({ group or logins, from, to })` (`/api/deal/get_batch`)
- `positionsBatch({ group or logins })` (`/api/position/get_batch`)
- `getGroup(name)` (`/api/group/get`)
- For Phase B, written now but not called yet:
  - `createUser({ group, name, leverage, email, country, passMain, passInvestor, login? })` (`/api/user/add`)
  - `updateUser(login, fields)`
  - `balance({ login, amount, comment })` (`/api/trade/balance`, `type=2` balance; negative amount for withdrawals; `check_margin=1`)
- Every function checks the login range lock (section 3.2) before calling MT5.

**Volume units:** MT5 deal volume is an integer in 1/10000 lot (`VolumeExt` has more precision). Convert to lots in one helper, `toLots(deal)`. Confirm against the docs and a real deal from the test account.

### A2. `tools/mt5-mock.js` and `tools/mt5-check.js`
- **Mock server:**
  - implements the auth handshake (with a fixed test password) and the endpoints above
  - keeps users, accounts, deals and positions in memory
  - assigns new logins from a range
  - has a `/_set` helper for tests
  - rejects logins outside the range, wrong passwords and requests without a session
- **Check tool:** reads `.env`, then step by step:
  - server reachable
  - authenticated
  - read `MT5_TEST_LOGIN` user and account
  - list logins in each configured group
  - read the last 7 days of deals for the test login

  It prints the result and a plain fix for each failure: IP not whitelisted, wrong password, wrong port, login outside the range.

### A3. Settings: account types mapped to MT5 groups
- In Client area settings, add per account type:
  - `mt5_group` (e.g. `real\absel-global\ecn`)
  - `mt5_demo_group`
- Add a global `mt5.writes_enabled` switch (default false), shown only in API mode.
- Add an MT5 status card on the settings page: mode, server, connected or not, last sync, login range, groups found. Same style as the B2BINPAY and Cyrafa cards.

### A4. Read-only sync (server timer, every `MT5_SYNC_SECONDS`)
- **Accounts:** for every `accounts` record with a login, refresh balance, equity, margin, free margin, leverage, group and last-seen time. This replaces the daily balance import in API mode; keep the import screen for manual mode.
- **Unknown logins:** MT5 accounts inside the login range that aren't in our system go to a "Unlinked MT5 accounts" list for operations to link to a client. Never link them automatically.
- **Deals:**
  - Fetch incrementally from the last synced deal time minus 10 minutes of overlap, deduplicated by deal ticket, into a new collection `mt5_deals`.
  - Fields: `{ id: "MD"+ticket, ticket, login, account_id, client_id, time, action, entry, symbol, lots, price, profit, commission, swap, position_id, comment }`
  - Store trading deals and balance deals; keep the raw MT5 object out of the record.
- **Positions:** a snapshot of open positions per account, for lifecycle "active trader" and margin display.
- **Trading activity:** existing logic (`markTradingStarted`, `recordTrading`, `lots_total`, `last_trade_at`, the dormant segment) must now be fed from deals. Use the existing functions; don't duplicate them.
- **Reconciliation report** (back office → Trading → MT5 reconciliation, operations and admin): for the period, our completed deposits and withdrawals per login against MT5 balance deals per login, highlighting differences.
  - Balance deals with our reference in the comment match automatically.
  - Others are shown as "made outside the system".

### A5. Tests
- Simulate assertions for the sync logic, fed by fake deals through a core function such as `mt5IngestDeals(rows)` and `mt5IngestAccounts(rows)`, so the core stays network-free.
- An integration test against `tools/mt5-mock.js`:
  - auth works and a bad password fails
  - the range lock refuses an out-of-range login
  - deals sync with no duplicates across two runs
  - account balances update
  - an unknown login appears in the unlinked list

---

## 5. Phase B: MT5 actions after back-office approval

All of this runs only when `MT5_MODE=api` **and** `mt5.writes_enabled` is on. Otherwise the existing manual buttons stay.

### B1. Account opening
- **Live account** request (`portalRequestAccount`): the operations button becomes **"Approve and create in MT5"**.
  - Create the user in the type's `mt5_group` with the requested leverage, name, email and country, and generate a strong main and investor password.
  - Record the login, server and group through the same code path as `openAccount`. The main password uses the existing one-time reveal: `pw_once` is shown once in the client area, then erased. Never store or log the investor password.
  - The client sees the account at once and receives the existing account-opened email.
- **Demo accounts** are created automatically on request, since no money is involved.
- **Failure:** the request stays in "requested" with the MT5 error shown. Operations can retry or use the manual "Record account" form.
- Check leverage changes against the type's allowed list. Changing leverage on an existing account is an operations action with an audit entry.

### B2. Deposits
- **Flow:** client deposit → money confirmed (gateway `paid`, or operations has checked the bank or e-wallet receipt) → operations clicks **"Approve and credit in MT5"** → `balance(+amount, comment "DEP {reference}")` → record the deal ticket → status `completed`.
- The existing first-deposit and FTD logic, emails, notifications and payment reports must work unchanged.
- Show "Credited in MT5 · deal #123456 · by Fatima" on the payment.
- **On timeout or unknown result:** mark the payment `mt5_unknown` and don't retry blindly. Run the exactly-once check from section 3.3 on the next sync. Operations can click "Check MT5 again".

### B3. Withdrawals
- Same approvals as today (one approval, or two above the limit).
- On final approval, the system:
  1. reads the live free margin (refuse with a clear message if it's not enough)
  2. runs `balance(-amount, comment "WD {reference}")`
  3. marks the withdrawal **"Debited in MT5, pay the client"**
- Operations then pays by bank or USDT outside and clicks **"Mark paid"** with the payout reference, which sets status `completed` and sends the existing email.
- If the client cancels before final approval, nothing happens in MT5.

### B4. Internal transfers
- One approval → debit the source with `TRF-OUT {reference}` → credit the target with `TRF-IN {reference}`.
- If the credit fails after the debit succeeded, raise a red alert to operations with a one-click retry of the credit. Never reverse automatically.

### B5. Company-funded $100 bonus accounts
The existing bonus flow gets an "Approve and credit in MT5" action with comment `BONUS {id}`. Its withdrawal rules stay as they are.

### B6. Tests
- Simulate and integration tests against the mock. They must cover:
  - no balance call without approval
  - two approvals above the limit
  - out-of-range login refused
  - the retry after timeout finds the existing deal and doesn't double-credit
  - insufficient margin blocks a withdrawal
  - a transfer whose credit fails raises the alert
  - `writes_enabled=false` keeps the manual flow

---

## 6. Phase C: IB / partner system

### C1. Data model (add to `COLLECTIONS`)
- **`partners`**
  ```
  { id: "IB…", client_id, code (unique, 6–10 chars, A–Z0–9), status: applied|approved|rejected|suspended,
    kind: individual|company, company: {name, reg_no, country}, plan_id, parent_id (master IB or null),
    can_recruit (bool), agreement: {version, accepted_at, ip}, payout: {method: mt5|bank|usdt, account_id, details},
    manager_id (staff), notes, created_at, approved_at, approved_by }
  ```
- **`ib_plans`**
  ```
  { id, name, active, rates: [{ account_type: "*"|id, symbol_group: "forex"|"metals"|"indices"|"energy"|"crypto"|"other", per_lot }],
    override_per_lot: [{ symbol_group, per_lot }] (what a master earns on a sub-IB's clients),
    cpa: { enabled, amount, min_deposit, min_lots, within_days }, min_hold_seconds (default 120), holdback_days (default 30) }
  ```
- **`commissions`** (ledger, one line per deal per level, or per CPA)
  ```
  { id, partner_id, level: 1|2, kind: lot|cpa|adjustment, client_id (internal only), account_id, deal_ticket, symbol, symbol_group,
    lots, rate, amount, period "YYYY-MM", status: pending|held|approved|paid|reversed, hold_reason, payout_id, created_at, decided_by }
  ```
- **`ib_clicks`** (hashed IP, partner_id, link campaign, time; keep 180 days)
- **Symbol groups:** a settings list of `{ group, pattern }` regexes, matched in order, e.g. `metals: ^(XAU|XAG)`. Unmatched symbols go to `other`.
- **Client and lead fields:**
  - `client.partner_id`, `lead.partner_id`
  - `lead.ib_client = true`
  - `client.partner_locked_at`

### C2. Becoming an IB
- **Client area:** a "Become a partner" card. It's a short form:
  - individual or company
  - company details if a company
  - how they'll promote
  - expected clients per month
  - accept the IB agreement (version text in settings)

  Company IBs upload company documents through the existing KYC upload with new kinds. The IB's own KYC must be approved first.
- **Website:** a `/partners` landing section linking to register or sign in, then apply.
- **Back office:**
  - **Partners → Applications**: compliance reviews documents; the partnerships manager approves, picks a plan, sets the parent (master IB) and `can_recruit`. Rejecting requires a reason.
  - Approving creates the code and emails the IB.
- **New role `partnerships`** (Partnerships manager), plus admin. Operations handles payouts, compliance handles IB documents.

### C3. Referral links and attribution
- **Links:**
  - `https://abselglobal.com/r/{CODE}` logs a click (rate-limited) and redirects to the website with `?ib={CODE}`
  - optional campaign: `/r/{CODE}/{campaign}`
  - sub-IB recruitment link: `/r/{CODE}?join=partner`
- **First-touch storage:** website and client area store `ib` in the existing first-touch attribution (`ag_attr`, `ag_utm`), kept 90 days. The register form has an optional "Partner code" field, prefilled from the link.
- **On `portalRegister`:**
  - a valid approved code sets `client.partner_id` and `lead.partner_id`, `lead.ib_client = true`, `utm_source = "ib"`, `utm_campaign = code`
  - the IB's own email or phone, or an existing client, can't be attributed (self-referral block)
- **Lock:** attribution is permanent. Only the partnerships manager or admin can reassign, with a reason. It's logged and both IBs are notified, with no client PII in the notice.
- **Leads from other sources** (Meta, Google, the lead API) with `ib` or `partner` set are attributed the same way.
- **Duplicates:** existing duplicate prevention still applies. A duplicate keeps its first attribution.

### C4. Commission engine (core, network-free; runs after each deal sync)
- For each new **closing** trading deal (entry out, in/out or out-by) on a live account whose client has `partner_id`:
  - **Level 1:**
    - `lots × rate(plan, account_type, symbol_group)` for the client's IB
    - `period` = the deal month
    - status `pending`
  - **Level 2:** if that IB has a `parent_id` and the parent is approved, add a line for the parent at the parent plan's `override_per_lot`.
  - **Hold rules** (status `held`, with reason):
    - the position was open less than `min_hold_seconds` (use `position_id`: open time from the opening deal)
    - the account belongs to the IB or the IB's parent (own trading is never paid)
    - the client shares a payment fingerprint (card hash or crypto address), sign-up IP or device with the IB (flag for review)
- **CPA:** one line when the client's first deposit is ≥ `min_deposit`, KYC is approved, and they trade ≥ `min_lots` within `within_days`. Status stays `held` until `holdback_days` pass with no chargeback or withdrawal of the FTD; then `pending`.
- **Reversals:** a chargeback, or a reversed or cancelled deposit, reverses the related CPA. A deal removed in MT5 (if detected on re-sync) reverses its lines. Never delete ledger lines; reverse them with a reason.
- **Idempotent:** (partner_id, level, deal_ticket) and (partner_id, client_id, kind cpa) are unique.
- **Month close:** on the 1st, last month's `pending` lines become reviewable. The partnerships manager approves per IB, which sets `approved`, or holds or adjusts lines with a reason. Adjustments are separate `kind: adjustment` lines.

### C5. Partner section in the client area (same login; shown once approved)
- **Dashboard** for the selected period:
  - clicks, sign-ups, KYC approved, FTD count, net deposits, lots
  - commission: pending, approved, paid
  - a small daily chart
- **Links:**
  - main link, code and campaign links (a builder that adds a campaign name)
  - QR code (reuse the existing QR loader)
  - copy buttons
  - the sub-IB recruitment link if `can_recruit`
- **Clients** (masked):
  - first name and last initial, country, status (signed up, KYC, funded, trading), account type
  - deposits total, lots this period, commission this period
  - **no email, phone, documents, account login or balance**
- **Sub-IBs** (if any): code, status, clients count, lots, and your override earned.
- **Commissions:**
  - monthly statement grouped by client (masked) and symbol group
  - CSV export with the same columns, masked
  - held lines show the reason in plain words ("Trade closed in under 2 minutes")
- **Payouts:**
  - the available balance is approved minus paid
  - request a payout when it's ≥ $50: to their own MT5 live account, or to bank or USDT details
  - history of past payouts
- **Materials:** banners and logos uploaded by staff (reuse `files` with a new kind), with "copy link with my code".
- **Agreement:** the accepted version and date, with a link to the text.

### C6. Payouts
- A payout request creates a `payments` record of **type `ib_payout`**, so it appears in Deposits & withdrawals with the same approval rules, including two approvals over the limit.
  - **To MT5:** after approval, `balance(+amount, comment "IB {reference}")`, using the Phase B machinery.
  - **To bank or USDT:** after approval, operations pays and clicks "Mark paid".
- When paid, the included commission lines get `payout_id` and status `paid`. If a payout is rejected, its lines go back to `approved`.
- No payout may include `pending` or `held` lines.

### C7. Back office
- **Navigation group "Partners"** (partnerships, admin; operations sees payouts):
  - **Applications**
  - **Partners list:** search, status, plan, master, clients, FTDs, lots, commission this month
  - **Partner profile:**
    - hierarchy tree (master → sub-IBs)
    - clients (full details for staff)
    - commission ledger with filters, plus hold, release and adjust actions with a reason
    - payouts, notes, audit trail
    - reassign a client
    - suspend (stops new attribution and new commission lines; existing approved amounts can still be paid unless a manager holds them)
  - **Commission plans:** editor, with a preview such as "a 1-lot EURUSD trade pays $X to the IB and $Y to the master"
  - **Month close:** a review screen per IB for the period
  - **IB report:**
    - per IB: clicks → sign-ups → FTD conversion, net deposits, lots, commission paid
    - commission as % of net deposits
    - cost per FTD
    - top symbols
- **Sales integration:**
  - IB clients still get an agent through the existing routing, with an "IB client · {code}" pill on the lead and client
  - excluded from agent FTD targets and leaderboards
  - shown in a separate "IB-referred FTD" count on the sales and business reports
- **Business overview:** an IB card with active IBs, IB-referred FTDs, IB share of deposits and commission due.
- **Notifications and email templates:**
  - to the IB: application received, approved or rejected; new referral signed up (no PII); monthly statement ready; payout paid
  - to staff: new application, payout requested, abuse flags

### C8. Tests and demo data
- **Simulate data:** 4 IBs (1 master with 2 sub-IBs, 1 independent), referred clients at every stage, deals synced from fake MT5 rows, CPA, holds and a payout.
- **Assertions:**
  - attribution from link and code
  - self-referral blocked
  - reassign logged
  - level 1 and 2 amounts correct for several symbol groups
  - deals under the minimum hold are held
  - own-account trading excluded
  - CPA qualification and reversal
  - no duplicate lines on re-sync
  - month close and payout flows, including a rejected payout restoring lines
  - Partner views expose no email or phone (check the RPC output)
- **Integration test** against the mock MT5: the full chain of a sync'd deal → commission → approve → payout to MT5 with the deal ticket recorded.

---

## 7. Database views (`db/schema.sql`)
Add `v_partners`, `v_commissions`, `v_mt5_deals` and `v_mt5_ops`, in the same style as `v_payments`.

## 8. Delivery checklist (each phase)
- [ ] `node tools/simulate.js` passes; the new tests pass; `node --check` passes on all changed files
- [ ] Server starts with `MT5_MODE=manual` and nothing behaves differently from before
- [ ] Back office and client area checked at 1440 px and 390 px, with no console errors
- [ ] `.env.example`, README and `db/schema.sql` updated
- [ ] No secrets in code, logs or the client-area responses
- [ ] Short summary: what changed, what to configure, and any assumption about the MT5 API to confirm with Absel Markets

## 9. Still to confirm with Absel Markets (don't hard-code; keep as settings)
- MT5 group names per account type and for demo; allowed leverage per group
- Web API port, and the server build version for `auth/start`
- That the manager has rights for create/edit users, balance operations and reading deals/positions, limited to Absel Global's groups
- Our server IP whitelisted
- Comment format they want on balance operations
- Whether commission can also be paid with MT5's own "agent" mechanism later (not used now)
