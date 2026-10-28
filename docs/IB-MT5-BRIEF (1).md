# Absel Global: MT5 Web API connection and IB (partner) system

Development brief for Claude Code. Build it in **three phases**, one at a time, in the order below. Finish each phase, with tests passing and the checklist done, before starting the next.

---

## 0. How to use this brief

Paste one of these prompts into Claude Code in VS Code, from the project root:

**Phase A**
> Read `docs/IB-MT5-BRIEF.md` fully, then implement **Phase A (MT5 Web API connector and read-only sync)** only. Follow section 2 (codebase conventions) and section 3 (non-negotiables) exactly. Build the mock MT5 server first and test against it. Run `node tools/simulate.js` and the new tests before you finish. Show me the list of changed files and anything you had to assume.

**Phase B**
> Read `docs/IB-MT5-BRIEF.md`. Phase A is done. Implement **Phase B (MT5 account creation, and matching manual MT5 money operations)** only. Remember non-negotiable 1: no money movement in MT5 from our system. Same rules and tests.

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
  - **No money moves in MT5 from our system: not now and not for at least the next 3 months.** Our system never calls any MT5 balance, credit, bonus-credit, deposit, withdrawal, order or trade endpoint, automatically or after approval. Absel Markets' operations team does every credit and debit in MT5 Manager themselves.
  - **What our system does with MT5:**
    - **reads** accounts, balance, equity, margin, deals and positions
    - **creates** trading accounts and edits non-money account details (name, email, leverage within the allowed list)

    That's all.
  - Deposits, withdrawals, transfers, bonus credits and IB payouts keep today's flow: the client requests, operations approves in our back office (every amount, even $1; two approvals for large withdrawals), operations does the money operation in MT5 Manager, then confirms in our back office. The difference is that our sync now **finds the matching MT5 balance deal** and offers it for one-click confirmation, and flags mismatches.
  - Automated credit and debit may come later as a separate, explicitly enabled feature with its own brief. Don't build it, stub it or leave unused code for it now.
  - Opening an account is not a money movement. It can run with one operations click, or automatically for demo accounts.
  - IB commissions are calculated from **real MT5 deals** synced through the API. No CSV is needed.
  - IB setup:
    - per-lot commission plus optional CPA per qualified FTD
    - two levels (IB and sub-IB, the master earning an override)
    - our system calculates commissions and operations pays them
    - the IB uses the same client-area login and gets a **Partner** section
    - IB clients still get a sales agent, but are flagged and kept out of agent FTD targets
    - the IB sees clients masked
    - payouts monthly, $50 minimum, with approval; operations pays them by hand (credit in MT5 Manager, bank or USDT)

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
- **Wording:** plain English in the UI ("Seen in MT5", "Confirm deposit", not "Balance deal matched").
- **Docs:** add a README section per feature.

---

## 3. Non-negotiables

1. **No money movement through MT5 from our system.** `lib/mt5.js` keeps an **allow-list of MT5 commands** and refuses anything else with an error, before any network call:
   - `auth/start`, `auth/answer`, `test/access`
   - `user/get`, `user/add`, `user/update`, `user/account/get`, `user/logins`
   - `deal/get_batch`, `position/get_batch`, `group/get`

   `user/update` may only send name, email, phone, country, comment and leverage, and leverage must be in the type's allowed list. Anything that changes balance, credit, positions or orders is refused (`trade/balance`, any `trade/*`, `order/*`, `position` modify or close, and credit or bonus operations). A test must prove that a balance call is impossible.
2. **Login range lock.** Every MT5 call that touches an account must check that the login is inside `MT5_LOGIN_FROM`–`MT5_LOGIN_TO`. Refuse, log and alert otherwise. Group names come only from our settings; never take them from user input.
3. **Matching, not moving.** Operations does money in MT5 Manager with our payment reference in the comment (`DEP {ref}`, `WD {ref}`, `TRF-OUT/TRF-IN {ref}`, `BONUS {id}`, `IB {ref}`). Our sync reads those balance deals and matches them to our records. A match is shown for one-click confirmation by a person and is never applied automatically. Every MT5 call our system makes (reads and account creation) is stored in an `mt5_ops` log: command, parameters without secrets, retcode, staff user and time.
4. **Manual fallback.** Everything still works with `MT5_MODE=manual`, today's behaviour. If MT5 can't be reached in API mode, the action fails with a visible error and operations can retry or record it manually. Nothing is lost silently.
5. **Read before write.** Phase A is read-only. Account creation arrives in Phase B behind a settings switch, `mt5.account_creation_enabled`, that is off by default.
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
  - `updateUser(login, fields)`: only the non-money fields allowed in section 3.1
- **There is no balance, credit or trade function.** Don't write one.
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
- Add a global `mt5.account_creation_enabled` switch (default false), shown only in API mode.
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
  - Balance deals with our reference in the comment are matched for display. Confirming still needs a person (Phase B).
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

## 5. Phase B: account creation, and matching manual MT5 money operations

Account creation runs only when `MT5_MODE=api` **and** `mt5.account_creation_enabled` is on. Matching needs only `MT5_MODE=api`. With manual mode everything works exactly as today.

### B1. Account opening (the only MT5 write)
- **Live account** request (`portalRequestAccount`): the operations button becomes **"Approve and create in MT5"**.
  - Create the user in the type's `mt5_group` with the requested leverage, name, email and country, and generate a strong main and investor password.
  - Record the login, server and group through the same code path as `openAccount`. The main password uses the existing one-time reveal: `pw_once` is shown once in the client area, then erased. Never store or log the investor password.
  - The new account has a **zero balance**. Our system never funds it.
- **Demo accounts** are created automatically on request. Their starting virtual balance comes from the MT5 demo group's own setting at Absel Markets; our system doesn't deposit into demo accounts either.
- **Failure:** the request stays in "requested" with the MT5 error shown. Operations can retry or use the manual "Record account" form.
- Leverage changes go through `updateUser` and must be in the type's allowed list. It's an operations action with an audit entry.

### B2. Deposits (manual credit in MT5, matched by our system)
- **Flow, the same as today plus matching:** client deposit → money confirmed (gateway `paid`, or receipt checked) → operations approves → operations credits in **MT5 Manager** with comment `DEP {reference}` → our sync finds that balance deal → the payment shows **"Seen in MT5 · deal #123456 · $500 · 14:02"** with a **"Confirm deposit"** button.
  - Confirming sets the existing `completed` status, with the deal ticket as the reference and the staff user. All existing first-deposit and FTD logic, emails and reports run unchanged.
- **Warnings** on the payment and in the operations desk:
  - amount in MT5 differs from the request
  - the deal is on a different login
  - no MT5 deal found after X hours (setting, default 2)
  - an MT5 balance deal with a `DEP` reference we don't know
- Operations can still confirm without a match, with a reason, e.g. "MT5 comment missing". It's logged.

### B3. Withdrawals
- Same approvals as today (one approval, or two above the limit).
- After approval, operations debits in MT5 Manager with `WD {reference}` and pays the client by bank or USDT. The sync shows **"Debit seen in MT5 · deal #…"**. Operations clicks **"Mark paid"** with the payout reference; the existing completion and email follow.
- The approval screen shows the **live free margin** from the sync, so operations can see whether the client can afford it before debiting in MT5. It's informational only.

### B4. Internal transfers
- One approval. Operations moves the money in MT5 Manager (`TRF-OUT {ref}` on the source, `TRF-IN {ref}` on the target).
- The sync matches both deals. Warn if only one side is seen after X hours.

### B5. Company-funded $100 bonus accounts and MT5 credit
- Done in MT5 Manager by Absel Markets with comment `BONUS {id}`. Our bonus flow shows the matched deal and asks for a one-click confirm.
- Our system never touches the MT5 **credit** field. It only reads and displays it if the account data includes it.

### B6. Tests
- Simulate and integration tests against the mock. They must cover:
  - **any attempt to call a non-allowed command (e.g. `trade/balance`) throws before a network request**, including through `updateUser` with a balance field
  - out-of-range login refused
  - account creation off by default; on, it creates in the right group with zero balance
  - matching: exact match, amount mismatch, wrong login, missing after X hours, unknown reference, two deals with the same reference (flag, don't pick one)
  - confirming without a match requires a reason
  - manual mode unchanged

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
  - **To MT5:** after approval, operations credits the IB's own MT5 account in MT5 Manager with comment `IB {reference}`. Our sync matches the deal and operations confirms, the same as B2.
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
- **Integration test** against the mock MT5: the full chain of a synced deal → commission → approve → payout request → manual MT5 credit (simulated in the mock) → matched → confirmed, with the deal ticket recorded.

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
- That the manager has rights only to create and edit users and to read accounts, deals and positions, limited to Absel Global's groups. **Ask them not to grant balance or credit rights to the Web API manager**, so the rule is enforced on the MT5 side as well.
- Our server IP whitelisted
- The comment format their operations team will use for manual balance operations (we suggest `DEP/WD/TRF-OUT/TRF-IN/BONUS/IB {reference}`), so our matching works
- Whether commission can also be paid with MT5's own "agent" mechanism later (not used now)
