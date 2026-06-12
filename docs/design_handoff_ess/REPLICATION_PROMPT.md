# Replication prompt — Sentire Payroll ESS (Employee Self-Service)

Paste the text below to Claude Code once this folder is in your repo.

---

You're building our **Employee Self-Service (ESS)** app for Sentire Payroll — the
employee-facing mobile experience for tenant staff. In this folder is a hi-fi design
reference: `Sentire Payroll ESS.html` plus `ess-*.jsx`, `nexus-refined.jsx`, and
`assets/`. The full spec is in `README.md` — **read it first**.

## What to replicate
Recreate the **UI and behavior** in our stack (treat it as **mobile-web first**, built so
it can be wrapped as an installable app later — if we're using React Native/Expo for the
native build, target that; otherwise our responsive web stack):
- the **color palette, typography** (Instrument Sans + Hanken Grotesk), spacing, radii, and component styles exactly as tokenized in the README / the HTML `<style>` block;
- the **app shell**: greeting/title/back top-bar variants, the 5-tab bottom nav (Home, Pay, Leave, Time, Profile), and the push/pop sub-screen routing;
- **all screens**: Login (PIN + password + biometric), Home (with the **clock in/out hero** as the front widget + payday card + quick actions + leave rings + announcements + recent payslips), Pay + Payslip detail, Leave + Leave request, Time/attendance, Profile + Settings, the **clock in/out flow with selfie capture**, requests, and announcements;
- the interaction details: live clock, form validation + success states, the clock-flow state machine, the shared "clocked in" state, and transform-only entrance animations (content must be visible before/without JS).

## What NOT to do
- **Do NOT copy any mock data** in `ess-data.jsx` (employee "Maria Santos", payslip amounts, dates, IDs, announcements). It's fabricated placeholder content — wire every screen to our **real** data/APIs. Use `ess-data.jsx` only as a **schema hint**.
- Don't reproduce the in-browser Babel / `window`-global setup, the design-canvas, or the browser/iOS device frames — those are prototype scaffolding. Build proper components rendering full-bleed in the viewport.

## Data & schema
- Where a screen needs data we don't store yet (account selfie punches with geo+timestamp, attendance log, leave balances/requests, YTD pay/tax, tax forms, announcements), **create the fields/tables/endpoints** to back it. Prefer extending existing models; add new ones where there's no home (e.g. `clock_punches` with selfie + lat/long + timestamp, `leave_requests`, `attendance_log`).
- **Retain the full employee information model**: name, employee ID, position, department, company, hire date/tenure, employment type, manager, email, phone, address, birthdate, monthly/semi-monthly salary, bank account, and government IDs (SSS, PhilHealth, Pag-IBIG, TIN) — with relations to payslips, tax forms, leave, attendance, and clock punches. Don't drop any; only add.

## Must-build features
1. **Login** — real **PIN**, **biometric** (WebAuthn or native biometrics), and **password** methods (all three), with our security policy. Brand the screen with the **Nexus mark + "Sentire Payroll"** lockup (`assets/sentire-mark.svg`).
2. **Clock in/out with selfie** — real front-camera capture + geolocation + timestamp, attached to the punch and shown as verification; reflect clocked-in state on Home.
3. **Payslips & tax forms**, **leave** (balances, request, history), **attendance**, **profile/settings** — all from real data.

## Context to keep
Philippine payroll: ₱ currency, semi-monthly cutoffs, 13th-month pay, BIR 2316, SSS/
PhilHealth/Pag-IBIG. Keep for PH tenants; parameterize if we expand. Render the wordmark
as live Instrument Sans text (not an image). Ensure ≥44px touch targets and a11y.

## Result
Same look and behavior as the reference, mobile-web first and app-ready — but every payslip,
leave balance, punch, and profile field comes from our backend, with new fields/schemas added
wherever the design introduces data we didn't previously store.
