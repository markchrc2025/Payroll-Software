# Handoff: Sentire Login Pages (Tenant + Admin)

## Overview
Two sign-in screens for the Sentire platform, both built on the same split-screen
layout (brand panel + form pane) and the Sentire "Nexus" brand:

1. **Tenant workspace** — end-customers signing in to **Sentire Payroll**. Friendly,
   product-branded (Payroll glyph + sage-green accent), SSO-forward.
2. **Central Portal** — Sentire **administrators/staff** signing in to the internal
   operations console. Austere, security-forward (orange brand accent, company SSO,
   audit/2FA messaging).

Both support email/password with inline validation, show/hide password, "keep me
signed in", loading, error, and success states.

## About the design files
The files in this bundle are **design references created in HTML/React-via-Babel** —
prototypes that show the intended look and behavior. They are **not** production code
to ship as-is. The task is to **recreate these screens in your app's existing
environment** (e.g. your React/Next/Vue stack) using your established routing, form,
auth, and component patterns. If no front-end environment exists yet, implement them in
the framework most appropriate for the project.

The `.jsx` files use in-browser Babel and global `window` exports purely so the
prototype runs from a static file — do not carry that pattern into production. Treat
them as a precise spec of markup, styles, and logic.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interaction states are final.
Recreate pixel-faithfully using your own component library; match the exact tokens below.

---

## Design tokens

### Brand colors
| Token | Hex | Use |
|---|---|---|
| Core orange | `#E8693A` | Sentire brand accent; **admin** CTAs, links, focus |
| Ink | `#2A2420` | Primary text, brand-panel base |
| Dark 1 / Dark 2 | `#2E241C` / `#211A15` | Brand-panel gradient (160°) |
| Sand | `#F2ECE4` | App background (canvas behind cards) |
| Paper | `#FFFFFF` | Form pane, inputs (focus) |
| Warm slate (muted) | `#6B6259` | Secondary text |
| Muted-2 | `#9A9085` | Placeholders, legal text, icons |
| Line / Line-strong | `#E7E0D6` / `#D8CFC2` | Dividers / input borders |
| Field bg | `#FCFAF7` | Input resting background |

### Product accent colors (per-product system)
Books `#C7913D` · **Payroll `#4F9373` (sage — tenant CTA)** · Tax `#A0627D` · POS `#5E7FB1`
On dark: Payroll node/text uses `#7FC4A6`.

### Accent themes (CSS custom props set on `.sn-screen[data-accent]`)
- **sage** (tenant default): `--acc:#4F9373; --acc-press:#3E7A5E; --acc-soft:#E9F2ED; --focus:0 0 0 3px rgba(79,147,115,.20)`
- **orange** (admin): `--acc:#E8693A; --acc-press:#C2552F; --acc-soft:#FDEEE6; --focus:0 0 0 3px rgba(232,105,58,.20)`

### Typography
- **UI / headings:** `Instrument Sans` (Google Fonts), weights 400/500/600/700.
- **Body / secondary** (subheads, trust chips, legal, error text): `Hanken Grotesk`, 400/500/600.
- Sizes: page title 25px/600/-0.02em · brand headline 40px/600/-0.025em (admin "Central Portal" 30px) · subhead 14.5px/1.6 · field label 12.5px/600 · input text 14.5px · button 15px/600 · legal 11.5px.

### Spacing / shape
- Card radius (artboard) none — full-bleed split; inner radii: inputs/buttons/SSO `10px`, brand glyph chip `9px`, checkbox `5px`.
- Form column: `max-width: 360px`, centered in pane.
- Pane padding 36×40px (compact 28×36 · comfy 44×48). Form row gap 15px (compact 11 · comfy 19). Input height 46px (compact 42 · comfy 50).
- Submit button height 48px; shadow `0 10px 22px -12px (accent @70%)`.
- Brand panel padding 36×40px.

### Shadows / focus
- Input focus: border → accent, bg → #fff, ring `--focus`.
- Error input: border `#B23B34`, ring `rgba(178,59,52,.12)`.

---

## Layout (both screens)
CSS grid, two columns: brand panel `0.82fr` + form pane `1fr`, full height, `overflow:hidden`.
Reference frame size 920×640. On narrow viewports you should collapse to a single column
(form only, or brand panel as a short header) — the prototype is fixed-width, so define
the responsive rule per your app's breakpoints.

### Brand panel (left)
- Background: linear-gradient(160°, `#2E241C`, `#211A15`); `color:#F7F3EF`; `isolation:isolate`.
- Optional **dot texture** overlay (toggle): radial dot grid (26px) + an orange radial glow top-right, masked to fade from bottom-left. Off state = subtle white radial highlight only.
- Three rows (flex column, space-between):
  1. **Top:** product/brand lockup (left) + pill badge (right).
     - Tenant: 34px rounded chip `rgba(255,255,255,.08)` + 1px `rgba(255,255,255,.16)` border, containing the **Payroll glyph** (recurring-pay-cycle icon, stroke `#F7F3EF`, accent `#7FC4A6`); text "Sentire **Payroll**" (Payroll in `#7FC4A6`, 600). Badge: "Workspace".
     - Admin: the **Nexus mark** (30px, light-on-dark, core `#E8693A`); text "Sentire **Central**" (Central in `#F2A380`). Badge: "Admin Console".
     - Badge style: 10.5px/600, uppercase, letter-spacing .07em, color `rgba(247,243,239,.6)`, 1px `rgba(247,243,239,.18)` border, padding 5×10, radius 999px.
  2. **Middle (centered):**
     - Tenant: headline "Payday,<br>handled." (40px); subhead "Approvals, filings and payslips for your whole team — one calm, connected place."
     - Admin: large **Nexus mark** (120px) above headline "Central Portal" (30px); subhead "Operations console for Sentire administrators — tenants, billing, releases and support tooling."
  3. **Foot:** trust chips separated by a top hairline `rgba(247,243,239,.14)`. Each chip = 6px accent dot (with soft ring) + label, 11.5px Hanken.
     - Tenant: "SOC 2 Type II" · "256-bit encryption" · "99.99% uptime"
     - Admin: "Restricted system" · "All activity audited" · "2FA enforced"

### Form pane (right)
Centered 360px column:
1. **Header:** title + subhead.
   - Tenant: "Sign in" / "Welcome back — your team's payroll is waiting."
   - Admin: "Administrator sign in" / "Authorized personnel only. Use your Sentire staff account."
2. **SSO:**
   - Tenant: two buttons in a 2-col grid — **Google** (multicolor G) and **Microsoft** (4-square).
   - Admin: one full-width button — key icon + "Continue with company SSO".
   - Button: white bg, 1px `#D8CFC2`, radius 10, 14px/600 text, `white-space:nowrap`; hover bg `#FAF7F2`, border `#C4B9A9`.
3. **Divider:** centered label between hairlines — "or sign in with email" (tenant) / "or use admin credentials" (admin).
4. **Error alert** (conditional): red soft box `#FBECEB` / text `#B23B34` / border `#F0C9C6`, circle-i icon, 13px Hanken.
5. **Form fields** (gap 15px):
   - **Company code** *(tenant only — first field)* — label "Company code"; leading building/card icon; placeholder `e.g. ACMEFOODS`; `type=text`, `autocomplete=organization`, `autocapitalize=characters`, `spellcheck=false`; value force-uppercased via `text-transform: uppercase` + `letter-spacing: 0.04em`. Below the field, a muted hint (`#978C80`, 12px Hanken): "The workspace ID your admin gave you." — replaced by the red error text when invalid. This scopes which tenant workspace the user signs into; the **admin** portal has no company code (staff sign in to one console).
   - **Email** — label "Work email" (tenant) / "Staff email" (admin); leading envelope icon; placeholder `you@company.com` / `name@sentire.io`; `type=email`, `autocomplete=username`.
   - **Password** — leading lock icon; trailing eye toggle (show/hide); placeholder "Enter your password"; `autocomplete=current-password`.
   - Inputs: 46px tall, field bg `#FCFAF7`, 1px `#D8CFC2`, radius 10, icon color `#9A9085` (→ accent on focus).
6. **Row:** checkbox "Keep me signed in" (checked by default for tenant, unchecked for admin) + right link "Forgot password?" (tenant) / "Trouble signing in?" (admin).
   - Custom checkbox 18px, radius 5; checked = accent fill + white check.
7. **Submit** — full-width accent button: "Sign in to workspace" (tenant) / "Sign in to portal" (admin). Loading: spinner + "Verifying…", disabled.
8. **"Use demo credentials"** — small underlined text button (prototype helper; **remove in production**).
9. **Legal line** — shield icon + 11.5px text.
   - Tenant: "Protected by Sentire. Your payroll data is encrypted end-to-end."
   - Admin: "Restricted system. Sessions are monitored and logged for security."

---

## Interactions & behavior
- **Inline validation** (on blur + on submit):
  - Company code *(tenant only)*: required; message "Company code is required."
  - Email: required; regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`; messages "Email is required." / "Enter a valid email address."
  - Password: required; min 8 chars; "Password is required." / "Password must be at least 8 characters."
  - Invalid field → red border + ring + helper text below.
- **Submit:** if client-validation fails → set error state + **shake** the form (`translateX` keyframes, .4s). Otherwise → loading (1.5s simulated) → success or error.
  - Demo success values (replace with real auth): tenant company `ACMEFOODS` + `maria@acmefoods.com` / `Acme2026!`; admin `a.okafor@sentire.io` / `Sentire2026`. For tenant, the company code is part of the credential check (case-insensitive).
  - Failure error copy: tenant "We couldn't verify those details. Check your company code, email and password and try again."; **admin** adds lockout warning "Admin accounts lock after 5 failed attempts."
- **Success state** replaces the form with a centered animated check (SVG stroke draw, ~0.85s) + heading + redirect progress bar (1.6s):
  - Tenant: "Welcome back" / "Opening the Acme Foods workspace…"
  - Admin: "Identity verified" / "Approval sent to your device — confirm to continue." (i.e. hand off to a **2FA push** step — implement the real second factor here).
- **Password toggle:** eye / eye-slash, `tabindex=-1`, swaps `type` text/password.
- **Disabled while loading:** all inputs and buttons.
- Transitions: inputs/buttons .15s; button active `translateY(1px)`; respect `prefers-reduced-motion` (disable shake/draw).

## State (per form)
`company` *(tenant only)*, `email`, `password`, `showPassword`, `remember`, `touched{company,email,password}`,
`status: idle|loading|error|success`, `formError` (string).
Wire `status`/`formError` to your real auth mutation; keep field values on error.

## Production notes
- **Auth:** replace the simulated `setTimeout` + hard-coded demo pairs with your real
  auth API. Admin portal should enforce **company SSO + 2FA** and real lockout.
- **Remove** the "Use demo credentials" button.
- **Routing:** tenant and admin are separate entry points (different hosts/paths and
  different auth backends) — they share layout + tokens, not sessions.
- **Logo:** use the SVGs in `assets/` (`sentire-mark.svg` light, `sentire-mark-dark.svg`
  for dark panels, `sentire-app-icon.svg` for favicon). Render the wordmark as live text
  in Instrument Sans 600 (-0.02em), not an image. The Payroll glyph lives in
  `sentire-logos.jsx` (`ProductGlyph`).
- **Accessibility:** label every input, `aria-label` the eye toggle, `role="alert"` on
  the error box, visible focus rings (already specced), 44px+ hit targets.

## Files in this bundle
- `Sentire Login Pages.html` — runnable prototype (open in a browser). Contains all CSS
  (the `<style>` block is the source of truth for tokens/spacing) and the canvas harness.
- `sentire-login.jsx` — the two login screens (brand panel + form + states). **Primary spec.**
- `nexus-refined.jsx` — the Nexus logo mark + wordmark components and `NX` color object.
- `sentire-logos.jsx` — `ProductGlyph` (Books/Payroll/Tax/POS icons) + earlier logo explorations.
- `assets/*.svg` — production logo files.
- `tweaks-panel.jsx`, `design-canvas.jsx` — prototype scaffolding only (Tweaks UI + the
  side-by-side canvas). **Not part of the design** — ignore for implementation.

> Note: the HTML loads React/Babel from a CDN and the `.jsx` files export to `window`;
> that's prototype plumbing. In your codebase, implement these as normal components.
