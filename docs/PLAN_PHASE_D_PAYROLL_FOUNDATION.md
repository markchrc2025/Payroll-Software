# Phase D — Statutory Engine + Payroll Foundation

> Materialized from `/memories/session/plan.md` on 2026-05-27. Reflects Blueprint §2.6, §2.7, §3, §4 and the two Q&A rounds.

Foundation (RLS, RBAC scaffolding, R2, multi-tenant) and Phase C3 Movements are shipped. Next sellable wedge is **compute a finalized payroll run and produce a payslip**. Sub-phases D1→D4.

## Sub-phase summary

### D1 — Statutory Configuration Engine
Effective-dated rules + 2026 seed + resolver. Replaces hardcoded statutory math; rule selected by *pay period's date range*, not "today".

Schema: single `StatutoryRule` table with `tenantId?` (NULL=global), `category` enum (`SSS_SCHEDULE`|`PHILHEALTH_SCHEDULE`|`PAGIBIG_SCHEDULE`|`BIR_WITHHOLDING_TABLE`|`DE_MINIMIS_CEILING`|`MINIMUM_WAGE_RATE`), `effectiveFrom`, `effectiveTo?`, `legalBasis`, `version`, `payload` JSONB. Polymorphic payload vs 6 tables — simpler resolver, typing via zod.

Files: `prisma/seed-statutory.ts` (idempotent upsert keyed `(category,version)`), `src/lib/statutory/{types,resolver,compute}.ts`, `scripts/load-statutory-2026.ts`. Resolver: `getActiveRule(tx, tenantId, category, asOfDate)` — tenant override else global else throw. Compute fns are pure: `computeSSS`, `computePhilHealth`, `computePagibig`, `lookupBIR`, `isMinimumWage`.

2026 seed (blueprint §3.2 legal basis): SSS RA 11199 (₱500 MSC steps, 5k–35k, 15% total, MPF >20k, EC 10/30), PhilHealth RA 11223+Circular 2025-001 (5%, floor 10k, ceiling 100k, min 500, max 5000), Pag-IBIG RA 9679+Circular 460 (2%/2% or 1% EE ≤1500, MFS cap 10k), BIR TRAIN tables per `payFrequency`, DeMinimis RR 29-2025, RTWPB wage orders (NCR + Region IV-A minimum).

Verification: tsc green; loader idempotent; smoke script asserts resolver lookup boundaries, SSS/PhilHealth/BIR/MWE expected values.

Out of scope: tenant-override write UI, pre-2026 rules, DOLE Wage Order automation.

### D2 — Pay Components + Period Inputs
Captures engine inputs for a regular-cycle run *without* DTR ingestion.

Schema: `PayComponent` (tenant-scoped name unique, `kind`, taxability flags), `EmployeePayComponent` (effective-dated amount assignment), `PeriodInput` (one row per employee×period: `daysWorked`, `lateUndertimeMinutes`, `regularOtHours`, `restDayHours`, `specialHolidayHours`, `regularHolidayHours`, `nightDiffHours`, `hazardHours`, `unpaidLeaveDays`), `Loan` (type SSS/PAGIBIG/CASH_ADVANCE/COMPANY; principal/installment/balance/status).

Routes: full CRUD under `/api/pay-components`, `/api/employees/[id]/pay-components`, `/api/period-inputs`, `/api/loans` (+ cancel). All `withTenant`, BigInt → `centavosToJson`.

Verification: seed 1 allowance + 1 bonus + 1 deduction, assign to seed employee, POST period input for 2026-06-01..06-15, cross-tenant GET = empty.

Out of scope: recurring-rule expander (just store rows), ExpenseClaim, PayrollAdjustment.

### D3 — Gross-to-Net Engine + PayrollBook/PayrollSheet
Compute and freeze a regular-cycle run. Output: `PayrollBook` (DRAFT→FINALIZED) + `PayrollSheet` per employee with every §2.6 field populated.

Schema: `PayrollBook` (tenant, period, cycle, runType, status, finalizedBy/At; unique `(tenantId,periodStart,periodEnd,runType)`), `PayrollSheet` (all §2.6 BigInt fields + `taxClassificationSnapshot` + `regionSnapshot` + `taxClassificationTransition?` JSON; unique `(payrollBookId,employeeId)`).

`src/lib/payroll/engine.ts` — pure orchestrator, §4.2 12-step waterfall: basePay → late/undertime → premium stacking (§4.3) → pay components → grossComp → non-taxable set (MWE check, mandatory contribs, de minimis ≤ceiling, 13th-month-cap residual, Employee.nontaxableBasicAmountCents) → grossTaxable → statutory (D1; respects `SECOND_CUTOFF`) → withholding tax (D1; 0 on MWE) → non-taxable additions → loan deductions (debit balanceCents) → netPay.

`src/lib/payroll/persist.ts` wraps in `withTenant` tx; refuses re-create on FINALIZED. Routes: `/api/payroll/runs` (POST creates DRAFT, GET list), `/api/payroll/runs/[id]` (GET detail), `/recompute` (DRAFT only), `/finalize` (DRAFT→FINALIZED, decrement loan balances, AuditLog).

Verification: POST run for 2026-06-01..06-15 SEMI_MONTHLY REGULAR → 201 with 10 sheets; spot-check Roberto Aquino (₱55k/mo NCR REGULAR): basePay 11d ≈ 27,816.09, PhilHealth EE 1,375 second cutoff, SSS EE 1,000, withholding via SEMI_MONTHLY table. Cross-tenant test. Finalize → recompute 409. Loan balance decremented once (re-finalize idempotency).

Out of scope: 13th-month annual, year-end annualization, OFF_CYCLE/FINAL_PAY, PayrollAdjustment corrections.

### D4 — Payslips + BPI Bank File
Make a FINALIZED run disbursable + visible.

Files: `src/lib/payslip/render.ts` (pure, returns structured object — HTML/JSON v1, no PDF), `/api/payroll/runs/[id]/payslips` (list, admin) + `/[employeeId]` (one, admin or owner), `src/lib/payroll/bank-files/bpi.ts` (fixed-width BPI ePay formatter, pure), `/api/payroll/runs/[id]/bank-files/bpi` (download FINALIZED only).

Verification: BPI file header+10 lines+trailer with control totals = Σ netPay; payslip JSON shows earnings/statutory/loans/net/period/tenant.

Out of scope: PDF rendering, BDO/UnionBank/Metrobank, ESS portal.

## Cross-cutting

- **Money:** BigInt centavos everywhere; `centavosToJson` on outputs; banker's rounding to centavos each persisted field; no `Number` math.
- **Determinism:** all rule lookups via `getActiveRule(tx, tenantId, category, periodEnd)`; no `Date.now()` in engine.
- **Idempotency:** recompute + finalize safe to retry; finalize guarded `status=DRAFT` inside tx.
- **RLS:** new models get `tenantId` + policy mirroring `20260527070000_enable_rls`.
- **Audit:** every `PayrollBook` status transition + every `Loan.balanceCents` mutation → AuditLog in same tx.
- **Testing:** `tsx` smoke + live curl for now. Vitest recommended right after D3 lands, before D4.

## Locked decisions (from Q&A round 2)

1. **Min-wage override guard** — tenant `MINIMUM_WAGE_RATE` below global RTWPB rate → **hard reject HTTP 422**. Validation lives in the override write route; engine never sees below-floor values.
2. **MWE reclassification timing** — flips on the **wage-order effective date with mid-period proration**. Engine §4.2 step 6 splits the period at the effective date; pre-flip uses old classification, post-flip uses new. `PayrollSheet` carries `taxClassificationSnapshot` for the finalizing classification and `taxClassificationTransition?: { effectiveDate, prevClassification }` JSON when a flip occurred.
3. **Shared CSV importer** — `src/lib/csv-import/` base built now; statutory seed is first consumer; future DTR + employee importers reuse it. Surface: header schema validation, per-row zod parse with row-numbered errors, partial-success `{ inserted, updated, skipped, errors[] }`, idempotency key per row, `dryRun: boolean`.
4. **Signoff posture** — proceed to D1 but **pause after schema + migration applied** for review *before* the seed loader runs.

## Architectural implications of the locks

- **Period-splitting helper** — `src/lib/payroll/period-split.ts` lands early in D3. Returns `Array<{ from, to, classification, region, basicRateCents }>` segments for any period with a classification or wage-rate transition. Engine loops per segment.
- **Override write validation** — `POST /api/statutory/overrides` must call resolver with `tenantId: null` to fetch the global floor, then reject if `payload.dailyRate < global.dailyRate` for any region in the override.
- **CSV importer location** — `src/lib/csv-import/{types,parse,report}.ts`. Statutory seed lives at `src/lib/csv-import/consumers/statutory.ts`.

## Outstanding (non-blocking)

- **2026 BIR rate source** — scaffolded with current TRAIN-tranche public values, version tag `"TRAIN-2023-onward-v1"` so it's swappable.
- **Rate-field representation** — basis-point integers (e.g. 500 = 5.00%). No Prisma `Decimal`.

## Execution dependency map

```
D1 schema → D1 seed/resolver/compute → D1 verify
D2 schema (∥ D1) → D2 routes (∥ D1 compute) → D2 verify
D3 schema (after D1+D2) → D3 engine → D3 routes → D3 verify
D4 (after D3 finalize) → D4 verify
```

Critical path is dominated by D1 seed accuracy and D3 §4.3 premium-stacking matrix correctness.

## Deliberately deferred

DTR ingestion+approval, leave accrual+OT requests, 13th-month/year-end/Alphalist/DAT, OFF_CYCLE/FINAL_PAY, PayrollAdjustment, ExpenseClaim, Asset, Incident, ATS, ESS/Kiosk/geofence, all frontend UI, AI Assistant.
