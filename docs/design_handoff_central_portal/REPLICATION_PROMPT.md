# Replication prompt — Sentire Central Portal UI

Paste the text below to Claude Code (or your dev) once this folder is in your repo.

---

You're restyling our **Central Portal** (super-admin console for the Sentire Payroll
platform). In this folder is a hi-fi design reference: `Sentire Central Portal.html`
plus `central-shell.jsx`, `central-pages.jsx`, `central-data.jsx`, and `assets/`.
Full spec is in `README.md` — read it first.

## What to replicate
Recreate the **UI only** in our existing app and stack:
- the **color palette** and **typography** (Instrument Sans + Hanken Grotesk + JetBrains
  Mono), exactly as tokenized in the README / the HTML's `<style>` block;
- the **component style** — sidebar, top bar, stat cards, tables, badges/pills, tabs,
  filter bars, charts, feeds, toggles, buttons (orange primary / ghost), card shapes,
  radii, spacing and hover/active states;
- the **sidebar menu and navigation structure**: Dashboard, Tenants, Billing, Support,
  Analytics, Audit log, Settings — with the active-item treatment (orange-soft bg, left
  bar, chevron), the "New" pills, the brand tile (Nexus mark), and the user footer;
- the **Tenant detail drill-down** (breadcrumb, header with actions, info cards, and the
  Overview / Billing / Subscription history / Support / Activity tabs).

Apply this styling across **all** screens so the portal looks like one cohesive product.

## What NOT to do
- **Do NOT copy any of the mock data.** Everything in `central-data.jsx` (companies,
  people, emails, invoice numbers, ticket text, amounts, metrics, dates) is fabricated
  placeholder content. Ignore the values entirely — wire every screen to our **real**
  data sources instead. `central-data.jsx` is useful **only** as a shape/schema hint.
- Do not reproduce the in-browser Babel / `window`-global setup; build proper components.

## Data & schema
- Where a screen shows a field or metric we **don't have yet** (e.g. account-health score,
  MRR, net revenue retention, churn, audit-log events, subscription-history timeline,
  trial-end date, region, primary contact), **create the new data — add the fields,
  columns, or schema needed** to back it. Prefer extending our existing models; add new
  tables/endpoints where there's no home for it (e.g. an `audit_events` log, a
  `subscription_events` history).
- **Retain the full tenant information model.** A tenant must keep: company/legal name,
  workspace slug/ID, plan, status (Active / Trialing / Past due / Cancelled), employee
  count, MRR, customer-since date, account-health, region, primary contact/owner,
  trial-end (when trialing), and its relations to invoices, subscription events, and
  support tickets. Don't drop any of these — only add.

## Result
Same look, our data. The portal should be visually indistinguishable from the reference,
but every number, name and record comes from our backend — with new fields/schemas added
wherever the design introduces information we didn't previously store.
