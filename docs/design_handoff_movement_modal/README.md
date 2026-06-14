# Handoff: Sentire Payroll — New Movement Request Modal (Redesign)

## Overview
A redesign of the **New Movement Request** modal in **Sentire Payroll** (tenant-admin web app,
HRIS + Payroll for the Philippine market). It lives on the **Employee Movements** page (HR Ops →
Movements) and is opened by the page's **+ New Movement** button. A movement captures a change to
an employee's placement/terms — transfer, promotion, salary adjustment, or status change.

**Why the redesign:** the previous modal was a single tall column of ~14 stacked fields that
required scrolling across **two screens** (the submit button was below the fold). The redesign
makes it **compact and fits on one screen** by switching to a multi-column field grid and grouping
fields into labeled sections, while staying 100% within the existing Sentire design system.

## About the Design File
The file in this bundle is a **design reference** built in HTML + React (via in-browser Babel) —
a working prototype that demonstrates the intended layout, spacing, copy, and interactions. It is
**not production code to copy verbatim.** Recreate it in the target codebase using its existing
component library, form layer, validation, and data/API. The modal should reuse the app's existing
primitives — the prototype mirrors them (`.pa-input`, `.pa-btn`, drawer/modal head & foot patterns)
but renames them locally; map them back to the real components.

> This modal is part of the larger **Sentire Payroll — Tenant Admin** app. If you also have that
> handoff (`design_handoff_payroll_admin`), this modal slots into it: same tokens, same `Field` /
> `Select` / `Btn` / `Drawer` primitives, opened from the Movements page.

## Fidelity
**High-fidelity (hifi).** Colors, type, spacing, radii, and interactions are final. Tokens are in
the file's `:root` and in **Design Tokens** below.

---

## Layout — the redesign

A centered modal (`role="dialog"`, scrim overlay) instead of the old tall form. Three regions:

### 1. Header (`.m-head`)
- Left: a 38×38 soft-accent icon tile (the "movement" glyph — two diagonal arrows) + title
  **New Movement Request** (Instrument Sans 600, 19px) and a one-line subtitle
  *"Transfer, promotion, salary or status change."* (12.5px, muted).
- Right: a 34×34 bordered close (`×`) button.

### 2. Body (`.m-body`) — a 3-column field grid (`.fgrid`, `repeat(3, 1fr)`, gap 14px)
This is the core of the redesign. Fields, in order:

**Core (row 1, three across):**
| Employee `*` | Scope of Change `*` | Effective Date `*` |
|---|---|---|
| custom combo (avatar + name) | native select | date input |

**Section divider** — `PLACEMENT DETAILS` (uppercase accent label + hairline rule, `.fsection`).

**Placement (two rows of three):**
| To Position | Job Title | Job Level |
|---|---|---|
| **Line Manager** | **Department** | **Branch** |
- *To Position*, *Department*, *Branch* are **select + inline "＋"** ("create new" affordance,
  `.selectadd` + `.addbtn`).
- *Job Title*, *Job Level* are text inputs (placeholders "e.g. Senior Engineer", "e.g. L3").
- *Line Manager* is a plain select.

**Section divider** — `JUSTIFICATION`.

**Justification:**
| Reason (textarea, 2 rows) | Notes (textarea, 2 rows) | *(third column empty)* |
- Side-by-side textareas keep this compact rather than two full-width stacked blocks.

### 3. Footer (`.m-foot`)
- Left: an info glyph + **"\* Required fields"** hint.
- Right: **Cancel** (ghost) and **Submit Request** (primary, with a check glyph).

### Result
At default density the modal is ~**760px wide × ~480–540px tall** — comfortably one screen on any
laptop. The body only scrolls on very short viewports.

---

## Components / States
- **Employee picker** — a custom combo (not a native select) so each option shows an **avatar
  chip** (initials on a hashed tone) + name + sub (role · department). Closed trigger shows avatar +
  name, or the placeholder "Select employee…". Clicking opens a popover list; selecting fills the
  trigger. Wire this to your real employee search/typeahead.
- **Select + inline ＋** — the dashed-bordered circular/rounded **＋** opens your "create new
  <entity>" flow (position, department, branch). In the prototype it's a visual control.
- **Inputs** — 38px tall (35px in compact), 9px radius, focus ring = accent border + 3px
  `--acc-soft` glow. Selects use a custom chevron; placeholder options render in muted color.
- **Buttons** — primary = accent fill with soft accent shadow, hover → `--acc-press`; ghost =
  white + line border, hover → `#f6f1ea`.
- **Scrim** — `rgba(33,26,21,.46)` + 2.5px backdrop blur; modal animates in (`pop`: slight rise +
  scale). Clicking the scrim closes the employee popover (wire to close-modal per your UX).

## Interactions & Behavior
- **Open** from the Movements page **+ New Movement** button.
- **Validation** — Employee, Scope of Change, Effective Date are required (`*`). Disable
  **Submit Request** until they're set; surface inline errors per your form layer.
- **Scope of Change** drives the form: the prototype always shows Placement Details, but in
  production you may show/hide sections by scope (e.g. *Salary Adjustment* → a salary block instead
  of placement). Treat the section grouping as the extensible pattern.
- **Submit** — assemble the movement record and POST to your movements endpoint; on success close
  the modal and refresh/append the Movements table row (status likely `Pending` → approval
  workflow).
- **Cancel / ×** — close without saving (confirm if the form is dirty).
- **Keyboard** — `Esc` closes; focus trap within the modal; return focus to the trigger on close.
- **Responsive** — below ~620px the grid drops to 2 columns and full-width fields span all columns.

## Tweakable variants (design decisions, not required toggles)
The prototype exposes three options via a Tweaks panel so reviewers can compare; the **shipping
defaults** are the first of each:
- **Density**: `comfortable` *(default)* | `compact` (35px controls, tighter gaps) — for dense
  admin contexts.
- **Placement grid**: `3 columns` *(default)* | `2 columns` (wider fields; reason/notes span 2).
- **Reason & Notes**: shown *(default)* | hidden (minimal request).

Pick the defaults for production unless your team prefers otherwise; the alternates are just there
to justify the layout choice.

## Design Tokens
```
--acc:#E8693A  --acc-press:#C2552F  --acc-soft:#fdeee6
--ink:#2A2420  --muted:#6B6259  --muted-2:#9b9085
--bg:#F6F2EC   --paper:#ffffff    --line:#ECE6DD  --line-2:#f1ece4
Radii: modal 18px · inputs/selects 9px · buttons 10px · icon tile 11px
Type:  --font "Instrument Sans" (labels/UI/headings) · --body "Hanken Grotesk" (inputs/text)
       --mono "JetBrains Mono"
Sizes: title 19px/600 · field label 12px/600 · input text 13.5px · section label 11px/700 uppercase
Controls: input height 38px (compact 35px) · focus ring 3px var(--acc-soft)
Avatar tones (hashed from initials): #E8693A #4F9373 #3e63a0 #A0627D #C7913D #5E7FB1
```

## Assets
- `assets/sentire-mark-dark.svg` — Sentire "Nexus" mark (for reference; not used inside the modal).
- All icons in the modal are inline SVGs (movement arrows, close ×, ＋, check, info) — map to your
  icon library or keep as inline SVG, stroke ~1.9–2.4, 24×24 viewBox.
- Fonts: Instrument Sans, Hanken Grotesk, JetBrains Mono (Google Fonts).
- Currency context is Philippine peso (₱) for salary-related scopes.

## Files
- `New Movement Request.html` — the modal prototype: design tokens (`:root`), all CSS, the dimmed
  **Movements** page backdrop (context only — not part of the deliverable), the modal, and the
  Tweaks panel.
- `tweaks-panel.jsx` — the Tweaks panel harness used by the prototype (reviewer tool; **not part of
  the production modal** — drop it when you implement).
- `assets/sentire-mark-dark.svg` — brand mark.

### How the prototype boots (reference only)
Loads React 18 + Babel from CDN; `tweaks-panel.jsx` then the inline `App` render the backdrop +
modal. In production: drop the backdrop and Tweaks harness, rebuild the modal with your component
library + form layer, and wire the employee picker, inline "＋" create flows, validation, and
submit to your API.
