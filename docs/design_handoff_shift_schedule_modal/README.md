# Handoff: Add / Edit Shift Schedule Modal

## Overview
A redesign of the **Add Shift Schedule** and **Edit Shift Schedule** modals in Sentire Payroll
(Attendance → Shift Schedules). The original modal was a single cramped scrolling block; this
redesign rebuilds it on the app's **reusable Modal shell** (pinned header / single scroll region /
pinned footer) and reorganizes the fields into labeled sections, adds a selectable shift-type
control, day-toggle pills, and a live footer summary that computes paid hours and the shift pattern
in real time.

Both modals are the **same form component** in two modes:
- **Add** — empty form, "Create shift" primary action.
- **Edit** — prefilled, an "N employees assigned" banner, plus a destructive **Delete** action.

## About the Design Files
The file in this bundle (`Shift Schedule Modal.html`) is a **design reference created in HTML +
React (in-browser Babel)** — a prototype showing intended look and behavior, **not production code to
copy directly**. The task is to **recreate this design in the target codebase's existing
environment** (the Sentire Payroll admin app — React) using its established components, primitives,
and tokens. If a primitive already exists (Input, Select, Button, Toggle, Checkbox), reuse it rather
than re-deriving the CSS here.

The prototype's `tweaks-panel.jsx` dependency is a **review harness only** (it drives the Add/Edit,
shift-type, and density switches for demoing). **Drop it** in production — `mode` is a prop, and
shift-type/density are real form state / app settings.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interactions. Recreate the UI
pixel-perfectly using the codebase's existing libraries and patterns. All values below are exact.

---

## Screens / Views

### Modal shell (shared)
Three rigid flex-column regions; **only the middle region scrolls**. This is the core fix — action
buttons can never fall under the fold, and the scrollbar lives in a stable inset gutter so it never
collides with content.

- **Container** `.m`: `background #ffffff`, `border-radius 18px`, `width 620px` (md), `max-width 100%`,
  `max-height min(760px, 100vh − 56px)`, shadow `0 32px 70px -24px rgba(33,26,21,.55), 0 2px 8px -2px rgba(33,26,21,.18)`.
  Entrance animation `pop` 0.26s `cubic-bezier(.2,.8,.3,1)` (translateY 10px + scale .985 + fade).
- **Scrim** `.ov`: `rgba(33,26,21,.46)` + `backdrop-filter: blur(2.5px)`, centered, `z-index 50`,
  click-outside to dismiss, fade-in 0.22s.
- **Header** `.m-head` (`flex: none`): 38×38 icon tile (`border-radius 11px`, bg `--acc-soft`, color
  `--acc`) + title (Instrument Sans 600 / 19px / -0.02em) + one-line subtitle (12.5px `--muted`). A
  34×34 bordered close button (×) on the right. The header shows its bottom border + soft shadow
  **only** when the body is scrolled away from the top (`data-top="false"`).
- **Scroll region** `.m-scroll` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`): padding
  `18px 24px 22px`. `scrollbar-gutter: stable`; Firefox `scrollbar-width: thin; scrollbar-color:
  #d9cfc2 transparent`; WebKit thumb `background #d9cfc2; border-radius 99px; border: 4px solid
  transparent; background-clip: padding-box` (hover `#c3b29c`), track transparent, width 12px.
- **Footer** `.m-foot` (`flex: none`): `background #fcfaf7`, padding `13px 18px 13px 22px`. Left = live
  summary chip; right = action buttons. Top border + shadow appear **only** when there's content
  below (`data-bottom="false"`). Track scroll position with a scroll listener + ResizeObserver to set
  `data-top` / `data-bottom` on `.m`.

### Add Shift Schedule
- **Icon**: clock. **Title**: "Add Shift Schedule". **Subtitle**: "Define work hours, breaks and the
  days this pattern applies."
- **Footer actions**: `Cancel` (ghost) · `✓ Create shift` (primary).

### Edit Shift Schedule
- **Icon**: pencil/edit. **Title**: "Edit Shift Schedule". **Subtitle**: "Adjust the working pattern
  — changes flow to assigned employees."
- **Assigned banner** (top of scroll region, Edit only): `.editmeta` — bg `--bg`, `border 1px solid
  --line`, `border-radius 11px`, padding `11px 14px`. 30×30 icon tile (bg `#e9eff7`, color `#3e63a0`,
  users icon) + text "**14 employees** are assigned to this schedule. Changes apply to their next
  worked day." (bold portion = Instrument Sans 600 `--ink`; rest 12.5px `--muted`).
- **Footer actions**: `🗑 Delete` (text-danger, far left of the button group) · `Cancel` (ghost) ·
  `✓ Save changes` (primary).

---

## Form body (identical for both modes)

Sections are separated by a divider row `.fsection`: an uppercase label (Instrument Sans 700 / 11px /
letter-spacing .07em / color `--acc-press`) with a leading `--acc` icon, followed by a 1px `--line`
rule filling the remaining width. Section vertical margin `22px 0 13px` (first section `margin-top 2px`).

### 1. Schedule
- **Name** `*` (text) + **Code** (text) in a 2-col grid `grid-template-columns: 1fr 150px; gap 14px`.
  - Name placeholder `e.g. Day Shift`; Code placeholder `DAY-8`.

### 2. Shift type
Three selectable cards in a `repeat(3, 1fr); gap 10px` grid. Each card `.typecard`: `border 1.5px
solid --line`, `border-radius 12px`, padding `13px 13px 12px`, column flex, gap 8px. Selected state
`.is-on`: `border-color --acc`, `background --acc-soft`, `box-shadow 0 0 0 3px rgba(232,105,58,.1)`.
Card icon tile 32×32, `border-radius 9px` (idle bg `--bg`/color `--muted`; selected bg `#fff`/color
`--acc`). Title Instrument Sans 600 / 13.5px; description 11.5px `--muted`.
  - **Fixed** (clock icon) — "Specific time-in and time-out"
  - **Flexible** (sliders icon) — "Core hours, required daily total"
  - **Open** (infinity icon) — "No set hours — total only"

The **Hours** section content swaps based on selection (see below).

### 3. Hours (conditional on shift type)
- **Fixed**:
  - **Time in** `*` + **Time out** `*` — `<input type="time">`, in a 2-col grid. Custom wrapper
    `.timefld`: leading clock glyph (absolute, left 12px, `--muted-2`), input `padding-left 38px`,
    `font-family --mono`. Defaults `08:00` / `17:00`.
  - **Grace period** (number, full width) — `.num-suffix` wrapper with a right-aligned "minutes"
    suffix (11.5px Instrument Sans 600 `--muted-2`, `padding-right 56px`). Hint below: "Allowed
    lateness before tardiness is recorded. `0` = strict." (the `0` is mono).
  - **Crosses midnight** checkbox row `.ckrow`: 20×20 custom checkbox (`--acc` when checked, white
    tick) + label "🌙 Crosses midnight — e.g. 22:00–06:00 night shift" (the "— e.g…" part is `--muted-2`).
- **Flexible**: **Core start** + **Core end** (time fields, 2-col) + **Required hours / day**
  (number, "hours" suffix, `step 0.5`). Hint: "Employees may start any time but must be present
  during core hours and hit the daily total."
- **Open**: **Required hours / day** only (number, "hours" suffix). Hint: "No fixed schedule — only
  the total worked hours are tracked against the daily target."

### 4. Break
- **Break duration** (number, "minutes" suffix) + **Break policy** (select) in a 2-col grid.
  - Break policy options: `Auto-deduct (Fixed)`, `Floating`, `Punch in / out`, `Paid break`.
- **Info note** `.fnote`: `bg #fbf7e9`, `border 1px solid #ece2c0`, `border-left 3px solid --acc`,
  `border-radius 9px`, padding `10px 13px`, margin-top 12px. A 17×17 round "i" badge (bg `#d9c98a`,
  color `#6b5a1e`) + text: "Worked hours = (last clock-out − first clock-in) − **{break} min**. No
  lunch punch needed." When policy = `Paid break`, the tail becomes "— break is paid, nothing
  deducted". The `{break} min` value updates live and is rendered in mono.

### 5. Work days `*`
- **Header row** `.days-head`: left = live hint "`{summary}` · `{N}` days / week" (e.g. "Mon–Fri · 5
  days / week"); right = preset buttons **Weekdays** / **All** / **Clear** (small pill buttons, bg
  `--bg`, `border 1px solid --line`, `border-radius 7px`, hover → `--acc-press` text + `--acc` border).
- **Day pills** `.daypills` (flex, gap 8px, wrap): seven buttons Mon…Sun. Each `.daypill`: `flex 1;
  min-width 56px; height 42px; border 1.5px solid --line; border-radius 10px`, Instrument Sans 600 /
  13px. Idle color `--muted`; weekend pills (Sat/Sun) get bg `--bg` (`.is-rest`). Selected `.is-on`:
  bg `--acc`, border `--acc`, color `#fff`, `box-shadow 0 6px 14px -8px rgba(232,105,58,.7)`.

### 6. Overtime
- **Auto-detect overtime** toggle card `.togrow`: `border 1px solid --line`, `border-radius 12px`,
  padding `13px 15px`, row flex gap 13px. `.is-on` → border `--acc`, bg `--acc-soft`. 34×34 icon tile
  (zap/bolt icon) + text block (title Instrument Sans 600 13.5px; subtext 11.5px `--muted-2`) + a
  44×25 pill toggle `.pa-toggle` on the right (track `#d8cfc2`, `--acc` when on; 19px white knob,
  translateX 19px on). Clicking anywhere on the row toggles it.
  - Subtext on: "Hours past time-out are flagged for approval automatically."
  - Subtext off: "Overtime requires a manual OT application — no auto-flagging."

---

## Footer live summary (left side)
A compact chip that recomputes on every change:
- **Paid hours**: big number `.fs-n` (Instrument Sans 700 / 16px, tabular-nums) + unit "h paid".
- A 1px vertical separator (`height 22px`, `--line`).
- **Meta** stacked: bold range line + day-pattern line (`--muted-2`).
  - Range text: Fixed → `08:00 → 17:00` (append ` +1` when crosses midnight); Flexible → `Core
    10:00–15:00`; Open → `Open hours`.
  - Day line: smart summary — contiguous runs collapse to `Mon–Fri`; 7 days → `Every day`; otherwise
    comma list; none → "No days selected".

### Computation rules
- Parse `HH:MM` to minutes. `span = out − in`; if `crosses midnight` OR `span ≤ 0`, add 1440.
- For **Flexible/Open**, `span = requiredHours × 60 + break` (so paid = requiredHours).
- `paid = span − break`. Display hours rounded to 1 decimal; show `—` when ≤ 0 / invalid.
- **Open** type shows no time range; paid = required hours.

---

## Interactions & Behavior
- **Open/close**: scrim fade 0.22s; modal `pop` 0.26s. Esc to close, click-scrim to dismiss, return
  focus to trigger. `role="dialog" aria-modal="true"`.
- **Edge seams**: header divider only when `data-top="false"`; footer divider only when
  `data-bottom="false"`. Recompute via scroll listener + ResizeObserver.
- **Shift-type cards**: clicking sets type and swaps the Hours fields.
- **Day presets**: Weekdays = Mon–Fri on; All = 7 on; Clear = none.
- **Toggle row & checkbox**: whole row is the click target.
- **Live summary + info note**: update on every relevant field change.
- **Transitions**: borders/backgrounds/box-shadows 0.12–0.18s; toggle knob 0.16s; card hover lifts
  border to `#ddd3c6`.
- **Responsive** (≤ 640px): `.typecards`, `.name-row`, `.fgrid` collapse to single column.

## State Management
Single form-state object (Add starts empty/defaults; Edit hydrates from the record):
```
name, code,
type: "Fixed" | "Flexible" | "Open",
timeIn, timeOut, grace, cross (bool),      // Fixed
coreIn, coreOut, reqHours,                  // Flexible / Open
breakMin, breakPolicy,
days: { Mon..Sun: bool },
autoOT (bool)
```
- `mode` ("Add" | "Edit") is a prop, not form state.
- Derived (not stored): span, paid hours, range text, day summary — compute from state on render.
- Required: `name`, `timeIn`+`timeOut` (Fixed), at least one work day. Wire to the app's real save +
  validation; Delete (Edit) opens the app's standard destructive-confirm modal (`sm`, danger tone).

## Design Tokens
```
--acc        #E8693A   accent / primary
--acc-press  #C2552F   primary hover, section labels
--acc-soft   #fdeee6   selected fills, icon tiles, focus ring
--ink        #2A2420   primary text
--muted      #6B6259   secondary text
--muted-2    #9b9085   tertiary text, suffixes, hints
--bg         #F6F2EC   app background, idle tiles
--paper      #ffffff   surfaces
--line       #ECE6DD   borders
--line-2     #f1ece4   subtle dividers
--danger     #C2402F   delete action
--danger-soft#fbe9e6   danger tint
ok           #4F9373
info tile    bg #e9eff7  color #3e63a0   (assigned banner)
note         bg #fbf7e9  border #ece2c0  accent-left #E8693A  text #6b5d3c
scrollbar    thumb #d9cfc2  hover #c3b29c  width 12px  inset 4px

Radii    modal 18 · cards/inputs/selects 9 · type/day/toggle cards 10–12 · icon tile 11 · pills 999
Inputs   height 40 (compact 36) · focus ring 3px --acc-soft · border --line
Buttons  radius 10 · padding 10px 17px · primary shadow 0 8px 18px -10px rgba(232,105,58,.75)
Type     Instrument Sans (UI/labels/headings) · Hanken Grotesk (body/inputs) · JetBrains Mono (times/codes)
Sizes    title 19/600 · section label 11/700 uppercase · field label 12/600 · input 13.5 · hint 11.5
```

## Assets
- **Icons**: inline SVG (Lucide-style, 1.9 stroke) — clock, edit/pencil, sliders, infinity, coffee,
  calendar, zap, moon, users, check, trash, close. Swap for the codebase's existing icon set.
- **Fonts**: Instrument Sans, Hanken Grotesk, JetBrains Mono (Google Fonts) — already the app's
  families.
- No raster/image assets.

## Files
- `Shift Schedule Modal.html` — the prototype (modal shell + shift form + Add/Edit modes + live
  summary). The form logic lives in the `useFormState` hook; the shell is the `Modal` component.
- Reference (not included): the app's reusable modal spec lives in `reusable-modal/` (`Sentire Modal
  System.html`, `README.md`) — this design follows that shell exactly.
- `padmin-shell.css` in the main project defines the matching `.pa-fld` / `.pa-input` / `.pa-toggle`
  primitives if you prefer to mirror class names.
