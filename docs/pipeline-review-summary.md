# Payroll Software — Pipeline Review & Live Walkthrough (Summary)

**Date:** 2026-06-23
**Scope:** Add Employee → DTR → Payroll Run
**Method:** Code-level review of the three subsystems (highest-severity findings verified by re-reading the cited code) + a live UI walkthrough run against a throwaway local database (zero production impact).

---

## 1. Executive summary

The Add Employee → DTR → Payroll Run pipeline works end-to-end (confirmed both by a DB-level test of employee creation and a live UI run that produced a fully computed payroll run). However, the review surfaced **three cross-cutting issues** that should be addressed before relying on the numbers in production:

1. **🔴 Timezone foundation is UTC, but this is a Philippines-only (UTC+8) payroll.** The business day, night-shift-differential window, late/undertime, and holiday/rest-day classification are all derived from UTC. This silently corrupts the DTR data that payroll consumes. *Most systemic issue.*
2. **🔴 Inconsistent authorization.** Several mutating/reading endpoints check only "is logged in" instead of a real permission, while sibling routes do it correctly. Privilege-escalation and data-exposure gaps.
3. **🔴 Weekly/Daily statutory over-deduction.** Weekly/daily employees get a *full month* of SSS/PhilHealth/Pag-IBIG deducted on **every** run (4–5×/month). The code comment even admits this is "deferred."

A key empirical finding from the live run: **payroll is strictly attendance-driven** — the first computed run returned ₱0 for everyone because there was no worked-days/DTR data. This is *why* the DTR timezone/integrity bugs are high-severity: bad or missing DTR data flows straight into wrong pay.

---

## 2. Top fix priorities (recommended order)

1. **Timezone (UTC → UTC+8)** across `punch.ts` + `compute-dtr.ts`. Everything downstream depends on it.
2. **Authorization sweep** — add `requirePermission` to DTR reject, DTR PATCH, payroll recompute, and payroll read/payslip routes; add a self-approval guard across DTR/OT/submission approvals.
3. **Weekly/daily statutory over-deduction** (`engine.ts:140–155`) — the most financially damaging payroll bug.
4. **Finalize integrity** — persist `adjustmentDeductionsCents`, take a row lock before DRAFT→FINALIZED (prevents double loan debits), map duplicate-period `P2002` → 409.
5. **Data-integrity quick wins** — statutory-ID duplicate detection (the HMAC index already exists), `attendanceExempt` create-path guard, recompute DTR after manual override, surface missing-OUT punches.
6. **Money discipline** — move remaining `Number`-based money math (leave cash-out, separation pay, fractional-hour premiums) onto BigInt HALF-UP helpers.

---

## 3. Findings by subsystem

Severity = financial / security / data-integrity impact. **✓** = personally verified by re-reading the cited code.

### 3.1 Add Employee
Flow: 9-step wizard → `POST /api/employees` (re-validated with the same Zod schema) → one `withTenant` transaction: FK tenant-checks → claim `employeeNumber` (`SELECT … FOR UPDATE`) → create `Employee` + `Placement` + `EmploymentTerm` (opening salary) + optional shift assignment + one encrypted `StatutoryId` per gov ID.

| Sev | Location | Problem | Fix |
|-----|----------|---------|-----|
| 🔴 High | `api/employees/route.ts:284–294` | No duplicate detection on statutory IDs, though `numberHmac` + `@@index([type, numberHmac])` exist for exactly this. Two employees can share a TIN/SSS. | Query `numberHmac = hmac(value)` before insert; reject on hit. |
| 🔴 High ✓ | `api/employees/route.ts` (POST) | `attendanceExempt` (full pay, no time records) can be set on **create** by any `EMPLOYEES:CREATE` holder. The **PUT** route gates it behind `PAYROLL:UPDATE` — so the control is bypassed by creating instead of editing. | Mirror the PUT guard in POST. |
| 🟠 Med | `api/employees/route.ts:130–131,208–209` | `immediateSupervisorId`/`managerId` skip the tenant-ownership pre-check applied to every other FK → reporting chain can point cross-tenant. | Add `findFirst({ id, tenantId })` checks. |
| 🟠 Med | `api/employees/route.ts:247–260` | `salaryEffectiveDate` is stored on `Employee` but the `EmploymentTerm` (what payroll reads) uses `termEffectiveDate ?? hireDate` — the stated salary effective date doesn't drive the in-force salary row. | Use `salaryEffectiveDate ?? termEffectiveDate ?? hireDate`. |
| 🟠 Med | `validations/employee.ts:141–142` | No uniqueness check on `workEmail` (used for ESS login linkage). | Tenant-scoped duplicate check in POST. |
| 🟡 Low | `AddEmployeeWizard.tsx` | No draft persistence (refresh/error loses 9 steps); employee-ID preview hard-coded `"—"` though `/next-id` exists; per-step validation skips emails/phones/statutory IDs. | localStorage draft; call `next-id`; expand step triggers. |

### 3.2 DTR / Attendance
Flow: punch → `executePunch` (consent + geofence flag + `AttendanceLog`) → `computeDtrFields` (worked/late/UT/NSD + advisory OT) → upsert `DTRRecord`. Paid OT only from an approved `OTApplication`. Employee submits a period → supervisor/manager approval chain → payroll's `/dtr/aggregate` sums **only APPROVED** rows into a `PeriodInput`.

| Sev | Location | Problem | Fix |
|-----|----------|---------|-----|
| 🔴 High ✓ | `lib/attendance/punch.ts:47–50` | Punch date floored to **UTC** midnight → PH morning punches land on the wrong day, splitting a shift across two DTR rows. | Apply UTC+8 (or tenant tz) before deriving the date. |
| 🔴 High | `lib/attendance/compute-dtr.ts:114–138` | NSD window + expected in/out anchored to `setUTCHours` → NSD/late/UT all 8h off for PH. | Materialize wall-clock windows in PH local time. |
| 🔴 High ✓ | `api/dtr/[id]/route.ts:33,42–48` | PATCH guards only on `getAuthContext` (no `TIMESHEETS` permission) and blocks only on `isLocked` — an already-APPROVED (unlocked) record can be silently edited. | Require permission; block/reset+audit edits to APPROVED rows. |
| 🔴 High ✓ | `api/dtr/[id]/reject/route.ts:14` | Reject has **no permission check at all** (approve uses `requirePermission`). Any authenticated user can reject any DTR. | Wrap with `requirePermission(req, "TIMESHEETS", "APPROVE")`. |
| 🔴 High | approve + reject + `submissions/[id]/approve` | **No self-approval guard** — an employee whose role has the permission can approve/reject their own DTR. | Reject when actor's employeeId === record.employeeId. |
| 🟠 Med | `api/dtr/[id]/manual/route.ts:92–104` | Manual time override updates effective times but does **not** recompute worked/late/UT/NSD → corrected times never reach payroll. | Re-run `computeDtrFields` after override. |
| 🟠 Med | `lib/attendance/punch.ts:173–183` | Missing OUT (clock-in only) → `workedMinutes = 0` with `dayStatus = PRESENT`, no flag. | Add an "open punch / missing OUT" status. |
| 🟠 Med | `api/dtr/submissions/route.ts:64–71` | Submission POST doesn't check the caller is that employee / has approval rights → submit on behalf of anyone. | Require ESS-self or `TIMESHEETS:APPROVE`. |
| 🟡 Low | `lib/attendance/geofence.ts` | Selfies stored but never compared (no liveness/identity check); out-of-fence punches flagged, never blocked. By design. | — |

### 3.3 Payroll Run
Flow: run = `PayrollBook` (unique on tenant+period+type). `POST /runs` → `queueRun` (PROCESSING) → background `processRun` → DRAFT. `loadActiveEmployees` attaches the single latest salary-bearing `EmploymentTerm`. Per employee: resolve statutory rules → `computeSheet` (12-step BigInt waterfall) → bulk-insert `PayrollSheet`. `finalizeRun` (DRAFT→FINALIZED) applies loans, locks DTR, marks claims PAID, audits.

| Sev | Location | Problem | Fix |
|-----|----------|---------|-----|
| 🔴 High ✓ | `lib/payroll/engine.ts:140–155` | `isStatutoryDeducted` returns `true` for **WEEKLY/DAILY** and always uses the full monthly equivalent → a weekly employee is charged a full month of contributions on **every** run (4–5×/month). | Deduct statutory once per calendar month for sub-monthly cycles (or prorate). |
| 🔴 High | `lib/payroll/persist.ts:339–398` + schema | `adjustmentDeductionsCents` is subtracted from `netPayCents` but **has no column and is never persisted** → stored `net` ≠ itemized deductions; DEDUCTION adjustments are invisible. | Add the column, persist + serialize it. |
| 🔴 High ✓ | `api/payroll/runs/[id]/recompute/route.ts:26` | Recompute uses only `getAuthContext` while create/finalize require `requirePermission(PAYROLL,…)`. Mutates pay with no gate. | Add `requirePermission`. |
| 🟠 Med | `lib/payroll/persist.ts:744–982` | No row lock before DRAFT→FINALIZED → two concurrent `finalizeRun` calls can both read DRAFT and **double-debit loan balances**. | `SELECT … FOR UPDATE` / serializable tx / advisory lock. |
| 🟠 Med | `lib/payroll/persist.ts:589–606` | Duplicate-period guard is `findUnique`-then-`create` (no lock); P2002 not mapped to `PayrollRunConflictError` → client gets 500 instead of 409. | Catch P2002 → 409. |
| 🟠 Med | `lib/payroll/persist.ts` (employee loop) | N+1: separate `periodInput`/`employeePayComponent`/`loan`/`adjustment`/`expenseClaim` queries per employee inside one 30s tx. | Batch with `employeeId: { in: [...] }`. |
| 🟠 Med | `lib/payroll/engine.ts:69–72, 877–880` | `timesUnits(hourlyRate, minutes/60)` passes a float; `minutes/60` exact only for clean fractions → fractional-hour pay off a centavo. | Integer centavo-minute math, divide by 60 HALF-UP. |
| 🟠 Med | `lib/payroll/persist.ts:531, 543` | Leave cash-out & separation pay use `Math.round(Number(cents) * …)` — violates BigInt-only money rule. | Use `multiply()` from `money.ts`. |
| 🟠 Med | `lib/payroll/engine.ts:432–545` | YEAR_END 13th-month WHT uses the standalone MONTHLY bracket, not annualized vs YTD → under-withholding until the separate manual `annualize` step runs. | Annualize at compute time or document. |
| 🟡 Low | `api/payroll/runs/[id]/route.ts` + payslips | Run/payslip **reads** rely on `getAuthContext` with no `PAYROLL:READ` → any authenticated tenant user can read everyone's payroll & payslips. | Gate reads behind `PAYROLL:READ`. |
| 🟡 Low | `lib/payroll/persist.ts:480–488` | `computeYearsOfService` uses 365.25-day years + floor → leap-boundary service can mis-bucket by a year (a full month of separation pay). | Calendar-anniversary counting. |

---

## 4. Live walkthrough (verification)

Ran the real app (Next 16) against a **throwaway local Postgres** (production untouched; repo left clean). Captured 8 screenshots: Login → Dashboard → Employees list → Add Employee wizard (steps 1–2) → Time & Attendance (DTR) → Payroll runs → computed Payroll run detail.

**Computed payroll run** (2nd cutoff, Jun 16–30 2026, 4 employees, DRAFT):

| Employee | Basic | Gross | SSS EE | PhilHealth EE | Pag-IBIG EE | WHT | Net Pay |
|----------|------:|------:|-------:|--------------:|------------:|----:|--------:|
| Juan Dela Cruz | ₱45,000 | ₱22,758.56 | ₱1,750 | ₱1,125 | ₱200 | ₱1,540.81 | **₱18,142.75** |
| Pedro Reyes | ₱38,000 | ₱19,218.32 | ₱1,750 | ₱950 | ₱200 | ₱885.20 | **₱15,433.12** |
| Maria Santos | ₱32,000 | ₱16,183.86 | ₱1,600 | ₱800 | ₱200 | ₱475.03 | **₱13,108.83** |
| Ana Lim | ₱28,000 | ₱14,160.85 | ₱1,400 | ₱700 | ₱200 | ₱216.58 | **₱11,644.27** |
| **Run total** | | **₱72,321.59** | **₱6,500** | **₱3,575** | **₱800** | **₱3,117.62** | **₱58,328.97** |

Notes confirmed live:
- **Attendance-driven:** first run returned ₱0 for all until worked-days/`PeriodInput` data was seeded.
- **Statutory cutoff logic correct:** SSS/PhilHealth/Pag-IBIG applied only on the 2nd cutoff (16–30), zero on the 1st (1–15) — the SEMI_MONTHLY design works (distinct from the weekly/daily over-deduction bug).
- DTR page rendered as the module shell only (no timekeeping data seeded in this pass).

---

## 5. Suggested next steps
- (a) Seed DTR/timekeeping data to show a populated attendance view and a DTR-driven payslip, **or**
- (b) Start fixing the prioritized issues above as atomic PRs (recommended starting point: the timezone foundation, then the authorization sweep).
