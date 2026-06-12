# Handoff: Sentire Central Portal (Dashboard → Settings)

## Overview
The **Central Portal** is Sentire's internal super-admin console for running the
multi-tenant Payroll platform. It has a fixed left sidebar and seven destinations:
**Dashboard, Tenants, Billing, Support, Analytics, Audit log, Settings**, plus a
**Tenant detail** drill-down opened by clicking any tenant row.

## About the design files
The files in this bundle are **design references created in HTML/React-via-Babel** —
a prototype that demonstrates the intended look, layout and interactions. They are
**not** production code to ship as-is. Recreate the UI in your app's existing stack
(React/Next/etc.) using your established component, routing and data-fetching patterns.
The `.jsx` files use in-browser Babel and `window` globals purely so the prototype runs
from a static file — do not carry that into production.

> ⚠️ **Do NOT copy the mock data.** Every company, person, invoice, ticket, amount and
> metric in these files is fabricated sample content. Replicate only the **UI** — the
> visual style, color palette, typography, spacing, component shapes and the sidebar /
> navigation structure. Wire the screens to your **real** data. Where this prototype
> shows a field your current system doesn't have yet, treat it as a **proposed new
> field/schema** and create it. See `REPLICATION_PROMPT.md` for the exact instruction
> to hand your developer/agent.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and states are final. Match the tokens
below precisely; substitute your real data into the same layouts.

---

## Design tokens (the part to copy)

### Color palette
| Token | Hex | Use |
|---|---|---|
| **Core orange** | `#E8693A` | Primary accent — active nav, primary buttons, links, focus, chart highlight |
| Orange press | `#C2552F` | Hover/pressed primary |
| Orange soft | `#FDEEE6` | Active-nav background, orange icon chips, "Pro" plan badge |
| Ink | `#2A2420` | Primary text, dark logo tile |
| Dark gradient | `#2E241C` → `#211A15` | Logo tile / app-icon background (150°) |
| Muted | `#6B6259` | Secondary text |
| Muted-2 | `#978C80` | Labels, placeholders, meta |
| Line | `#ECE6DD` | Borders / dividers |
| Line-2 | `#F1ECE4` | Inner table/row dividers |
| App bg | `#F7F4EF` | Page background (warm off-white) |
| Paper | `#FFFFFF` | Sidebar, top bar, cards |
| Status green | text `#1F7A4D` / bg `#E7F4EC` | Active, Paid, Healthy |
| Status amber | text `#9A6A12` / bg `#FBF1DC` | Trialing, Pending, Invited |
| Status red | text `#B23B34` / bg `#FBE9E7` | Past due, Overdue, Urgent, Open |
| Status slate | text `#5E5048` / bg `#EFEAE3` | Cancelled, System, Low |
| Info blue | text `#3E63A0` / bg `#E9EFF7` | Normal priority, blue icon chips |

### Typography
- **UI / numbers / headings:** `Instrument Sans` (400/500/600/700).
- **Body / meta / hints:** `Hanken Grotesk` (400/500/600).
- **Monospace** (IDs, codes): `JetBrains Mono` 500.
- Sizes: page H1 27px/600/-0.02em · card title 15.5px/600 · stat value 26px/600 · table cell 13.5px · table header 11px/600 uppercase/0.05em · nav item 14px/500.

### Shape & spacing
- Radii: cards/stats `14px`, buttons/inputs/chips `10px`, icon chips `8px`, pills `999px`.
- Sidebar width `256px`; content padding `28px`; card padding `16–18px`; stat gap `14px`.
- Primary button shadow: `0 8px 18px -10px rgba(232,105,58,.7)`.
- Card border: `1px solid #ECE6DD` on `#FFF`.

### Iconography
Single-weight line icons, `stroke-width 1.7`, 24-grid (see `central-shell.jsx` `ICONS`).
The brand mark in the sidebar tile is the **Nexus** logo (`assets/sentire-mark-dark.svg`).

---

## Layout shell (every page)
- **Grid:** `256px` sidebar + fluid main; full viewport height.
- **Sidebar** (`#FFF`, right border): brand block (dark rounded tile with Nexus mark +
  "Sentire Central" / "Super Admin Portal"); nav list; user footer (avatar + name +
  email + role). Active item: orange-soft background, `#C2552F` text, 3px orange left
  bar, chevron on the right. "New" pill on Analytics & Audit log.
- **Top bar** (`#FFF`, bottom border): global search input with `⌘K` kbd; right side has a
  green **Production** environment pill and a bell with an unread dot.
- **Main scroll area:** each page starts with a **page head** (H1 + sub) and optional
  right-aligned actions (primary + ghost buttons).

### Buttons
- **Primary:** orange fill, white text, soft orange shadow. **Ghost:** white, `#ECE6DD`
  border, ink text, hover `#F6F1EA`.

### Reusable components (replicate these)
StatCard (label, big value, tinted icon chip, optional delta ▲/▼ + sub), Card (titled
container with optional header action), data Table (uppercase header row, hover rows,
right-aligned numeric cols), Badge (status pill — color by status), PlanBadge
(Starter/Pro/Enterprise), tabs (underline-active), filter bar (search field + selects),
bar chart, donut chart, toggle switch, activity/audit **feed** (colored dot + text + meta).

---

## Screens

### 1. Dashboard
Page head "Dashboard" + **Onboard tenant** primary button. Then:
- **5 stat cards:** MRR (orange, +delta), Active tenants (green, +delta), Employees paid
  (blue), Trialing (amber, "n expiring soon"), Past due (red, "₱ outstanding").
- **2-col row:** left = "Recurring revenue" bar chart (12 months, last bar orange,
  hover tooltip); right = "Needs attention" list (overdue invoice / urgent ticket /
  expiring trial — each with a tinted icon, title, sub and a ghost action button).
- **Recent tenants** card → the shared Tenant table (first 5), "View all" link.

### 2. Tenants
Page head + **Refresh** (ghost) and **Add tenant** (primary). Card containing a filter
bar (search + Plan select + Status select) and the **Tenant table**:
columns = Company (logo + name + slug), Plan, Employees (num), Status, MRR (num),
**Health** (mini bar + score, green/orange/red), Since, chevron. **Rows are clickable →
Tenant detail.** Filters narrow the list live; empty state when no match.

### 3. Billing
Page head + **New invoice**. Tabs: **Overview / Subscriptions / Packages / Payment history**.
- Overview: 4 stat cards (MRR, Active subscriptions, Outstanding, Collected this month) +
  "Recent invoices" table (Invoice # mono, Tenant, Amount, Status badge, Issued).
- Subscriptions: table (Tenant, Plan, Seats, MRR, Renews, Status).
- Packages: 3 pricing cards (Starter / **Pro – "Most popular"** highlighted with orange
  border / Enterprise "Custom"), feature list, "n tenants" + Edit.
- Payment history: invoice table.

### 4. Support
Page head. 4 stat cards (Open tickets, Avg first response + within-SLA, Past due accounts,
Trials expiring 7d). **Ticket queue** table (ID mono, Subject, Tenant, Priority badge,
Agent — "Unassigned" in red, Age). 2-col: "Past due accounts" + "Trials expiring soon"
attention lists with Contact/Nudge actions.

### 5. Analytics *(proposed new page)*
4 stat cards (Net revenue retention, Churn 90d, Avg revenue/tenant, Trial→paid). 2-col:
MRR-growth bar chart + Plan-mix **donut** with legend.

### 6. Audit log *(proposed new page)*
Page head + **Export CSV**. Filter bar (search + event-type select + date-range select).
**Feed** list: colored dot (security=red, billing=orange, tenant=blue, system=slate),
"<who> <action> <target>", timestamp · IP, and a capitalized type pill on the right.

### 7. Settings
Two cards: **Roles** (table: Name, Description, Permissions count pill, Admins count, Type
badge System/Custom, "Permissions" action) with **Add role**; **Administrators** (table:
Name w/ avatar, Email, Role pill, Status badge, Last login, Edit) with **Invite admin**.
Plus a **Security** card with toggle rows (Enforce 2FA, IP allowlist, idle sign-out).

### 8. Tenant detail (drill-down)
Opened from any tenant row. Contains:
- **Breadcrumb** "Tenants › {company}" (back link).
- **Header:** 52px logo, company name, "slug · region · Owner {name}", Plan + Status
  badges, and actions **Impersonate · Suspend · Manage subscription**.
- **4 info cards:** Employees, MRR (billed monthly / on trial), Customer since, Account
  health (n/100 + Healthy/At risk/Critical).
- **Tabs:**
  - **Overview** — "Company details" definition list + "Current package" (plan, price,
    seat tier, feature list).
  - **Billing** — this tenant's invoices.
  - **Subscription history** — feed (subscribed → upgraded → renewed; payment-failed /
    cancelled events for at-risk accounts; trial timeline for trialing tenants).
  - **Support** — this tenant's tickets only (empty state if none).
  - **Activity** — recent account events feed.

> **Retain the full tenant information model.** A tenant carries: company/legal name,
> workspace slug/ID, plan, status (Active/Trialing/Past due/Cancelled), employee count,
> MRR, customer-since date, account-health score, region, primary-contact/owner, trial-end
> (when trialing), plus relations to invoices, subscription events and support tickets.
> Keep all of these — add real fields as needed, but don't drop any.

---

## Interactions
- Sidebar nav switches pages; clicking a tenant row routes to Tenant detail; breadcrumb
  routes back; scroll resets to top on navigation.
- Billing & Tenant-detail **tabs** switch in place. Tenant **filters** (search + selects)
  narrow the list. Toggles flip. All transitions ~.12–.15s.
- Buttons/links are wired to handlers in the prototype but are visual placeholders —
  connect them to your real flows (onboard tenant, invoice, impersonate, suspend, etc.).

## Files in this bundle
- `Sentire Central Portal.html` — runnable prototype + **all CSS (source of truth for tokens/spacing)**.
- `central-shell.jsx` — sidebar, top bar, icons, StatCard/Card/Badge/Table primitives, page head, nav context.
- `central-pages.jsx` — all seven pages + Tenant detail. **Primary layout spec.**
- `central-data.jsx` — **MOCK DATA ONLY. Do not copy. Use as a schema hint.**
- `nexus-refined.jsx` — Nexus logo mark component.
- `assets/*.svg` — production logo files.
- `REPLICATION_PROMPT.md` — paste-ready instruction for your dev/agent.
