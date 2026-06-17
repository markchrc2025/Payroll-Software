# Handoff: Organization Chart (Sentire Payroll — Admin)

## Overview
The **Organization Chart** module lets an HR Admin define and visualize the company's **reporting structure** — who reports to whom, from the CEO down through COO/CFO, directors, managers, supervisors and individual contributors. It renders the whole company as an interactive tree, supports **drag-to-reassign** a person's manager, surfaces **vacant executive roles**, and filters/searches across the org.

It lives inside the existing **Sentire Payroll admin shell** as a new **Workforce → Org Chart** page (added to the sidebar right after Departments).

### Why it matters
The org chart is the backbone other modules resolve against — e.g. the **Leave Approval Workflow** routes requests through *relative* org-chart roles (Supervisor → Line Manager → Head of Department …). This module is where that structure is actually defined.

## About the Design Files
This bundle is a **runnable hi-fi prototype** built in React (via in-browser Babel) on top of the real Sentire admin shell. The files are a **design reference — not production code to ship as-is**. The task is to **recreate this design in the target codebase** using its established framework, components, routing, state, and API layer (React/Vue/etc.). If no front-end environment exists yet, pick the most appropriate one and implement there.

Open `Organization Chart.html` in a browser to interact with it:
- Boots the full admin shell with the **Org Chart** page active.
- **Drag any person card onto another card** to re-assign their manager (cycle-protected). A toast confirms; the change persists to `localStorage`.
- **Zoom** with the bottom-right control cluster, **Ctrl/Cmd + scroll wheel**, or pinch; **pan** by dragging empty canvas. The "%" label / target button **re-centers and resets** to 100%.
- **Search** + **department/branch filters** dim non-matches (hierarchy stays intact for context).
- **Collapse/expand** any subtree (toggle on the card), or all at once.
- Click a person → their **Employee profile** page.
- A **Tweaks** panel (toolbar) switches **Chart layout: tree / horizontal / outline** and toggles **department colours**.

## Fidelity
**High-fidelity.** Visuals follow the Sentire design system exactly (warm espresso/terracotta palette, Instrument Sans / Hanken Grotesk / JetBrains Mono, `pa-*` shell primitives). Colors, spacing, radii and interactions are specified in the source and summarized below. Recreate pixel-faithfully using the codebase's real components.

## The implementation file
The **only module-specific file** is **`org-chart.jsx`** (~430 lines). Everything else is the surrounding shell, included so the prototype runs:
- `org-chart.jsx` — **the module** (data tree + tree/horizontal/outline renderers + drag-reassign + zoom/pan + filters). Recreate this.
- `padmin-shell.css` — design-system CSS (tokens + `pa-*` primitives). The module's own `.oc-*` CSS lives in a `<style>` block inside `Organization Chart.html` — port it too.
- `padmin-shell.jsx` — shell primitives the module imports from `window`: `PIcon, Card, Btn, Badge, PageHead, Field, Select, EmpAvatar, PNav, NAV_GROUPS`.
- `padmin-data.jsx` — **mock data** (`window.PA`): `EMP`, `DEPARTMENTS`, `POSITIONS`, `BRANCHES`, etc. Replace with real API data (see Data model below).
- `padmin-pages-1/2/3.jsx`, `padmin-drawers.jsx`, `tweaks-panel.jsx` — the rest of the admin app + Tweaks engine, for context. **Not part of this feature.**

## Data model

### Source of truth
Positions and departments are **driven by their own modules**, not invented here:
- **Departments** come from `window.PA.DEPARTMENTS` (includes a new `Executive` department, head = *Vacant*, count 0). Department **colours** are derived from this list.
- **Positions** come from `window.PA.POSITIONS`. The three **C-level roles live there** as `dept: "Executive"` with `count: 0` (unfilled) and `level: "Executive"`. The chart renders any Executive-dept position with no incumbent as a **vacant node**.
- Every node's `position` / `dept` string resolves to a defined Position / Department.

### Node
```js
{
  id: string,            // "E-0007" for people, "V-CEO"/"V-COO"/"V-CFO" for vacant exec roles
  name: string,          // person's name; "Unfilled position" for vacant
  position: string,      // job title (from POSITIONS)
  dept: string,          // department name (from DEPARTMENTS)
  branch: string,        // branch / location
  initials: string,
  vacant: boolean,
}
```

### Reporting lines
A single map `managerId(nodeId) → parentNodeId | null` defines the tree (root = the node whose manager is `null`, i.e. the CEO).
- The prototype seeds it in `OC_BASE_MANAGER` and overlays user drag-edits stored in `localStorage["sentire-orgchart-v1"]` (`{ [employeeId]: newManagerId }`).
- **In production, persist `managerId` (a.k.a. `reportsToId`) on the employee record** and PATCH it when a card is dropped. Reporting lines are *not* part of the Positions module — they belong on the employee.
- The executive reporting relationships (CEO ← COO, CEO ← CFO) are defined in `OC_EXEC_META`.

**Hierarchy in the prototype (5 levels):**
`CEO (vacant)` → `COO (vacant)`, `CFO (vacant)`, `HR Director`, `Sales Director` → managers (`Operations Manager`, `Engineering Lead`, `Warehouse Supervisor`, `Finance Manager`, …) → supervisors / seniors → associates / engineers.

## Screens / Views

### Page header + stat strip
- `PageHead`: title **"Organization Chart"**, subtitle "Define the company's reporting structure — drag any person onto a new manager to re-assign them." Actions: **Export** (ghost) and **Reset structure** (ghost, only shown when drag-edits exist — clears overrides).
- **Stat strip** (`.oc-statbar`): People · Departments · Vacant roles · Reporting levels (computed max depth), plus a hint "Drag a card onto a manager to re-assign reporting."

### Toolbar (`.oc-toolbar`)
- **Search** field (name / position / id), **Department** select (from `DEPARTMENTS`), **Branch** select (from `BRANCHES`).
- Right side: a **match count** pill when filtering, and **expand-all / collapse-all** buttons (hidden in horizontal layout).

### Chart canvas — 3 layouts (Tweak-switchable)
A scrollable, zoomable/pannable stage (`.oc-stage` › `.oc-scroll` › `.oc-zoomwrap` › `.oc-canvas`). The canvas is `transform: scale(zoom)`; the zoom-wrap is sized to `natural × zoom` so scrollbars track the scaled content. Auto-centers on the root per layout; zoom preserves the focal point.

- **tree** (default): classic **top-down** boxes with CSS connector lines (nested `ul`/`li`, `::before`/`::after` borders form the bus + drops). Recommended default.
- **horizontal**: same tree rotated **left-to-right**.
- **outline**: indented, expandable **list** (`.oc-orow`) with depth rails — compact, no zoom needed.

### Person card (`.oc-card`)
Fixed 212px. A top **dept-colour strip**, then avatar (initials, dept-tinted) + **name** (primary) + **position** (secondary), and a footer with a **department chip** and a **collapse toggle** showing the direct-report count. `draggable`; clicking the body opens the employee profile.

### Vacant card (`.oc-card.is-vacant`)
Dashed border, hatched background, briefcase glyph, the **position title** as the label, and a **"Vacant"** badge. Not draggable (execs are structural) but is a valid **drop target**.

## Interactions & Behavior
- **Drag-to-reassign**: HTML5 DnD. On drop, set the dragged person's manager to the target. **Guards**: can't drop on self, on a current manager (no-op), or on any descendant (cycle prevention); vacant nodes can't be dragged. Drop target gets an accent ring; a toast announces the change; persists.
- **Zoom**: buttons (±0.15), **Ctrl/Cmd + wheel** (`{ passive:false }` listener, `preventDefault`), range **0.4–1.6**. The "%" label and the target icon **reset to 100% and re-center**. Persisted to `localStorage["sentire-orgchart-zoom-v1"]`.
- **Pan**: pointer-drag on empty canvas (skipped when the pointer starts on a `.oc-card`); cursor `grab`/`grabbing`.
- **Collapse/expand**: per-node toggle; expand-all / collapse-all in the toolbar (collapse-all keeps the root open).
- **Filter / search**: matches stay fully opaque (search matches also get an accent ring); non-matches dim to ~0.26 with slight grayscale — the tree shape is preserved so people keep context.
- **Open profile**: click a person card → `nav.go("employee", id)`.
- **Responsive**: stat strip wraps ≤1160px; the canvas always scrolls.

## State
```
overrides   {empId: managerId}        // drag edits, persisted (sentire-orgchart-v1)
collapsed   Set<nodeId>               // session
q / dept / branch                     // filters
zoom        number 0.4–1.6            // persisted (sentire-orgchart-zoom-v1)
natSize     {w,h}                     // measured natural canvas size (offsetWidth/Height)
dragId / dropId / panning             // transient interaction state
```

## Design Tokens (from `padmin-shell.css`)
```
Accent       #E8693A (--acc)     Accent pressed #C2552F (--acc-press)   Accent soft #fdeee6 (--acc-soft)
Ink          #2A2420 (--ink)     Muted #6B6259 (--muted)                Muted-2 #9b9085 (--muted-2)
Page bg      #F6F2EC (--bg)      Paper #ffffff (--paper)                Line #ECE6DD (--line) / #f1ece4 (--line-2)
Sidebar      #2E241C → #1f1813   Radius (--r) 14px
Fonts: Instrument Sans (UI/headings), Hanken Grotesk (body), JetBrains Mono (numeric/IDs)
```
**Department colours** (used for strips, chips, avatar tints — toggleable):
```
Executive #C7913D · Operations #E8693A · Engineering #3E63A0 · Finance & Accounting #4F9373
Sales & Marketing #A0627D · People & Culture #5E7FB1 · Warehouse #8A6253
```
Module-specific `.oc-*` styles are in the `<style>` block of `Organization Chart.html`.

## Assets
- **Icons**: inline SVG via the shell's `PIcon` (Lucide-style set); the zoom controls use three small inline SVGs (minus / plus / frame-target). No raster assets.
- **Fonts**: Google Fonts (Instrument Sans, Hanken Grotesk, JetBrains Mono) — use the app's existing font setup.

## Notes for implementation
- Reuse the app's **real** components (cards, buttons, selects, badges, avatars) rather than re-deriving `.oc-*`/`pa-*`; tokens above are for parity-checking.
- Persist reporting lines as `reportsToId` **on the employee**; PATCH on drop. Keep the cycle guard server-side too.
- Consider a dedicated tree-layout lib for very large orgs (virtualization, edge routing) — the CSS-connector approach is clean up to a few hundred nodes.
- `Export` is a stub — wire to PNG/PDF/CSV as needed.
- The three layouts are exposed as a Tweak so stakeholders can choose; **tree is the recommended default** — you can ship just one.

## Files
- `Organization Chart.html` — entry point; boots the shell + module; contains all `.oc-*` CSS and the Tweaks wiring.
- `org-chart.jsx` — **the module** (recreate this).
- `padmin-shell.css`, `padmin-shell.jsx`, `padmin-data.jsx`, `padmin-pages-1/2/3.jsx`, `padmin-drawers.jsx`, `tweaks-panel.jsx` — surrounding shell/context.
- `padmin-assets/` — app icon.
- `PROMPT.md` — a ready-to-paste prompt for Claude Code.
