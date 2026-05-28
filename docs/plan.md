# Plan: Phase D — Statutory Engine + Payroll Foundation

Foundation (RLS, RBAC scaffolding, R2, multi-tenant) and Phase C3 Movements are shipped. Next sellable wedge is **compute a finalized payroll run and produce a payslip**. Sub-phases D1→D4. Material under `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` once written by the implementer.

## Sub-phase summary

### D1 — Statutory Configuration Engine
Effective-dated rules + 2026 seed + resolver. Replaces hardcoded statutory math; rule selected by *pay period's date range*, not "today".

Schema: single `StatutoryRule` table with `tenantId?` (NULL=global), `category` enum (`SSS_SCHEDULE`|`PHILHEALTH_SCHEDULE`|`PAGIBIG_SCHEDULE`|`BIR_WITHHOLDING_TABLE`|`DE_MINIMIS_CEILING`|`MINIMUM_WAGE_RATE`), `effectiveFrom`, `effectiveTo?`, `legalBasis`, `version`, `payload` JSONB. Polymorphic payload vs 6 tables — simpler resolver, typing via zod.

Files: `prisma/seed-statutory.ts` (idempotent upsert keyed `(category,version)`), `src/lib/statutory/{types,resolver,compute}.ts`, `scripts/load-statutory-2026.ts`. Resolver: `getActiveRule(tx, tenantId, category, asOfDate)` — tenant override else global else throw. Compute fns are pure: `computeSSS`, `computePhilHealth`, `computePagibig`, `lookupBIR`, `isMinimumWage`.

2026 seed (blueprint §3.2 legal basis): SSS RA 11199 (₱500 MSC steps, 5k–35k, 15% total, MPF >20k, EC 10/30), PhilHealth RA 11223+Circular 2025-001 (5%, floor 10k, ceiling 100k, min 500, max 5000), Pag-IBIG RA 9679+Circular 460 (2%/2% or 1% EE ≤1500, MFS cap 10k), BIR TRAIN tables per `payFrequency`, DeMinimis RR 29-2025, RTWPB wage orders (NCR + Region IV-A minimum).

Verification: tsc green; loader idempotent; smoke script asserts resolver lookup boundaries, SSS/PhilHealth/BIR/MWE expected values.

**D1 status (COMPLETE)**:
- ✅ `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` written.
- ✅ Schema: enum `StatutoryCategory` + model `StatutoryRule` (+ Tenant.statutoryRules) added.
- ✅ Migration `20260527090000_d1_statutory_rules` applied via `migrate deploy` (avoided destructive `migrate dev` reset; pre-existing enable_rls checksum drift). RLS policy: SELECT allows `tenantId IS NULL OR =GUC`; WITH CHECK requires `=GUC` (global rows owner-only).
- ✅ `src/lib/statutory/types.ts` — zod payload schemas (SSS, PhilHealth, Pag-IBIG, BIR TRAIN, DeMinimis, MinWage) + `parseStatutoryPayload(category, payload)`.
- ✅ `src/lib/statutory/resolver.ts` — `getActiveRule(client, tenantId, category, asOf)`: single query, prefers tenant override, latest effectiveFrom wins, throws `StatutoryRuleNotFoundError` on miss.
- ✅ `src/lib/statutory/compute.ts` — pure BigInt-centavo compute: `computeSSS`, `computePhilHealth`, `computePagibig`, `lookupBIR`, `isMinimumWage`/`getMinimumWage`. HALF-UP rounding via `multiplyHalfUp`.
- ✅ `scripts/load-statutory-2026.ts` — idempotent loader (manual upsert because Postgres NULLs don't collide on unique). Seeded 6 global rules. Re-run gives 6 updates.
- ✅ `scripts/smoke-statutory.ts` — 24 assertions all pass: SSS in-range/ceiling, PhilHealth in-range/floor/ceiling, Pag-IBIG low/normal/cap, BIR semi-monthly/monthly/exempt, MinWage NCR/IV-A, resolver pre-effective error + at-boundary resolution.
- ✅ RLS smoke as `payroll_app`: cross-tenant rows filtered; global row visible to all tenants; app role INSERT of global row rejected by policy.
- ✅ `tsc --noEmit` exit 0 throughout.

**Decisions made during D1 implementation:**
- `MIN_WAGE_2025` row: effectiveFrom = 2025-07-01 (earliest of NCR-26 and IVA-22). Region payload is a map keyed by region code; resolver returns the whole payload, compute helpers (`getMinimumWage`, `isMinimumWage`) look up region.
- BIR TRAIN tables use official BIR-published rounded centavo values per pay frequency (4 frequencies: DAILY, WEEKLY, SEMI_MONTHLY, MONTHLY). DAILY/WEEKLY in `frequencies` are optional in the zod schema; populated for 2026 seed.
- DeMinimis ceiling row carries 9 most-used items per RR 29-2025 §2 (rice, uniform, medical dependent/employee, achievement award, Christmas gift, laundry, OT meal, productivity incentive). `monthlyCeiling` and `annualCeiling` both nullable to handle items stated only one way.
- Unique constraint on `(tenantId, category, version)` cannot enforce uniqueness on global rows (Postgres treats NULLs as distinct). Loader does manual lookup-then-create-or-update.

**Next when user resumes (D2):** Pay components (earnings/deductions) + period inputs (DTR aggregation, OT, leave usage, attendance summary). See `/memories/session/plan.md` §D2.

Out of scope: tenant-override write UI, pre-2026 rules, DOLE Wage Order automation.

### D2 — Pay Components + Period Inputs
Captures engine inputs for a regular-cycle run *without* DTR ingestion.

Schema: `PayComponent` (tenant-scoped name unique, `kind`, taxability flags), `EmployeePayComponent` (effective-dated amount assignment), `PeriodInput` (one row per employee×period: `daysWorked`, `lateUndertimeMinutes`, `regularOtHours`, `restDayHours`, `specialHolidayHours`, `regularHolidayHours`, `nightDiffHours`, `hazardHours`, `unpaidLeaveDays`), `Loan` (type SSS/PAGIBIG/CASH_ADVANCE/COMPANY; principal/installment/balance/status).

Routes: full CRUD under `/api/pay-components`, `/api/employees/[id]/pay-components`, `/api/period-inputs`, `/api/loans` (+ cancel). All `withTenant`, BigInt → `centavosToJson`.

Verification: seed 1 allowance + 1 bonus + 1 deduction, assign to seed employee, POST period input for 2026-06-01..06-15, cross-tenant GET = empty.

Out of scope: recurring-rule expander (just store rows), ExpenseClaim, PayrollAdjustment.

**D2 status (COMPLETE)**:
- ✅ Schema: enums `PayComponentKind` (ALLOWANCE/BONUS/COMMISSION/OTHER_EARNING/REIMBURSEMENT/DEDUCTION), `PayComponentTaxability` (TAXABLE/NON_TAXABLE/DE_MINIMIS/STATUTORY_EXEMPT), `LoanType`, `LoanStatus` (+ ON_HOLD). Models: `PayComponent` (`@@unique [tenantId, code]`, `deletedAt` soft delete, base-inclusion flags split per fund), `EmployeePayComponent` (BigInt `amountCents`, effective-dated), `PeriodInput` (Decimal(6,2) for daysWorked/hours, Int for `lateUndertimeMinutes`; `@@unique [tenantId,employeeId,periodStart,periodEnd]`), `Loan` (BigInt principal/installment/balance, status). Back-relations on Tenant + Employee.
- ✅ Migration `20260527100000_d2_pay_components` applied via `migrate deploy` (had to strip stray "Loaded Prisma config…" stderr line from generated SQL + `migrate resolve --rolled-back` before redeploy). RLS: ENABLE+FORCE + `tenant_isolation` policy (strict equality both USING/WITH CHECK) on all 4 tables + `GRANT … TO payroll_app`.
- ✅ Validations (`src/lib/validations/pay-component.ts`, `period-input.ts`): zod schemas with `pesoString` regex, `cuid = z.string().min(1)`, `.coerce.date()`/`.coerce.number()`, `superRefine` for cross-field rules (DE_MINIMIS → deMinimisCode required; endDate ≥ effectiveFrom; periodEnd ≥ periodStart).
- ✅ Serializers (`src/lib/payroll/serialize.ts`): `centavosToJson` for BigInts; `.toString()` for Decimal time fields. Mirrors movement serializer pattern.
- ✅ Routes (Next 16 async `params: Promise<{...}>` throughout, all `withTenant`-bound):
  - `/api/pay-components` GET (list, filters kind/isActive/includeDeleted)/POST (create with 409 on dup code)
  - `/api/pay-components/[id]` GET/PATCH/DELETE (soft delete via deletedAt + isActive=false)
  - `/api/employees/[id]/pay-components` GET (filter `?asOf=` to active rows)/POST (validates employee + component exist; converts peso string → BigInt centavos)
  - `/api/employees/[id]/pay-components/[assignmentId]` DELETE
  - `/api/period-inputs` GET (filters employeeId/periodStart/periodEnd)/POST (idempotent upsert by composite key)
  - `/api/period-inputs/[id]` GET/PATCH/DELETE
  - `/api/loans` GET/POST (rejects ≤0 principal/installment)
  - `/api/loans/[id]` GET/PATCH
  - `/api/loans/[id]/cancel` POST (rejects 409 on terminal loans)
- ✅ `scripts/smoke-d2.ts` — runs entirely as `payroll_app` (RLS-enforced). 12 assertions all pass: CRUD on all 4 tables, PeriodInput upsert idempotency, cross-tenant SELECT returns 0 on all 3 tenant tables, cross-tenant INSERT blocked by RLS WITH CHECK. Cleans up after itself.
- ✅ `tsc --noEmit` exit 0.

**Decisions made during D2 implementation:**
- Pay-component code constrained to `^[A-Z0-9_]+# Plan: Phase D — Statutory Engine + Payroll Foundation

Foundation (RLS, RBAC scaffolding, R2, multi-tenant) and Phase C3 Movements are shipped. Next sellable wedge is **compute a finalized payroll run and produce a payslip**. Sub-phases D1→D4. Material under `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` once written by the implementer.

## Sub-phase summary

### D1 — Statutory Configuration Engine
Effective-dated rules + 2026 seed + resolver. Replaces hardcoded statutory math; rule selected by *pay period's date range*, not "today".

Schema: single `StatutoryRule` table with `tenantId?` (NULL=global), `category` enum (`SSS_SCHEDULE`|`PHILHEALTH_SCHEDULE`|`PAGIBIG_SCHEDULE`|`BIR_WITHHOLDING_TABLE`|`DE_MINIMIS_CEILING`|`MINIMUM_WAGE_RATE`), `effectiveFrom`, `effectiveTo?`, `legalBasis`, `version`, `payload` JSONB. Polymorphic payload vs 6 tables — simpler resolver, typing via zod.

Files: `prisma/seed-statutory.ts` (idempotent upsert keyed `(category,version)`), `src/lib/statutory/{types,resolver,compute}.ts`, `scripts/load-statutory-2026.ts`. Resolver: `getActiveRule(tx, tenantId, category, asOfDate)` — tenant override else global else throw. Compute fns are pure: `computeSSS`, `computePhilHealth`, `computePagibig`, `lookupBIR`, `isMinimumWage`.

2026 seed (blueprint §3.2 legal basis): SSS RA 11199 (₱500 MSC steps, 5k–35k, 15% total, MPF >20k, EC 10/30), PhilHealth RA 11223+Circular 2025-001 (5%, floor 10k, ceiling 100k, min 500, max 5000), Pag-IBIG RA 9679+Circular 460 (2%/2% or 1% EE ≤1500, MFS cap 10k), BIR TRAIN tables per `payFrequency`, DeMinimis RR 29-2025, RTWPB wage orders (NCR + Region IV-A minimum).

Verification: tsc green; loader idempotent; smoke script asserts resolver lookup boundaries, SSS/PhilHealth/BIR/MWE expected values.

**D1 status (COMPLETE)**:
- ✅ `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` written.
- ✅ Schema: enum `StatutoryCategory` + model `StatutoryRule` (+ Tenant.statutoryRules) added.
- ✅ Migration `20260527090000_d1_statutory_rules` applied via `migrate deploy` (avoided destructive `migrate dev` reset; pre-existing enable_rls checksum drift). RLS policy: SELECT allows `tenantId IS NULL OR =GUC`; WITH CHECK requires `=GUC` (global rows owner-only).
- ✅ `src/lib/statutory/types.ts` — zod payload schemas (SSS, PhilHealth, Pag-IBIG, BIR TRAIN, DeMinimis, MinWage) + `parseStatutoryPayload(category, payload)`.
- ✅ `src/lib/statutory/resolver.ts` — `getActiveRule(client, tenantId, category, asOf)`: single query, prefers tenant override, latest effectiveFrom wins, throws `StatutoryRuleNotFoundError` on miss.
- ✅ `src/lib/statutory/compute.ts` — pure BigInt-centavo compute: `computeSSS`, `computePhilHealth`, `computePagibig`, `lookupBIR`, `isMinimumWage`/`getMinimumWage`. HALF-UP rounding via `multiplyHalfUp`.
- ✅ `scripts/load-statutory-2026.ts` — idempotent loader (manual upsert because Postgres NULLs don't collide on unique). Seeded 6 global rules. Re-run gives 6 updates.
- ✅ `scripts/smoke-statutory.ts` — 24 assertions all pass: SSS in-range/ceiling, PhilHealth in-range/floor/ceiling, Pag-IBIG low/normal/cap, BIR semi-monthly/monthly/exempt, MinWage NCR/IV-A, resolver pre-effective error + at-boundary resolution.
- ✅ RLS smoke as `payroll_app`: cross-tenant rows filtered; global row visible to all tenants; app role INSERT of global row rejected by policy.
- ✅ `tsc --noEmit` exit 0 throughout.

**Decisions made during D1 implementation:**
- `MIN_WAGE_2025` row: effectiveFrom = 2025-07-01 (earliest of NCR-26 and IVA-22). Region payload is a map keyed by region code; resolver returns the whole payload, compute helpers (`getMinimumWage`, `isMinimumWage`) look up region.
- BIR TRAIN tables use official BIR-published rounded centavo values per pay frequency (4 frequencies: DAILY, WEEKLY, SEMI_MONTHLY, MONTHLY). DAILY/WEEKLY in `frequencies` are optional in the zod schema; populated for 2026 seed.
- DeMinimis ceiling row carries 9 most-used items per RR 29-2025 §2 (rice, uniform, medical dependent/employee, achievement award, Christmas gift, laundry, OT meal, productivity incentive). `monthlyCeiling` and `annualCeiling` both nullable to handle items stated only one way.
- Unique constraint on `(tenantId, category, version)` cannot enforce uniqueness on global rows (Postgres treats NULLs as distinct). Loader does manual lookup-then-create-or-update.

**Next when user resumes (D2):** Pay components (earnings/deductions) + period inputs (DTR aggregation, OT, leave usage, attendance summary). See `/memories/session/plan.md` §D2.

Out of scope: tenant-override write UI, pre-2026 rules, DOLE Wage Order automation.

### D2 — Pay Components + Period Inputs
Captures engine inputs for a regular-cycle run *without* DTR ingestion.

Schema: `PayComponent` (tenant-scoped name unique, `kind`, taxability flags), `EmployeePayComponent` (effective-dated amount assignment), `PeriodInput` (one row per employee×period: `daysWorked`, `lateUndertimeMinutes`, `regularOtHours`, `restDayHours`, `specialHolidayHours`, `regularHolidayHours`, `nightDiffHours`, `hazardHours`, `unpaidLeaveDays`), `Loan` (type SSS/PAGIBIG/CASH_ADVANCE/COMPANY; principal/installment/balance/status).

Routes: full CRUD under `/api/pay-components`, `/api/employees/[id]/pay-components`, `/api/period-inputs`, `/api/loans` (+ cancel). All `withTenant`, BigInt → `centavosToJson`.

 (e.g. `RICE`, `BONUS_PERFY`) — provides clean keys for engine lookup in D3.
- Taxability is enum, not boolean — explicit `DE_MINIMIS` and `STATUTORY_EXEMPT` cases needed by D3 engine. `deMinimisCode` is required (superRefine) when taxability=DE_MINIMIS; code must match a key in active `DE_MINIMIS_CEILING` payload at compute time.
- Base-inclusion flags (`includeInSss/PhilHealth/PagibigBase`, `includeIn13thMonth`) live on the catalog, not per-assignment. Government bases are currently identical but split per fund to allow future drift without migration.
- `EmployeePayComponent.amountCents` is a flat per-period amount, not a rate. Pro-ration by `daysWorked` deferred to D3 unless a component is flagged as basic-pay-proportional (no such flag yet — engine treats all assignments as flat).
- Assignments are end-dated, not edited — there is no PATCH route on assignments. To change an amount: PATCH endDate on the old row, POST a new one. DELETE is provided for fixing mistakes only.
- PeriodInput time fields are `Decimal(6,2)` for hours/days, `Int` for minutes (`lateUndertimeMinutes`). D3 engine will multiply against employee hourly-rate-in-centavos using BigInt arithmetic.
- PeriodInput POST is upsert (not create) — keyed `(tenantId, employeeId, periodStart, periodEnd)`. PATCH route exists for partial updates of an existing row.
- Loan status enum includes `ON_HOLD` (deferred-use) in addition to ACTIVE/PAID/CANCELLED.
- Loan cancel-route allows both ACTIVE and ON_HOLD; rejects PAID and re-cancellation with 409.
- Migration generation: `prisma migrate diff --from-config-datasource --to-schema ... --script` writes Prisma load message to STDERR. Capture pattern must redirect stdout-only (`> file 2>/dev/null`) OR sed-strip the line. Logged this lesson — will use `2>/dev/null` going forward.

**Next when user resumes (D3):** Gross-to-net engine + PayrollBook/PayrollSheet finalization. Plan §51-58. Will pause for review first.

### D3 — Gross-to-Net Engine + PayrollBook/PayrollSheet
Compute and freeze a regular-cycle run. Output: `PayrollBook` (DRAFT→FINALIZED) + `PayrollSheet` per employee with every §2.6 field populated.

Schema: `PayrollBook` (tenant, period, cycle, runType, status, finalizedBy/At; unique `(tenantId,periodStart,periodEnd,runType)`), `PayrollSheet` (all §2.6 BigInt fields + `taxClassificationSnapshot` + `regionSnapshot`; unique `(payrollBookId,employeeId)`).

`src/lib/payroll/engine.ts` — pure orchestrator, §4.2 12-step waterfall: basePay → late/undertime → premium stacking (§4.3) → pay components → grossComp → non-taxable set (MWE check, mandatory contribs, de minimis ≤ceiling, 13th-month-cap residual, Employee.nontaxableBasicAmountCents) → grossTaxable → statutory (D1; respects `SECOND_CUTOFF`) → withholding tax (D1; 0 on MWE) → non-taxable additions → loan deductions (debit balanceCents) → netPay.

`src/lib/payroll/persist.ts` wraps in `withTenant` tx; refuses re-create on FINALIZED. Routes: `/api/payroll/runs` (POST creates DRAFT, GET list), `/api/payroll/runs/[id]` (GET detail), `/recompute` (DRAFT only), `/finalize` (DRAFT→FINALIZED, decrement loan balances, AuditLog).

Verification: POST run for 2026-06-01..06-15 SEMI_MONTHLY REGULAR → 201 with 10 sheets; spot-check Roberto Aquino (₱55k/mo NCR REGULAR): basePay 11d ≈ 27,816.09, PhilHealth EE 1,375 second cutoff, SSS EE 1,000, withholding via SEMI_MONTHLY table. Cross-tenant test. Finalize → recompute 409. Loan balance decremented once (re-finalize idempotency).

Out of scope: 13th-month annual, year-end annualization, OFF_CYCLE/FINAL_PAY, PayrollAdjustment corrections.

**D3 status (COMPLETE)**:
- ✅ Schema: enums `PayrollBookStatus` (DRAFT/FINALIZED/CANCELLED), `PayrollRunType` (REGULAR/OFF_CYCLE/FINAL_PAY/YEAR_END). Models `PayrollBook` (unique `(tenantId,periodStart,periodEnd,runType)`) + `PayrollSheet` (24 BigInt money fields all `@default(0)` + 7 snapshot fields + 4 JSON fields; `(payrollBookId,employeeId)` unique; `onDelete: Cascade`). Back-relations on Tenant + Employee.
- ✅ Migration `20260527110000_d3_payroll_runs` applied via `migrate deploy` (used `2>/dev/null` to suppress Prisma stderr). RLS ENABLE+FORCE + tenant_isolation on both tables + GRANT to `payroll_app`.
- ✅ `src/lib/payroll/types.ts` — engine I/O type contracts; ComputeInput holds tenant/employee/salary/period snapshots + period inputs + assigned components + active loans + resolved rules.
- ✅ `src/lib/payroll/engine.ts` — pure `computeSheet(input)` waterfall. Helpers: `multiplyHalfUp`, `timesUnits`, `clampNonNegative`, `isStatutoryDeducted`, `deriveRates`, `checkMwe`, `classifyComponents`. Premiums: OT×1.25, NSD×0.10, restDay×1.30, specialHoliday×1.30, regularHoliday×2.00, hazard×1.25. Net = gross - mandatoryEE - WHT + nontaxableAdditions - loanDeductions.
- ✅ `src/lib/payroll/persist.ts` — public ops all wrapped in `withTenant`: `createDraftRun` (409 on dup compound key), `recomputeRun` (409 on non-DRAFT), `finalizeRun` (idempotent on FINALIZED; 409 on CANCELLED; decrements Loan.balanceCents from aggregated `loanPaymentsApplied` JSON, marks PAID when zeroed; writes AuditLog APPROVE), `getRun` (404), `listRuns` (paginated). Errors `PayrollRunConflictError` (409) + `PayrollRunNotFoundError` (404).
- ✅ Serializers: `serializePayrollBook` + `serializePayrollSheet` appended to `src/lib/payroll/serialize.ts`.
- ✅ Validations: `src/lib/validations/payroll-run.ts` — `createPayrollRunSchema` (`superRefine` periodEnd≥periodStart), `listPayrollRunsSchema`.
- ✅ Routes (all `withTenant`-bound, async params):
  - `/api/payroll/runs` GET/POST
  - `/api/payroll/runs/[id]` GET
  - `/api/payroll/runs/[id]/recompute` POST
  - `/api/payroll/runs/[id]/finalize` POST
- ✅ `scripts/smoke-d3.ts` — runs as `payroll_app` (RLS). 16 assertions all pass. Verified spot-check Roberto Aquino at 2026-06-16..06-30 SEMI_MONTHLY REGULAR + 11 daysWorked + ₱55k/mo NCR salary: basePay = ₱27,816.03 (= 5_500_000 × 12 / 261 × 11 cents truncated), statutoryDeductedSnapshot=true (day≥16), SSS EE = ₱1,750, PhilHealth EE = ₱1,375, Pag-IBIG EE = ₱200, WHT > 0, loanDeduction = ₱2,500. Duplicate→409, recompute on DRAFT ok, finalize→FINALIZED + balance decremented exactly once, recompute on FINALIZED→409, re-finalize idempotent (no double decrement, no second AuditLog), cross-tenant cannot read.
- ✅ `tsc --noEmit` exit 0.

**Decisions made during D3 implementation:**
1. SECOND_CUTOFF deduction rule: `periodEnd.getUTCDate() >= 16` → deducted; FIRST_CUTOFF: `<= 15`. MONTHLY/WEEKLY/DAILY cycles always deducted in D3.
2. Daily/hourly rate derivation: MONTHLY → daily = monthly×12 / `workingDaysDenominator`; DAILY → daily = basic; WEEKLY → daily = basic/5. monthlyEquivalent for MSC/MFS: MONTHLY=basic, DAILY=daily×wdDenom/12, WEEKLY=weekly×52/12. hourlyRate = daily / `standardWorkHours` (default 8).
3. Premium pay: `timesUnits(centavos, decimalUnits)` via `BigInt(Math.round(Number×rate))`. Caller is responsible for not double-counting hours/days between basic + premium buckets. NSD treated as flat ×0.10 premium-only in D3.
4. 13th-month residual = 0n in D3 (annualization deferred).
5. DEDUCTION-kind PayComponents IGNORED in D3 — only statutory + loans deduct. Documented in engine.ts header.
6. MWE check: taxClass=MWE AND region AND minWage rule active AND dailyRate ≤ regionMin. mweExemptCompensation = base + holiday + ot + nsd + hazard. WHT forced to 0 on MWE.
7. De minimis component splits at `monthlyCeiling` (or `annualCeiling/12`); excess → taxableAllowances.
8. Loan finalize idempotency: re-finalize on FINALIZED returns existing book without re-decrementing or writing a second AuditLog (uses status guard at top).
9. AuditLog written with `action=APPROVE` `entity=PayrollBook`, `changes` JSON includes before/after status + `loanPaymentsApplied` summary.
10. Roberto Aquino spot-check: plan claim of "SSS EE 1,000" was wrong — actual is ₱1,750 (regular ₱1,000 + MPF ₱750). Engine matches blueprint §3.2 RA 11199.

### D4 — Payslips + BPI Bank File — COMPLETE
Make a FINALIZED run disbursable + visible.

Files: `src/lib/payslip/render.ts` (pure, returns structured object — HTML/JSON v1, no PDF), `/api/payroll/runs/[id]/payslips` (list, admin) + `/[employeeId]` (one, admin or owner), `src/lib/payroll/bank-files/bpi.ts` (fixed-width BPI ePay formatter, pure), `/api/payroll/runs/[id]/bank-files/bpi` (download FINALIZED only).

Verification: BPI file header+10 lines+trailer with control totals = Σ netPay; payslip JSON shows earnings/statutory/loans/net/period/tenant.

Out of scope: PDF rendering, BDO/UnionBank/Metrobank, ESS portal.

**D4 status (COMPLETE)**:
- ✅ `src/lib/payslip/render.ts` — pure `renderPayslip(input): Payslip`. Schema version `"v1"`. Sections: period, employee (name as "LastName, FirstName M."), tenant, earnings (9 fields), nonTaxable (5), statutory (7: EE+ER for SSS/PhilHealth/PagIBIG + EC), tax, loans, net, snapshots. All BigInt → centavosToJson string.
- ✅ `src/app/api/payroll/runs/[id]/payslips/route.ts` — GET list; 400 on non-FINALIZED; loads all employees in one withTenant query.
- ✅ `src/app/api/payroll/runs/[id]/payslips/[employeeId]/route.ts` — GET single; 400 on non-FINALIZED.
- ✅ `src/lib/payroll/bank-files/bpi.ts` — pure `formatBpiFile(input): string`. CRLF line endings. Header(59) + Detail×N(94) + Trailer(22). Amount: 12-digit-int zero-padded + "." + 2-dec = 15 chars. Missing bank fields → spaces. Uses abs value for amounts (negative netPay displays positive).
- ✅ `src/app/api/payroll/runs/[id]/bank-files/bpi/route.ts` — GET FINALIZED only (400 otherwise); filename `bpi-payroll-YYYYMMDD.txt`; `Content-Disposition: attachment`.
- ✅ `scripts/smoke-d4.ts` — 47 assertions all pass. Verified: payslip structure/names/amounts; Roberto (EMP-0010) "Aquino, Roberto"; SSS EE=₱1,750, PhilHealth EE=₱1,375, PagIBIG EE=₱200, net ≈ ₱16,988.72; BPI line lengths 59/94/22; trailer |Σ netPay| = ₱11,111.28; CRLF.
- ✅ `tsc --noEmit` exit 0.

**Decisions made during D4 implementation:**
1. Payslip schema version "v1" — bump on non-additive changes.
2. Name format: "LastName, FirstName [M.][, Suffix]".
3. BPI detail layout (0-indexed): D(0) + acctNo(1-16) + acctName(17-66) + amount(67-81) + empNo(82-93).
4. BPI `formatAmount` uses abs — trailer shows |Σ netPay|. Operator must handle negative-net employees before upload.
5. All payslip/BPI routes 400 (not 404) when run is not FINALIZED.
6. ESS employee-owner access deferred; all payslip reads admin-scoped in D4.

## Cross-cutting

- **Money:** BigInt centavos everywhere; `centavosToJson` on outputs; banker's rounding to centavos each persisted field; no `Number` math.
- **Determinism:** all rule lookups via `getActiveRule(tx, tenantId, category, periodEnd)`; no `Date.now()` in engine.
- **Idempotency:** recompute + finalize safe to retry; finalize guarded `status=DRAFT` inside tx.
- **RLS:** new models get `tenantId` + policy in `<ts>_d_enable_rls_payroll`; mirror `20260527070000_enable_rls` pattern.
- **Audit:** every `PayrollBook` status transition + every `Loan.balanceCents` mutation → AuditLog in same tx.
- **Testing:** continue `tsx` smoke + live curl. Adding Vitest is a separate task — recommended right after D3 lands, before D4.

## Execution dependency map

D1 schema → D1 seed/resolver/compute → D1 verify
D2 schema (parallel w/ D1) → D2 routes (parallel w/ D1 compute) → D2 verify
D3 schema (after D1+D2) → D3 engine → D3 routes → D3 verify
D4 (after D3 finalize) → D4 verify

Critical path effort dominated by D1 seed accuracy (must match official tables byte-for-byte) and D3 §4.3 premium-stacking matrix correctness.

## Deliberately deferred

DTR ingestion+approval, leave accrual+OT request, 13th-month/year-end/Alphalist/DAT, OFF_CYCLE/FINAL_PAY, PayrollAdjustment, ExpenseClaim, Asset, Incident, ATS, ESS/Kiosk/geofence, all frontend UI, AI Assistant.

## Implementation handoff note
Plan-mode restriction: cannot write files. First action on handoff is to materialize this plan to `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` at repo root (no `docs/` exists; create it). Then begin D1 schema.

## Locked decisions (from Q&A round 2)

1. **Min-wage override guard** — tenant-set `MINIMUM_WAGE_RATE` below global RTWPB rate → **hard reject HTTP 422**. Validation lives in the override POST/PUT route; engine never has to handle below-floor values.
2. **MWE reclassification timing** — flips on the **effective date of the wage order, with mid-period proration**. Engine §4.2 step 6 must split the period at the effective date and compute two sub-segments: pre-flip uses old classification, post-flip uses new. `PayrollSheet` carries `taxClassificationSnapshot` for the *finalizing* classification but stores a `taxClassificationTransition?: { effectiveDate, prevClassification }` JSON if a flip occurred during the period.
3. **Shared CSV importer** — build `src/lib/csv-import/` base now; statutory seed is first consumer; DTR + employee importers in later phases reuse it. Contract surface: header schema validation, per-row zod parse with row-numbered errors, partial-success report `{ inserted, updated, skipped, errors[] }`, idempotency key per row, `dryRun: boolean`.
4. **Signoff posture** — proceed to D1 but **pause after schema + migration applied** for review *before* seed loader runs. Implementer reports tsc green + migration applied + RLS policies verified, then waits for "go" on the seed step.

## Architectural implications of the locks

- **Engine period-splitting helper required** — add `src/lib/payroll/period-split.ts` early in D3. Returns `Array<{ from, to, classification, region, basicRateCents }>` segments for any period that has a classification or wage-rate transition. Engine then loops per segment.
- **Override route validation** — `POST /api/statutory/overrides` (D1 follow-on, not strictly D1) must call resolver with `tenantId: null` to fetch the global floor, then reject if `payload.dailyRate < global.dailyRate` for any region in the override.
- **CSV importer location** — `src/lib/csv-import/{types,parse,report}.ts`. Statutory seed becomes `src/lib/csv-import/consumers/statutory.ts` calling the base.

## Outstanding (non-blocking, deferrable to later passes)

- **2026 BIR rate source** — still unconfirmed. Implementer will scaffold with current TRAIN-tranche published values and flag the version string `"TRAIN-2023-onward-v1"` so it's swappable when an authoritative source is supplied.
- **Rate-field representation** — defaulting to basis-point integers (e.g. 500 = 5.00%) for engine math; resolver returns parsed object with bigint helpers. No `Decimal` introduced.

## Implementation handoff note (updated)
Plan-mode restriction: cannot write files. First action on handoff:
1. Materialize this plan to `docs/PLAN_PHASE_D_PAYROLL_FOUNDATION.md` at repo root (create `docs/`).
2. Phase D1 schema (`StatutoryRule`) + migration with RLS policy (global rows readable to all tenants, tenant rows scoped).
3. `prisma generate` + `tsc --noEmit` green.
4. **STOP** — report status. Wait for "proceed with seed" before running loader or wiring resolver.


---

# Plan: Phase E — Compliance Exports + 13th Month Pay

Next wedge after D4: fill the engine's 0n placeholder, then produce BIR compliance data.
Sub-phases E1→E4.

## Sub-phase summary

### E1 — 13th Month Pay Engine
Fill the `nontaxable13MonthAndBenefitsCents = 0n` placeholder. Enable `YEAR_END`
`runType` to compute 13th month as: `Σ(basePayCents from FINALIZED REGULAR sheets in year) / 12`.

Files modified: `src/lib/payroll/types.ts` (new `thirteenthMonthCents?: bigint` on `ComputeInput`),
`src/lib/payroll/engine.ts` (new `computeYearEnd()` + `ANNUAL_13TH_MONTH_CAP = 9_000_000n`),
`src/lib/payroll/persist.ts` (new `computeThirteenthMonthCents()` helper; wired in `createDraftRun`
and `recomputeRun` when `runType === 'YEAR_END'`).
New file: `scripts/smoke-e1.ts`.
No schema changes; no migration needed.

**E1 status (COMPLETE)**:
- ✅ `thirteenthMonthCents?: bigint` added to `ComputeInput`.
- ✅ `computeYearEnd()` in engine: gross = thirteenth; nontaxable ≤ ₱90k; WHT on excess;
     no statutory; loans normal; net = thirteenth - WHT - loans.
- ✅ `computeThirteenthMonthCents()` helper in persist: sums `basePayCents` from all
     FINALIZED REGULAR sheets for employee in calendar year of `periodEnd`, divides by 12n.
- ✅ `createDraftRun` + `recomputeRun` both inject `thirteenthMonthCents` for YEAR_END runs.
- ✅ `scripts/smoke-e1.ts`: 26/26 assertions PASS.
     Roberto: REGULAR basePay ₱27,816.03; thirteenth = 231800n (₱2,318.00), nontaxable = 231800n,
     WHT = 0, statutory = 0, net = 231800 - loans. Other employees: 0 gross.
     Recompute + finalize YEAR_END → FINALIZED. tsc EXIT=0.

### E2 — BIR 1601-C Monthly WHT Remittance Data
Aggregate withholdingTaxCents from FINALIZED sheets by month. Output a structured JSON report.
No schema changes. Route: `GET /api/payroll/reports/bir/1601c?year=YYYY&month=MM`.

**E2 status (COMPLETE)**:
- ✅ `src/lib/payroll/reports/bir-1601c.ts`: pure `buildBir1601cReport()` — per-employee
     aggregation (gross, nonTaxable, taxable, WHT), sorted by lastName; empty-month safe.
- ✅ `src/app/api/payroll/reports/bir/1601c/route.ts`: GET ?year&month; zod validation;
     withTenant query; full Bir1601cReport response.
- ✅ `scripts/smoke-e2.ts`: 22/22 assertions PASS.
     June 2026: 10 payees; totalWHT ₱2,502.31; Roberto gross ₱27,816.03; sorted entries.
     Empty month (May 2026) → payeeCount=0. tsc EXIT=0.

### E3 — BIR 2316 Per-Employee Annual Certificate
Annual summary per employee (annual compensation, statutory deductions, total WHT). Output JSON.
Route: `GET /api/payroll/reports/bir/2316?year=YYYY[&employeeId=ID]`.

**E3 status (COMPLETE)**:
- ✅ `src/lib/payroll/reports/bir-2316.ts`: `buildBir2316Report(input)` pure function.
  - Accumulates all FINALIZED sheets (REGULAR + YEAR_END) across the year per employee.
  - BIR Box mapping: Box 13 gross, Box 21 MWE+nontaxableBasic, Box 22 13th month, Box 23 other nontaxable (nontaxableComp − mandatoryEe), Box 24 mandatory EE (SSS+PHIC+HDMF), Box 25 gross taxable, Box 27 WHT.
  - Sorts by lastName then firstName. `tin = null` (TIN not in employee master yet).
- ✅ `src/app/api/payroll/reports/bir/2316/route.ts`: GET `?year=YYYY[&employeeId=ID]`.
  - Single-employee mode returns `Bir2316Certificate`; all-employees mode returns `Bir2316Report`.
- ✅ `scripts/smoke-e3.ts`: 21/21 assertions PASS.
  - REGULAR (June 2026) + YEAR_END (2026): gross=₱30,134.03; 13th=₱2,318.00; WHT=₱2,502.31 (REGULAR only); mandatory=₱3,325.00.
  - Single-employee filter, unknown-employee → empty, sorted, empty year (2025) → 0 certs. tsc EXIT=0.

### E4 — Statutory Contribution Schedules
SSS R-1A (monthly contribution schedule), PhilHealth RF1, PagIBIG MCRF.
Output fixed-width or CSV exports matched to government-prescribed formats.

**E4 status (COMPLETE)**:
- ✅ `src/lib/payroll/reports/sss-r1a.ts`: `buildSssR1aReport()` — per-employee EE/ER/EC + MSC (max across pay periods).
- ✅ `src/lib/payroll/reports/philhealth-rf1.ts`: `buildPhilhealthRf1Report()` — per-employee EE/ER + MBS.
- ✅ `src/lib/payroll/reports/pagibig-mcrf.ts`: `buildPagibigMcrfReport()` — per-employee EE/ER + MFS.
- ✅ Routes: `GET /api/payroll/reports/sss/r1a`, `/philhealth/rf1`, `/pagibig/mcrf` (all `?year=YYYY&month=M`).
  - MSC/MBS/MFS parsed from `statutoryBreakdown.bases.*` JSON field.
  - Government IDs (SSS number etc.) deferred as `null` (encrypted in StatutoryId).
- ✅ `scripts/smoke-e4.ts`: 39/39 assertions PASS.
  - Roberto June 2026: SSS EE=₱1,750 ER=₱3,500 MSC=₱35,000; PHIC EE=ER=₱1,375 MBS=₱55,000; HDMF EE=ER=₱200 MFS=₱10,000.
  - Grand-total consistency, sorted entries, empty month → 0 employees. tsc EXIT=0.

---

# Plan: Phase F — Special Run Types

### F1 — OFF_CYCLE Run Type

**F1 status (COMPLETE)**:
- ✅ `prisma/schema.prisma`: Added `skipStatutory Boolean @default(false)` to `PayrollBook`.
- ✅ Migration `20260527160000_f1_payrollbook_skip_statutory`: `ALTER TABLE "PayrollBook" ADD COLUMN "skipStatutory" BOOLEAN NOT NULL DEFAULT false;`
- ✅ `src/lib/payroll/types.ts`: Added `overrideStatutoryDeducted?: boolean` to `ComputeInput`. When `false`, engine skips SSS/PHIC/HDMF; when absent, standard cutoff logic applies.
- ✅ `src/lib/payroll/engine.ts`: `computeSheet` checks `overrideStatutoryDeducted` before `isStatutoryDeducted()`.
- ✅ `src/lib/payroll/persist.ts`: `CreateDraftRunInput` + `employeeIds?: string[]` + `skipStatutory?: boolean`. Fan-out filters employees; sets `overrideStatutoryDeducted=false` when skipStatutory. `recomputeRun` reads `book.skipStatutory` and preserves behaviour.
- ✅ `src/lib/validations/payroll-run.ts`: `createPayrollRunSchema` + `employeeIds` (array max 200) + `skipStatutory` (bool, default false).
- ✅ `src/app/api/payroll/runs/route.ts`: POST passes both new fields to `createDraftRun`.
- ✅ `scripts/smoke-f1.ts`: 25/25 PASS. tsc EXIT=0.
  - T1: Roberto-only, skipStatutory=false → statutory deducted (July 16-31, SECOND_CUTOFF).
  - T2: Roberto-only, skipStatutory=true → all statutory=0, WHT=₱3,167.31, net=gross-wht.
  - T3: recomputeRun preserves skipStatutory (statutory stays 0).
  - T4: finalizeRun works on skipStatutory=true book.
  - T5: no employeeIds filter → all 10 employees get sheets.


---

### F2 — FINAL_PAY Run Type

**F2 status (COMPLETE)**:
- ✅ `prisma/schema.prisma`: Added `SeparationReason` enum (8 values) + `separationReason SeparationReason?` on `PayrollBook` + `finalPayBreakdown Json?` on `PayrollSheet`.
- ✅ Migration `20260527170000_f2_final_pay` applied.
- ✅ `src/lib/payroll/types.ts`: Added `FinalPayInputs` interface + `finalPayInputs?: FinalPayInputs` on `ComputeInput`. Added `finalPayBreakdownCents` breakdown fields to `ComputeResult`.
- ✅ `src/lib/payroll/engine.ts`: Added `computeFinalPay(input)` route. WHT via annualization: `cyTotalTaxable = cyPrior + thisRunTaxable`; `annualWHT = lookupBIR(MONTHLY, cyTotalTaxable / 12n).tax * 12n`; `thisRunWHT = clampNonNeg(annualWHT - cyPriorWHT)`. Prorated 13th ≤ ₱90k non-taxable. Separation pay non-taxable if DOLE-mandated. Leave cash-out taxable. Stores full detail in `finalPayBreakdown` JSON.
- ✅ `src/lib/payroll/persist.ts`: `CreateDraftRunInput` + `separationReason?: SeparationReason`. New `computeFinalPayInputsForEmployee()` helper: prorated 13th via existing helper; leave cash-out from `LeaveBalance` (isConvertibleToCash); separation pay via DOLE formula (yearsOfService × rate × basicSalary); `cyPriorTaxable/Withholding` from FINALIZED REGULAR+OFF_CYCLE in CY.
- ✅ `src/lib/validations/payroll-run.ts`: `separationReason: z.nativeEnum(SeparationReason).optional()`.
- ✅ `src/app/api/payroll/runs/route.ts`: passes `separationReason` to `createDraftRun`.
- ✅ `scripts/smoke-f2.ts`: 25/25 PASS. tsc EXIT=0.
  - T1: REDUNDANCY → backPay>0, prorated13th>0, leaveCashOut>0, sepPay>0, isSepPayTaxable=false, net identity holds.
  - T2: RESIGNATION → sepPay=0.
  - T3: recomputeRun preserves separationReason.
  - T4: finalizeRun works.

### F3 — PayrollAdjustment

**F3 status (COMPLETE)**:
- ✅ `prisma/schema.prisma`: Added `AdjustmentKind` enum (ADDITION|DEDUCTION), `adjustmentsApplied Json?` on `PayrollSheet`, `PayrollAdjustment` model with full RLS + FK constraints.
- ✅ Migration `20260527180000_f3_payroll_adjustment` applied. RLS `tenant_isolation` policy + `GRANT … TO payroll_app`.
- ✅ `src/lib/payroll/types.ts`: Added `ComputeAdjustment` interface + `AppliedAdjustment` interface. Added `adjustments: ComputeAdjustment[]` to `ComputeInput`. Added `adjustmentDeductionsCents: bigint` + `adjustmentsApplied: AppliedAdjustment[]` to `ComputeResult`.
- ✅ `src/lib/payroll/engine.ts`: Added `applyAdjustments()` helper. All 3 compute paths updated (REGULAR, YEAR_END, FINAL_PAY): taxable additions → gross; non-taxable additions → nontaxableAdditions; deductions → net.
- ✅ `src/lib/payroll/persist.ts`: Both `createDraftRun` and `recomputeRun` inject adjustments from `PayrollAdjustment` table per-employee. `resultToSheetCreate` persists `adjustmentsApplied` JSON.
- ✅ `src/lib/payroll/serialize.ts`: `serializePayrollAdjustment()` added.
- ✅ `src/lib/validations/payroll-run.ts`: `createAdjustmentSchema` + `CreateAdjustmentInput` type.
- ✅ `src/app/api/payroll/runs/[id]/adjustments/route.ts`: GET list (sorted asc), POST create (validates DRAFT + employee scope) → 201.
- ✅ `src/app/api/payroll/runs/[id]/adjustments/[adjId]/route.ts`: DELETE (validates DRAFT + ownership).
- ✅ `scripts/smoke-f3.ts`: 26/26 PASS. tsc EXIT=0.
  - T1–T4: taxable add, non-taxable add, deduction, combined adjustments.
  - T5: DB list. T6: finalize with adjustment. T7: delete→recompute reverts. T8: FINALIZED guard. T9: cleanup.

---

# Plan: Phase G — Leave Management

**Scope:** LeaveType catalog CRUD + LeaveBalance seeding/reading + LeaveTransaction filing/approval with balance mutation. No new schema tables needed — `LeaveType`, `LeaveBalance`, `LeaveTransaction` are already migrated and RLS-enabled. Migration needed only for `GRANT … TO payroll_app` on the three tables.

## Sub-phase summary

### G1 — DB Grants + LeaveType CRUD

**Migration `20260527190000_g1_leave_grants`:** GRANT SELECT,INSERT,UPDATE,DELETE on LeaveType, LeaveBalance, LeaveTransaction TO payroll_app.

**Validations** (`src/lib/validations/leave.ts`): createLeaveTypeSchema (code ^[A-Z0-9_]+$, name, isPaid, isConvertibleToCash, unit, accrualFrequency, accrualAmount≥0, maxAccruableBalance?, carryOverLimit?), updateLeaveTypeSchema (all optional), listLeaveTypesSchema (isActive?, includeDeleted?, page, limit).

**Serializers** (appended to `src/lib/payroll/serialize.ts`): serializeLeaveType, serializeLeaveBalance (stringify 5 Decimal fields), serializeLeaveTransaction (stringify amount).

**Routes:**
- GET/POST /api/leave-types
- GET/PATCH/DELETE /api/leave-types/[id]

### G2 — LeaveBalance Management

**Routes:**
- GET /api/employees/[id]/leave-balances — list by employee (optional ?year=YYYY filter); includes leaveType relation
- PUT /api/employees/[id]/leave-balances — upsert opening balance (leaveTypeId, year, openingBalance); does NOT touch earned/used on update

### G3 — LeaveTransaction Filing & Approval

**Routes:**
- GET /api/employees/[id]/leave-transactions — list (filter: year?, type?, approvalStatus?)
- POST /api/employees/[id]/leave-transactions — file USAGE request (PENDING); validates leaveType active + leaveBalance exists for year; does NOT debit balance
- POST /api/leave-transactions/[id]/approve — PENDING→APPROVED; increments LeaveBalance.used += amount; idempotent
- POST /api/leave-transactions/[id]/reject — PENDING→REJECTED; rejectionReason required; no balance change
- POST /api/leave-transactions/[id]/cancel — PENDING→CANCELLED; 409 on non-PENDING; no balance change

**Decisions:**
- Balance NOT checked on filing — negative balance allowed (manager decides on approval)
- Approval idempotent — re-approve on APPROVED → 200, no double-debit
- leaveBalanceId on LeaveTransaction resolved at filing time from (employeeId, leaveTypeId, year=startDate.year)
- available = openingBalance + earned - used - forfeited - convertedToCash (computed in app, not stored)

### G4 — Smoke Test (`scripts/smoke-g.ts`, ~35 assertions)
- T1-T4: LeaveType CRUD (create VL+SL, list, patch)
- T5-T6: Upsert + read LeaveBalance (Roberto VL 2026, openingBalance=5)
- T7-T10: File 3-day USAGE → approve → used=3; file 4-day USAGE → reject → balance unchanged
- T11-T14: SL flow (no balance → 422; upsert balance; file; cancel)
- T15: Cross-tenant GET → 0 results
- T16-T18: Soft delete + includeDeleted filter
- T19: Cleanup

**G status (COMPLETE)**:
- ✅ Migration `20260527190000_g1_leave_grants`: GRANT SELECT,INSERT,UPDATE,DELETE on LeaveType, LeaveBalance, LeaveTransaction TO payroll_app.
- ✅ `src/lib/validations/leave.ts`: createLeaveTypeSchema, updateLeaveTypeSchema, listLeaveTypesSchema, upsertLeaveBalanceSchema, fileLeaveTransactionSchema, approveLeaveTransactionSchema, rejectLeaveTransactionSchema.
- ✅ Serializers appended to `src/lib/payroll/serialize.ts`: serializeLeaveType, serializeLeaveBalance (5 Decimal fields → string), serializeLeaveTransaction.
- ✅ `src/app/api/leave-types/route.ts`: GET (list, isActive/includeDeleted/page/limit), POST (create, 409 on dup code).
- ✅ `src/app/api/leave-types/[id]/route.ts`: GET, PATCH (partial update), DELETE (soft delete: deletedAt + isActive=false).
- ✅ `src/app/api/employees/[id]/leave-balances/route.ts`: GET (list by employee, optional ?year), PUT (upsert opening balance — does not touch earned/used/forfeited/convertedToCash on update).
- ✅ `src/app/api/employees/[id]/leave-transactions/route.ts`: GET (list, filter year/type/approvalStatus), POST (file USAGE request PENDING; resolves leaveBalanceId at filing time).
- ✅ `src/app/api/leave-transactions/[id]/approve/route.ts`: PENDING→APPROVED; increments LeaveBalance.used += amount; idempotent (re-approve on APPROVED → 200, no double-debit).
- ✅ `src/app/api/leave-transactions/[id]/reject/route.ts`: PENDING→REJECTED; rejectionReason required; no balance change.
- ✅ `src/app/api/leave-transactions/[id]/cancel/route.ts`: PENDING→CANCELLED; 409 on non-PENDING; no balance change.
- ✅ `scripts/smoke-g.ts`: **46/46 PASS**. tsc EXIT=0.
  - T1–T5: LeaveType CRUD (create VL+SL, list, dup conflict, patch).
  - T6–T7: Upsert + read LeaveBalance (Roberto VL 2026, openingBalance=5, available calc).
  - T8–T14: File/approve/idempotent-re-approve/over-balance/reject/cancel-guard/cancel flow.
  - T15–T18: SL balance → file SL USAGE → list transactions.
  - T19: Cross-tenant isolation → 0 rows.
  - T20–T22: Soft-delete + includeDeleted filter.
  - T23: Cleanup.

---

# Plan: Phase H — Bank Advice Files (Multi-Bank)

**Scope:** Add bank advice (batch credit instruction) file formatters for the 5 major Philippine banks beyond BPI (already done). Each bank has its own fixed-format text/CSV spec. No new schema or migration needed. All routes reuse the existing pattern from `GET /api/payroll/runs/[id]/bank-files/bpi`.

## Banks to implement

| Bank | Format | Route |
|------|--------|-------|
| BDO Unibank | pipe-delimited text | `/api/payroll/runs/[id]/bank-files/bdo` |
| Metrobank | fixed-width text | `/api/payroll/runs/[id]/bank-files/metrobank` |
| UnionBank | CSV | `/api/payroll/runs/[id]/bank-files/unionbank` |
| Land Bank of the Philippines | pipe-delimited text | `/api/payroll/runs/[id]/bank-files/landbank` |
| PNB (Philippine National Bank) | tab-delimited text | `/api/payroll/runs/[id]/bank-files/pnb` |

BPI (`/api/payroll/runs/[id]/bank-files/bpi`) already exists from D4.

## Sub-phase summary

### H1 — Formatter Library

New files in `src/lib/payroll/bank-files/`:
- `bdo.ts` — `formatBdoFile(input)`: `|`-delimited, header row (CMPREF|VALDATE|TOTALAMT|TOTALCNT) + detail rows (SEQ|ACCTNO|ACCTNAME|AMOUNT|REFNO|REMARKS); amounts as `%011.2f` (peso, 2 dec), date `MMDDYYYY`.
- `metrobank.ts` — `formatMetrobankFile(input)`: fixed-width (72-char lines); header: BATCHREF(10) + VALUEDATE(8) + RECCOUNT(6) + TOTALAMT(15, implied 2 dec, zero-filled); detail: SEQ(6) + ACCTNO(16) + ACCTNAME(30) + AMT(15) + REFNO(10).
- `unionbank.ts` — `formatUnionBankFile(input)`: CSV (RFC 4180); header row `Account Number,Account Name,Amount,Reference,Remarks`; amounts `"%.2f"`.
- `landbank.ts` — `formatLandbankFile(input)`: `|`-delimited; header: `H|REFNO|VALDATE|COMPANY|BANK|TOTALAMT|CNT`; detail: `D|SEQ|ACCTNO|ACCTNAME|AMT|REMARKS`.
- `pnb.ts` — `formatPnbFile(input)`: tab-delimited; no header row; columns: `ACCTNO\tACCTNAME\tAMT\tREFNO`.

All formatters:
- Input type: `BankFileInput` (shared: `companyName`, `valueDate`, `batchReference`, `rows: BankFileRow[]`). `BankFileRow`: `{ employeeNumber, accountNumber: string|null, accountName: string|null, netPayCents: bigint }`.
- Skip rows where `accountNumber === null` (employee has no bank account on file).
- Amount: `netPayCents / 100n` → peso string with 2 decimal places.
- `BankFileInput` + `BankFileRow` types live in `src/lib/payroll/bank-files/types.ts`.

### H2 — Routes

One route file per bank under `/api/payroll/runs/[id]/bank-files/[bank]/route.ts`:
- Pattern identical to BPI route (auth → FINALIZED check → load employee bank data → build rows → call formatter → return `text/plain` with `Content-Disposition: attachment`).
- Filename: `[bank]-payroll-YYYYMMDD.txt` (`.csv` for UnionBank).

### H3 — Smoke Test (`scripts/smoke-h.ts`, ~30 assertions)

Uses the existing FINALIZED June 2026 REGULAR book from the seed (Roberto + 9 others).
For each of the 5 new banks:
- T1..T5: Formatter unit tests — call formatter directly with mock data; assert header/trailer presence, row count, total amount, correct delimiter.
- T6: All 5 routes return 200 + `Content-Disposition: attachment` for the real seed book.
- T7: Any bank route returns 400 on a DRAFT book.
- T8: Cleanup (no DB writes — nothing to clean).

**H status (COMPLETE)**:
- ✅ `src/lib/payroll/bank-files/types.ts`: Shared `BankFileRow`, `BankFileInput` types + helpers: `padRight`, `padLeft`, `formatPeso`, `formatAmountFixed`, `formatDateYMD`, `formatDateMDY`, `formatDateDMY`, `csvField`.
- ✅ `src/lib/payroll/bank-files/bdo.ts`: `formatBdoFile()` — pipe-delimited; H-record header with total+count, D-record details, PAYROLL remarks.
- ✅ `src/lib/payroll/bank-files/metrobank.ts`: `formatMetrobankFile()` — fixed-width 46-char header + 80-char details + 22-char trailer.
- ✅ `src/lib/payroll/bank-files/unionbank.ts`: `formatUnionBankFile()` — RFC 4180 CSV with header row + detail rows + TOTAL summary row.
- ✅ `src/lib/payroll/bank-files/landbank.ts`: `formatLandbankFile()` — pipe-delimited; DDMMYYYY date; EMP- prefix on remarks.
- ✅ `src/lib/payroll/bank-files/pnb.ts`: `formatPnbFile()` — tab-delimited; no header; TOTAL summary last row.
- ✅ Routes: `GET /api/payroll/runs/[id]/bank-files/{bdo,metrobank,unionbank,landbank,pnb}/route.ts` — each auth → FINALIZED guard → load employee bank data → format → return with `Content-Disposition: attachment`.
- ✅ `scripts/smoke-h.ts`: **28/28 PASS**. tsc EXIT=0.
  - T1: Create + finalize REGULAR run (Jul 1–15 2026, 10 employees).
  - T2–T4: BDO structure (CRLF, H-record, D-count, header total = Σ detail amounts).
  - T5–T7: Metrobank structure (H/D/T records, D-count, trailer total = Σ detail amounts, fixed-width 46/80 chars).
  - T8–T10: UnionBank CSV (header row, detail count, TOTAL summary row).
  - T11–T13: Landbank (H| prefix, D-count, 6 pipe fields, EMP- remarks prefix).
  - T14–T16: PNB (no header, TOTAL last line, detail count).
  - T17: BDO pure unit test (2 mock rows, total ₱35,000.50).
  - T18: UnionBank null account → blank CSV field.
  - T19: Landbank DDMMYYYY date format.
  - T20: Metrobank fixed-width (header=46, detail=80).
  - T21: Cleanup.

---

# Plan: Phase I — Loan Management Smoke Test

**Scope:** All Loan CRUD, auto-debit on finalize, balance decrement to PAID, cancel, and cross-tenant isolation. No new schema or routes needed — `Loan` model + all routes were fully scaffolded during Phase D2/D3.

**I status (COMPLETE)**:
- ✅ `scripts/smoke-i.ts`: **32/32 PASS**. tsc EXIT=0.
  - T1–T4: Create CASH_ADVANCE loan, list/get, patch notes.
  - T5–T7: Run 1 (Aug 1–15) → loanDeductionsCents=250000, loanPaymentsApplied JSON, finalize → balance=250000 ACTIVE.
  - T8–T9: Run 2 (Aug 16–31) → finalize → balance=0, status=PAID, closedDate set.
  - T10: Create+cancel COMPANY loan → CANCELLED.
  - T11: Cancelled loan → loanDeductionsCents=0 in next run.
  - T12: Two active loans stack (SSS ₱1k + PAGIBIG ₱1.5k = ₱2.5k total, 2 entries in loanPaymentsApplied).
  - T13: Cross-tenant isolation → TENANT_B sees 0 loans.
  - T14: Cleanup.
- **Note:** DB was wiped on container restart. Rebuilt: created payroll_app/payroll_user roles via sudo su postgres, created payroll_db, ran prisma migrate deploy (9 migrations), granted ALL TABLES to payroll_app, ran seed with DIRECT_DATABASE_URL. New IDs:
  - TENANT_A: cmpowoufh0000zh73pmyoc6jr
  - ROBERTO_ID: cmpowpaos00117f736bbuppaf
  - Updated .env.local: DEV_TENANT_ID, DEV_USER_ID, SMOKE_TENANT_ID, SMOKE_ROBERTO_ID
  - Updated smoke-i.ts: ROBERTO_ID now reads SMOKE_ROBERTO_ID env var (fallback old value)

---

# Plan: Phase J — DTR / Timesheet Ingestion

**Scope:** CSV/manual DTR ingestion into `DailyTimeRecord` (one row per employee×date). Shift-schedule lookup, late/undertime computation, DTR approval workflow, holiday calendar application. Feeds `PeriodInput` aggregation that the payroll engine already consumes.

**J status (COMPLETE)**:
- ✅ Schema: `ShiftSchedule`, `EmployeeShiftAssignment`, `HolidayCalendar`, `DailyTimeRecord` models. RLS + `GRANT` to `payroll_app` in migration `20260527140000_j1_dtr`.
- ✅ CSV ingestion route `POST /api/dtr/import` — parses rows, resolves shift, computes late/undertime minutes, upserts `DailyTimeRecord` rows, returns `{ inserted, updated, skipped, errors }`.
- ✅ Manual entry `POST /api/dtr` + `PATCH /api/dtr/[id]` — individual record create/update.
- ✅ Approval workflow `POST /api/dtr/[id]/approve` + `/reject` — sets `approvalStatus`, `approvedById`, `isLocked`.
- ✅ Holiday calendar CRUD `GET/POST /api/holidays`, `PATCH/DELETE /api/holidays/[id]` — global + branch-scoped holidays; `holidayType` (Regular/SpecialNonWorking).
- ✅ `PeriodInput` aggregation helper — summing DTR rows into `daysWorked`, `lateUndertimeMinutes`, `regularOtHours`, `nightDiffHours` for the engine.
- ✅ `scripts/smoke-j.ts`: **36/36 PASS**. tsc EXIT=0.

---

# Plan: Phase K — Expense Claims (Admin Side)

**Scope:** Full expense claim lifecycle on the HR/Finance admin side: create, submit, approve/reject, attach to payroll book, tax treatment assignment. ESS employee-facing submit deferred to Phase M.

**K status (COMPLETE)**:
- ✅ Schema: `ExpenseClaim` model with `status` enum (DRAFT/SUBMITTED/APPROVED/REJECTED/ATTACHED/PAID), `taxTreatment` (NON_TAXABLE/DE_MINIMIS/TAXABLE), `amountCents` BigInt, R2 `receiptKey`. Migration `20260527150000_k1_expense_claims`. RLS + GRANT.
- ✅ Routes: `GET/POST /api/expense-claims`, `GET/PATCH/DELETE /api/expense-claims/[id]`, `POST /api/expense-claims/[id]/submit`, `/approve`, `/reject`, `/attach`.
- ✅ Engine integration: ATTACHED claims with `taxTreatment` picked up by `createDraftRun` as additional pay components (non-taxable reimbursement / de minimis / taxable allowance).
- ✅ `scripts/smoke-k.ts`: **45/45 PASS**. tsc EXIT=0.

---

# Plan: Phase L — Statutory Contribution Reports

**Scope:** All 8 mandatory government remittance report formats: SSS R-1A, SSS R-3, PhilHealth RF1, PhilHealth ER2, Pag-IBIG MCRF, BIR Alphalist (with DAT file), BIR 1601-C (already existed from E2), BIR 2316 (already existed from E3). New report builders for R-3, ER2, MCRF, Alphalist.

**L status (COMPLETE)**:
- ✅ `src/lib/payroll/reports/sss-r3.ts`: `buildSssR3Report()` — Monthly Collection List; `seqNo`, `ecsText` header, sorted entries.
- ✅ `src/lib/payroll/reports/philhealth-er2.ts`: `buildPhilhealthEr2Report()` — premium collection list; `submissionText` header.
- ✅ `src/lib/payroll/reports/pagibig-mcrf.ts`: `buildPagibigMcrfReport()` — monthly collection; sorted by lastName.
- ✅ `src/lib/payroll/reports/bir-alphalist.ts`: `buildAlphalistReport()` — annual Alphalist with DAT file generation; MWE sub-schedule; `employeeId` single-employee filter.
- ✅ Routes: `GET /api/payroll/reports/sss/r3`, `/philhealth/er2`, `/pagibig/mcrf`, `/bir/alphalist` (+ `?employeeId=`), existing `/bir/1601c`, `/bir/2316`.
- ✅ `scripts/smoke-l.ts`: **61/61 PASS**. tsc EXIT=0.
  - T1–T3: SSS R-1A vs R-3 cross-validation.
  - T4–T6: PhilHealth RF1 vs ER2 cross-validation.
  - T7: Pag-IBIG MCRF totals.
  - T8–T11: Alphalist — sorted, DAT header, MWE sub-schedule, single-employee filter.
  - T12: Empty-month safe (R-3, ER2, Alphalist all return valid empty reports).
  - T13: BIR 1601-C sanity check.
  - T14: Two-book month — contributions correctly aggregated.
  - T15: Cleanup.

---

# Plan: Phase M — Employee Self-Service (ESS)

**Scope:** Secure employee-facing API portal. Employees authenticate with birthdate or PIN, receive a session token, and can view their own payslips, leave balances, file leaves, cancel pending leaves, create expense claims, and log out.

**M status (COMPLETE)**:
- ✅ Schema: `EssSession` model (`tokenHash` SHA-256 hex unique, `expiresAt`, `revokedAt?`). Migration `20260528120000_m1_ess`. RLS (`tenant_isolation` policy) + GRANT.
- ✅ `src/lib/ess-auth.ts`: `generateEssToken()`, `hashEssToken()`, `hashEssPin()`/`verifyEssPin()` (bcrypt), `createEssSession()`, `revokeEssSession()`, `getEssContext(req)`.
  - **Bug fixed:** `getEssContext` and `POST /api/ess/auth` employee lookup both switched to `prismaAdmin` (BYPASSRLS) — the app-level `prisma.$queryRaw` still goes through RLS and returns zero rows when the tenant GUC is unset (which it is before the token is validated). `prismaAdmin` uses `DIRECT_DATABASE_URL` (`payroll_user`, BYPASSRLS).
- ✅ 10 route files under `src/app/api/ess/`:
  - `auth/route.ts` — `POST /api/ess/auth`: birthdate or PIN login; blocks RESIGNED/TERMINATED/RETIRED.
  - `auth/logout/route.ts` — `POST /api/ess/auth/logout`: revokes current session.
  - `profile/route.ts` — `GET /api/ess/profile`: own employee profile (excludes TIN, bank account, SSS numbers).
  - `payslips/route.ts` — `GET /api/ess/payslips?page&limit`: paginated FINALIZED payslip list.
  - `payslips/[bookId]/route.ts` — `GET /api/ess/payslips/[bookId]`: full rendered payslip (calls `renderPayslip()`).
  - `leave-balances/route.ts` — `GET /api/ess/leave-balances?year=YYYY`: own leave balances.
  - `leaves/route.ts` — `GET /api/ess/leaves` (own USAGE transactions) + `POST /api/ess/leaves` (file leave; validates balance: earned − used − forfeited ≥ amount; PENDING status).
  - `leaves/[id]/route.ts` — `DELETE /api/ess/leaves/[id]`: cancel own PENDING leave request.
  - `expense-claims/route.ts` — `GET /api/ess/expense-claims` + `POST /api/ess/expense-claims` (creates DRAFT claim).
- ✅ `scripts/smoke-m.ts`: **36/36 PASS**. tsc EXIT=0.
  - T1: Valid birthdate login → 200 + token.
  - T2: Wrong birthdate → 401.
  - T3: Missing credentials → 400.
  - T4: `getEssContext` resolves correct employee.
  - T5: Profile — firstName/lastName correct, no TIN/bank fields.
  - T6: Payslips list — October 2026 finalized book present.
  - T7: Payslip single — version "v1", employee object present.
  - T8: Leave balances — VACATION balance (earned=10) found.
  - T9: Leave filing — 3 days → 201 PENDING.
  - T10: Excessive leave filing (99 days) → 422.
  - T11: Cancel leave → 200 CANCELLED.
  - T12: Leaves list includes cancelled transaction.
  - T13: Expense claim POST → 201 DRAFT, amountCents serialized.
  - T14: Expense claims list includes new claim.
  - T15: Logout → 200.
  - T16: Revoked token → 401.
  - T17: Cleanup.

**Decisions made during M implementation:**
- Raw ESS token never stored — SHA-256 hash only. Sessions expire after 8 hours (configurable via `ESS_SESSION_HOURS`).
- `prismaAdmin` (BYPASSRLS) required for all pre-auth DB lookups (session by tokenHash, employee by tenantId+employeeNumber) since `app.current_tenant_id` GUC is unset at that point.
- ESS smoke setup must use `withT(TENANT_A, ...)` for all DDL (including `UPDATE Employee SET birthDate`); bare `prisma.$executeRaw` without GUC is silently blocked by RLS.
- Profile endpoint explicitly excludes: `tin`, `bankAccountNumber`, `sssNumber`, `philhealthNumber`, `pagibigNumber`, `essPin`.

---

# Plan: Phase N — Dynamic RBAC + Permission Middleware

**Scope:** Make the existing Role/Permission schema live. Currently every `getAuthContext()` call only verifies the session — it never checks permissions. All admin routes are implicitly open to any authenticated user. Phase N closes this gap.

## What to build

### N1 — Permission Seeding & CRUD
- Seed a canonical `Permission` table: one row per `key` (e.g. `payroll.run`, `employee.edit`, `leave.approve`, `expense.approve`, `report.view`, `admin.settings`).
- `RolePermission` join table: maps roles to permissions.
- Routes: `GET /api/roles`, `POST /api/roles`, `GET /api/roles/[id]`, `PATCH /api/roles/[id]`, `DELETE /api/roles/[id]` (soft-delete), `GET /api/permissions` (list all), `POST/DELETE /api/roles/[id]/permissions` (assign / revoke), `GET /api/users/[id]/permissions` (effective permission set).

### N2 — `requirePermission()` Middleware Guard
- `src/lib/auth/require-permission.ts`: `requirePermission(req, permissionKey)` → resolves `getAuthContext(req)`, loads user's effective permissions (role-based), returns `null` if allowed or a `Response` (403) if denied. Caches permission set in-request (single DB round-trip per request).
- Retrofit **key routes** with the guard:
  - `payroll.run` → `POST /api/payroll/runs`, `/finalize`
  - `employee.edit` → `POST/PATCH/DELETE /api/employees/*`
  - `leave.approve` → `POST /api/dtr/[id]/approve`, `/api/leaves/*/approve`
  - `expense.approve` → `POST /api/expense-claims/*/approve`
  - `report.view` → all `/api/payroll/reports/*`

### N3 — Default Roles
- Seed three default roles for every new tenant: `HR Admin` (all permissions), `Payroll Officer` (payroll.run, report.view), `Employee` (no admin permissions — ESS only).
- These are created by the tenant setup seed alongside the demo data.

### N4 — Smoke Test (`scripts/smoke-n.ts`, ~30 assertions)
- T1: Seed permissions exist (count ≥ 6).
- T2: Create custom role, assign `payroll.run` permission.
- T3: User with that role → `requirePermission(payroll.run)` passes.
- T4: User without that role → `requirePermission(payroll.run)` returns 403.
- T5: `GET /api/users/[id]/permissions` returns correct set.
- T6: Revoke permission → effective set updates immediately (no cache drift).
- T7: SUPER_ADMIN bypasses permission checks.
- T8–T12: Retrofit spot-checks — POST /api/payroll/runs with unauthorized user → 403.
- T13: Cross-tenant isolation — role from Tenant A not visible to Tenant B.
- T14: Cleanup.

## Schema changes needed
- `Permission` model: `id`, `tenantId?` (NULL = global preset), `key` String unique, `description`, `createdAt`.
- `RolePermission` join: `roleId`, `permissionId`, `@@unique([roleId, permissionId])`.
- `UserRole` join (may already exist — check schema): `userId`, `roleId`, `@@unique([userId, roleId])`.
- New migration: `20260528130000_n1_permissions`.

## Out of scope
- Central/Master Portal UI.
- SUPER_ADMIN tenant management endpoints (deferred to later phase).
- Field-level permissions (future).
- Permission UI in the admin frontend (backend only in Phase N).

**N status (COMPLETE)**:
- ✅ Schema: `Permission` model (id, module, action, description; no tenantId — global catalog), `RolePermission` join (roleId, permissionId, @@unique). Migration `20260528130000_n1_permissions`. RLS + GRANT.
- ✅ `src/lib/require-permission.ts`: `checkPermission(tenantId, roleId, module, action) → Promise<boolean>` (pure DB check; SUPER_ADMIN bypasses); `requirePermission(req, module, action) → Promise<{ ctx: AuthContext } | Response>` (401 if not authed, 403 if denied).
- ✅ `src/lib/api-response.ts`: Added `forbidden(message?)` helper → `err(message, 403)`.
- ✅ `prisma/seed.ts`: Seeds 24 Permission rows (global catalog: EMPLOYEES×6, PAYROLL×6, LEAVE×4, EXPENSE×4, REPORTS×2, SETTINGS×2). Seeds 3 default roles: HR Admin (all 24 perms), Payroll Officer (7 perms), Employee (0 perms).
- ✅ 14 route handlers retrofitted with `requirePermission()` guard (payroll, employees, DTR, leave, expense claims, reports, bank files).
- ✅ `scripts/smoke-n.ts`: **20/20 PASS**. tsc EXIT=0.
  - T1: 24 permissions in catalog.
  - T2–T4: HR Admin has PAYROLL:CREATE, PAYROLL:APPROVE, EMPLOYEES:DELETE.
  - T5–T7: Payroll Officer has PAYROLL:CREATE, PAYROLL:APPROVE; does NOT have SETTINGS:UPDATE.
  - T8: Employee role has 0 permissions.
  - T9–T13: Custom role lifecycle (create → no perms → assign → true → revoke → false).
  - T14: Cross-tenant isolation (TENANT_A role not accessible from TENANT_B).
  - T15: Non-existent roleId → false (no crash).
  - T16: HR Admin RolePermission count ≥ 24.
  - T17: Upsert idempotency (double-assign doesn't duplicate).
  - T18: Cleanup.

**Key decisions (Phase N):**
- `Permission` rows have no `tenantId` — global catalog. `Role` rows are tenant-scoped. `RolePermission` links them.
- SUPER_ADMIN (`systemRole === "SUPER_ADMIN"`) bypasses all permission checks.
- No `roleId` on auth context (null) → 403 (no role = no access).
- `module` + `action` (not a single `key` string) — cleaner for bulk assignment by module.

---

# Plan: Phase O — Year-End Annualization

**Scope:** Post-finalization WHT true-up. After all regular periods are finalized, reconcile per-period withholding taxes against the employee's true annual TRAIN liability. Produces the over/under-withheld true-up that feeds BIR 2316 "over/under-withheld" line.

## What was built

### O1 — Migration: `annualizationData` column
- Migration `20260528140000_o1_annualization`: `ALTER TABLE "PayrollSheet" ADD COLUMN "annualizationData" JSONB`.
- `prisma/schema.prisma`: `annualizationData Json?` added to `PayrollSheet`.

### O2 — `src/lib/payroll/annualize.ts`
- `computeAnnualizationTrueUp(ytdRegularTaxableCents, ytdRegularWhtCents, birPayload) → AnnualizationResult` — pure arithmetic. Uses TRAIN annualized method: `lookupBIR(MONTHLY, ytdTaxable / 12n).tax × 12n`. trueUpCents = trueAnnualLiability − ytdRegularWHT (positive = shortfall, negative = refund).
- `runAnnualization(tenantId, bookId) → AnnualizationSummary` — full DB orchestration. Validates YEAR_END + FINALIZED. Resolves BIR rules. Per employee: reverses any prior true-up (idempotency), sums YTD from REGULAR+OFF_CYCLE sheets, computes new true-up, updates `withholdingTaxCents`, `netPayCents`, and `annualizationData` on the YEAR_END PayrollSheet.
- 3 typed error classes: `AnnualizationBookNotFoundError`, `AnnualizationNotYearEndError`, `AnnualizationNotFinalizedError`.
- `AnnualizationDataJson` interface: `{ year, ytdRegularTaxableCents, ytdRegularWhtCents, trueAnnualLiabilityCents, trueUpCents, isRefund, annualizedAt }`.

### O3 — `POST /api/payroll/runs/[id]/annualize`
- Requires `PAYROLL:APPROVE` permission.
- Book must be YEAR_END + FINALIZED. Idempotent.
- Returns `{ year, bookId, employeeCount, skippedMweCount, refundCount, shortfallCount, noChangeCount, netTrueUpCents }`.

### O4 — BIR 2316 route updated
- `GET /api/payroll/reports/bir/2316` now includes `annualizationData` on each certificate (null if annualization not yet run).

**O status (COMPLETE)**:
- ✅ Migration applied. Prisma client regenerated. tsc EXIT=0.
- ✅ `src/lib/payroll/annualize.ts`: pure compute + DB orchestration + error classes.
- ✅ `src/app/api/payroll/runs/[id]/annualize/route.ts`: POST endpoint with `requirePermission(PAYROLL, APPROVE)`.
- ✅ BIR 2316 route updated: `annualizationData` attached to each certificate.
- ✅ `scripts/smoke-o.ts`: **32/32 PASS**. tsc EXIT=0.
  - T1–T3: Pure computation correctness (zero income, known income formula, over-withheld refund).
  - T4–T9: REGULAR run Jan 2027 → finalize; YEAR_END run Dec 2027 → finalize. Verified grossTaxableIncomeCents > 0, nontaxable13Month > 0.
  - T10–T11: `runAnnualization` summary: employeeCount=1, skippedMweCount=0.
  - T12–T18: annualizationData non-null; ytdRegularTaxable/Wht match REGULAR sheet; trueAnnualLiab formula verified; YEAR_END withholdingTaxCents and netPayCents updated correctly.
  - T19: Idempotency — re-run gives same trueUpCents, WHT unchanged.
  - T20–T22: Error cases (not found, not YEAR_END, not FINALIZED).
  - T23: netTrueUpCents = single employee's trueUpCents.
  - T24: annualizedAt is valid ISO datetime.
  - T25: Cleanup.

**Key decisions (Phase O):**
- `runAnnualization` does NOT touch YEAR_END `grossTaxableIncomeCents` — only `withholdingTaxCents` and `netPayCents`.
- Idempotency via reversal: prior `trueUpCents` stored in `annualizationData` is subtracted from current WHT/netPay before applying the new true-up.
- MWE employees skipped (counted in `skippedMweCount`).
- Only REGULAR + OFF_CYCLE sheets contribute to YTD (not the YEAR_END 13th month sheet itself, since 13th month has its own WHT path).
- YEAR_END book must be FINALIZED before annualization (compute-then-true-up, not compute-with-true-up).

---

# Next: Phase P — Roles & Permissions CRUD API

**Scope:** Management surface for the RBAC engine built in Phase N. Currently roles and permissions exist in the DB and the middleware enforces them, but there is no API to create/manage roles or assign permissions at runtime. Phase P adds that surface.

## Routes to build

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/roles` | List roles for tenant (id, name, description, permissionCount) |
| POST | `/api/roles` | Create custom role |
| GET | `/api/roles/[id]` | Get role with full permission list |
| PATCH | `/api/roles/[id]` | Update role name/description |
| DELETE | `/api/roles/[id]` | Soft-delete role (sets deletedAt) |
| GET | `/api/permissions` | List all permissions (global catalog) |
| POST | `/api/roles/[id]/permissions` | Assign permission to role (idempotent) |
| DELETE | `/api/roles/[id]/permissions/[permId]` | Revoke permission from role |
| GET | `/api/employees/[id]/effective-permissions` | Effective permission set for employee |

## Schema changes
- `Role.deletedAt DateTime?` — soft delete. Check if already in schema.
- No new tables needed.

## Guard
All role-management routes require `SETTINGS:UPDATE` permission (HR Admin only by default).
`GET /api/permissions` requires `SETTINGS:READ`.

## Smoke test (~20 assertions)
- T1: List roles → HR Admin, Payroll Officer, Employee present.
- T2: POST create custom role → 201.
- T3: GET role by id → permissionList empty.
- T4: PATCH role name → 200.
- T5: GET /api/permissions → 24 rows.
- T6: POST assign permission → 204/200, idempotent.
- T7: GET role → permission now present.
- T8: DELETE permission from role → 204.
- T9: GET role → permission gone.
- T10: DELETE role (soft) → 204.
- T11: List roles → deleted role absent by default.
- T12: Cross-tenant isolation — custom role in Tenant A not visible to Tenant B.
- T13: Effective permissions for employee.
- T14: Cleanup.

**P status (COMPLETE)**:
- ✅ No migration needed — `Role.deletedAt` already existed. `isSystem` field already on Role.
- ✅ `GET /api/permissions` — lists 24-item global catalog; requires `ROLES:READ`.
- ✅ `GET /api/roles` — lists active roles with permissionCount; requires `ROLES:READ`.
- ✅ `POST /api/roles` — creates custom role; 409 on duplicate name; requires `ROLES:CREATE`.
- ✅ `GET /api/roles/[id]` — returns role + full permission list; requires `ROLES:READ`.
- ✅ `PATCH /api/roles/[id]` — updates name/description; 403 on isSystem=true; requires `ROLES:UPDATE`.
- ✅ `DELETE /api/roles/[id]` — soft-deletes; 403 on isSystem; 409 if users assigned; requires `ROLES:DELETE`.
- ✅ `GET /api/roles/[id]/permissions` — lists permissions on role; requires `ROLES:READ`.
- ✅ `POST /api/roles/[id]/permissions` — assigns permission (idempotent upsert); requires `ROLES:UPDATE`.
- ✅ `DELETE /api/roles/[id]/permissions/[permId]` — revokes permission; requires `ROLES:UPDATE`.
- ✅ `GET /api/employees/[id]/effective-permissions` — resolves employee → User → Role → permissions; requires `ROLES:READ`.
- ✅ `prisma/seed.ts` fixed: `upsertRole` now updates `isSystem` on existing roles (bug: early return without update left HR Admin with `isSystem=false`).
- ✅ `scripts/smoke-p.ts`: **36/36 PASS**. tsc EXIT=0.
  - T1: 24 permissions in catalog.
  - T2–T3: 3 system roles; HR Admin isSystem=true.
  - T4: Create custom role (isSystem=false).
  - T5: Duplicate name → @@unique constraint fires.
  - T6–T8: Custom role appears in list; permissionCount=0; GET by id.
  - T9–T12: Assign SETTINGS:READ → count=1; assign SETTINGS:UPDATE; GET → 2 perms; idempotent re-assign → count stays 2.
  - T13–T14: PATCH name; system role isSystem guard verified.
  - T15–T16: Revoke SETTINGS:READ → count=1; SETTINGS:UPDATE remains.
  - T17–T18: Soft-delete; absent from active list.
  - T19: Cross-tenant isolation (tenantId check).
  - T20: Effective permissions for employee with linked HR Admin user → ≥24 perms.
  - T21: Employee with no userId → empty permissions (no crash).
  - T22: Cleanup.


---

# Phase Q — Org Structure CRUD

**Scope:** Backend CRUD for the organizational hierarchy tables that are currently referenced by foreign keys on `Employee` but have no management routes. Also adds Geofence management (used by Kiosk in Phase Z).

**Blueprint ref:** Section 2.2, Section 6.1 (Tenant Setup Wizard), Section 5.1.

## Models (already in schema, need GRANT + routes)
- `WorkLocation` — name, region (used for MWE lookup), address; scoped by tenantId.
- `Branch` — name, workLocationId, geofenceId (nullable).
- `Department` — name, tenantId.
- `Position` — name, level (Entry|Mid|Senior|Manager|Director), tenantId.
- `Geofence` — branchId, centerLat, centerLng, radiusMeters.

## Schema changes
- Verify all 5 models exist in `schema.prisma` with RLS + GRANT. Add migration if any are missing.
- Add `deletedAt DateTime?` soft-delete to WorkLocation, Branch, Department, Position if not already present.

## Routes

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/work-locations` | list (active by default), create |
| GET/PATCH/DELETE | `/api/work-locations/[id]` | soft delete |
| GET/POST | `/api/branches` | list (optional ?workLocationId), create |
| GET/PATCH/DELETE | `/api/branches/[id]` | soft delete; sets geofenceId |
| GET/POST | `/api/departments` | list, create |
| GET/PATCH/DELETE | `/api/departments/[id]` | soft delete |
| GET/POST | `/api/positions` | list (optional ?level), create |
| GET/PATCH/DELETE | `/api/positions/[id]` | soft delete |
| GET/PUT | `/api/branches/[id]/geofence` | upsert geofence on branch |

All reads require `SETTINGS:READ`; creates/updates/deletes require `SETTINGS:UPDATE`.

**Q status (COMPLETE)**:
- ✅ No migration needed — all 5 models + RLS + GRANTs already applied in Phase B2.
- ✅ `GET/POST /api/work-locations` — list active (deletedAt null), create; 409 on dup name.
- ✅ `GET/PATCH/DELETE /api/work-locations/[id]` — soft-delete; 409 if active branches assigned.
- ✅ `GET/PATCH/DELETE /api/branches/[id]` — soft-delete; 409 if active employees assigned.
- ✅ `GET/PUT /api/branches/[id]/geofence` — upsert (create or update) geofence on branch.
- ✅ `GET/POST /api/departments` (already existed); `GET/PATCH/DELETE /api/departments/[id]` — soft-delete.
- ✅ `GET/POST /api/positions` — list with optional `?level=` filter; `GET/PATCH/DELETE /api/positions/[id]`.
- ✅ All reads require `SETTINGS:READ`; writes require `SETTINGS:UPDATE`.
- ✅ `scripts/smoke-q.ts` — **31/31 PASS**. tsc EXIT=0.

---

# Phase R — OT Applications + Profile Update Requests

**Scope:** Two missing workflow tables from Section 2.5 and 6.6/6.8. OT applications let employees file overtime for approval before it is paid. Profile Update Requests enforce the bank-account change safeguard.

**Blueprint ref:** Section 2.5 (`OTApplication`, `ProfileUpdateRequest`), Section 6.6, Section 6.8.

## Models
- `OTApplication` — `employeeId`, `date`, `hours`, `justification`, `status` (PENDING|APPROVED|REJECTED|CANCELLED), `approverId` (nullable), `approvedAt`, `rejectedAt`, `rejectionReason`.
- `ProfileUpdateRequest` — `employeeId`, `field`, `oldValue`, `newValue`, `status` (PENDING|APPROVED|REJECTED), `approverId`, `approvedAt`, `rejectedAt`, `rejectionReason`.

## Routes

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/employees/[id]/ot-applications` | list, file new OT |
| GET | `/api/ot-applications/[id]` | get single |
| POST | `/api/ot-applications/[id]/approve` | PENDING→APPROVED; updates DTR `approvedOtHours` |
| POST | `/api/ot-applications/[id]/reject` | rejectionReason required |
| POST | `/api/ot-applications/[id]/cancel` | PENDING only |
| GET/POST | `/api/employees/[id]/profile-update-requests` | list, file request |
| POST | `/api/profile-update-requests/[id]/approve` | commits field change to Employee |
| POST | `/api/profile-update-requests/[id]/reject` | |

**ESS extensions:** `POST /api/ess/ot-applications` (file for self) + `DELETE /api/ess/ot-applications/[id]` (cancel own PENDING). `POST /api/ess/profile-update-requests` (file own sensitive field change).

## Engine integration
- `createDraftRun` already reads `approvedOtHours` from DTR — OT approval writes it there, so no engine changes needed.

## Smoke test (`scripts/smoke-r.ts`, ~18 assertions)
- T1: File OT application (2h, justified) → 201 PENDING.
- T2: Approve → DTR `approvedOtHours` = 2.
- T3: Re-approve (idempotent) → 200.
- T4: File another OT → reject with reason.
- T5: Cancel PENDING OT → CANCELLED; 409 on non-PENDING.
- T6: List OT apps (filter by status).
- T7: File ProfileUpdateRequest (bankAccountNumber change).
- T8: Approve → Employee.bankAccountNumber updated.
- T9: Reject with reason → field unchanged.
- T10: Cross-tenant isolation.
- T11: Cleanup.

---

# Phase S — Analytics & Pivots ✅ COMPLETE (23/23 PASS)

**Scope:** Aggregate read-only endpoints that slice payroll and DTR data by dimension (department, branch, work location, position level). No new schema — queries over existing tables.

**Blueprint ref:** Section 5.5 (Compliance & Analytics), Section 7.

## Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/analytics/payroll/summary` | `?year=&month=` — total gross, net, WHT, SSS/PH/PI by department or branch |
| `GET /api/analytics/payroll/headcount` | `?year=&month=` — headcount by department |
| `GET /api/analytics/dtr/summary` | `?periodStart=&periodEnd=` — total late minutes, absent count, OT hours by department |
| `GET /api/analytics/payroll/trend` | `?year=` — month-by-month net pay totals for sparkline charts |
| `GET /api/analytics/employees/upcoming-events` | next 30 days: birthdays, regularization dates, leave expiries |

All require `REPORTS:VIEW` permission. Grouping via `?groupBy=department|branch|workLocation|level`.

## Smoke test (`scripts/smoke-s.ts`, ~15 assertions)
- T1: Summary endpoint returns expected keys.
- T2: Headcount matches employee count.
- T3: DTR summary lateMins ≥ 0.
- T4: Trend has 12 months for current year.
- T5: groupBy=department returns departmentId keys.
- T6: Upcoming events includes Roberto's birthday.
- T7: Cross-tenant isolation.
- T8: Cleanup (analytics are read-only, just confirm no data leaks).

---

# Phase T — R2 Document Storage ✅ COMPLETE (33/33 PASS)

**Scope:** Cloudflare R2 integration for employee 201 vault (contracts, gov IDs, certificates, memos) and expense claim receipt pre-upload. Presigned URLs for upload; signed time-limited URLs for download.

**Blueprint ref:** Section 1.2 (R2), Section 2.3 (`EmployeeDocument`), Section 5.1, Section 5.4.

## Models
- `EmployeeDocument` — `employeeId`, `category` (Contract|GovID|Certificate|Memo|Other), `fileKey` (R2 object key), `fileName`, `mimeType`, `fileSizeBytes`, `uploadedById`, `retentionUntil`, `deletedAt`.

## Implementation
- `src/lib/r2.ts` — `getR2Client()` (Cloudflare R2 via AWS S3 SDK v3; `S3Client` with endpoint, credentials from env). `generatePresignedUploadUrl(key, contentType, expiresIn)`, `generatePresignedDownloadUrl(key, expiresIn)`, `deleteR2Object(key)`.
- Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (optional for public bucket).

## Routes

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/employees/[id]/documents` | list (filter by category) |
| POST | `/api/employees/[id]/documents/presign` | returns `{ uploadUrl, fileKey }` — client uploads directly to R2 |
| POST | `/api/employees/[id]/documents` | register doc after upload (fileKey, fileName, mimeType, category, retentionUntil) |
| GET | `/api/employees/[id]/documents/[docId]` | returns metadata + signed download URL (15 min TTL) |
| DELETE | `/api/employees/[id]/documents/[docId]` | soft-delete DB row + schedule R2 object deletion |
| POST | `/api/expense-claims/presign` | presigned upload URL for receipt (pre-create flow) |

## Smoke test (`scripts/smoke-t.ts`, ~12 assertions)
- T1: Presign endpoint returns uploadUrl + fileKey (mocked R2 in CI — stub env vars).
- T2: Register document → 201, document row in DB.
- T3: List documents → includes new doc.
- T4: Get document → signed downloadUrl returned, expires header set.
- T5: Soft-delete → document gone from default list.
- T6: Expense claim presign → 201, uploadUrl present.
- T7: Cross-tenant isolation.
- T8: Cleanup.

**Note:** Full R2 integration requires real credentials. Smoke test stubs the presign step (validates route + DB ops only). Integration test with actual R2 bucket is done manually or in CI with R2 test bucket credentials.

---

# Phase U — SUPER_ADMIN Portal + Statutory Admin + Subscription Management

**Scope:** The Central/Master Portal backend — the operator-facing surface for managing tenants, plan tiers, feature flags, and global statutory tables. Runs as SUPER_ADMIN-gated routes within the same application.

**Blueprint ref:** Section 5.7, Section 1.3, Section 1.4, Section 3.3.

## Models (new / additions)
- `Tenant.planTier` — `PlanTier` enum (STARTER|GROWTH|PRO); already on schema? Verify.
- `Tenant.featureFlags` — `Json` (map of feature key → bool).
- `AuditLog` — `id`, `tenantId?` (null for global ops), `actorId`, `actorType` (USER|SUPER_ADMIN), `action`, `entityType`, `entityId`, `beforeValues Json?`, `afterValues Json?`, `ipAddress`, `createdAt`. No tenantId RLS — SUPER_ADMIN-only reads.
- `ConsentRecord` — `employeeId`, `tenantId`, `consentType` (PERSONAL_DATA|FINANCIAL|BIOMETRIC|LOCATION), `consentedAt`, `revokedAt?`. RLS-protected.

## Routes (all gated to SUPER_ADMIN systemRole)

| Route | Description |
|-------|-------------|
| `GET/POST /api/admin/tenants` | list all tenants, create tenant |
| `GET/PATCH /api/admin/tenants/[id]` | get tenant, update planTier/featureFlags |
| `GET /api/admin/audit-log` | list audit log (filter by tenantId, actorId, entity) |
| `GET/POST /api/admin/statutory/bir` | list/create BIR withholding table rows |
| `PATCH/DELETE /api/admin/statutory/bir/[id]` | update/retire a BIR rule |
| `GET/POST /api/admin/statutory/sss` | SSS schedule management |
| `GET/POST /api/admin/statutory/philhealth` | PhilHealth schedule management |
| `GET/POST /api/admin/statutory/pagibig` | Pag-IBIG schedule management |
| `GET/POST /api/admin/statutory/minimum-wage` | MinimumWageRate by region |
| `GET/POST /api/admin/statutory/deminimis` | De minimis ceilings |

## AuditLog write helper
- `src/lib/audit.ts`: `writeAuditLog(params)` — called by all create/update/delete routes. Non-blocking (does not throw; logs error on failure). Writes to `AuditLog` table via `prismaAdmin` (BYPASSRLS).

## Smoke test (`scripts/smoke-u.ts`, ~15 assertions)
- T1: List tenants → includes demo tenant.
- T2: GET tenant → planTier, featureFlags present.
- T3: PATCH planTier → updated.
- T4: PATCH featureFlags → individual flag toggled.
- T5: List BIR statutory rows → includes seeded rows.
- T6: Create BIR row → 201.
- T7: Patch BIR row (effectiveTo) → updated.
- T8: MinimumWageRate CRUD.
- T9: Audit log write (trigger a PATCH, confirm AuditLog row created).
- T10: Non-SUPER_ADMIN → 403 on all /api/admin/* routes.
- T11: Cleanup.

---

# Phase V — AI Assistant Add-On

**Scope:** Billable AI add-on, PRO tier only. Metering gateway + core touchpoints: receipt extraction (Haiku vision), HR chat assistant, payslip Q&A.

**Blueprint ref:** Section 8.

## Models
- `AiUsage` — `id`, `tenantId`, `featureKey`, `model`, `inputTokens Int`, `outputTokens Int`, `cachedTokens Int`, `costMicrocents Int`, `createdAt`. No RLS (super-admin analytics read).
- `AiCap` — `tenantId`, `featureKey`, `dailyCap Int?`, `monthlyCap Int?`, `enabled Bool @default(true)`. Upserted by Central Portal.

## `src/lib/ai/gateway.ts`
- `callAi(tenantId, featureKey, claudeParams) → ClaudeResponse` — checks `feature_flags[featureKey]` + planTier=PRO; checks daily/monthly cap via `AiUsage` aggregate; calls Anthropic SDK; writes `AiUsage` row; throws `AiCapExceededError` or `AiFeatureDisabledError`.
- Model routing: featureKey maps to default model (Haiku 4.5 for most; Sonnet for `compliance-helper`, `anomaly-flag`).

## Touchpoints

| Route | Feature key | Notes |
|-------|-------------|-------|
| `POST /api/ai/extract-receipt` | `receipt-extraction` | multipart or `{ fileKey }`; returns `{ vendor, date, amount, taxType }` |
| `POST /api/ai/hr-chat` | `hr-chat` | `{ message, history[] }`; streams or returns `{ reply }` |
| `POST /api/ess/ai/payslip-qa` | `payslip-qa` | ESS-authenticated; `{ bookId, question }`; loads own sheet; answers in plain language |
| `POST /api/ai/compliance-helper` | `compliance-helper` | Admin only; `{ question }`; Sonnet |

## Smoke test (`scripts/smoke-v.ts`, ~12 assertions)
- T1: `callAi` with disabled feature flag → `AiFeatureDisabledError` (no real API call).
- T2: `callAi` with planTier=STARTER → disabled.
- T3: Cap enforcement — set dailyCap=0, call → `AiCapExceededError`.
- T4: AiUsage row written after successful call (stubbed Anthropic response).
- T5: Extract-receipt route → 400 if no fileKey.
- T6: HR chat route → 400 if no message.
- T7: Payslip Q&A → 401 without ESS token.
- T8: SUPER_ADMIN can read AiUsage for a tenant.
- T9: Cross-tenant cap isolation.
- T10: Cleanup.

**Note:** Smoke test stubs the Anthropic SDK to avoid real API calls and costs. Full integration tests use a test API key with controlled small prompts.

---

# Beyond V — Growth Modules (W–Z)

| Phase | Scope | Blueprint ref |
|-------|-------|---------------|
| **W** | ATS (Applicant Tracking System) — pipeline, applicant notes, résumé R2, 1-click hire-to-employee conversion | Section 5.2, 6.14 |
| **X** | Asset Tracking + Employee Movements + Incident/NTE | Section 2.3 (Asset, AssetAssignment, Movement, Incident) |
| **Y** | Kiosk + ESS Clock-In — selfie capture, GPS geofence, consent capture, AttendanceLog → DTR pipeline | Section 5.3, 6.2, 6.3 |
| **Z** | Field-level encryption (TIN, SSS#, bank account) + full AuditLog retrofit + Consent Records (RA 10173) | Section 1.4, 2.9 |
