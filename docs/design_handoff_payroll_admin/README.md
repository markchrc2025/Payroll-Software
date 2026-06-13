# Handoff: Sentire Payroll — Tenant Admin (Web)

## Overview
Sentire Payroll is a warm, document-style **HRIS + Payroll** web app for the Philippine market
(₱ currency; SSS / PhilHealth / Pag-IBIG / TIN statutory IDs). This bundle is the **tenant-admin
console**: a left-sidebar shell with a topbar and a set of full-page modules (Dashboard,
Employees, Departments, Payroll Runs, etc.) plus modal drawers and a multi-step **Add Employee**
wizard.

This handoff focuses on two recently finalized pieces of work, with full documentation of the
shell and the Add Employee form so a developer can rebuild them faithfully:

1. **Sidebar cleanup + collapse/expand** — removed the redundant "Company & Branding" nav item
   (it is reachable from the avatar dropdown's *Company settings*) and added a collapse/expand
   control that turns the sidebar into a 76px icon rail (state persisted to `localStorage`).
2. **Add Employee form rebuild** — the wizard's field schema was rebuilt to capture the full
   employee record (Personal, Government IDs, Job, Salary, Family, Contact, Health, Directory,
   Others) while keeping the existing wizard UI.

## About the Design Files
The files in this bundle are **design references created in HTML/React (via in-browser Babel)** —
prototypes that demonstrate the intended look, layout, copy, and behavior. They are **not
production code to copy verbatim.** The task is to **recreate these designs in the target
codebase's existing environment** (React, Vue, Angular, etc.) using its established component
library, routing, form layer, and state management. If no front-end environment exists yet,
choose an appropriate framework and implement the designs there.

The prototype loads React 18 + Babel from a CDN and stitches several `text/babel` script files
together via a shared `window` namespace. In a real app you would replace that with proper
modules/components, a real router, and a real data layer — the prototype's `window.PA` mock data
(`padmin-data.jsx`) stands in for API responses.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, and interactions are final. Rebuild
the UI to match pixel-for-pixel using your codebase's primitives. Exact token values are in
**Design Tokens** below and at the top of `Sentire Payroll Admin.html` (`:root` block).

---

## Screens / Views

### 1. App Shell (`padmin-shell.jsx`)
**Layout** — CSS grid, two columns: `grid-template-columns: 266px 1fr` (sidebar | main), full
viewport height. When the sidebar is collapsed the first column becomes `76px` (applied via
`.pa-app:has(.pa-side.is-collapsed)`).

**Sidebar (`.pa-side`)** — vertical flex column, `padding: 18px 14px 14px`, dark espresso gradient
background `linear-gradient(168deg, #2E241C, #1f1813)`, text `#e9e2d8`. (A light "paper" variant
exists, toggled by `data-side="paper"` on `.pa-app`.) Top to bottom:
- **Brand block** — 40×40 rounded tile (11px radius) holding the Sentire "Nexus" mark, then a
  two-line label: **Sentire Payroll** / *HRIS & Payroll*.
- **Company switcher (`.pa-co`)** — pill button: 34×34 accent tile with company initials, company
  name + plan, and a swap icon; opens the "switch company" drawer.
- **Nav (`.pa-nav`)** — collapsible groups. Group labels are 10px/700 uppercase, tracking `.08em`,
  color `#8a7e6f`. Items (`.pa-navitem`) are 13.5px/500, `color:#cfc6ba`, `padding:9px 12px`,
  `border-radius:9px`, with an 18px leading icon. **Active item**: background `--acc` (#E8693A),
  white text, `box-shadow: 0 6px 16px -8px rgba(232,105,58,.8)`. Hover: `rgba(255,255,255,.07)`.
  A "New" pill (`.pa-new`) tags new modules (AI Assistant, Analytics).
  - Only the active group + "Overview" are open by default; clicking a group label
    (`.pa-navlabel`) toggles it. A small accent dot appears on a collapsed group that contains the
    active item.

**Collapse/expand control (`.pa-side-toggle`)** — a 26px circular button pinned to the sidebar's
right edge (`position:absolute; top:28px; right:-13px; z-index:20`), white fill, 1px `--line`
border, soft shadow. Icon is a left chevron when expanded, right chevron when collapsed. Hover:
icon + border turn `--acc`, `transform: scale(1.08)`.
- **Collapsed (icon-rail) behavior**: sidebar width → 76px; brand text, company text/swap, and
  group labels hide; **all** nav items render as centered icons (groups no longer collapse) with
  the label exposed as a native `title` tooltip; the active item keeps its accent highlight.
- **Persistence**: collapsed state is read/written to `localStorage["pa-side-collapsed"]`
  (`"1"`/`"0"`).

**Nav groups & items** (id, label, icon) — the live structure after the cleanup:
- **Overview**: Dashboard
- **Workforce**: Employees, Departments, Branches, Locations, Positions, Assets
- **HR Ops**: Incidents, Movements, Profile Requests, Claims, Announcements
- **Talent**: Recruitment
- **Time**: Time & Attendance, Leave
- **Payroll**: Payroll Runs, Pay Components, Loans, Bank Files
- **Compliance**: Gov't Reports, Analytics *(New)*
- **Settings**: Pay Rules, Premium Rates, Holiday Calendar, Leave Policies, Roles & Permissions,
  Kiosks, AI Assistant *(New)*
  - **NOTE:** "Company & Branding" was **removed** from this group. The Branding page still exists
    and is reached via the topbar avatar menu → **Company settings**. Keep that linkage.

**Topbar (`.pa-top`)** — flex row, `padding:13px 30px`, white, 1px bottom border `--line`. Left: a
read-only search field (`.pa-topsearch`) that opens the command/search drawer, with a `⌘K` kbd
hint. Right: a notifications bell with an unread dot, and an avatar menu (`.pa-me`) showing
initials + name + role with a chevron. The avatar menu (`.pa-memenu`) lists: My profile,
**Company settings** (→ Branding page), Security, and a danger **Sign out**.

### 2. Add Employee — full-page wizard (`padmin-drawers.jsx` → `AddEmployeePage`)
**Entry** — from Employees page header (`Add Employee` primary button) and from an employee
detail page (`Edit`). Routed as page id `new-employee`.

**Layout (`.pa-wizardpage`)** — CSS grid `232px 1fr`, `gap:28px`, `max-width:968px`. Left is a
sticky vertical stepper (`.pa-vsteps`); right is the active step's `Card` + a footer button bar.
Below `1160px` the stepper collapses to a horizontal wrap and the grid becomes single-column.
- **Stepper item (`.pa-vstep`)** — number badge (or check when done) + two-line label (step name /
  sub). Current step: `.is-now` (soft-accent background `--acc-soft`, accent label). Completed
  steps are clickable to go back; future steps are disabled (forward nav only via **Continue**).
- **Footer (`.pa-formbar`)** — "Step N of 9" on the left; **Back** (if not first), **Cancel**, and
  **Continue** (or **Save employee** on the last step) on the right.
- On save, a success card (`SuccessState`) shows the created name, a summary line
  (position · department · joined date), and a definition list (Employee ID, Job type, Basic
  salary, Status), with **Add another** / **Back to Employees**.

**Form field engine (`FieldRenderer` + `FieldGrid`)** — fields render into a 2-column grid
(`.pa-fgrid`, `gap:15px`); a field with `span:2` spans both columns. Each field object is
`{ k, label, type, options?, ph?, hint?, req?, span?, rows?, add?, lines? }`.
Supported `type` values:
- `text` / `email` / `tel` / `number` / `date` — standard inputs (`.pa-input`, 40px tall).
- `select` — native dropdown with a disabled placeholder option.
- `select` + `add:true` — dropdown paired with a circular accent **+** button (`.pa-addbtn`) for
  "create a new option inline" (used on Job Position, Department, Branch, Level, Ethnicity,
  Religion, Bank, Leave Workflow, Workday, Holiday).
- `money` — text input with a `₱` prefix (`.pa-money`).
- `textarea` — multi-line (`rows`).
- `segmented` — segmented control (`.pa-segfield`).
- `toggle` — full-width labeled row with an on/off switch (`.pa-ftoggle`).
- `photo` — centered avatar tile + "Change photo" link (`.pa-fphoto`).
- `section` — a full-width uppercase subheader inside a step (`.pa-fsection`); top border separates
  sub-sections.
- `note` — a soft cream callout with a `?` badge; supports multiple `lines` (`.pa-fnote`).
- `adder` — a labeled line-item block with a **+** button and an "N/A" empty row, for repeatable
  pay items (`.pa-fadder`).
- `*` marks required (`req:true`) via the accent asterisk (`.pa-req`).

**Wizard steps & fields** (exact, in order). Required fields marked `*`.

1. **Personal** — *Identity & IDs*
   - Photo ("Change photo"); ID*; First Name*; Middle Name; Last Name*; Gender* (Female/Male/Other);
     Birth Date*; Nationality (select); National ID*; Passport; Ethnicity (select+add);
     Religion (select+add); toggle **"Allow employee to update profile by 2026-06-20"**.
2. **Government IDs** — *SSS, PhilHealth, Pag-IBIG, TIN*
   - SSS; PhilHealth; Pag-IBIG; TIN (each a text field with PH format placeholders).
3. **Job** — *Placement & terms*
   - Date Joined*; End of Probation; toggle **Time Clock Needed** (default on).
   - **Placement** section — Effective Date*; Job Position* (select+add); Line Manager (select);
     Department (select+add); Branch (select+add); Level (select+add).
   - **Employment Terms** section — Effective Date*; Job Type (Permanent…); Description (Confirmed…);
     Leave Workflow (select+add, "DEFAULT"); Workday (select+add, "DEFAULT"); Holiday (select+add,
     "DEFAULT"); Term Start; Term End.
4. **Salary** — *Pay & payment*
   - **Salary** section — Effective Date*; Basic Salary (money); Currency (PHP/USD/SGD);
     note "For hourly rate, you may use Earning."; Next Review Date; adders: **Earning**,
     **Deduction**, **Bonus**, **Statutory Contribution**.
   - **Payment** section — Bank (select+add); IBAN / Bank Account; Pay Cycle (Monthly…);
     Method (Cash…).
5. **Family** — *Spouse & children*
   - **Spouse** section — Marital Status (Single…); toggle **Spouse Working**; First/Middle/Last
     Name; Birth Date; Nationality; National ID; Passport; Ethnicity (select+add); Religion
     (select+add).
   - **Children** section — Number of Children (number, default 0).
6. **Contact** — *Web, phone, address*
   - **Web** — Email (for Employee Web Account invitation); Blog / Homepage.
   - **Phone** — Office Phone; Mobile Phone; House Phone.
   - **Address** — Address1; Address2; City; Postcode; State; Country / Region (select).
7. **Health** — *Physical & senses*
   - **Physical** — Height (cm); Weight (kg); Blood Type (A+…AB-).
   - **Vision** / **Hearing** (Left, Right; Normal/Mild/Moderate/Severe).
   - **Hand** / **Leg** (Left, Right; Normal/Limited/None).
8. **Directory** — *Access & privacy*
   - **Access Right** — Employee Role (Guest/Employee/Manager/Admin); note explaining the three
     access tiers (3 lines).
   - **Privacy Level** — Email, Blog/Homepage, Office Phone, Mobile Phone, House Phone, Address,
     In Case of Emergency, Birthday, Family Birthday, Anniversary — each a select of
     **Not Accessible / Employee / Manager**.
9. **Others** — *Remarks*
   - Remark (textarea, "Remark (2000 characters max)").

   *Field defaults* (pre-selected values): Gender=Female, Nationality=Philippines,
   Job Type=Permanent, Description=Confirmed, Leave Workflow/Workday/Holiday=DEFAULT, Currency=PHP,
   Pay Cycle=Monthly, Method=Cash, Marital Status=Single, Country=Philippines, Employee Role=Employee,
   Number of Children=0, Time Clock Needed=on, and the Privacy Levels per the screens
   (Email/Blog/Phones/Birthday/Anniversary=Employee, House Phone/Address=Not Accessible,
   In Case of Emergency=Manager).

   *Reference note:* the source screens also include a **Quick Entry** fast-path tab and a
   user-configurable **Custom Fields** tab. Quick Entry was intentionally omitted (it duplicates
   the essential fields the wizard already collects); the statutory IDs from Custom Fields are
   represented as the **Government IDs** step. Treat both as product decisions, not omissions.

### Other modules (context)
`padmin-pages-1/2/3.jsx` contain the remaining pages (Dashboard, Employees table + detail,
Departments, Payroll Runs + detail, Pay Components, Loans, Gov't Reports, Analytics, Branding,
Roles, Holiday, Claims, Recruitment, Announcements, and schema-driven add forms). They share the
same primitives (`Card`, `Btn`, `Badge`, `StatCard`, `PageHead`, tables) and are good reference for
the overall visual system, but the **focus of this handoff is the shell + Add Employee form**.

---

## Interactions & Behavior
- **Sidebar collapse**: toggles `is-collapsed` on `.pa-side`; width animates between 266px and 76px;
  state persists in `localStorage`. Collapsed items expose labels via `title` tooltips.
- **Nav groups**: click a group label to expand/collapse; the active group auto-opens on navigation.
- **Wizard nav**: Continue advances and marks the step done; completed steps are clickable to return;
  future steps are locked. Cancel returns to Employees. Save shows the success state.
- **Inline "+" on selects**: intended to open a quick "create new <entity>" affordance
  (department, position, bank, etc.). In the prototype it is a visual control; wire it to your
  create flow.
- **Adders (Earning/Deduction/Bonus/Statutory)**: "+" should add a repeatable line item; the empty
  state reads "N/A".
- **Responsive**: at ≤1160px the wizard becomes single-column and the stepper wraps horizontally;
  content grids (stats, cards) collapse to 1–2 columns.
- **Transitions**: nav/hover color changes ~.13s; group chevron rotation .18s; button hovers use a
  small `scale(1.08)`.

## State Management
- **Sidebar**: `collapsed` (persisted) and per-group `open` map. Active item derived from the
  current route (with parent mapping, e.g. `employee`→`employees`, `payrun`→`payruns`,
  `new-employee`→`employees`).
- **Add Employee**: a single `values` object (one key per field) + current `step` index + `saved`
  flag. In production, back this with your form library (React Hook Form / Formik / etc.) and your
  validation rules; submit assembles the employee record for the API.
- **Routing**: prototype uses an in-memory `{ page, param }`; replace with your router. Page ids are
  listed under Nav groups above; `new-employee` → Add Employee wizard.

## Design Tokens
From `:root` in `Sentire Payroll Admin.html`:
- **Accent**: `--acc:#E8693A`, pressed `--acc-press:#C2552F`, soft `--acc-soft:#fdeee6`
- **Ink/text**: `--ink:#2A2420`, `--muted:#6B6259`, `--muted-2:#9b9085`
- **Surfaces**: `--bg:#F6F2EC`, `--paper:#ffffff`, lines `--line:#ECE6DD`, `--line-2:#f1ece4`
- **Sidebar gradient**: `--side-1:#2E241C` → `--side-2:#1f1813`
- **Radius**: `--r:14px` (cards); inputs/buttons 9px; nav items 9px; pills 999px
- **Row padding**: `--row-py:13px` (compact density: 9px)
- **Type**: headings/UI `--font: "Instrument Sans"`; body `--body: "Hanken Grotesk"`;
  numeric/mono `--mono: "JetBrains Mono"` (Google Fonts)
- **Status badge palette** (`BADGE` map in `padmin-shell.jsx`): paired text/bg colors for Active,
  Paid, Approved, Draft, Pending, Open, Overdue, Regular, Special, etc.
- **Avatar tones**: `#E8693A, #4F9373, #3e63a0, #A0627D, #C7913D, #5E7FB1` (hashed from initials)
- **Note callout** (form): bg `#fbf7e9`, border `#ece2c0`, left bar `--acc`.

Typical sizes: card title 19px/600; field label 12.5px/600; input text 13.5px; nav item 13.5px;
group label 10px/700 uppercase. (Web app scale — not slide/print scale.)

## Assets
- `padmin-assets/sentire-app-icon.svg` — favicon/app icon.
- The **Sentire "Nexus" mark** is drawn inline as an SVG in `padmin-shell.jsx` (`SentireMark`) — a
  4-node constellation with an accent center dot; recreate as a component/SVG in your app.
- All other icons are inline SVG paths in the `ICONS` map (`padmin-shell.jsx`), stroke 1.7,
  24×24 viewBox — map these to your icon library or keep as inline SVGs.
- Fonts: Instrument Sans, Hanken Grotesk, JetBrains Mono (Google Fonts).
- No raster images; currency is Philippine peso (₱).

## Files
- `Sentire Payroll Admin.html` — entry point: design tokens (`:root`), **all component CSS**,
  script load order, the root `App` (route table + Tweaks panel).
- `padmin-shell.jsx` — `SentireMark`, `PIcon` + `ICONS`, `NAV_GROUPS`, **`Sidebar`** (collapse),
  **`Topbar`** (avatar menu → Company settings), and shared primitives (`PageHead`, `Badge`,
  `StatCard`, `Card`, `Btn`, `Toggle`, `Drawer`, `EmpAvatar`, `Field`, `Select`, `GenericPage`).
- `padmin-drawers.jsx` — form primitives (`FieldRenderer`, `FieldGrid`, `useForm`), **`EMP_STEPS`**
  (the Add Employee schema) + **`AddEmployeePage`**, schema-driven add forms, and all modal drawers.
- `padmin-pages-1.jsx` / `padmin-pages-2.jsx` / `padmin-pages-3.jsx` — the module pages + page
  registry (`window.PAGES`).
- `padmin-data.jsx` — mock data (`window.PA`): company, session, employees, departments, branches,
  positions, etc. Replace with real API data.
- `padmin-assets/sentire-app-icon.svg` — app icon.

### How the prototype boots (for reference only)
`Sentire Payroll Admin.html` loads React 18 + Babel, then the scripts in order: `padmin-data` →
`padmin-shell` → `padmin-pages-1/2/3` → `padmin-drawers`, each exporting to `window`. The root
`App` renders `<Sidebar/>` + `<Topbar/>` + the active page from `window.PAGES`. In production,
replace the `window` stitching with real modules, the mock `window.PA` with your data layer, and
the in-memory route with your router.
