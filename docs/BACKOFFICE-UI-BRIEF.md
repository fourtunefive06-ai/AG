# Absel Global back office: navigation redesign (Meta Business Suite style)

Development brief for Claude Code. This changes **how people move around the back office**: the shell, navigation, search and home. It does **not** change what any page does.

---

## 0. Prompt to paste into Claude Code (VS Code)

> Read `docs/BACKOFFICE-UI-BRIEF.md` fully. Redesign the back-office navigation shell as described. Don't change any page's behaviour, any route, any RPC or any access rule. Work in the steps in section 6, checking the back office at 1440 px, 1024 px and 390 px after each step. Run `node tools/simulate.js` at the end, and show me screenshots or a description of each role's navigation (admin, sales manager, agent, marketing manager, operations, compliance).

Do this **before** Phase C of `docs/IB-MT5-BRIEF.md`, so the new Partners area slots into the new navigation.

---

## 1. The problem

- The left sidebar lists every page in one long column: **34 links in 10 groups for an admin**, so people scroll to find pages and lose their place.
- Every new feature (MT5 reconciliation, partners, payouts) makes it longer.
- The search box only searches leads.
- On a phone the whole list opens as a drawer.

## 2. The target: how Meta Business Suite does it

1. **A narrow icon rail on the left (≈72 px)** with **7 or 8 main areas** ("hubs"). Each shows an icon, a short label underneath and a badge that adds up the to-dos inside it. The bottom of the rail holds **All tools**, **Settings**, **Help** and the **profile avatar**.
2. **A contextual sub-menu (≈232 px)** next to the rail, listing only the pages of the selected hub, with small group headings. It can be collapsed to rail-only, and that choice is remembered per user (localStorage, wrapped in try/catch).
3. **"All tools"**: a panel or overlay listing **every page the user can open**, grouped by hub, with a search box and a ☆ **pin** on each tool. Pinned tools (up to 5) appear in the rail under the hubs, so each person builds their own short menu.
4. **Top bar:**
   - page title and breadcrumb (Hub › Page)
   - **global search**: a ⌘K / Ctrl+K command palette
   - a **"+ Create"** menu
   - notifications
   - help
   - the **workspace badge** ("Absel Global · Admin")
5. **Home** is a role-based start page with the to-dos and shortcuts for that person.
6. **Phone:** a bottom tab bar with 4 role-based hubs plus **More**, which opens All tools as a sheet. The rail and sub-menu are hidden; the hub's pages become a horizontal scrolling tab strip under the top bar.

## 3. Information architecture

Map every **existing route** to a hub. Routes, view code and access functions (`isMgr`, `isOps` and so on) stay exactly as they are; only the shell's `NAV` structure changes. A hub is shown only if the user can open at least one page in it. A page is shown only if its existing access function allows it.

| Hub (rail) | Icon | Pages, grouped (existing route in brackets) | Who typically sees it |
|---|---|---|---|
| **Home** | home | Business overview (`overview`) · Sales dashboard (`dashboard`) · Operations desk (`ops`), shown as **tabs on the Home page** filtered by role; Home opens the person's role default (today's `home()` logic) | everyone |
| **Sales** | target | *My work:* My day (`queue`), Calling mode (`call`), Inbox (`inbox`), Follow-ups (`tasks`) · *Pipeline:* Leads (`leads`), Client journey (`lifecycle`), Deposit pipeline (`pipeline`), FTD verification (`deposits`), Demo & $100 (`bonus`), Targets (`targets`) · *Team:* Team live (`live`), Call quality (`quality`), Lead hygiene (`hygiene`), Territories (`territories`) | sales, managers |
| **Clients** | users | Clients (`clients`) · KYC review (`kyc`) · Account opening (`openacc`) · *Trading:* Trading accounts (`trading`), Trading data import (`balances`) (MT5 sync status and reconciliation go here later) | operations, compliance, managers |
| **Money** | cash | Deposits & withdrawals (`money`) · Payment performance (`payperf`) (IB payouts go here later) | operations, managers |
| **Marketing** | megaphone | Marketing overview (`mkt`) · Campaigns & spend (`campaigns`) · Broadcasts (`broadcasts`) · Lead sources (`sources`) · Leads, view only (`leads` for marketing) · *Messaging:* Templates (`templates`), Automations (`automations`), Message log (`messages`), Opt-outs & DNC (`optouts`) | marketing, managers |
| **Partners** | handshake | *(Phase C of the IB brief: Applications, Partners, Commission plans, Month close, IB report.)* Hidden until those routes exist; define the hub now with an empty list | partnerships, admin |
| **Insights** | chart | Reports & MIS (`reports`) · shortcuts to Business overview and Payment performance | managers, marketing, operations |
| **Settings** (rail bottom) | gear | *Organisation:* Settings (`settings`) · *People:* Team (`team`) · *Client area:* Client area settings (`portalsettings`) · *Data:* Import leads (`import`) | admin, managers |

Notes:
- **Badges** stay attached to their pages (`inbox`, `kyc`, `accounts`, `money`, `bonus`, `deposits`, `broadcasts`, `reviews`, `queue`). The hub icon shows the **sum** of its pages' badges. Keep using the existing `drawBadges()` values.
- `leads` appears for sales under Sales and for marketing-only users under Marketing (view only), exactly as today.
- An **agent** should see only Home, Sales (without the Team group) and maybe Clients. That's 2–3 hubs, which is why this works for every role.

## 4. Components to build (in `public/crm/app.js` and `public/crm/index.html`)

1. **`NAV` as data:** `[{ hub, label, icon, groups: [{ title, items: [[route, label, icon, access, badge]] }] }]`. Generate the existing `ACCESS` map from it so route guards keep working unchanged.
2. **Rail:**
   - 72 px wide, navy brand background (existing `--brand`), white icons, 10.5 px labels
   - the active hub highlighted with the existing `--cta` accent
   - tooltips on hover
   - keyboard reachable, with `aria-current="page"` on the active page
3. **Sub-menu:**
   - light surface (existing `--surface`) next to the rail, with group headings
   - a collapse button with `aria-expanded`
   - remembers collapsed state and last page per hub
   - opening a hub goes to the last page used in it, or its first page
4. **All tools:**
   - an overlay from the rail button (or **G then A**)
   - search box at the top, filtering as you type
   - grid of tools grouped by hub with icon, name and a one-line description; descriptions live with the NAV entries
   - ☆ pin and unpin, stored per user in localStorage (try/catch), maximum 5, shown in the rail
5. **Command palette (⌘K / Ctrl+K, and the top-bar search):**
   - jumps to pages ("deposits" → Deposits & withdrawals)
   - searches leads through the existing `listLeads` search
   - searches clients and payments references if an existing RPC supports it; otherwise only pages and leads, noting what's missing
   - arrow keys and Enter work; Esc closes
   - shows recent pages
6. **"+ Create" menu**, role-filtered, opening existing screens or forms only:
   - New lead (sales)
   - Import leads (managers)
   - New campaign (marketing)
   - New broadcast (marketing)
   - New template (comms)
   - Record FTD (sales, if a direct route exists)
7. **Top bar:** breadcrumb (Hub › Page), the existing agent status and "Taking leads" controls, notifications, a help link, and the avatar menu (existing user menu).
8. **Home:**
   - role tabs: Business, Sales, Operations; only those the user can see
   - a **To do** row of cards built from the badge counts, linking to the pages
   - **Pinned tools** as shortcut cards
   - Reuse the existing overview, dashboard and ops views inside the tabs rather than rebuilding them.
9. **Phone (≤ 760 px):**
   - bottom tab bar with safe-area padding: Home + up to 3 role hubs + More
   - More opens All tools as a bottom sheet
   - the hub's pages appear as a horizontally scrollable tab strip under the top bar
   - no hamburger drawer
10. **Tablet (761–1100 px):** rail plus collapsed sub-menu by default; it opens as an overlay.

## 5. Rules

- **No behaviour change:** same routes and URLs (`#/…` with the configurable route prefix), same views, same RPCs, same access checks. Bookmarks and links in notifications and emails must keep working.
- **Zero dependencies:** vanilla JS and CSS only, using the existing design tokens, icons (`ICONS`) and dark-mode variables. Add any new icons (home, handshake, grid/all-tools, help, pin) to `ICONS` in the same SVG style.
- **The same `app.js` also runs inside the live demo and prototype pages**, which load it in `srcdoc` iframes without a server. Avoid anything that breaks there, such as absolute URL assumptions or service workers, and wrap all storage in try/catch.
- **Accessibility:**
  - every control reachable by keyboard
  - visible focus rings
  - `aria-label` on icon-only buttons
  - menus close on Esc
  - contrast at least AA in light and dark
- **Performance:** building the shell must not call any extra RPC. Use `C.state.meta` and the existing badge refresh.
- Remove the old long sidebar CSS only once the new shell works for every role.

## 6. Steps

1. Convert `NAV` to the hub structure, generating `ACCESS` from it. Prove every role sees exactly the same set of pages as before by writing a quick script that lists visible routes per role before and after, and compare.
2. Build the rail and sub-menu (desktop), with breadcrumb and badge roll-up.
3. All tools overlay with search and pinning.
4. Command palette and the "+ Create" menu.
5. Home page with role tabs, To do and pinned shortcuts.
6. Tablet and phone layouts (bottom tabs, More sheet, tab strip).
7. Polish: keyboard, focus, dark mode, empty states. Then remove the old sidebar code and CSS.

## 7. Acceptance checklist

- [ ] Admin sees ≤ 8 hubs in the rail and no page needs more than **2 clicks** from anywhere (hub → page), or 1 with a pin or ⌘K
- [ ] Each role sees exactly the same pages as before (script output attached)
- [ ] Badges show on pages and roll up to hubs; they update as before
- [ ] Old URLs and notification links still open the right page
- [ ] 1440 / 1024 / 390 px: no horizontal page scroll, no overlap, no console errors
- [ ] Light and dark mode both correct
- [ ] `node tools/simulate.js` passes
- [ ] README: a short "Navigating the back office" section (hubs, All tools, pins, ⌘K)
