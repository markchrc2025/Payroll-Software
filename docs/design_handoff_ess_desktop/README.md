# Handoff: Sentire Payroll — Employee Self-Service (ESS), Desktop Web

## Overview
Sentire Payroll ESS is the **employee-facing self-service web app** (the companion to the
tenant-admin console). It is a warm, document-style product for the Philippine market
(₱ currency; SSS / PhilHealth / Pag-IBIG / TIN government numbers). Employees use it to clock in/out
with selfie verification, view payslips and tax forms, request and track leave, review attendance,
submit their DTR (daily time record) per payroll period, and manage their profile.

This is the **desktop (browser) layout**: a centered top-nav shell (max-width 1240px) rather than the
mobile tab bar. It shares the same brand, palette, and data model as the mobile ESS.

## About the Design Files
The files in this bundle are **design references built in HTML/React (via in-browser Babel)** —
prototypes that demonstrate the intended look, layout, copy, and interactions. They are **not
production code to ship verbatim.** The task is to **recreate these designs in the target codebase's
existing environment** (React, Vue, Angular, etc.) using its component library, router, form layer,
and data fetching. If no front-end exists yet, choose an appropriate framework and implement there.

Two things to understand about how the prototype is wired (and what to ignore vs. keep):
- **Presentation scaffolding (IGNORE for the product):** `design-canvas.jsx`, `browser-window.jsx`,
  and `tweaks-panel.jsx` only exist to arrange the screens as artboards on a pannable canvas inside a
  faux browser window, plus a live "Tweaks" panel. The real product is a single app shell
  (`ESSDesktop`) rendering one screen at a time — see "How the prototype is composed" below. Do **not**
  reproduce the canvas, the browser chrome, or the tweaks panel in the real app.
- **Mock data (REPLACE):** `ess-data.jsx` (`window.ESS`) stands in for API responses. Replace with
  your real data layer.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, and interactions are final. Rebuild the
UI to match using your codebase's primitives. Token values are in the `:root`-equivalent block at the
top of `Sentire Payroll ESS Desktop.html` and summarized under **Design Tokens** below.

---

## App Shell (`ess-desktop-shell.jsx` → `ESSDesktop`)
**Frame** — full-height flex column. A sticky translucent **topbar** (`.d-top`, 62px, white at 92%
opacity with `backdrop-filter: blur(10px)`, 1px bottom border) over a scrollable **main** region.
All content is centered in a `max-width: 1240px` container with `28px` side padding.

**Topbar (`.d-top-in`)**, left → right:
- **Brand** — the Sentire "Nexus" mark (inline SVG, `SentireMark`) + wordmark **Sentire Payroll**
  (the word "Payroll" is accent-colored).
- **Primary nav (`.d-nav`)** — text+icon links: **Home**, **Pay**, **Leave**, **Time**. Active link
  uses soft-accent background `--e-acc-soft` + accent-pressed text; hover is a warm `#f5f1ea`.
- **Right cluster (`.d-topright`)** — a notifications **bell** (38px rounded-square button with an
  accent unread dot) and an **avatar menu button** (`.d-me`) showing initials + employee name + ID
  with a chevron; clicking it opens the **Profile** page (the button highlights when Profile is
  active).

**Routing** — in-memory `{ page, param }` with a `DNav` context exposing `go(page, param)`,
`openModal(kind)`, `closeModal()`, plus `clockedIn` / `setClockedIn`. Page registry:
`dashboard → DDashboard`, `pay → DPay`, `leave → DLeave`, `time → DTime`, `profile → DProfile`,
`dtr → DDTRPeriods`, `dtr-detail → DDTRDetail`. Replace with your router; keep these routes.

**Global modals** — rendered by the shell on top of the page: **clock-in / clock-out**
(`DClockModal`, selfie verification) and **leave request** (`DLeaveModal`). Page content re-mounts on
route change (keyed by `page:param`) with a subtle fade/translate-in (`@keyframes d-fade`, .25s).

---

## Screens / Views

### Sign in (`ess-desktop-login.jsx` → `DLogin`) — 2 artboards (`step="id"`, `step="pin"`)
A centered single-column card on the warm background, with brand lockup above and a small footer
(© 2026 Sentire · Privacy · Help). Three steps:
1. **`id`** — "Sign in" card: **Company code** field (building icon, e.g. `SENTIREPAYROLL`) and
   **Employee number** field (user icon, e.g. `EMP-00412`); inputs auto-uppercase. Primary
   **Continue** button. Footer line "New employee? · Activate your account".
2. **`pin`** — "Enter your PIN" card: shows who is signing in, then a **6-box PIN entry**
   (`DPinBoxes`) backed by a hidden numeric input; filled boxes show a dot, the next box is
   highlighted. A wrong PIN (`000000` in the prototype) shakes/clears with an error message.
   Links: "Forgot PIN?" and "Use a different account". On a correct 6-digit PIN → success state.
3. **`ok`** — success card: check icon, "Welcome back, {first}", "Opening your workspace…".

### Home / Dashboard (`DDashboard`, screens-a)
**Page head** — "Good {morning/afternoon/evening}, {first} 👋" + "{company} · {today}".
**Two-column grid** (`.d-cols-main`, main + side):
- **Main column**
  - **Clock hero (`.d-clockhero`)** — a rich card showing today's date, a "Clocked in / Not clocked
    in" pill, the **live current time** (updates every second), the shift schedule, and a large
    **Clock In / Clock Out** button (camera icon) noting "Selfie verification required". The button
    opens the clock modal.
  - **Quick actions (`.d-qa-row`)** — four tiles: Request leave (→ leave modal), File overtime
    (→ Time), Reimbursement (→ Pay), Request COE (→ Profile), each with a toned icon.
  - **Recent payslips** — a table card (Pay period · Paid · Status · Net pay · chevron); rows link to
    the payslip detail. "See all" → Pay.
- **Side column**
  - **Next payday card (`.e-payday`)** — wallet icon, "Next payday · {date}", estimated net, and an
    "in N days" pill; links to the latest payslip.
  - **Leave balance (`.e-balcard`)** — three progress **rings** (VL/SL/EL) with remaining counts;
    links to Leave.
  - **Announcements** — cards with a category chip, relative date, title, and body.

### Pay (`DPay`, screens-a)
**Page head** — "Pay" + a segmented control **Payslips / Tax forms**.
- **Payslips tab** — two-pane (`.d-paygrid`): left is a **YTD summary** (Net pay · YTD, Tax withheld ·
  YTD) above a scrollable **payslip list** (each row: icon, period, "Paid {date}", net amount;
  selected row highlighted; the 13th-month item uses a distinct icon/treatment). Right is the
  **payslip detail card** (`.d-psdetail`): kicker + big **net pay**, "Paid {date} · {status}", a
  **Download PDF** ghost button, then two columns — **Earnings** (Basic pay, Overtime w/ hours,
  Allowance) and **Deductions** (SSS, PhilHealth, Pag-IBIG, Withholding tax, Tardiness) each with a
  subtotal — then a **Net pay** total row and a "Deposited to {bank} {acct}" note.
- **Tax forms tab** — a list of downloadable **BIR Form 2316** certificates by year (icon, name·year,
  description, download button).

### Leave (`DLeave` + `DLeaveModal`, screens-b)
**Page head** — "Leave" + a primary **Request leave** button (opens the modal).
- **Balance cards (`.d-leavebals`)** — one per leave type (Vacation/Sick/Emergency): a progress ring
  with remaining count, the type name, and "{used} used · {total} total".
- **Request history** — table (Type · Dates · Days · Reason · Status), status as a colored chip
  (Approved=green, Pending=amber, Rejected=red).
- **Request leave modal (`DLeaveModal`)** — leave-type chips, **From / To** date fields (calendar
  icon), a **Reason** textarea, a "{N} days remaining for {type}" note, and Cancel / **Submit
  request**. On submit → success state ("sent to {manager} for approval").

### Time & attendance (`DTime`, screens-b)
**Page head** — "Time & attendance" + "{today} · Shift {schedule}" and a primary **Submit DTR**
button (→ DTR flow).
**Two-column grid (`.d-timegrid`):**
- **Left** — a **clock card** (live time, day, schedule, a **Clock in / Clock out** button, and a
  status line) above four **period stat** cards: Present, Late (amber), Absent, OT hrs (sage).
- **Right** — the **attendance log** table (Date · Time in · Time out · Status); status is a colored
  chip ("Present", "Late · OT 1.5h", "Rest day", etc.).

### Submit DTR — period selection (`DDTRPeriods`, dtr)
**Page head** — "Submit DTR" + a ghost **Back to Time** button.
- An **"open period" banner (`.d-dtr-due`)** when a period is open for submission, with a **Review &
  submit** button and the due/pay dates.
- A **payroll-periods table** (Period [+ "Current" tag] · Group · Pay date · Days · OT hrs · DTR
  status · chevron); rows open the period detail. Status chips: Open=amber, Submitted=sage,
  Approved=green, Locked=slate. Footer note: submitted DTRs route to {manager}.

### DTR review & submit (`DDTRDetail`, dtr)
**Page head** — "DTR · {period}" + "{group} · Pay date {date} · {status chip}" and a ghost **All
periods** button.
**Two-column grid:**
- **Left** — **Period summary** stat cards (Days present, Tardiness in minutes, Absent, Overtime
  hours). Then either a **certify + submit** card (a checkbox "I certify… true and accurate record…",
  a disabled-until-checked **Submit DTR** button, and a "Due {date} · goes to {manager}" note) or, if
  already submitted/approved, a **success card** ("DTR submitted/approved").
- **Right** — the full **daily time record** table (Date · Time in · Time out · OT hrs · Tardiness ·
  Status) with a footer hint about filing time-correction requests.

### Profile (`DProfile`, screens-b)
**Page head** — "Profile" + "Personal records, employment, and government numbers".
**Two-column grid (`.d-profilegrid`):**
- **Left** — an **ID card** (large avatar, name, position · dept, employment + ID chips); an
  **employment card** (Company, Manager, Date hired, Tenure); a **Log out** button; an app version
  line.
- **Right** — a **Personal** card (Email, Mobile, Address, Birthdate, Civil status) and a **Pay &
  government** card (Bank account, SSS, PhilHealth, Pag-IBIG, TIN). Rows use the `e-prow` pattern
  (leading icon · label · value).

### Clock in/out modal (`DClockModal`, shell)
A centered modal for **selfie verification**. Header "Clock in/out · selfie verification", a **geo +
timestamp** line ("Acme Foods HQ · {time}"), a camera **viewfinder** with corner brackets, a scanning
animation, and a location/timestamp watermark. Flow: **camera → review → done**. Capture freezes a
timestamp; Confirm records the punch (toggles `clockedIn`) and shows a success state.

---

## Interactions & Behavior
- **Live clock** — `useNow()` ticks every second; the dashboard/time/clock-modal times update live.
- **Clock in/out** — opens `DClockModal`; Capture → Review → Confirm flips `clockedIn` globally, so
  the dashboard hero and Time card reflect the new state.
- **Navigation** — top-nav links and in-page links/rows call `nav.go(page, param?)`; tables of
  payslips / periods are row-clickable. Avatar → Profile.
- **Segmented controls & tabs** — Pay (Payslips / Tax forms) and similar use local state.
- **Modals** — overlay click-out and an explicit close (×) both dismiss; success states gate on a
  **Done** button. Leave request and DTR submit show a confirmation success state rather than
  navigating away.
- **DTR submit** — gated behind a certification checkbox; pre-submitted/approved periods render
  read-only success cards.
- **PIN entry** — 6 boxes backed by a hidden input; full length auto-validates with an error shake on
  failure.
- **Transitions** — page re-mount fade (.25s); link/hover color changes ~.12s; scan animation in the
  viewfinder.

## State Management
- **Shell**: `route {page, param}`, `openModal`, `clockedIn` (lifted so multiple screens reflect punch
  state). Replace the in-memory route with your router; lift `clockedIn` to your global/session store.
- **Per-screen local state**: selected payslip, active tab, leave-form fields, DTR certify/submitted,
  login step/pin. Back forms with your form library and real validation.
- **Data**: everything comes from `window.ESS` (mock). Map each structure to your API (see Files).

## Design Tokens
From the `.d-app, .d-login` token block at the top of `Sentire Payroll ESS Desktop.html`:
- **Accent**: `--e-acc:#E8693A`; pressed = `color-mix(--e-acc 76%, #000)`; soft =
  `color-mix(--e-acc 12%, #fff)`.
- **Ink/text**: `--e-ink:#2A2420`, `--e-muted:#6B6259`, `--e-muted2:#9b9085`.
- **Surfaces**: `--e-bg:#F4F1EA`, `--e-paper:#ffffff`, lines `--e-line:#ECE6DD`. Page bg behind the
  app frame: `#efeae2`.
- **Status/chip tones** (`E_TONES` in `ess-ui.jsx`): green `#1f7a4d`/`#e7f4ec`, amber
  `#9a6a12`/`#fbf1dc`, red `#b23b34`/`#fbe9e7`, slate `#6b6259`/`#efeae3`, sage `#3E7A5E`/`#e9f2ed`.
  Status→tone map: Approved/Paid/On time/Present=green, Pending/Late=amber, Rejected/Absent=red.
- **Leave ring colors**: VL `#4F9373`, SL `#3E63A0`, EL `#C2552F`.
- **Radius**: cards ~14–16px; nav links 10px; bell 11px; chips/pills 999px. **Container**: max-width
  1240px, 28px gutters. **Base font size**: 14px.
- **Type**: UI/headings/numerics **Instrument Sans**; body **Hanken Grotesk** (Google Fonts). No mono
  face in ESS — numeric cells use Instrument Sans (`.d-num`, `.d-num-cell`).

## Assets
- **Sentire "Nexus" mark** — inline SVG (`SentireMark` in `ess-desktop-shell.jsx`): a 4-node
  constellation with an accent center dot. Recreate as a component/SVG.
- **Icons** — inline SVG paths in `E_ICONS` (`ess-ui.jsx`), 24-grid, stroke 1.8. Map to your icon
  library or keep as inline SVGs.
- **Fonts** — Instrument Sans, Hanken Grotesk (Google Fonts).
- No raster images; the selfie viewfinder is a pure-CSS placeholder (wire to a real camera/WebRTC in
  production). Currency is Philippine peso (₱), formatted via `peso()` / `peso0()` in `ess-data.jsx`.

## Files
**Product (rebuild these):**
- `Sentire Payroll ESS Desktop.html` — design tokens + **all component CSS** (the `.d-*` and `.e-*`
  classes), font links, script load order, and the canvas wiring at the bottom. The CSS here is the
  source of truth for spacing/sizes.
- `ess-desktop-shell.jsx` — `SentireMark`, `DNav` context, top-nav items, page registry, **`ESSDesktop`**
  shell, and the **clock-in/out selfie modal** (`DClockModal`).
- `ess-desktop-login.jsx` — **`DLogin`** sign-in flow (company code + employee no → 6-digit PIN → ok).
- `ess-desktop-screens-a.jsx` — **`DDashboard`** (Home) and **`DPay`** (payslips + tax forms).
- `ess-desktop-screens-b.jsx` — **`DLeave`** + **`DLeaveModal`**, **`DTime`**, **`DProfile`**.
- `ess-desktop-dtr.jsx` — **`DDTRPeriods`** (period selection) and **`DDTRDetail`** (review & submit).
- `ess-ui.jsx` — shared primitives: `EIcon` (+ icon set), `ECard`, `ESection`, `EChip`/`EStatus`,
  `EBtn`, `ERing` (progress ring), `EAvatar`, `useNow`/`fmtTime`. These are the building blocks to
  port to your component library.
- `ess-data.jsx` — mock data (`window.ESS`): `EMPLOYEE`, `PAYDAY`, `PAYSLIPS` (+ `payslip()` builder),
  `TAXFORMS`, `LEAVE_BAL`, `LEAVE_HISTORY`, `ATTENDANCE`, `DTR_PERIODS`, `ANNOUNCEMENTS`,
  `REQUEST_TYPES`. **Replace with your API.**

**Presentation scaffolding (do NOT rebuild — present only):**
- `design-canvas.jsx`, `browser-window.jsx`, `tweaks-panel.jsx` — arrange the screens as artboards on
  a pannable canvas inside faux browser chrome, with a live tweak panel. Included so the prototype
  runs; none of it is part of the product.

### How the prototype is composed (for reference only)
The HTML loads React 18 + Babel, then the scaffolding and `ess-*` scripts, each exporting to
`window`. At the bottom, a `<DesignCanvas>` lays out one `<DCArtboard>` per screen — Sign in, Sign in ·
PIN, Home, Clock in · Selfie, Pay · payslip detail, Leave, Request leave · modal, Time · attendance,
Submit DTR · select period, DTR · review & submit, Profile — each wrapped in a browser frame and
rendering either `<DLogin/>` or `<DScreen page=… param=… modal=…/>` (which mounts the `ESSDesktop`
shell). **In production, drop the canvas/frame/tweaks entirely**: render `ESSDesktop` as the app,
replace the in-memory route with your router, and replace `window.ESS` with your data layer.
