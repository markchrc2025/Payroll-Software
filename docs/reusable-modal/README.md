# Sentire — Reusable Modal Shell (Handoff)

## What broke
The **Add Role** modal (Settings → Custom Roles) scrolled badly: the native browser scrollbar
sat hard against the permission-table cells, the dialog title/fields and the table scrolled as one
undifferentiated block, and the column header (MODULE / VIEW / CREATE …) scrolled out of view so you
lost the column meaning halfway down. The submit buttons also got pushed under the fold.

## The fix — one shell, three rigid regions
Replace every ad-hoc modal with **one shared `Modal` component** built as a flex column with three
regions that never blend:

```
┌─ m-head   (fixed)  icon · title · subtitle · close ───────────┐
│                                                               │
│   m-scroll (the ONLY scrolling region)                        │ ← scrollbar lives here,
│                                                               │   in a stable inset gutter
├─ m-foot   (fixed)  hint · Cancel · Primary ───────────────────┤
└───────────────────────────────────────────────────────────────┘
```

Key rules that fix the scrollbar:

1. **Only `m-scroll` scrolls.** Header and footer are `flex: none` and stay pinned. The buttons can
   never fall under the fold.
2. **The scrollbar sits in a stable, inset gutter** — it can never collide with content again:
   - `scrollbar-gutter: stable` so the layout doesn't shift when the bar appears.
   - A slim, fully-rounded thumb floated inside a transparent gutter via
     `border: 4px solid transparent; background-clip: padding-box;` (WebKit) and
     `scrollbar-width: thin` (Firefox). The thumb is visually ~4px in from the edge.
3. **Sticky table header.** Inside a scrolling data table (the permission matrix), the column-header
   row is `position: sticky; top: …` so VIEW/CREATE/EDIT/… stay readable the whole way down.
4. **Edge seams only when needed.** `m-head` shows its bottom border + soft shadow **only** when the
   body is scrolled away from the top (`data-top="false"`), and `m-foot` shows its top border only
   when there's more content below (`data-bottom="false"`). A short modal that fits has no seams at
   all — no false "there's more" affordance.
5. **Size, don't sprawl.** Width is a token (`sm 460 / md 640 / lg 880`); height is capped at
   `min(720px, 100vh − 56px)` and only then does the body scroll.

## Live reference
`Sentire Modal System.html` — a working prototype (HTML + React via in-browser Babel). It is a
**design reference, not production code.** Rebuild the shell with your real component library, then
reuse it everywhere. The Tweaks panel (top-right, toggle in the toolbar) flips between three
contents to prove the one shell scales:
- **Permissions matrix** — the Add Role case that broke (long, scrolls, sticky table header).
- **Form** — Edit Employee (md width, sectioned 2-col grid).
- **Confirm** — Delete role (sm width, danger tone, no scroll → no seams).
Plus **Width** (auto / sm / md / lg) and **Density** (comfortable / compact).

`tweaks-panel.jsx` is the reviewer harness — **drop it** when you implement.

## Design tokens (already in the app's system)
```
--acc:#E8693A  --acc-press:#C2552F  --acc-soft:#fdeee6
--ink:#2A2420  --muted:#6B6259  --muted-2:#9b9085
--bg:#F6F2EC   --paper:#fff      --line:#ECE6DD  --line-2:#f1ece4
--ok:#4F9373   --danger:#C2402F  --danger-soft:#fbe9e6
Scrollbar: thumb #d9cfc2 (hover #c3b29c) · track transparent · width 12px · inset 4px
Radii: modal 18 · inputs/selects 9 · buttons 10 · icon tile 11
Type:  Instrument Sans (UI/labels/headings) · Hanken Grotesk (body/inputs) · JetBrains Mono
Sizes: title 19/600 · field label 12/600 · input 13.5 · section label 11/700 uppercase
Controls: input height 38 (compact 35) · focus ring 3px var(--acc-soft)
```

---

## Claude Code prompt — paste this

> **Build a reusable `Modal` component for the Sentire Payroll admin app and migrate the Add Role
> dialog onto it.** The current modals scroll badly — the native scrollbar collides with table cells,
> the whole dialog scrolls as one block, table column headers scroll out of view, and action buttons
> fall under the fold. Fix this with one shared shell.
>
> **Component API**
> ```tsx
> <Modal
>   size="sm" | "md" | "lg"            // 460 / 640 / 880px; default md
>   icon={<Shield/>} iconTone="default" | "danger"
>   title="Add Role"
>   subtitle="Name the role and tick the actions it may perform in each module."
>   footerHint={<>…required field hint…</>}
>   actions={<><Button variant="ghost">Cancel</Button><Button variant="primary">Create Role</Button></>}
>   onClose={…}
> >
>   {/* body content — the ONLY scrolling region */}
> </Modal>
> ```
>
> **Structure** — a flex column with three regions:
> - `header` (`flex: none`, fixed): icon tile (38×38, `--acc-soft` bg / `--danger-soft` when
>   `iconTone="danger"`) + title (Instrument Sans 600/19) + one-line subtitle (12.5 muted) on the
>   left; 34×34 bordered close button on the right.
> - `scroll` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`): the body. Apply
>   `scrollbar-gutter: stable`, `scrollbar-width: thin; scrollbar-color: #d9cfc2 transparent`, and
>   WebKit `::-webkit-scrollbar{width:12px}` + thumb `background:#d9cfc2; border-radius:99px;
>   border:4px solid transparent; background-clip:padding-box` (hover `#c3b29c`), track transparent.
>   The thumb must sit inset in a gutter and never overlap content.
> - `footer` (`flex: none`, fixed): left hint, right action buttons. Buttons must never scroll.
>
> **Scroll-edge seams (no false affordances):** track scroll position and set `data-top` / `data-bottom`
> on the root. Show the header's bottom border + a soft shadow **only** when `data-top="false"`, and
> the footer's top border **only** when `data-bottom="false"`. A modal whose content fits shows neither.
> Use a scroll listener + a ResizeObserver to recompute.
>
> **Sizing:** width by `size` token; `max-height: min(720px, 100vh - 56px)`; the body scrolls only
> after that cap. Centered, `role="dialog" aria-modal="true"`, scrim `rgba(33,26,21,.46)` + 2.5px
> blur, Esc to close, focus trap, return focus to trigger on close, click-scrim-to-dismiss.
>
> **Data tables inside a modal (Add Role permission matrix):** render the table inside the scroll
> region and make the column-header row `position: sticky; top: 0` with a solid `#faf7f2` background so
> VIEW / CREATE / EDIT / DELETE / APPROVE / EXPORT stay visible while rows scroll. Use a CSS grid
> (`1.5fr repeat(6, 1fr)`) for perfect column alignment; render disallowed actions as a muted "—",
> not a checkbox. Keep a sticky "N selected · Toggle full access" bar above the table.
>
> **Tokens / styling:** use the existing design system — accent `#E8693A` (press `#C2552F`, soft
> `#fdeee6`), ink `#2A2420`, line `#ECE6DD`, danger `#C2402F`; radii modal 18 / input 9 / button 10;
> Instrument Sans for UI + Hanken Grotesk for inputs; input height 38px, focus ring 3px `--acc-soft`.
> Reuse the app's existing Input / Select / Button / Checkbox primitives — don't reinvent them.
>
> **Then migrate Add Role** (Settings → Custom Roles) to `<Modal size="lg">`, and adopt the same shell
> for the other dialogs (Edit Employee → `md`, destructive confirms → `sm` with `iconTone="danger"`).
> Match the reference prototype `Sentire Modal System.html` for layout, spacing, and copy.

## Files
- `Sentire Modal System.html` — the prototype (shell + 3 example contents + Tweaks).
- `tweaks-panel.jsx` — reviewer harness (not production).
- `assets/sentire-mark-dark.svg` — brand mark (reference).
