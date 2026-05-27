# Sentire Payroll — Master Blueprint (Build Specification)

**This document is the single source of truth for implementation. Build exactly what is specified here. Every statement is a requirement. This document describes the system as it must exist at first launch (Phase 1). Features not described here are out of scope for this build.**

---

## 1. System Architecture

### 1.1 Multi-Tenancy
The system is a single application with a single codebase and a single deployment. It serves all client companies ("tenants") from that one instance.

- The root entity is **Tenant** (a client company).
- Every tenant-owned table carries a `tenant_id`. All data access is scoped by `tenant_id` at the data-access layer. No query returns rows across tenants.
- Each tenant has its own subdomain, branding (logo, colors), and configuration. A tenant's users only ever see that tenant's data.

### 1.2 Technology
- **Database:** PostgreSQL. Tenant isolation is enforced by `tenant_id` on all tenant-owned tables plus row-level security policies.
- **Backend:** A single backend application exposing a REST API.
- **Front end:** React + TypeScript + Tailwind CSS + shadcn/ui. The Employee Self-Service (ESS) interface is a Progressive Web App (PWA).
- **Currency:** All monetary values are Philippine Peso (PHP), stored as integer centavos.

### 1.3 Subscriptions & Feature Flags
- Each tenant has a `plan_tier` (`Standard`, `Plus`) and a set of `feature_flags`.
- The **Central Portal** (Section 5.6) sets a tenant's `plan_tier` and toggles individual `feature_flags`.
- The application reads `feature_flags` to enable or disable functionality per tenant. All Phase 1 functionality is available on `Standard`.

### 1.4 Security & Data Privacy (RA 10173)
- Data is encrypted in transit (TLS) and at rest.
- The following fields are encrypted at the field level: TIN, SSS number, PhilHealth number, Pag-IBIG number, and bank account number.
- Every create, update, delete, and sensitive read of employee, payroll, and statutory data is written to the **AuditLog** (Section 2) with actor, action, entity, before/after values, and timestamp.
- An employee's consent for storing personal and financial data is captured at onboarding and recorded in **ConsentRecord** with a timestamp.
- Each data category has a configured retention period. Records past retention are purged by a scheduled job.

---

## 2. Data Model

All tables below carry `id`, `tenant_id`, `created_at`, and `updated_at` unless noted. `Tenant` itself has no `tenant_id`.

**Tenant** — `name`, `subdomain`, `branding` (JSON: logo, primary color), `plan_tier`, `feature_flags` (JSON), `payroll_cycle` (`semi_monthly`), `working_days_denominator` (`261`), `statutory_cutoff_rule` (`second_cutoff`), `thirteenth_month_basis` (`strict_dole`), `default_dtr_approver_id` (references User; reviews DTRs/requests for employees at the top of the reporting chain).

**User** — `email`, `password_hash`, `role` (`Admin` | `Payroll` | `Employee`), `employee_id` (nullable).

**WorkLocation**, **Branch**, **Department**, **Position** — each: `name`, plus parent references where applicable (`Branch.work_location_id`). `WorkLocation` also carries `region` (used to look up the applicable minimum wage for MWE classification).

**Employee** — `employee_no`, `first_name`, `last_name`, `birthdate`, `hire_date`, `employment_status` (`Active` | `Inactive`), `salary_type` (`Monthly` | `Daily`), `base_rate`, `derived_daily_rate`, `derived_hourly_rate`, `level` (`Entry` | `Mid` | `Senior` | `Manager` | `Director`), `work_location_id`, `branch_id`, `department_id`, `position_id`, `immediate_supervisor_id` (nullable, references Employee), `manager_id` (nullable, references Employee), `tax_classification` (`Regular` | `MWE`), `nontaxable_basic_amount` (default 0; employer-designated non-taxable portion of basic pay), `sss_no`, `philhealth_no`, `pagibig_no`, `tin`, `bank_account` (encrypted), `ess_pin`.

**ShiftSchedule** — `name`, `type` (`Fixed` | `Flexible`), `time_in`, `time_out`, `break_minutes`, `crosses_midnight` (bool), `work_days` (JSON).

**EmployeeShiftAssignment** — `employee_id`, `shift_schedule_id`, `effective_from`, `effective_to`.

**HolidayCalendar** — `date`, `holiday_type` (`Regular` | `SpecialNonWorking`), `scope` (`Global` | `Branch`), `branch_id` (nullable).

**LeaveType** — `name`, `is_paid` (bool).

**LeaveBalance** — `employee_id`, `leave_type_id`, `balance_days`.

**LeaveApplication** — `employee_id`, `leave_type_id`, `start_date`, `end_date`, `status` (`Pending` | `Approved` | `Rejected`), `approver_id`, `medical_cert_file` (nullable).

**OTApplication** — `employee_id`, `date`, `hours`, `justification`, `status` (`Pending` | `Approved` | `Rejected`), `approver_id`.

**AttendanceLog** — `employee_id`, `date`, `time_in`, `time_out`, `source` (`Import` | `Manual`).

**DailyTimeRecord (DTR)** — `employee_id`, `date`, `status` (`Present` | `Absent` | `PaidLeave` | `Holiday`), `worked_hours`, `late_minutes`, `undertime_minutes`, `approved_ot_hours`, `nsd_hours`, `holiday_type` (nullable), `approval_status` (`Pending` | `Approved` | `Rejected`), `approved_by_id` (nullable, references User), `is_locked` (bool).

**PayComponent** — `name`, `kind` (`Allowance` | `Bonus` | `Deduction`), `is_taxable` (bool), `is_recurring` (bool).

**EmployeePayComponent** — `employee_id`, `pay_component_id`, `amount`, `effective_from`, `effective_to`.

**PayrollBook** — `period_start`, `period_end`, `cycle`, `status` (`Draft` | `Finalized`).

**PayrollSheet** — `payroll_book_id`, `employee_id`, `tax_classification` (snapshot of `Regular` | `MWE` at run time), and frozen computed fields: `base_pay`, `late_undertime_deduction`, `ot_pay`, `nsd_pay`, `holiday_pay`, `hazard_pay`, `taxable_allowances`, `mwe_exempt_compensation` (basic minimum wage + holiday/OT/NSD/hazard pay exempt for MWEs), `nontaxable_basic`, `gross_compensation`, `nontaxable_compensation` (sum of all exempt items), `gross_taxable_income`, `sss_ee`, `sss_er`, `philhealth_ee`, `philhealth_er`, `pagibig_ee`, `pagibig_er`, `withholding_tax`, `nontaxable_additions`, `nontaxable_13month_and_benefits` (the portion within the ₱90,000 cap), `loan_deductions`, `net_pay`. Once the parent `PayrollBook` is `Finalized`, these rows are immutable.

**PayrollAdjustment** — `employee_id`, `target_payroll_book_id`, `kind` (`Addition` | `Deduction`), `amount`, `is_taxable` (bool), `reason`.

**StatutoryTable configs** (Section 3): **SSS_Schedule**, **PhilHealth_Schedule**, **PagIBIG_Schedule**, **BIR_WithholdingTable**, **DeMinimis_Ceilings**, **MinimumWageRate** — each effective-dated.

**AuditLog** — `user_id`, `action`, `entity`, `entity_id`, `before` (JSON), `after` (JSON), `timestamp`.

**ConsentRecord** — `employee_id`, `consent_type`, `granted_at`.

---

## 3. Statutory Configuration Engine

### 3.1 Rule
No statutory rate, bracket, ceiling, or threshold is written in application code. Each lives in an effective-dated config table. Every config row carries `effective_from`, `effective_to`, `legal_basis`, and `version`. The payroll engine selects the row valid for the **pay period's date range**, not the current date. Re-running a past period uses that period's rates.

### 3.2 Seed Data (effective 2026-01-01)

**SSS_Schedule** — Total rate 15% of Monthly Salary Credit (MSC). Employer share 10%, employee share 5%. MSC floor ₱5,000, ceiling ₱35,000. For MSC above ₱20,000 the contribution includes a Mandatory Provident Fund (MPF) component. Employer also pays Employees' Compensation (EC): ₱10 when MSC is below ₱15,000, otherwise ₱30. The full bracketed MSC table (₱500 steps) is loaded from the official SSS 2026 schedule. `legal_basis`: RA 11199.

**PhilHealth_Schedule** — Rate 5% of monthly basic salary, split equally (2.5% employee / 2.5% employer). Income floor ₱10,000, ceiling ₱100,000. Minimum monthly premium ₱500, maximum ₱5,000. `legal_basis`: RA 11223 (UHC), PhilHealth Circular 2025-001.

**PagIBIG_Schedule** — Employee 2% and employer 2% of monthly compensation; employee rate is 1% when monthly compensation is ₱1,500 or below. Maximum Fund Salary cap ₱10,000, so the maximum is ₱200 per share (₱400 total). `legal_basis`: RA 9679, HDMF Circular 460.

**BIR_WithholdingTable** — Stored per payroll frequency (`daily`, `weekly`, `semi_monthly`, `monthly`). Seeded from the current BIR withholding tax tables under the TRAIN law (2023-onward tranche; ₱250,000 annual exemption threshold). The engine selects the table matching the tenant's `payroll_cycle`.

**DeMinimis_Ceilings** — Per-category non-taxable ceilings, seeded from BIR Revenue Regulation 29-2025. Amounts paid above a category's ceiling are treated as taxable. The combined annual exclusion cap for 13th-month pay and other benefits is ₱90,000 (`legal_basis`: RA 10963, TRAIN).

**MinimumWageRate** — Daily statutory minimum wage by `region` (and sector where applicable), used to classify Minimum Wage Earners. Seeded from the current Regional Tripartite Wages and Productivity Board (RTWPB) wage orders per region. `legal_basis`: applicable regional Wage Order.

---

## 4. Payroll Computation Engine

### 4.1 Salary Types & Conversions
- **Monthly Paid:** `derived_daily_rate = (base_rate × 12) / working_days_denominator`.
- **Daily Paid:** pay = `derived_daily_rate × days_worked`.
- **Hourly rate:** `derived_hourly_rate = derived_daily_rate / 8`.
- **Late/Undertime deduction:** `(derived_hourly_rate / 60) × total_late_undertime_minutes`.
- **Regular Pay:** fixed base rate with no absence/late deductions.
- **Basic Pay:** Regular Pay minus tardiness and absence deductions.

### 4.2 Gross-to-Net Waterfall
The engine computes each employee's pay in this exact order and writes the result to a `PayrollSheet`:

1. Compute **Base Pay**.
2. Deduct **tardiness and absences** (late/undertime).
3. Add **premium pay** (OT, NSD, rest day, holiday, hazard) using the stacking matrix (4.3).
4. Add **allowances and bonuses** (each tagged taxable or non-taxable on its `PayComponent`).
5. **Gross Compensation** = sum of steps 1–4.
6. Determine **non-taxable compensation** (Section 4.8): MWE-exempt pay, mandatory contributions, non-taxable components, de-minimis-within-ceiling, 13th-month-and-other-benefits within the ₱90,000 cap, and substantiated reimbursements.
7. **Gross Taxable Income** = Gross Compensation − non-taxable compensation.
8. Deduct **statutory contributions** (SSS, PhilHealth, Pag-IBIG) per the tenant's `statutory_cutoff_rule`.
9. Compute **withholding tax** on Gross Taxable Income from the period-specific BIR table. For employees with `tax_classification = MWE`, withholding tax on the exempt components is zero.
10. Add back **non-taxable additions** (reimbursements and other non-taxable items that are paid out but were excluded from the tax base).
11. Deduct **loans and other deductions**.
12. **Net Take-Home Pay** = result.

### 4.3 Premium Stacking Matrix
Premium pay is computed hour by hour against the employee's shift and the night-shift window (10:00 PM–6:00 AM). Multipliers compose; they are not applied as a single day-level value. The base factors:

| Condition | Factor |
|---|---|
| Regular work overtime | 1.25 |
| Night Shift Differential (within 10PM–6AM) | ×1.10 applied to the otherwise-applicable rate |
| Rest day or Special Non-Working Holiday worked | 1.30 |
| Rest day OT / Special Non-Working Holiday OT | 1.69 |
| Regular Holiday worked | 2.00 |
| Regular Holiday OT | 2.60 |
| Regular Holiday falling on a rest day, worked | 2.60 |
| Double Holiday worked | 3.00 |

Stacking order: apply the day-type factor first, then the overtime factor, then multiply by 1.10 for any of those hours that fall inside the night-shift window. Example: overtime worked between 10PM and 6AM on a regular holiday = base hourly rate × 2.60 × 1.10.

### 4.4 13th-Month Pay
`thirteenth_month = total_basic_salary_earned_in_calendar_year / 12`. The default basis is **Strict DOLE**: Basic Pay (which already reflects unpaid lates and absences) and excludes overtime, premium pay, allowances, and COLA. The tenant setting `thirteenth_month_basis` controls the basis.

### 4.5 Statutory Computation Specifics
- Each contribution is computed from the employee's applicable salary against the effective-dated schedule (Section 3).
- SSS uses the MSC bracket lookup (including MPF and EC components). PhilHealth applies 5% within the floor/ceiling. Pag-IBIG applies the 2%/2% (or 1% employee) rule capped at the Maximum Fund Salary.
- Contributions are monthly obligations. In semi-monthly payroll, they are deducted on the second (month-end) cutoff (`statutory_cutoff_rule = second_cutoff`).

### 4.6 Withholding Tax
The engine selects the BIR withholding table matching the tenant's `payroll_cycle` and applies it to the period's taxable income.

### 4.7 Corrections & Off-Cycle Runs
- A `PayrollBook` in `Draft` status can be re-opened and recomputed.
- A `Finalized` `PayrollBook` is immutable. Corrections to a finalized book are made through an **off-cycle adjustment run** (a new `PayrollBook`) or through **PayrollAdjustment** records that are applied to the next `PayrollBook`.

### 4.8 Minimum Wage Earners & Non-Taxable Compensation
**MWE classification.** An employee is a Minimum Wage Earner when `tax_classification = MWE`. The system supports this in two ways: the employer sets the classification on the employee, and the engine validates it against `MinimumWageRate` for the employee's `WorkLocation.region` for the period — if the employee's basic rate exceeds the applicable regional minimum wage for that period, the engine flags the classification as invalid for that period and treats the employee as `Regular`.

**MWE tax treatment.** For an MWE, the following are exempt from income tax and from withholding: basic minimum wage (including COLA that forms part of the minimum wage), holiday pay, overtime pay, night shift differential, and hazard pay. These amounts are recorded in `mwe_exempt_compensation` and excluded from `gross_taxable_income`. Any *other* taxable compensation an MWE receives (e.g., commissions, taxable allowances, bonuses beyond the ₱90,000 cap) remains taxable under the normal rules.

**Employer-designated non-taxable basic.** `Employee.nontaxable_basic_amount` lets the employer designate a non-taxable portion of basic pay (for example, the exempt minimum-wage portion). The engine excludes this amount from `gross_taxable_income` and records it in `nontaxable_basic`.

**Non-taxable compensation set** (excluded from the withholding-tax base): MWE-exempt compensation; mandatory SSS/PhilHealth/Pag-IBIG employee contributions; pay components flagged `is_taxable = false`; de minimis benefits within their RR 29-2025 ceilings (excess is taxable); 13th-month pay and other benefits up to the ₱90,000 combined annual cap (excess is taxable); and substantiated reimbursements.

---

## 5. Modules

### 5.1 HRIS
- Employee master with the fields in Section 2, organizational tags (Work Location, Branch, Department, Position, Level), and statutory IDs.
- Company dashboard showing headcount, the next upcoming payroll period, and upcoming holidays.

### 5.2 Time & Attendance
- **DTR sources:** import attendance via CSV/biometric-export file, and manual entry/correction by Admin or Payroll users.
- **Shift logic:** fixed and flexible shifts; recognition of cross-midnight overtime; computation of tardiness and undertime against the assigned shift.
- **DTR review & approval:** DTRs route through the reporting chain for approval (Section 6.3).
- **Leave:** leave types, per-employee leave balances (manual ledger), and the leave/undertime application workflow (Section 6.4).
- **Overtime:** the overtime application workflow (Section 6.5).

### 5.3 Payroll, Records & Claims
- **Payroll Book:** the historical ledger of all payroll runs for the tenant.
- **Payroll Sheet:** the frozen per-employee line-item breakdown for a run.
- **Pay components:** Admin-defined custom allowances, bonuses, and deductions, each flagged taxable or non-taxable.
- **Corrections:** off-cycle runs and adjustments per Section 4.7.

### 5.4 Compliance Outputs
- **Payslip** generation per employee per run.
- **BPI bank file** generation in BPI's payroll batch upload format, plus a **generic CSV** export.
- **BIR 1601-C data** export (monthly remittance of withholding tax on compensation).
- **BIR Form 2316** generation per employee — the Certificate of Compensation Payment / Tax Withheld for the calendar year (and for the final period on separation).
  - **Data sources:** the employee's master record (name, TIN, address, employer details, `tax_classification`) plus the aggregation of all that employee's frozen `PayrollSheet` rows for the target year. The form's lines are populated from the snapshotted breakdown: `gross_compensation`, `mwe_exempt_compensation`, `nontaxable_compensation` (broken out into mandatory contributions, 13th-month-and-other-benefits within ₱90,000, de minimis, and MWE-exempt components), `gross_taxable_income`, and total `withholding_tax`.
  - **How it is generated:** an Admin or Payroll user opens the 2316 generator, selects the calendar year (or a separated employee), and generates either a single employee's certificate or a batch for all employees. The system aggregates the year's `PayrollSheet` data per employee and renders the BIR 2316 layout.
  - **Output:** a per-employee BIR Form 2316 document (PDF) following the official layout, plus a batch download. The employee's `tax_classification` determines whether the MWE-exempt lines are populated.
- All compliance files are generated for the client to file themselves (export-only).

### 5.5 Employee Self-Service (ESS)
- Secure payslip viewing, protected by the employee's `ess_pin` (or birthdate).
- View of own profile and leave balances.

### 5.6 RBAC, Reporting Lines & Central Portal
- **System roles:** `Admin`, `Payroll`, `Employee`, each with a fixed permission set. Roles control what a user can *do* in the system.
- **Reporting lines:** each employee has an `immediate_supervisor_id` and a `manager_id` (Section 2). These define the approval chain for DTRs, leave, and overtime, and are independent of system roles.
- **Approval-chain fallback:** an employee's requests route to their immediate supervisor; a supervisor's own requests route to their manager; an employee at the top of the chain (no supervisor or manager set) routes to the tenant's designated reviewer, `Tenant.default_dtr_approver_id` (an `Admin` or `Payroll` user).
- **Central Portal:** the operator-facing portal that creates and manages tenants, sets each tenant's `plan_tier`, and toggles each tenant's `feature_flags`.

---

## 6. Workflows

### 6.1 Tenant Setup Wizard
Operator creates a Tenant in the Central Portal → tenant Admin completes a guided wizard: company profile and branding → organizational structure (locations with region, branches, departments, positions) → employees, statutory IDs, reporting lines (immediate supervisor and manager), and tax classification (Regular/MWE) → pay rules (cycle, denominator, 13th-month basis, default DTR approver) → shift schedules and holiday calendar. On completion the tenant can run payroll.

### 6.2 DTR Generation (from import)
Admin/Payroll imports an attendance file or enters punches manually → the system writes `AttendanceLog` rows → the system computes each `DailyTimeRecord` against the employee's assigned `ShiftSchedule`, deriving worked hours, late minutes, undertime minutes, and night-shift hours → each DTR is created with `approval_status = Pending`.

### 6.3 DTR Review & Approval
DTRs are routed for approval along the reporting chain (Section 5.6): an employee's DTRs route to their `immediate_supervisor`; a supervisor's own DTRs route to their `manager`; an employee at the top of the chain (no supervisor or manager) routes to the tenant's `default_dtr_approver`. The approver reviews the period's DTRs, can edit before approving, and sets each to `Approved` or `Rejected`, recorded in `approved_by_id`. An `Admin` may override and approve any DTR (escalation/fallback). A payroll run cannot finalize on `Pending` or `Rejected` DTRs without an explicit `Admin` override.

### 6.4 Leave / Undertime Application
Employee files a leave or undertime request in ESS, attaching a medical certificate where required → status `Pending`; the system checks the `LeaveBalance` → request routes to the employee's `immediate_supervisor` (escalating to `manager`, then `default_dtr_approver` per the chain) → on approval, the system decrements the balance and overwrites the `DailyTimeRecord` for the date as `PaidLeave`, bypassing the absence deduction.

### 6.5 Overtime Application
Employee files an overtime request in ESS with hours and justification → the system cross-references `AttendanceLog` and rejects the request if there is no clock-out supporting the claimed hours → request routes to the employee's `immediate_supervisor` (escalating per the chain) → on approval the system sets `approved_ot_hours` on the `DailyTimeRecord`. Only approved overtime is paid.

### 6.6 Holiday Application
Admin adds a holiday to the `HolidayCalendar` with date, type, and scope → during a payroll run the engine intercepts each `DailyTimeRecord` on that date: if there is no log on a Regular Holiday it injects 100% holiday pay; if the employee is present it applies the holiday factor from the stacking matrix.

### 6.7 Payroll Run & Corrections
Payroll user opens the Payroll Book and starts a run for a period → the system verifies that all `DailyTimeRecord` rows for the period are `Approved` (blocking on any `Pending`/`Rejected` DTR unless an `Admin` overrides) → locks all DTRs for the period → creates a new `PayrollBook` (`Draft`) → loops every active employee and executes the gross-to-net waterfall (Section 4.2), pulling effective-dated statutory tables, MWE classification, approved overtime, leave, holiday factors, and pay components → writes one frozen `PayrollSheet` per employee → Payroll user reviews the run → on **Finalize**, the `PayrollBook` becomes immutable, the system generates the BPI bank file and CSV, and publishes payslips to ESS. Corrections after finalization follow Section 4.7.

### 6.8 BIR 2316 Generation
Admin/Payroll opens the 2316 generator → selects a calendar year (or a separated employee) and either a single employee or a batch → the system aggregates that employee's frozen `PayrollSheet` rows for the year together with the employee master record → it renders the BIR Form 2316 layout, populating the gross, taxable, and non-taxable lines (including MWE-exempt lines when `tax_classification = MWE`) → output is a per-employee PDF certificate plus a batch download, for the client to issue and file.

---

## 7. UI/UX

- **Branding:** "Sentire Payroll," deep-blue and slate palette, built with Tailwind and shadcn/ui; per-tenant logo and primary color.
- **Admin desktop:** collapsible left sidebar, top global search, dashboard metric widgets (headcount, upcoming payroll, holidays).
- **ESS mobile (PWA):** bottom navigation bar; data tables collapse to vertical card views with no horizontal scrolling.

---

## 8. Configuration Defaults

| Setting | Default |
|---|---|
| Deployment | Single application, logical multi-tenancy by `tenant_id` |
| Payroll cycle | Semi-monthly |
| Statutory deduction timing | Second (month-end) cutoff |
| Monthly-paid denominator | 261 working days |
| 13th-month basis | Strict DOLE (Basic Pay) |
| Compliance filing posture | Export-only (the client files) |
| Bank file format | BPI |
| Plan tiers | `Standard`, `Plus` |
| Employee tax classification | `Regular` by default; `MWE` set per employee, validated against the regional minimum wage |
| 13th-month & other benefits exclusion cap | ₱90,000 combined, annual |
| DTR approval before payroll | Required (Admin override available) |
