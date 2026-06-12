# Handoff: Sentire Payroll — Employee Self-Service (ESS)

## Overview
ESS is the **employee-facing mobile web app** for tenants of Sentire Payroll. Employees
sign in (PIN / password / biometric) and self-serve: view payslips & tax forms, **clock
in/out with a selfie**, request leave, check attendance, and manage their profile.

**Form factor:** responsive **mobile web** first (runs in any phone browser), built so it
can later be wrapped as an installable mobile app. The prototype shows it inside a mobile
**browser frame** by default; a Tweak flips to an iOS device frame to preview the future
native build. Neither frame is part of the product — your app renders full-bleed in the
viewport.

## About the design files
These are **design references in HTML/React-via-Babel** — a runnable prototype, not
production code. Recreate the screens in your real stack (React Native / Expo for the
future app, or your responsive web stack) using your routing, auth, data, and components.
The in-browser Babel + `window` globals are prototype plumbing — don't carry them over.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and interaction states are final. Match
the tokens below; wire screens to your real data and APIs.

---

## Design tokens

### Color (Sentire Payroll)
| Token | Hex | Use |
|---|---|---|
| **Accent** | `#E8693A` | Primary — clock hero, buttons, active tab, PIN dots, links, focus. (Brand-orange; the Payroll product accent is sage `#4F9373` — selectable via a Tweak, but orange is the current default.) |
| Accent press | `color-mix(accent 76% + black)` | pressed |
| Accent soft | `color-mix(accent 13% + white)` | chips, soft fills, key press |
| Ink | `#2A2420` | primary text |
| Muted | `#6B6259` | secondary text |
| Muted-2 | `#9b9085` | meta, placeholders |
| App bg | `#F4F1EA` | screen background (warm) |
| Paper | `#FFFFFF` | cards, inputs |
| Line | `#ECE6DD` | borders/dividers |
| Status green | `#1f7a4d` / `#e7f4ec` | Approved / Paid / On time / Present |
| Status amber | `#9a6a12` / `#fbf1dc` | Pending / Late |
| Status red | `#b23b34` / `#fbe9e7` | Rejected / Absent / errors |
| Leave colors | VL `#4F9373` · SL `#3E63A0` · EL `#C2552F` | leave-type rings |

The accent derives `--e-acc-press` / `--e-acc-soft` via CSS `color-mix`, so theming from a
single hex works. Leave-type colors are semantic (fixed), not themed.

### Typography
- **UI / numbers / headings:** `Instrument Sans` (400–700).
- **Body / meta:** `Hanken Grotesk` (400–600).
- Sizes: clock-hero time 46px/700 · payslip net 38px/700 · screen title (root) 18px, big numbers 21–26px · card titles 13.5–15px/600 · body 13–14.5px · section labels 13px/600 uppercase.

### Shape & spacing
- Radii: cards `16px`, hero/viewfinder `20–24px`, buttons/inputs `12–13px`, chips/pills `999px`, keypad keys circular.
- Screen content padding 16px; card padding 12–18px; stack gap 12px.
- **Touch targets ≥ 44px** (inputs 48px, primary buttons 50px, keypad keys 62px, shutter 72px).

### Iconography
Single-weight line icons, `stroke-width 1.8`, 24-grid (see `ess-ui.jsx` `E_ICONS`). The
brand mark is the **Nexus** logo (`assets/sentire-mark.svg`; component `NexusMark` in
`nexus-refined.jsx`).

---

## App shell (`ess-app.jsx`)
- **Top bar** — three variants: **Home** (greeting "Good {morning/afternoon/evening}, {first}" + company + notification bell), **tab root** (large title), **sub-screen** (back chevron + centered title).
- **Body** — scrollable; sub-screens slide in (transform only — never animate from `opacity:0`, so content is visible at first paint / SSR).
- **Bottom tab nav** — 5 tabs: **Home, Pay, Leave, Time, Profile** (active = accent).
- **Routing** — a simple stack: tab roots + pushed sub-views (`payslip`, `leaveRequest`, `request:{ot|reimb|coe}`, `settings`, `announcement`, `clock:{in|out}`). Back pops; switching tabs resets. A shared `clockedIn` flag lives at app level so clocking in updates Home.

---

## Screens

### Login (`ESSLogin` in `ess-clock-login.jsx`)
Returning-employee unlock. **Brand lockup = Nexus mark + "Sentire Payroll"** (Payroll in
accent). Avatar + "Hi, {first}" + company.
- **PIN (default):** 6 dots + numeric keypad (1–9, **Face ID** key, 0, **backspace**). Wrong PIN → dots shake + "Incorrect PIN". Completing 6 digits → success ("Welcome back / Opening your workspace…").
- **Biometric:** Face ID key → scanning animation → success.
- **Password:** "Use password instead" → email (prefilled) + password (show/hide) + Sign in; "Use PIN instead" flips back.
- Replace the demo logic with real auth; PIN/biometric/password are three real methods to support.

### Home (`HomeScreen`)
- **Front widget = Clock in/out hero** (accent gradient): live current time, date, shift, status pill ("Not clocked in" / "Clocked in"), and a big **Clock In / Clock Out** button → opens the selfie clock flow. "Selfie verification required."
- **Payday card** (secondary): next payday date, est. net, countdown → opens latest payslip.
- **Quick actions:** Request leave · File OT · Reimburse · COE.
- **Leave balance** rings (VL/SL/EL) → Leave tab.
- **Announcements** list → announcement detail.
- **Recent payslips** → payslip detail.

### Clock in/out (`ClockScreen`) — **with Selfie**
Sub-screen, 3 steps: **camera → review → done**.
- **Camera:** geo + live-time banner; a **selfie viewfinder** (face-guide oval, corner brackets, scan line, location+time watermark); a **shutter** button; note that the selfie confirms identity and is attached to the punch.
- **Review:** frozen frame with a check + "Retake" / "Confirm".
- **Done:** success — "Clocked in/out · {time}", date, "selfie verified at {location}", a **Selfie-captured** card (location, time, On-time chip), Done.
- Production: capture a real selfie (front camera), attach geolocation + timestamp, store the punch + photo, and reflect state. Wire `setClockedIn`.

### Pay (`PayScreen`, `PayslipDetail`)
- Segmented **Payslips / Tax forms**. Payslips: YTD net + tax summary, list of payslips (incl. 13th-month) → detail. Tax forms: BIR 2316 list (download).
- **Payslip detail:** big net pay + Paid chip; **Earnings** (basic, OT w/ hrs, allowance → gross) and **Deductions** (SSS, PhilHealth, Pag-IBIG, withholding tax, tardiness → total) breakdown; net summary; deposited-to note; Download PDF.

### Leave (`LeaveScreen`, `LeaveRequest`)
- Balance cards w/ rings (used/total); **Request leave** button.
- Request history (type, dates, days, status chip, reason).
- **Request form:** leave-type chips, From/To, reason, remaining-balance note, Submit → success ("sent to {manager} for approval").

### Time (`TimeScreen`)
- Clock card (current time, shift, **Clock in/out** toggle, status).
- Period stats: Present / Late / Absent / OT hrs.
- Attendance log (day, in→out, status chip; rest days).

### Profile (`ProfileScreen`, `SettingsScreen`)
- Header (avatar, name, position, Regular + employee-ID chips).
- **Personal** (email, mobile, address, birthdate), **Employment** (company, position, manager, hire date + tenure), **Pay & government** (bank acct, SSS, PhilHealth, Pag-IBIG, TIN).
- Links: **Settings**, **Request certificate (COE)**. Log out. Version line.
- **Settings:** notification toggles (payslip ready, leave updates, announcements), security (biometric unlock, change password), appearance (dark mode).

### Requests (`RequestScreen`) & Announcement (`AnnouncementScreen`)
- Generic request form for OT / Reimbursement / COE → success.
- Announcement detail (tag, title, body, sender).

---

## Interactions & behavior
- Bottom-nav switches tabs; cards/rows push detail screens; back pops; scroll resets on nav.
- Forms validate and show success states; the clock flow is a small state machine.
- Live clock updates every second (`useNow` in `ess-ui.jsx`).
- Respect `prefers-reduced-motion` (disable slide/scan/shake). Keep entrance animations transform-only so content is visible without JS / before animation.
- All buttons/links in the prototype are wired to local handlers — connect to real flows/APIs.

## State per concern
Login: `mode(pin|password)`, `pin`, `status(idle|scanning|error|success)`. Clock:
`step(camera|review|done)`, captured time. App: route stack + `clockedIn`. Screens hold
local form state. Wire all of these to your real auth, payroll, leave, and attendance APIs.

## Data model (retain employee info)
An employee carries: name, employee ID, position, department, company, hire date/tenure,
employment type, manager, email, phone, address, birthdate, monthly/semi-monthly salary,
bank account, and government IDs (SSS, PhilHealth, Pag-IBIG, TIN); with relations to
payslips (earnings/deductions lines), tax forms, leave balances + requests, attendance
log, and clock punches (time + geo + selfie). Keep all of these.

> ⚠️ **Do NOT copy the mock data** in `ess-data.jsx` (employee "Maria Santos", amounts,
> dates, etc.) — it's fabricated. Use it only as a **schema hint** and wire to real data.

## Production notes
- **PH payroll context:** ₱ currency, semi-monthly cutoffs, 13th-month pay, BIR 2316, SSS/PhilHealth/Pag-IBIG. Keep this for Philippine tenants; parameterize for others.
- **Auth:** implement real PIN, biometric (WebAuthn / native biometrics), and password; enforce your security policy. Remove demo shortcuts.
- **Selfie clock:** real camera capture + geolocation + timestamp; store and show verification.
- **Logo:** use `assets/sentire-mark.svg` (light) / `-dark.svg`; render the wordmark as live Instrument Sans text, not an image.
- **Accessibility:** label inputs, `aria` on icon buttons, visible focus, 44px+ targets.

## Files in this bundle
- `Sentire Payroll ESS.html` — runnable prototype + **all CSS (token/spacing source of truth)** + the browser/app frame + Tweaks.
- `ess-app.jsx` — shell: top bar, bottom nav, stack routing, shared clock state.
- `ess-screens-a.jsx` — Home, Pay, Payslip detail. `ess-screens-b.jsx` — Leave, Leave request, Time, Profile, Settings, Announcement, Request.
- `ess-clock-login.jsx` — **Clock in/out (selfie)** + **PIN/password/biometric login**.
- `ess-ui.jsx` — icons, primitives (cards, chips, rings, buttons), `useNow`/`fmtTime`.
- `ess-data.jsx` — **MOCK DATA ONLY. Do not copy. Schema hint only.**
- `nexus-refined.jsx` — Nexus logo component. `assets/*.svg` — production logos.
- `ios-frame.jsx` — prototype device-frame scaffold only (**ignore for implementation**).
- `REPLICATION_PROMPT.md` — paste-ready instruction for your dev/agent.
