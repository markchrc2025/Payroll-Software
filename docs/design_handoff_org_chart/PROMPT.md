# Claude Code prompt — Organization Chart module

Paste the prompt below into Claude Code, run it from your app's repo root, and keep this `design_handoff_org_chart/` folder available so Claude can read the reference files.

---

## Prompt

> I'm adding an **Organization Chart** module to our HR/Payroll admin app. In `design_handoff_org_chart/` there is a runnable hi-fi **design reference** built in React + in-browser Babel on a standalone shell. **Do not copy it verbatim** — recreate the design in *our* codebase using our existing components, routing, state management, design tokens, and API layer. Read `design_handoff_org_chart/README.md` first (full spec), then `org-chart.jsx` (the only module file) and the `.oc-*` CSS inside `Organization Chart.html`.
>
> **What to build** — an Org Chart page that visualizes the company reporting structure as an interactive tree:
> - **Top-down tree** of nodes (CEO → COO/CFO → directors → managers → supervisors → ICs) with connector lines. Each **person card** shows avatar, name, position title, a department-coloured chip, and a direct-reports count with a collapse/expand toggle. Clicking a card opens that employee's profile.
> - **Vacant executive roles** (CEO/COO/CFO) render as dashed "Vacant" nodes. These come from the **Positions** module (department = Executive, no incumbent) — not hardcoded.
> - **Drag-to-reassign**: drag a person card onto another card to change their manager. Guard against dropping on self / current manager / any descendant (cycle). Persist by PATCHing the employee's `reportsToId`; show a confirmation toast; offer "Reset structure".
> - **Zoom & pan**: zoom buttons + Ctrl/Cmd-wheel (range ~0.4–1.6), drag empty canvas to pan, and a reset/center control. Auto-center on the root; zoom preserves the focal point.
> - **Search + Department + Branch filters**: dim non-matching nodes (keep the tree intact for context) rather than hiding them.
> - **Collapse/expand** any subtree + expand-all/collapse-all.
> - **Layout options** (tree / horizontal / outline) and a **department-colour** toggle exist in the reference as design Tweaks. **Tree is the default — ship that**; treat the others as optional.
>
> **Data & source of truth**:
> - Reporting structure = a `reportsToId` (manager) field **on the employee record**. Root = employee with no manager.
> - **Positions and Departments are owned by their own modules** — read titles/departments from there; render Executive-dept positions with no incumbent as vacant nodes. Don't duplicate that data in the org-chart feature.
> - Enforce the no-cycle rule on the server when updating a manager.
>
> **Fidelity**: high — match the design's spacing, the department colour palette, card layout, and the connector-line tree exactly, but using our component library and tokens. The README lists every colour, token, interaction, and state.
>
> Start by proposing where this fits in our routing/nav and which existing components you'll reuse, then implement. Ask me about anything our codebase does differently (e.g. how we model `reportsToId`, how we do drag-and-drop, or our preferred tree-rendering approach) before locking in decisions.

---

## Quick checklist for the implementer
- [ ] Route + sidebar entry (reference puts it under **Workforce**, after Departments)
- [ ] Top-down connector-line tree with person + vacant nodes
- [ ] Card: avatar · name · position · dept chip · reports count / collapse toggle · click→profile
- [ ] Drag-to-reassign with cycle guard → PATCH `reportsToId` (+ toast, reset)
- [ ] Zoom (buttons + Ctrl/Cmd-wheel) & pan (drag canvas), auto-center
- [ ] Search + department + branch filters (dim, don't hide)
- [ ] Collapse/expand (per-node + all)
- [ ] Department colour-coding (toggle), driven by the Departments module
- [ ] Positions/departments sourced from their modules; vacant exec roles from unfilled Executive positions
- [ ] (Optional) horizontal & outline layouts
