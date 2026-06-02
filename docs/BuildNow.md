
## THE PROMPT

Rebuild the Holiday Calendar page (`/settings/holiday-calendar` or equivalent) from scratch. The current implementation is a plain list/table. Replace it entirely with a **visual full-month calendar** where HR Admins can see, add, edit, and delete holidays directly from the calendar grid. The design and behavior are specified in full below.

---

### Layout overview

The page has two main areas side by side:

**Left — Calendar panel (main, ~65% width)**
- Full month calendar grid
- Year + month navigation
- Holidays rendered as colored chips on their dates
- Clicking a date opens the Add Holiday modal (pre-filled with that date)
- Clicking an existing holiday chip opens the Edit Holiday modal

**Right — Holiday list panel (~35% width)**
- Shows all holidays for the currently selected month, sorted by date
- Each item shows: date, name, category badge, region (if area-specific)
- Edit and delete actions per item
- A "Load PH National Holidays" quick-fill button at the top (see below)

---

### Calendar grid specification

- Display a standard 7-column grid: **Sun → Sat**
- Header row: Sun · Mon · Tue · Wed · Thu · Fri · Sat (short labels, muted color)
- Each day cell: shows the day number top-left
- Cells for days outside the current month are greyed out and non-interactive
- Today's date: subtle background highlight (e.g., `bg-blue-50 border border-blue-200`)
- Holidays on a date appear as **colored pill chips** below the day number, stacked vertically if multiple holidays fall on the same date
- If more than 2 holidays fall on one date, show 2 chips and a `+N more` overflow link
- Month navigation: `← Previous` and `Next →` arrow buttons with the current month + year label centered between them (e.g., `June 2026`)
- Year jump: a year selector dropdown next to the month label so HR can quickly jump to a different year (range: current year − 1 to current year + 3)

---

### Holiday categories, colors, and payroll multipliers

Use these 4 categories consistently across the calendar chips, list panel, and form dropdowns:

| Category | Chip color | Badge label | DOLE Multiplier | Notes |
|---|---|---|---|---|
| Legal Holiday | Red — `bg-red-100 text-red-700 border-red-200` | Legal Holiday | 200% | Also called Regular Holiday under DOLE |
| Special Non-Working Holiday | Amber — `bg-amber-100 text-amber-700 border-amber-200` | Special Non-Working | 130% | Nationwide, declared by proclamation |
| Special One-Time Holiday | Purple — `bg-purple-100 text-purple-700 border-purple-200` | Special One-Time | 130% | Presidential proclamation, not recurring |
| Area-Specific Holiday | Teal — `bg-teal-100 text-teal-700 border-teal-200` | Area-Specific | 130% | Region/city/province-level holiday |

Show the DOLE multiplier as a small muted label inside the chips on the calendar (e.g., `Rizal Day · 200%`) so HR always sees the payroll impact at a glance.

---

### Add / Edit Holiday modal

Use the **centered floating modal** design from Prompt 1 (max-w-lg, rounded-2xl, header + scrollable body + footer).

**Fields:**

```
Holiday Name *           [text input]
Category *               [dropdown: Legal Holiday / Special Non-Working / Special One-Time / Area-Specific]
Date *                   [date picker — pre-filled if opened by clicking a calendar cell]
Recurring Annually       [toggle/checkbox — if ON, this holiday repeats every year on the same date]
```

**Conditional field — show only when Category = "Area-Specific":**

```
Region *                 [dropdown — Philippine regions listed below]
Province / City          [optional text input or secondary dropdown for more granular scoping]
```

**Conditional field — scope (show for all categories):**

```
Scope                    [radio buttons]
                           ○ Company-wide (applies to all branches)
                           ○ Branch-specific (multiselect of active branches)
```

**If Branch-specific is selected:**
```
Select Branches *        [multiselect dropdown of all active company branches]
```

**Optional:**
```
Proclamation Reference   [text input, optional — e.g., "Proclamation No. 368, s. 2023"]
Notes                    [textarea, optional]
```

**Footer buttons:**
- Cancel — `variant outline`
- Save Holiday — `bg-[#1E3A5F] text-white`

---

### Philippine regions for the Area-Specific dropdown

Populate the Region dropdown with the complete official list:

```
NCR — National Capital Region
CAR — Cordillera Administrative Region
Region I — Ilocos Region
Region II — Cagayan Valley
Region III — Central Luzon
Region IV-A — CALABARZON
Region IV-B — MIMAROPA
Region V — Bicol Region
Region VI — Western Visayas
Region VII — Central Visayas
Region VIII — Eastern Visayas
Region IX — Zamboanga Peninsula
Region X — Northern Mindanao
Region XI — Davao Region
Region XII — SOCCSKSARGEN
Region XIII — Caraga
BARMM — Bangsamoro Autonomous Region in Muslim Mindanao
```

---

### "Load PH National Holidays" quick-fill button

Place this button at the top of the right-side list panel. When clicked:
- Show a confirmation modal: "Load official Philippine national holidays for [selected year]? This will not overwrite existing holidays — only add missing ones."
- On confirm: seed the calendar with the standard Legal Holidays and Special Non-Working Holidays for the selected year
- The pre-loaded holidays to seed (recurring annually):

**Legal Holidays (200%):**
- January 1 — New Year's Day
- April 9 — Araw ng Kagitingan (Bataan and Corregidor Day)
- May 1 — Labor Day
- June 12 — Independence Day
- August 25 — National Heroes Day (last Monday of August — compute dynamically)
- November 30 — Bonifacio Day
- December 25 — Christmas Day
- December 30 — Rizal Day
- Moveable: Maundy Thursday, Good Friday (compute from Easter for the selected year)
- Moveable: Eid'l Fitr, Eid'l Adha (mark as TBD if exact date not yet proclaimed — show with a `*` and a tooltip "Exact date subject to proclamation")

**Special Non-Working Holidays (130%):**
- August 21 — Ninoy Aquino Day
- November 1 — All Saints' Day
- November 2 — All Souls' Day
- December 8 — Feast of the Immaculate Conception
- December 24 — Christmas Eve
- December 31 — New Year's Eve

Do not seed Special One-Time or Area-Specific holidays — those are manual.

---

### Delete behavior

- Clicking Delete on a holiday shows a confirmation: "Delete [Holiday Name] on [Date]? This will remove it from payroll computation for all future runs."
- If the holiday is `recurring = true`, ask: "Delete only this year's occurrence, or all future occurrences?"
  - Option A: Delete this year only
  - Option B: Delete permanently (removes the recurring record)

---

### Data model changes required

Add or update the `Holiday` table to support:

```
id
company_id (tenant)
name
category: ENUM('LEGAL', 'SPECIAL_NON_WORKING', 'SPECIAL_ONE_TIME', 'AREA_SPECIFIC')
date (YYYY-MM-DD)
recurring_annually: boolean
scope: ENUM('COMPANY_WIDE', 'BRANCH_SPECIFIC')
branch_ids: array (null if company-wide)
region: string (null unless AREA_SPECIFIC)
province_city: string (optional)
proclamation_reference: string (optional)
notes: text (optional)
created_by: user_id
created_at
updated_at
```

The payroll engine must read from this table when determining holiday multipliers. It should:
1. Match by `date` for the payroll period
2. Check `scope` — if `BRANCH_SPECIFIC`, only apply to employees assigned to the matching branches
3. If `AREA_SPECIFIC`, only apply to employees whose assigned branch is in the matching region

---

### Validation checklist after implementation

- [ ] Calendar renders as a proper month grid with correct day-of-week alignment
- [ ] Month and year navigation works correctly
- [ ] Holiday chips appear on the correct dates with the correct category colors
- [ ] DOLE multiplier (200% / 130%) is visible on each chip
- [ ] Clicking a date opens Add Holiday modal with date pre-filled
- [ ] Clicking a chip opens Edit Holiday modal pre-filled with that holiday's data
- [ ] Area-Specific category shows the Region dropdown
- [ ] Branch-specific scope shows the branch multiselect
- [ ] Load PH National Holidays seeds correctly without overwriting existing entries
- [ ] Moveable holidays (Easter-based, Eid) are computed correctly or flagged as TBD
- [ ] Delete with recurring confirmation works for both single-year and permanent deletion
- [ ] Payroll engine correctly reads holiday data by date, scope, and branch
- [ ] Area-Specific holidays only apply to employees in the matching region's branches

---

*Do not change the payroll computation multipliers — those are already correct in the engine. Only fix the Holiday Calendar UI, its data model, and the engine's holiday lookup query.*
