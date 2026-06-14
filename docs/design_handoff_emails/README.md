# Handoff: Sentire Transactional Email System

## Overview
A complete, production-oriented set of **11 transactional emails** for Sentire — a payroll platform — spanning three audiences:

- **Tenant employees** (Employee Self-Service / "ESS")
- **Tenant admins** (Payroll Administrators of a company on the platform)
- **Internal platform admins** (Sentire Central console)

The emails cover account lifecycle (onboarding, password reset, security notices) and the tenant billing lifecycle (invoice, past-due, deactivation). They are built as one cohesive template family, differentiated only by a header **surface label** and the body content.

## About the Design Files
The files in this bundle are **design references created as table-based HTML emails**. They are already written in email-safe HTML (tables, inline styles, `border-collapse`, MSO conditional comments) and are close to production-ready — but they are **reference designs**, not a drop-in integration. The task is to **recreate / wire these into the target environment**: your Email Service Provider (ESP) templating system (e.g. SendGrid Dynamic Templates, Postmark, Customer.io, MJML, Braze, a Rails/Django mailer, React Email, etc.) using its variable syntax and asset hosting.

If you have an existing transactional-email system, port these into it using its conventions. If you are starting fresh, **MJML** or **React Email** are good choices for maintaining table-based layouts; the structure here maps cleanly onto either.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, copy, and layout. Recreate pixel-faithfully. The HTML is deliberately email-client-safe; preserve the table structure and inline styles rather than refactoring to modern CSS layout (fl/grid), which most email clients don't support.

---

## The Template System

Every email shares one shell. Differences between emails are: (1) the **surface label**, (2) the **eyebrow** + headline + body copy, (3) which **content block(s)** appear between the intro and the footer.

### Shell anatomy (top → bottom)
1. **Outer canvas** — full-width, background `#F7F4EF` (cream), 36px top / 40px bottom padding, 16px side padding.
2. **Card** — 600px max-width, white `#ffffff`, 1px border `#ece6dd`, `border-radius: 16px`.
   - ⚠️ **Critical:** the card table uses `border-collapse: separate; border-spacing: 0;` (NOT `collapse`). In `collapse` mode browsers ignore cell `border-radius` and the rounded corners fail. This was a real bug — keep `separate`.
3. **Header band** — background ink `#2A2420`, 22px/36px padding, `border-radius: 16px 16px 0 0`. Contains:
   - Left: 30×30 logo mark (`sentire-mark-dark-1024.png`) + wordmark "Sentire" (Instrument Sans 600, 21px, color `#F7F3EF`).
   - Right: **surface label** — uppercase, 11px, weight 600, letter-spacing 0.16em, color `#9c9085`.
4. **Body** — one or more content blocks (see below).
5. **Divider** — 1px `#ece6dd`, full width inside 36px padding.
6. **Footer** — 1–2 lines, Hanken Grotesk 12.5px, color `#978c80`, with a support mailto link in `#C2552F`. Cell carries `border-radius: 0 0 16px 16px`.
7. **Legal line** — outside the card, centered, 11.5px, color `#a89d90`.

### Surface labels
| Label | Audience | Used by |
|---|---|---|
| `SELF-SERVICE` | Tenant employee | Employee onboarding, employee reset, employee reset notice |
| `PAYROLL` | Tenant admin | Tenant onboarding, tenant admin reset |
| `BILLING` | Tenant billing admin | Monthly billing, unpaid billing, deactivation |
| `CENTRAL` | Internal platform admin | Admin onboarding, admin reset, admin reset notice |

---

## Content Blocks (reusable)

These are the building blocks composed into each email's body. Each is a full table row (`<tr>`).

### `intro`
Eyebrow (optional) + H1 + paragraph + primary CTA button.
- Eyebrow: Hanken Grotesk 11px / 600 / uppercase / letter-spacing 0.16em. Default color `#C2552F`; security/urgent variants use red `#b23b34`.
- H1: Instrument Sans 600, 26px, line-height 1.18, letter-spacing -0.02em, color `#2A2420`.
- Paragraph: Hanken Grotesk 15px, line-height 1.62, color `#6B6259`. Inline emphasis uses `<strong>` at `#2A2420`/600.
- CTA button: background `#E8693A`, `border-radius: 11px`, padding 15px/34px, Instrument Sans 600 15px, white text, `white-space: nowrap`.

### `featuresPanel` (employee onboarding)
"What you can do" — vertical list of icon + title + description rows.
- Icon tile: 48×48, background `#fdeee6`, `border-radius: 12px`, holds a 26×26 orange monoline PNG icon.
- Title: Instrument Sans 600 15px `#2A2420`. Desc: Hanken Grotesk 13.5px `#6B6259`.

### `stepsPanel` (tenant & admin onboarding)
Sand panel `#F2ECE4`, `border-radius: 14px`, containing:
- Kicker (left, uppercase 11px `#978c80`) + meta (right, e.g. "3 steps · ~10 min").
- Title: Instrument Sans 600 18px.
- Numbered steps: 28×28 orange `#E8693A` circle badge (white number) + title/desc, separated by 1px `#e4dbcd` hairlines.

### `fallback` (all reset emails)
"Or copy this link into your browser:" + the URL in JetBrains Mono 12.5px, `word-break: break-all`, link color `#C2552F`.

### `noticeIntro` (password-changed notices)
Centered: 56×56 `#fdeee6` round badge with a 30×30 icon (check for employee, shield for admin), then centered H1 (25px) + paragraph.

### `detailPanel` (notices)
Sand `#F2ECE4` panel of key/value rows. Key: Hanken Grotesk 13px `#978c80` (140px col). Value: Instrument Sans 600 13.5px `#2A2420`. 1px `#e4dbcd` hairlines between rows.

### `billingPanel` (billing emails)
Sand panel with: label + **status pill** (top row), large **amount** (Instrument Sans 600, 34px, letter-spacing -0.02em), hairline, then key/value rows (values right-aligned).
- Amounts shown in **₱ (PHP)** to match the Manila/PH context.

### `pill` (status chips)
Inline-block, Instrument Sans 700 12px, `border-radius: 999px`, padding 5px/12px, `white-space: nowrap`. Tone palettes:
| Tone | Background | Text | Use |
|---|---|---|---|
| orange | `#fdeee6` | `#C2552F` | "Due 5 Jul" |
| amber | `#fbf1dc` | `#9a6a12` | warnings |
| red | `#fbe9e7` | `#b23b34` | "Past due", "Suspended" |
| green | `#e7f4ec` | `#1f7a4d` | success |

### `calloutBox` (billing warnings) & `warnCallout` (security)
Tinted box, `border-radius: 12px`, bold title + body. Amber tone: bg `#fbf1dc`, title `#8a5e10`, body `#6e4f17`. Red tone: bg `#fbe9e7`, title `#9c352e`, body `#7d4a44`. The security `warnCallout` is a red box titled "Didn't make this change?" with a `#b23b34` action link.

---

## The 11 Emails

### Tenant — Account
1. **Employee Onboarding** (`SELF-SERVICE`) — `intro` ("Activate my account") + `featuresPanel` (Clock in & out / Payslips / Leave). Recipient: employee (Juan).
2. **Employee ESS Reset Password** (`SELF-SERVICE`) — `intro` ("Reset password", 1-hour expiry) + `fallback`.
3. **Employee Reset Password Notice** (`SELF-SERVICE`) — `noticeIntro` (check badge) + `detailPanel` (Account / When / Device) + red `warnCallout` ("Secure your account").

### Tenant — Admin
4. **Tenant Onboarding** (`PAYROLL`) — `intro` ("Activate your account") + `stepsPanel` ("Your first three steps") + reassurance line. Recipient: admin (Maria).
5. **Tenant Admin Reset Password** (`PAYROLL`) — admin-scoped `intro` + `fallback`.

### Tenant — Billing (recipient: billing admin Maria; support → `billing@sentire.solutions`)
6. **Monthly Billing Notice** (`BILLING`) — `intro` ("View & pay invoice") + `billingPanel` (orange "Due 5 Jul") + autopay note.
7. **Notice of Unpaid Billing** (`BILLING`) — red eyebrow `intro` ("Pay now") + `billingPanel` (red "Past due · 9 days") + amber `calloutBox`.
8. **Deactivation Notice** (`BILLING`) — red eyebrow `intro` ("Reactivate account") + `billingPanel` (red "Suspended") + red `calloutBox` ("What deactivation means").

### Central — Internal admin (recipient: Alex; support → `central-support@sentire.com`)
9. **Admin Onboarding** (`CENTRAL`) — `intro` ("Activate admin access") + `stepsPanel` ("Where to start": 2FA / tenant directory / dashboard).
10. **Admin Reset Password** (`CENTRAL`) — privileged-account `intro` + `fallback`.
11. **Admin Reset Password Notice** (`CENTRAL`) — `noticeIntro` (shield badge) + `detailPanel` (incl. Role) + red `warnCallout`.

---

## Interactions & Behavior
These are static emails — no client-side JS. "Behavior" = correct linking and responsive rules.
- **CTA + fallback link** must point to the same tokenized URL.
- **Responsive:** a single media query at `max-width: 480px` sets the card to `width: 100%` and reduces side padding (`.px`) to 24px. (480px, not 600px — a 600px breakpoint would wrongly trigger at the email's own width.)
- **Preheader:** each email has a hidden preheader `<div>` (the inbox preview text) followed by zero-width-joiner/nbsp padding to stop clients pulling body text into the preview.
- **Dark mode:** not specifically handled; the ink header already reads well. If your ESP supports it, add `@media (prefers-color-scheme: dark)` overrides.

## Templating / Variables to wire up
Replace these placeholders with ESP merge variables:
- **People/Org:** recipient first name (Juan / Maria / Alex), company name (Northwind Trading), account email, role.
- **Links:** activation/reset/pay URLs (currently carry fake tokens), "secure account" URLs.
- **Billing:** amount (₱48,500.00), invoice number (INV-2026-0612), billing period, plan/seats, due date, days-overdue, suspension/deactivation dates.
- **Security notices:** timestamp, device/location string.
- **Expiry windows:** 1 hour (reset), 7 days (activation).

## Design Tokens
```
/* Core */
--ink:        #2A2420
--muted:      #6B6259
--muted-2:    #978c80
--line:       #ece6dd
--bg:         #F7F4EF   (cream canvas)
--paper:      #ffffff
--acc:        #E8693A   (core orange — CTAs, badges)
--acc-press:  #C2552F   (links, pressed)
--acc-soft:   #fdeee6   (icon tiles, orange pill bg)
--sand:       #F2ECE4   (info panels)
--sand-line:  #e4dbcd   (hairlines inside panels)
--header-txt: #F7F3EF
--header-sub: #9c9085   (surface label)

/* Status (from the Central Portal token set) */
green  #1f7a4d / bg #e7f4ec
amber  #9a6a12 / bg #fbf1dc
red    #b23b34 / bg #fbe9e7

/* Radii */
card 16px · button 11px · panel 14px · callout 12px · icon tile 12px · pill 999px

/* Type */
Display: "Instrument Sans" (500/600/700)
Body:    "Hanken Grotesk" (400/500/600)
Mono:    "JetBrains Mono" (500)  — reset fallback links
H1 26px/600 (-0.02em) · billing amount 34px/600 · body 15px/1.62 · footer 12.5px
```

## Assets
In `assets/` (recreate or host on your CDN, then swap to absolute URLs — relative paths won't load in mail clients):
- `sentire-mark-dark-1024.png` — light Nexus logo mark for the dark header band.
- `icon-clock.png`, `icon-payslip.png`, `icon-leave.png` — 120px orange monoline ESS feature icons.
- `icon-check.png`, `icon-shield.png`, `icon-key.png` — security/notice icons (orange monoline).

Fonts load from Google Fonts via `<link>`; mail clients that block web fonts fall back to Arial/system sans (already specified in every `font-family`). For Outlook (Word engine), expect `border-radius` to be ignored (square corners) — this is the standard, accepted email tradeoff.

## Files
Design references in this bundle:
- `emails/tenant/employee-onboarding.html`
- `emails/tenant/employee-reset-password.html`
- `emails/tenant/employee-reset-password-notice.html`
- `emails/tenant/tenant-onboarding.html`
- `emails/tenant/tenant-admin-reset-password.html`
- `emails/tenant/monthly-billing-notice.html`
- `emails/tenant/unpaid-billing-notice.html`
- `emails/tenant/deactivation-notice.html`
- `emails/central/admin-onboarding.html`
- `emails/central/admin-reset-password.html`
- `emails/central/admin-reset-password-notice.html`
- `assets/` — logo mark + icons
- `Sentire Email System.html` — the review canvas that renders all 11 side by side (not an email; a contact sheet for reference)
