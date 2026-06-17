# Handoff: Leave Approval Workflow (Sentire Payroll — Admin)

## Overview
The **Leave Approval Workflow** module lets an HR Admin define reusable templates that control how an employee's leave request is routed and approved. Each template has a code, a description, an active flag, an ordered **approval sequence**, and a **notification** setting. Templates are assigned to employees via their Employment Terms.

This is a **redesign + rebuild** of the existing module (the current production screen is a cramped single-column form with a dropdown-style "Approver 1 / +5 More" list). The redesign introduces:
- A **list of workflow templates** (cards) → click into a **detail/editor**.
- A roomy **visual approval-sequence builder** — a vertical timeline of numbered stages you can **drag-to-reorder** (with up/down arrow fallbacks) and remove.
- A **redesigned "Notify additional recipients"** section (selectable option cards instead of a bare radio list).

### ⚠️ Key model decision — approvers are ORG-CHART ROLES, not specific people
Approval levels are **relative roles resolved against the organization chart at filing time** — e.g. *Supervisor, Line Manager, Head of Department, HR Manager, CEO / Owner*. The admin never picks a named employee; the system resolves each role to the actual person for the filing employee when a request is submitted. The notification recipients use the same role set. (The org chart itself is a separate, future feature — this module only references roles by key.)

## About the Design Files
This is a **runnable hi-fi prototype** built in React (via in-browser Babel) on top of the existing **Sentire Payroll admin shell**. It is a faithful design reference — **not production code to ship as-is**. Recreate it in the real codebase using the app's actual components, routing, state management, and API layer.

Open `Leave Approval Workflow.html` in a browser to interact with it:
- It boots the full admin shell with the **Leave Approval** page active (added to the sidebar under the **Time** group, next to Leave).
- Click a template → editor. Drag stages, add/remove levels, switch notify options, toggle Active, Save.
- A **Tweaks** panel (toolbar) exposes **Sequence layout: timeline / cards / list** plus shell theming. State persists to `localStorage` (`sentire-leaveflow-v2`).

## Fidelity
**High-fidelity.** Visuals follow the Sentire design system exactly (warm espresso/terracotta palette, Instrument Sans / Hanken Grotesk, `pa-*` shell primitives). Colors, spacing, radii, and interactions are all specified in the source files and summarized below.

## The implementation file
The **only module-specific file** is **`leave-workflow.jsx`** (~480 lines). Everything else in the bundle is the surrounding shell, included so the prototype runs:
- `leave-workflow.jsx` — **the module** (list + detail editor + sequence builder + role picker). Recreate this.
- `padmin-shell.css` — design-system CSS (tokens + `pa-*` primitives). The module's own `.lw-*` CSS lives in a `<style>` block inside `Leave Approval Workflow.html`.
- `padmin-shell.jsx` — shell primitives the module imports from `window`: `PIcon, Card, Btn, Badge, Toggle, PageHead, Drawer, PNav, NAV_GROUPS`.
- `padmin-data.jsx`, `padmin-pages-1/2/3.jsx`, `padmin-drawers.jsx`, `tweaks-panel.jsx` — the rest of the admin app + Tweaks engine, for context / so the shell renders. **Not part of this feature.**

## Screens / Views

### 1. Workflow list (`WorkflowList`)
- `PageHead`: title "Leave Approval Workflow", subtitle about routing across the org chart, primary action **New Workflow**.
- Responsive grid of template **cards** (`.lw-tcard`), each showing: leave icon tile, **Active/Inactive** badge, **code** (e.g. DEFAULT), description, a compact **role sequence** (small role-icon tiles separated by chevrons, `RoleStack`), "{n}-step approval", and a chevron affordance.
- A dashed **"New workflow template"** add-card at the end.
- Click a card → detail editor.

### 2. Workflow detail / editor (`WorkflowDetail`)
- **Breadcrumb**: Leave Approval Workflow › {code}.
- **Header** (`.lw-dethead`): icon tile, editable-looking title (the code), a sub line "{n}-step sequence · Notify: {label}", and on the right: an **Active** toggle pill, **Cancel**, **Save workflow** (flashes "Saved").
- **Two-column body** (`.lw-detgrid`, `1fr 360px`, stacks ≤1160px):
  - **Main — "Approval sequence" card**: header with description + **Add level** button (hidden once all roles are used). Body renders the **sequence builder** (below), or an empty-state when there are no levels. Below the card sits an info note: levels are resolved from the org chart at filing time; the workflow is assigned via Employment Terms.
  - **Side**: a **Details** card (Code* text input — force-uppercased; Description* textarea) and a **Notify additional recipients** card.

### 3. Sequence builder (`SequenceBuilder`) — 3 layouts (Tweak-switchable)
Operates on an ordered array of **role keys**. Each **stage** (`.lw-stage`) shows: drag grip, a numbered accent badge (1..n), a **role icon tile** (`RoleTile`), the role label + its resolution description, and actions (move up, move down, remove). Stages are `draggable` (HTML5 DnD reorder) **and** have up/down buttons.
- **timeline** (default): vertical line with a "Employee files leave" start node → numbered stage rows → an "Add approval level" dashed row → a green "Leave approved" end node.
- **cards**: horizontal flow — "Employee files" chip → arrow → stage cards (number badge top-left, grip top-right, actions footer) → "Add" → "Approved" chip.
- **list**: simple stacked rows + an "Add approval level" row.

### 4. Notify section
- Five **selectable option cards** (`.lw-notifyopt`, custom radio): *Do not notify additional recipients · Final approval only · Final approval / rejection · Final & interim approval / rejection / escalation · All application-related events.*
- When anything other than "Do not notify" is selected, a **Recipient roles** sub-section appears: an **Add** button opens the role picker; selected roles render as removable chips (`.lw-recip-chip`) with a role icon.

### 5. Role picker (`RolePicker`, in a `Drawer`)
- Right-side drawer listing the **org-chart roles** not already added, each as a row (role icon tile + label + description + add affordance). Used for both approval levels and recipient roles. When all roles are added, shows "All org-chart roles have been added."

## Org-chart roles (`ORG_ROLES`)
Ordered low → high. Each: `{ k, label, icon, desc }`.
| key | label | resolves to | icon (Lucide-style) |
|---|---|---|---|
| `supervisor` | Supervisor | The employee's direct supervisor | employees |
| `line_manager` | Line Manager | The employee's reporting manager | positions |
| `dept_head` | Head of Department | Head of the employee's department | departments |
| `hr_manager` | HR Manager | The HR manager on record | requests |
| `ceo` | CEO / Owner | Company owner or chief executive | roles |

> Replace this hardcoded list with the real org-chart role taxonomy once that module exists. Keep the model as **role keys**, resolved per-employee server-side at filing time.

## Data model (per template)
```js
{
  id: string,
  code: string,            // unique, uppercased (e.g. "DEFAULT")
  description: string,
  active: boolean,
  approvers: string[],     // ordered ORG-CHART ROLE KEYS — the approval sequence
  notify: "none" | "final" | "finalrej" | "interim" | "all",
  recipients: string[],    // ROLE KEYS notified per the notify setting
}
```
Seed templates in the prototype: **DEFAULT** (`line_manager → dept_head`, notify `finalrej`, recipient `hr_manager`, active), **EXECUTIVE** (`dept_head → ceo`, notify `interim`, recipient `hr_manager`, active), **FIELD STAFF** (`supervisor`, notify `none`, inactive).

## Interactions & Behavior
- **Reorder** a level: drag a stage, or use its up/down arrows. Order = approval order.
- **Add level / recipient**: opens the role picker drawer (excludes already-chosen roles; "Add" hidden when all are used).
- **Remove**: the × on a stage / chip.
- **Notify**: selecting an option reveals/hides the recipient sub-section.
- **Active toggle**, **Save** (persists; "Saved" flash), **Cancel/breadcrumb** (back to list).
- **New Workflow**: creates a blank template (empty sequence, notify `finalrej`) and opens it; the editor shows the empty-state until a level is added.
- A **template should have ≥1 approval level** before it's usable — enforce on save in production (the prototype doesn't hard-block).

## Design Tokens (from `padmin-shell.css`)
```
Accent          #E8693A   (--acc)        Accent pressed  #C2552F  (--acc-press)
Accent soft     #fdeee6   (--acc-soft)   Ink             #2A2420  (--ink)
Muted           #6B6259   (--muted)      Muted-2         #9b9085  (--muted-2)
Page bg         #F6F2EC   (--bg)         Paper           #ffffff  (--paper)
Line            #ECE6DD   (--line)       Line-2          #f1ece4  (--line-2)
Sidebar         #2E241C → #1f1813        Green (active)   #1f7a4d / #e7f4ec
Radius (--r) 14px · Fonts: Instrument Sans (UI), Hanken Grotesk (body), JetBrains Mono (numeric)
```
Module-specific `.lw-*` styles are in the `<style>` block of `Leave Approval Workflow.html`.

## Assets
- **Icons**: all inline SVG via the shell's `PIcon` (Lucide-style set). No raster assets.
- **Fonts**: Google Fonts (Instrument Sans, Hanken Grotesk, JetBrains Mono) — use the app's existing font setup.

## Notes for implementation
- This **replaces** the current `/leave/workflow` screen. Wire it to the same persistence/API; only the model (role-based approvers) and the UI change.
- The sidebar entry was added under the **Time** group as "Leave Approval"; confirm desired placement (Time vs Settings/near Leave Policies).
- Reuse the app's real components for inputs, buttons, drawers, toggles, and badges rather than re-deriving the `.lw-*`/`pa-*` styles — the tokens above are for parity-checking.
- The three sequence layouts are exposed as a design Tweak so stakeholders can pick a direction; **timeline is the recommended default**. You can ship just one.
