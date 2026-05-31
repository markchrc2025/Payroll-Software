## T&A / DTR: Blueprint vs. Current System

### What the Blueprint Defines

The DTR workflow has **three distinct layers** per day and a **period-level submission** concept:

**Three Layers per Day:**
| Layer | Fields | Who Owns It | Mutable? |
|---|---|---|---|
| **Official** | `official_time_in`, `official_time_out` | GPS/selfie capture | Immutable (never edited) |
| **Manual** | `manual_time_in`, `manual_time_out` + `reason_code` + `notes` + `actor` | Employee (pre-submit) or Supervisor | Audited override |
| **Effective** | `effective_time_in`, `effective_time_out` | System-computed | Auto-derived |

**Override priority:** Supervisor manual > Employee manual > Official captured.

**Period Submission Flow (not daily):**
```
Employee submits DTR (end of cutoff)
    → Supervisor reviews/edits manual layer → Supervisor Approved
        → Manager reviews audit log (read-only) → Manager Approved
            → Payroll Engine consumes
```
The payroll engine **only accepts `Manager Approved` submissions** — unapproved ones are flagged in pre-run review.

**Supporting models required:**
- `DTRSubmission` — one row per employee per cutoff period; tracks multi-step status (`SUBMITTED / SUPERVISOR_APPROVED / MANAGER_APPROVED / RETURNED`)
- `DTRAuditLog` — immutable log of every manual field edit (actor, role, old/new value, reason, timestamp)

---

### What Currently Exists

**Schema — `DTRRecord`** (schema.prisma):
- Stores **computed aggregate minutes**: `workedMinutes`, `lateMinutes`, `undertimeMinutes`, `otMinutes`, `nsdMinutes`
- `approvalStatus: DTRStatus` — only `PENDING / APPROVED / REJECTED` (flat, single-step)
- **No three-layer time fields** — official/manual/effective timestamps don't exist
- Has `isLocked` for payroll finalize

**Schema — `AttendanceLog`** (schema.prisma):
- Raw punch records (IN/OUT) with GPS, selfie key, geofence flags — this IS the official layer source
- Correctly immutable

**Schema — `DTRApprovalConfig`** (schema.prisma):
- Config model exists (`requiresSupervisorVerification`, `requiresManagerApproval`, deadline hours)
- The *config* is ready, but the *process* it governs isn't implemented yet

**Missing from schema:**
- `DTRSubmission` — period-level grouping model with multi-step status
- `DTRAuditLog` (or equivalent) — audit trail for manual edits
- The three-layer time columns on `DTRRecord`

**API — `/api/dtr`** (route.ts):
- Lists and upserts individual `DTRRecord` rows
- `/api/dtr/[id]/approve` and `/reject` — single-step approval only

**UI — `DtrRecordsTab`** (DtrRecordsTab.tsx):
- Shows individual daily rows per employee
- Approve/Reject buttons on each row
- **Does not match the blueprint's period-submission view** (should be one row per employee per cutoff, drill-down to daily breakdown)

---

### Gap Summary & What Needs to Be Built

| # | Gap | Impact |
|---|---|---|
| 1 | `DTRRecord` has no `official_time_in/out`, `manual_time_in/out`, `effective_time_in/out` columns | Payroll engine cannot compute hours correctly from time data; currently uses pre-aggregated minutes |
| 2 | No `DTRSubmission` model | Can't track period-level approval state; supervisor/manager chain has no data anchor |
| 3 | No `DTRAuditLog` model | Manager has no audit trail to review; DOLE audit exposure |
| 4 | Approval flow is single-step (APPROVED/REJECTED) | Doesn't match Submitted → Supervisor Approved → Manager Approved chain |
| 5 | Admin DTR UI shows daily rows, not period submissions | Wrong mental model; HR can't see "which employees have submitted for this cutoff" |
| 6 | ESS manual entry flow (`/ess/dtr`) not wired to `DTRRecord` manual layer | Employees can't correct missed clock-ins before submitting |

---

### How I Would Apply This

The build is naturally sequenced in two tracks:

**Track A — Schema migration (foundation):**
1. Add `official_time_in/out`, `manual_time_in/out`, `manual_reason_code`, `manual_actor_id/role`, `effective_time_in/out` to `DTRRecord`
2. Add `DTRSubmission` model with `status` enum (`SUBMITTED / SUPERVISOR_APPROVED / MANAGER_APPROVED / RETURNED`) and FK to `PayrollPeriod` + `Employee`
3. Add `DTRAuditLog` model (immutable append)
4. Migrate `DTRStatus` from 3-value to match the new submission statuses

**Track B — API + UI layer (on top of schema):**
5. New `/api/dtr/submissions` — list by cutoff, filter by status
6. `/api/dtr/submissions/[id]/approve-supervisor` and `approve-manager` and `return`
7. Admin UI: rewrite `DtrRecordsTab` to show period-submission view with daily drill-down
8. ESS: wire manual entry form to save `manual_time_in/out` + write `DTRAuditLog`

**Payroll engine dependency:**
Currently the engine reads `PeriodInput` (manually entered `daysWorked`, `lateUndertimeMinutes`, etc.). Once the DTR pipeline is complete, a new step compiles `DTRSubmission` (Manager Approved) → `PeriodInput` automatically, removing the need for manual HR data entry.

---
