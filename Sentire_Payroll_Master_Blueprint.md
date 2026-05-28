# Sentire Payroll — Master Blueprint (Complete Build Specification)

**This document is the single, complete source of truth for implementation. It describes the entire target system. Every feature, table, and workflow described here is in scope. A feature being assigned a later build priority (Section 10) does not mean it is excluded — it means it is sequenced. Build to this specification.**

**Product:** A multi-tenant HRIS, Time & Attendance, and Payroll SaaS for Philippine SMEs (micro-businesses through mid-market, 500–5,000+ employees), Philippine Labor Code and BIR compliant, with a premium UX.

---

## 1. System Architecture

### 1.1 Multi-Tenancy
- The system is a single application, single codebase, single deployment, serving all client companies ("tenants").
- The root entity is **Tenant**. Every tenant-owned table carries `tenant_id`. All data access is scoped by `tenant_id` at the data-access layer, enforced by PostgreSQL row-level security. No query returns rows across tenants.
- Each tenant has its own subdomain, branding (logo, colors), configuration, and feature set. A tenant's users only ever see that tenant's data.
- A tenant can later be migrated to a dedicated isolated deployment without schema changes (the data layer is designed so tenant data is cleanly separable).
- **Global (non-tenant) data:** the statutory configuration tables (Section 2.7) are shared national data with no `tenant_id`; they are operator-managed and read by every tenant.
- **Operator control plane:** the Central/Master Portal runs as role-gated routes within this same application (not a separate app), under a `SUPER_ADMIN` identity that operates above tenant row-level security. `SUPER_ADMIN` is defined in Section 1.4 and Section 5.7.

### 1.2 Technology
- **Database:** PostgreSQL with row-level security for tenant isolation.
- **Object storage:** Cloudflare R2 for documents and media (employee 201 files, receipts, selfies). Files are referenced by key from the database; access is via signed, time-limited URLs.
- **Backend:** A single backend application exposing a REST API.
- **Front end:** React + TypeScript + Tailwind CSS + shadcn/ui. The Employee Self-Service (ESS) interface is a Progressive Web App (PWA). The Kiosk is a cross-platform web interface.
- **Currency:** All monetary values are Philippine Peso (PHP), stored as integer centavos.
- **Payroll engine layout:** the engine is organized as pure per-step modules under `src/lib/payroll/engine/*`, one per step of the gross-to-net waterfall (Section 4.2). All arithmetic (multiply, divide, round, share-split) is delegated to a single centralized centavo module at `src/lib/money/`; engine step modules never perform inline arithmetic. The money module owns one rounding policy applied everywhere (Section 4.1).

### 1.3 Subscriptions & Feature Flags
- Each tenant has a `plan_tier` (`STARTER`, `GROWTH`, `PRO`) and a set of `feature_flags`. Each tier maps to a set of feature flags; the tier-to-flag mapping is configured in the Central Portal rather than hardcoded. The AI Assistant add-on is included in the `PRO` tier.
- The **Central/Master Portal** (Section 5.7) sets a tenant's `plan_tier` and toggles individual `feature_flags`, including the AI Assistant add-on.
- The application reads `feature_flags` to enable or disable functionality per tenant.

### 1.4 Security & Data Privacy (RA 10173)
- Data is encrypted in transit (TLS) and at rest. Field-level encryption applies to TIN, statutory ID numbers, and bank account numbers, using AES-256-GCM under an **envelope-encryption** scheme: a random Data Encryption Key (DEK) encrypts the field values, and the DEK is wrapped by a Key Encryption Key (KEK). The KEK is sourced from an environment secret initially and can later be moved to a KMS/vault by re-wrapping the DEK only — without re-encrypting stored data. The KEK is a 256-bit random value, never committed to the repository, backed up separately from the database, with a documented rotation procedure.
- For any encrypted field that must be searched or made unique (e.g., TIN de-duplication), a keyed HMAC of the plaintext is stored in a companion indexed column; lookups and uniqueness constraints use the HMAC, since GCM ciphertext is not searchable.
- **`SUPER_ADMIN` (operator) identity:** the SaaS operator's identity is separate from tenant RBAC. It is not a tenant `Role`, cannot be granted through tenant role management, has its own login with MFA, and every `SUPER_ADMIN` action is written to `AuditLog`. It operates above tenant row-level security to manage tenants and global statutory data.
- Every create, update, delete, and sensitive read of employee, payroll, statutory, and document data is written to **AuditLog** with actor, action, entity, before/after values, and timestamp.
- Employee consent for storing personal data, financial data, biometric data (selfies), and location data (GPS) is captured and recorded in **ConsentRecord** with type and timestamp. Biometric and location data are Sensitive Personal Information and require explicit consent before capture.
- Each data category has a configured retention period. Raw selfies and GPS coordinates are purged after the DTR they support is finalized, per retention policy; computed results are retained. A scheduled job enforces retention.
- The system supports a breach-notification record and data-subject access/erasure requests.

---

## 2. Data Model

All tables carry `id`, `tenant_id`, `created_at`, `updated_at` unless noted. `Tenant` has no `tenant_id`.

### 2.1 Tenant, Users & Access Control (Dynamic RBAC)
- **Tenant** — `name`, `subdomain`, `branding` (JSON), `plan_tier`, `feature_flags` (JSON), `payroll_cycle`, `working_days_denominator`, `statutory_cutoff_rule`, `thirteenth_month_basis`, `default_dtr_approver_id`.
- **User** — `email`, `password_hash`, `employee_id` (nullable), `is_active`.
- **Role** — `name` (e.g., `Admin`, `Payroll`, `Branch Supervisor`, `Payroll Read-Only`), `is_system_default` (bool). Tenants may create custom roles.
- **Permission** — `key` (e.g., `payroll.run`, `employee.edit`, `dtr.approve`), `description`.
- **RolePermission** — `role_id`, `permission_id`.
- **UserRole** — `user_id`, `role_id`.

### 2.2 Organization
- **WorkLocation** — `name`, `region` (used for minimum-wage lookup), `address`.
- **Branch** — `name`, `work_location_id`, `geofence_id` (nullable).
- **Department** — `name`.
- **Position** — `name`, `level` (`Entry` | `Mid` | `Senior` | `Manager` | `Director`).

### 2.3 Employee & 201 File
- **Employee** — `employee_no`, `first_name`, `last_name`, `birthdate`, `hire_date`, `regularization_date` (nullable), `employment_status` (`Probationary` | `Regular` | `Inactive`), `salary_type` (`Monthly` | `Daily`), `base_rate`, `derived_daily_rate`, `derived_hourly_rate`, `work_location_id`, `branch_id`, `department_id`, `position_id`, `immediate_supervisor_id` (nullable → Employee), `manager_id` (nullable → Employee), `tax_classification` (`Regular` | `MWE`), `nontaxable_basic_amount` (default 0), `bank_account` (encrypted), `ess_pin`.
- **StatutoryId** — `employee_id`, `type` (`SSS` | `PhilHealth` | `PagIBIG` | `TIN`), `number` (encrypted), `number_hmac` (keyed HMAC for uniqueness/lookup, per Section 1.4). (Statutory IDs are stored in this normalized table, one row per ID type.)
- **EmployeeDocument** — `employee_id`, `category` (e.g., `Contract`, `GovID`, `Certificate`, `Memo`), `file_key` (R2 object key), `file_name`, `uploaded_by_id`, `retention_until`.
- **Asset** — `name`, `serial_number`, `category`, `condition`, `monetary_value`.
- **AssetAssignment** — `asset_id`, `employee_id`, `assigned_on`, `returned_on` (nullable), `return_condition`.
- **Movement** — `employee_id`, `type` (`Promotion` | `Transfer` | `Reclassification`), `effective_date`, `from_values` (JSON), `to_values` (JSON), `status`, `approver_id`.
- **Incident** — `employee_id`, `type` (`Memo` | `NTE`), `subject`, `body`, `file_key` (nullable), `issued_by_id`, `issued_on`, `employee_response` (nullable).

### 2.4 Time & Attendance
- **ShiftSchedule** — `name`, `type` (`Fixed` | `Flexible`), `time_in`, `time_out`, `break_minutes`, `crosses_midnight` (bool), `work_days` (JSON).
- **EmployeeShiftAssignment** — `employee_id`, `shift_schedule_id`, `effective_from`, `effective_to`.
- **Geofence** — `branch_id`, `center_lat`, `center_lng`, `radius_meters`.
- **AttendanceLog** — `employee_id`, `date`, `time_in`, `time_out`, `source` (`Import` | `Manual` | `Kiosk` | `ESS`), `selfie_key` (R2, nullable), `gps_lat` (nullable), `gps_lng` (nullable), `geofence_status` (`Inside` | `Outside` | `Unknown`), `flagged` (bool).
- **DailyTimeRecord (DTR)** — `employee_id`, `date`, `status` (`Present` | `Absent` | `PaidLeave` | `Holiday`), `worked_hours`, `late_minutes`, `undertime_minutes`, `approved_ot_hours`, `nsd_hours`, `holiday_type` (nullable), `approval_status` (`Pending` | `Approved` | `Rejected`), `approved_by_id` (nullable), `is_locked` (bool).
- **HolidayCalendar** — `date`, `holiday_type` (`Regular` | `SpecialNonWorking`), `scope` (`Global` | `Branch`), `branch_id` (nullable).

### 2.5 Leave & Requests
- **LeaveType** — `name`, `is_paid` (bool), `requires_medical_cert` (bool).
- **LeavePolicy** — `leave_type_id`, `accrual_method` (`Accrual` | `LumpSum`), `accrual_rate`, `max_balance`, `carryover_rule`.
- **LeaveBalance** — `employee_id`, `leave_type_id`, `balance_days`.
- **LeaveLedger** — `employee_id`, `leave_type_id`, `change`, `reason`, `effective_date` (historical accrual/usage ledger).
- **LeaveApplication** — `employee_id`, `leave_type_id`, `start_date`, `end_date`, `status`, `approver_id`, `medical_cert_key` (nullable).
- **OTApplication** — `employee_id`, `date`, `hours`, `justification`, `status`, `approver_id`.
- **ProfileUpdateRequest** — `employee_id`, `field`, `old_value`, `new_value`, `status`, `approver_id` (used for sensitive changes such as bank account).
- **EForm** — `name`, `schema` (JSON form definition). **EFormSubmission** — `eform_id`, `employee_id`, `data` (JSON), `status`, `approver_id`.

### 2.6 Payroll & Pay Components
- **PayComponent** — `name`, `kind` (`Allowance` | `Bonus` | `Deduction`), `is_taxable` (bool), `is_recurring` (bool), `is_de_minimis` (bool).
- **EmployeePayComponent** — `employee_id`, `pay_component_id`, `amount`, `effective_from`, `effective_to`.
- **ExpenseClaim** — `employee_id`, `amount`, `receipt_key` (R2), `category`, `tax_treatment` (`NonTaxableReimbursement` | `DeMinimis` | `Taxable`), `status`, `approver_id`, `target_payroll_book_id`.
- **Loan** — `employee_id`, `type` (`SSS` | `PagIBIG` | `CashAdvance` | `Company`), `principal`, `installment_amount`, `balance`, `status`.
- **PayrollBook** — `period_start`, `period_end`, `cycle`, `status` (`Draft` | `Finalized`), `run_type` (`Regular` | `OffCycle` | `FinalPay` | `YearEnd`).
- **PayrollSheet** — `payroll_book_id`, `employee_id`, `tax_classification` (snapshot), and frozen fields: `base_pay`, `late_undertime_deduction`, `ot_pay`, `nsd_pay`, `holiday_pay`, `hazard_pay`, `taxable_allowances`, `mwe_exempt_compensation`, `nontaxable_basic`, `gross_compensation`, `nontaxable_compensation`, `nontaxable_13month_and_benefits`, `gross_taxable_income`, `sss_ee`, `sss_er`, `philhealth_ee`, `philhealth_er`, `pagibig_ee`, `pagibig_er`, `withholding_tax`, `nontaxable_additions`, `loan_deductions`, `net_pay`. Immutable once the parent `PayrollBook` is `Finalized`.
- **PayrollAdjustment** — `employee_id`, `target_payroll_book_id`, `kind` (`Addition` | `Deduction`), `amount`, `is_taxable` (bool), `reason`.

### 2.7 Statutory Configuration (effective-dated, GLOBAL)
- **SSS_Schedule**, **PhilHealth_Schedule**, **PagIBIG_Schedule**, **BIR_WithholdingTable**, **DeMinimis_Ceilings**, **MinimumWageRate** — each carries `effective_from`, `effective_to`, `legal_basis`, `version` (Section 3).
- These tables are **global**: they carry **no `tenant_id`**, are shared by all tenants, and are writable only by `SUPER_ADMIN` (Section 5.7). Tenants cannot create or override statutory rows.

### 2.8 Recruitment (ATS)
- **Applicant** — `name`, `email`, `phone`, `position_id`, `resume_key` (R2), `stage` (`Applied` | `Shortlisted` | `Interviewed` | `Offered` | `Hired`).
- **ApplicantNote** — `applicant_id`, `author_id`, `body`.

### 2.9 Audit, Consent & AI Metering
- **AuditLog** — `user_id`, `action`, `entity`, `entity_id`, `before` (JSON), `after` (JSON), `timestamp`.
- **ConsentRecord** — `employee_id`, `consent_type` (`PersonalData` | `Biometric` | `Location` | `Financial`), `granted_at`.
- **AiUsage** — `tenant_id`, `feature`, `model`, `input_tokens`, `output_tokens`, `cost_estimate`, `timestamp` (used for metering and fair-use caps; Section 8).

---

## 3. Statutory Configuration Engine

### 3.1 Rule
No statutory rate, bracket, ceiling, or threshold is written in application code. Each lives in an effective-dated config table with `effective_from`, `effective_to`, `legal_basis`, `version`. The engine selects the row valid for the **pay period's date range**, not the current date. Re-running a past period uses that period's rules.

### 3.2 Seed Data (effective 2026-01-01)
- **SSS_Schedule** — Total 15% of Monthly Salary Credit (MSC). Employer 10%, employee 5%. MSC floor ₱5,000, ceiling ₱35,000. MSC above ₱20,000 includes a Mandatory Provident Fund (MPF) component. Employer pays Employees' Compensation (EC): ₱10 (MSC < ₱15,000) or ₱30 (MSC ≥ ₱15,000). Full bracketed MSC table (₱500 steps) loaded from the official SSS 2026 schedule. `legal_basis`: RA 11199.
- **PhilHealth_Schedule** — 5% of monthly basic salary, split 2.5% employee / 2.5% employer. Floor ₱10,000, ceiling ₱100,000. Minimum premium ₱500, maximum ₱5,000. `legal_basis`: RA 11223, PhilHealth Circular 2025-001.
- **PagIBIG_Schedule** — Employee 2% and employer 2%; employee 1% when monthly compensation ≤ ₱1,500. Maximum Fund Salary cap ₱10,000 → max ₱200 per share. `legal_basis`: RA 9679, HDMF Circular 460.
- **BIR_WithholdingTable** — Stored per payroll frequency (`daily`, `weekly`, `semi_monthly`, `monthly`). Seeded from current BIR withholding tax tables (TRAIN, 2023-onward tranche; ₱250,000 annual exemption threshold). The engine selects the table matching the tenant's `payroll_cycle`.
- **DeMinimis_Ceilings** — Per-category non-taxable ceilings, seeded from BIR Revenue Regulation 29-2025; excess over a ceiling is taxable. Combined annual exclusion cap for 13th-month pay and other benefits is ₱90,000. `legal_basis`: RA 10963 (TRAIN), RR 29-2025.
- **MinimumWageRate** — Daily statutory minimum wage by `region` (and sector where applicable), used to classify Minimum Wage Earners. Seeded from current RTWPB wage orders per region. `legal_basis`: applicable regional Wage Order.

### 3.3 Importer & Resolver
- **Importer:** a single reusable module performs all writes to the global statutory tables, following **parse → validate → dry-run (preview the diff) → commit**. It is the only path that mutates statutory data. It is invoked by a CLI seed command and, once built, by the `SUPER_ADMIN` admin API (Section 5.7) — both call the same importer; the logic is never duplicated.
- **Resolver:** the engine reads statutory values only through a resolver that returns the row valid for a given **pay-period date** and table version. The resolver is a hard dependency of the payroll engine and is covered by the engine test suite.

---

## 4. Payroll Computation Engine

### 4.1 Salary Types & Conversions
- **Monthly Paid:** `derived_daily_rate = (base_rate × 12) / working_days_denominator`.
- **Daily Paid:** pay = `derived_daily_rate × days_worked`.
- **Hourly rate:** `derived_hourly_rate = derived_daily_rate / 8`.
- **Late/Undertime deduction:** `(derived_hourly_rate / 60) × total_late_undertime_minutes`.
- **Regular Pay:** fixed base rate, no absence/late deductions. **Basic Pay:** Regular Pay minus tardiness and absences.

### 4.2 Gross-to-Net Waterfall
The engine computes each employee's pay in this exact order and writes a `PayrollSheet`:
1. Compute **Base Pay**.
2. Deduct **tardiness and absences** (late/undertime).
3. Add **premium pay** (OT, NSD, rest day, holiday, hazard) via the stacking matrix (4.3).
4. Add **allowances and bonuses** (each tagged taxable or non-taxable on its `PayComponent`).
5. **Gross Compensation** = sum of steps 1–4.
6. Determine **non-taxable compensation** (4.5): MWE-exempt pay, mandatory contributions, non-taxable components, de-minimis-within-ceiling, 13th-month-and-other-benefits within the ₱90,000 cap, substantiated reimbursements.
7. **Gross Taxable Income** = Gross Compensation − non-taxable compensation.
8. Deduct **statutory contributions** (SSS, PhilHealth, Pag-IBIG) per `statutory_cutoff_rule`.
9. Compute **withholding tax** on Gross Taxable Income via the period-specific BIR table. For MWEs, withholding on exempt components is zero.
10. Add back **non-taxable additions** (reimbursements/items paid out but excluded from the tax base).
11. Deduct **loans and other deductions**.
12. **Net Take-Home Pay** = result.

### 4.3 Premium Stacking Matrix
Premium pay is computed hour by hour against the employee's shift and the night-shift window (10:00 PM–6:00 AM). Multipliers compose; they are not applied as a single day-level value.

| Condition | Factor |
|---|---|
| Regular work overtime | 1.25 |
| Night Shift Differential (within 10PM–6AM) | ×1.10 on the otherwise-applicable rate |
| Rest day or Special Non-Working Holiday worked | 1.30 |
| Rest day OT / Special Non-Working Holiday OT | 1.69 |
| Regular Holiday worked | 2.00 |
| Regular Holiday OT | 2.60 |
| Regular Holiday on a rest day, worked | 2.60 |
| Double Holiday worked | 3.00 |

Stacking order: day-type factor, then overtime factor, then ×1.10 for hours inside the night-shift window. Example: OT between 10PM–6AM on a regular holiday = hourly rate × 2.60 × 1.10.

### 4.4 13th-Month Pay
`thirteenth_month = total_basic_salary_earned_in_calendar_year / 12`. Default basis **Strict DOLE** (Basic Pay, reflecting unpaid lates/absences; excludes OT, premium pay, allowances, COLA). Tenant setting `thirteenth_month_basis` controls the basis.

### 4.5 Minimum Wage Earners & Non-Taxable Compensation
- **MWE classification:** an employee is an MWE when `tax_classification = MWE`. The engine validates against `MinimumWageRate` for the employee's `WorkLocation.region` each period; if the basic rate exceeds the applicable regional minimum for that period, the employee is treated as `Regular` for that period.
- **MWE exemption:** basic minimum wage (including COLA forming part of minimum wage), holiday pay, overtime pay, night shift differential, and hazard pay are exempt from income tax and withholding; recorded in `mwe_exempt_compensation`. Other taxable income an MWE receives (commissions, taxable allowances, bonuses beyond the ₱90,000 cap) remains taxable.
- **Employer-designated non-taxable basic:** `Employee.nontaxable_basic_amount` excludes a designated portion of basic pay from `gross_taxable_income`, recorded in `nontaxable_basic`.
- **Non-taxable compensation set:** MWE-exempt compensation; mandatory SSS/PhilHealth/Pag-IBIG employee contributions; components flagged `is_taxable = false`; de minimis within RR 29-2025 ceilings; 13th-month and other benefits up to ₱90,000; substantiated reimbursements.

### 4.6 Statutory Computation Specifics
- Each contribution is computed against the effective-dated schedule. SSS uses the MSC bracket lookup (incl. MPF and EC). PhilHealth applies 5% within floor/ceiling. Pag-IBIG applies 2%/2% (or 1% employee) capped at the Maximum Fund Salary.
- Contributions are monthly obligations; in semi-monthly payroll they are deducted on the second (month-end) cutoff (`statutory_cutoff_rule = second_cutoff`).

### 4.7 Withholding Tax
The engine selects the BIR withholding table matching the tenant's `payroll_cycle` and applies it to taxable income for the period.

### 4.8 Corrections & Off-Cycle Runs
- A `Draft` `PayrollBook` can be re-opened and recomputed.
- A `Finalized` `PayrollBook` is immutable. Corrections are made via an **off-cycle adjustment run** (a new `PayrollBook` with `run_type = OffCycle`) or via **PayrollAdjustment** records applied to the next book.

### 4.9 Year-End Annualization
In the final period of the calendar year, the engine runs annualization for all active employees: sum YTD taxable income and YTD withholding; compute true annual liability against the annual TRAIN table; post the over/under-withholding true-up (refund or shortfall); produce per-employee BIR 2316; and produce the Alphalist (with MWEs on the separate MWE schedule) and supporting DAT file.

### 4.10 Final Pay / Offboarding Computation
On offboarding, the engine: schedules ESS lockout for the end date; queries `AssetAssignment` and flags unreturned assets (HR may post a monetary deduction equal to asset value); converts unused convertible leave to cash via `LeaveBalance`; prorates 13th-month (YTD Basic / 12); annualizes tax (YTD income vs. YTD withheld → refund or payable); sums unpaid salary + 13th-month + leave cash-out + tax refund − asset and other deductions. Output: a Final `PayrollSheet`, an auto-populated **Quitclaim**, and the final **BIR 2316**.

### 4.11 Engine Testing & Quality Gate
The payroll engine must pass an automated golden-case regression suite, specified in the companion `Engine_Test_Spec.md`, before it produces any real payroll output. Tests are written alongside each engine module (never a phase behind it). Expected values are derived independently of the engine — from the formulas in the test spec, or hand-computed from the official statutory tables — and are never captured from the engine's own output. CI blocks merge on any failing or missing engine test.

---

## 5. Feature Modules

### 5.1 HRIS
- **Employee master & 201 files:** all Section 2.3 fields, organizational tags, statutory IDs (StatutoryId table), and an **EmployeeDocument** vault backed by R2 (contracts, government IDs, certificates, memos) with category, retention, and audit.
- **Company dashboard:** noticeboard, headcount, upcoming payroll, holidays, employees on leave, birthdays.
- **Asset tracking:** assign equipment (serial, condition) and track returns for final-pay clearance.
- **Incident management:** memos and Notices to Explain (NTE) with employee responses.
- **Movements:** digital promotion/transfer/reclassification forms with approval and effective dating.

### 5.2 Applicant Tracking System (ATS)
- Kanban pipeline (Applied → Shortlisted → Interviewed → Offered → Hired), applicant notes, resume storage in R2.
- 1-click conversion of a Hired applicant into an Active `Employee` (carrying over name, position, documents).

### 5.3 Time & Attendance
- **Capture:** (a) import attendance via CSV/biometric-export file; (b) manual entry by Admin/Payroll; (c) **Digital time clock** in ESS and **Kiosk** mode with **selfie capture** and **GPS geofencing**.
- **Shift logic:** fixed and flexible shifts; cross-midnight overtime; tardiness/undertime against the assigned shift.
- **Geofence:** punches outside a branch radius are **flagged and allowed** (never hard-rejected) for HR review; consent for biometric/location capture is required (Section 1.4).
- **DTR:** computed records with review/approval routed up the reporting chain (Section 6.4).
- **Leave:** leave types, accrual/lump-sum policies, balances, historical ledger, and the leave/undertime application workflow.
- **Overtime:** the overtime application workflow with attendance cross-check.

### 5.4 Payroll, Records & Claims
- **Payroll Book:** master historical ledger of all runs. **Payroll Sheet:** frozen per-employee line-item breakdown.
- **Custom pay components:** Admin-built allowances/bonuses/deductions, each taxable or non-taxable, with de-minimis flags.
- **Expense claims:** employees file reimbursements with receipt upload; Finance approves and assigns tax treatment; approved claims attach to a target payroll book.
- **Loans:** SSS/Pag-IBIG/company loans and cash advances with installment schedules and running balances.
- **Corrections:** off-cycle and adjustment runs (Section 4.8).

### 5.5 Compliance & Analytics
- **Payslips** per employee per run, published to ESS.
- **Bank files:** BDO, BPI, UnionBank, Metrobank batch formats, plus a generic CSV.
- **Statutory reports:** SSS R-1A/R-3, PhilHealth ER2/RF1, Pag-IBIG MCRF, BIR 1601-C, BIR 2316, Alphalist (with the separate MWE schedule) and DAT file.
- **Filing posture:** export-only — all files are generated for the client to file through their own channels.
- **Analytics:** pivot/slice timesheets and payroll by Department, Branch, Work Location, or Level.

### 5.6 Employee Self-Service (ESS)
- Secure payslip viewing protected by `ess_pin` (or birthdate).
- Profile view; sensitive changes (e.g., bank account) submitted as `ProfileUpdateRequest` for HR approval.
- E-forms (IT tickets, shift-change requests, etc.) via the e-form builder.
- File leave, undertime, overtime, and expense claims.

### 5.7 RBAC & Central/Master Portal
- **Dynamic RBAC:** custom roles built from permissions (Section 2.1). Default roles `Admin`, `Payroll`, `Employee` ship as presets; tenants may add roles such as `Branch Supervisor` or `Payroll Read-Only`.
- **Reporting lines:** `immediate_supervisor_id` / `manager_id` define approval chains, independent of roles.
- **Central/Master Portal:** operator-facing portal for the SaaS owner to create and manage tenants, set `plan_tier`, toggle `feature_flags` (including the AI add-on), manage subscriptions, and manage the global statutory tables.
- **Architecture:** the portal runs as role-gated routes inside the single application (not a separate app), under the `SUPER_ADMIN` identity (Section 1.4). It is not built from tenant RBAC.
- **Statutory admin endpoints:** the global statutory tables are managed through a dedicated `/api/admin/statutory/*` namespace gated to `SUPER_ADMIN` only. There is no shared tenant/operator statutory endpoint, and tenants have no write or override access to statutory data. These endpoints call the shared importer (Section 3.3).

### 5.8 AI Assistant Add-On
A billable add-on bundled into the `PRO` tier, OFF by default, controlled per-tenant from the Central Portal. Full behavior, models, caching, and gating are defined in Section 8.

---

## 6. Workflows

### 6.1 Tenant Setup Wizard
Operator creates a Tenant in the Central Portal → tenant Admin completes a wizard: company profile & branding → org structure (locations with region, branches with geofences, departments, positions) → roles & permissions → employees, statutory IDs, documents, reporting lines, tax classification → pay rules (cycle, denominator, 13th-month basis, default DTR approver) → shift schedules, leave policies, holiday calendar. On completion the tenant can run payroll.

### 6.2 Clock-In (Kiosk / ESS)
Employee enters PIN → camera captures selfie → system captures GPS → queries the employee's assigned Branch and Shift → computes distance from the branch `Geofence`; if outside the radius the punch is flagged and allowed → saves `AttendanceLog` (selfie key, GPS, geofence status) → computes tardiness/undertime against the shift. Requires prior biometric/location consent.

### 6.3 DTR Generation
From imported/manual punches or from clock-in logs, the system computes each `DailyTimeRecord` against the assigned `ShiftSchedule` (worked hours, late, undertime, night-shift hours), created with `approval_status = Pending`.

### 6.4 DTR Review & Approval
DTRs route up the reporting chain: an employee's DTRs → `immediate_supervisor`; a supervisor's own DTRs → `manager`; top-of-chain (no supervisor/manager) → tenant `default_dtr_approver`. The approver may edit before approving, then sets `Approved`/`Rejected` (`approved_by_id` recorded). An `Admin` may override. A payroll run cannot finalize on `Pending`/`Rejected` DTRs without an `Admin` override.

### 6.5 Leave / Undertime Application
Employee files in ESS, attaching a medical certificate where required → status `Pending`; balance checked → routes up the reporting chain → on approval, balance decremented (ledger updated) and the DTR overwritten as `PaidLeave`, bypassing the absence deduction.

### 6.6 Overtime Application
Employee files hours + justification in ESS → system cross-references `AttendanceLog` and rejects if no supporting clock-out → routes up the reporting chain → on approval sets `approved_ot_hours`. Only approved overtime is paid.

### 6.7 Expense Claims
Employee uploads receipt + amount in ESS → routes to HR/Finance → Finance verifies and sets `tax_treatment` (non-taxable reimbursement, de-minimis-within-ceiling, or taxable) → approved claim attaches to the target payroll book and is added in the next run with the correct tax handling.

### 6.8 Profile Update (Bank Change Safeguard)
Employee edits a sensitive field (e.g., bank account) in ESS → not committed immediately; a `ProfileUpdateRequest` routes to HR → HR verifies identity and approves → change is committed and logged in `AuditLog`. The next bank file uses the new account.

### 6.9 Holiday Application
Admin adds a holiday (date, type, scope) to `HolidayCalendar` → during a run the engine intercepts DTRs on that date: no log on a Regular Holiday → inject 100% holiday pay; present → apply the holiday factor from the stacking matrix.

### 6.10 Payroll Run & Corrections
Payroll user starts a run for a period → system verifies all DTRs are `Approved` (blocks otherwise unless `Admin` override) → locks DTRs → creates a `Draft` `PayrollBook` → loops every active employee and executes the gross-to-net waterfall (4.2), pulling effective-dated tables, MWE classification, approved OT, leave, holiday factors, components, loans → writes one frozen `PayrollSheet` per employee → user reviews → on **Finalize**, the book becomes immutable, bank files and CSV are generated, and payslips are published to ESS. Corrections follow Section 4.8.

### 6.11 Year-End Annualization
In the final period of the year, the system runs the annualization described in Section 4.9 across all active employees, producing the true-up, 2316s, and Alphalist/DAT.

### 6.12 BIR 2316 Generation
Admin/Payroll opens the 2316 generator → selects a calendar year (or a separated employee), single or batch → system aggregates the employee's frozen `PayrollSheet` rows for the year plus master data → renders the BIR 2316 layout, populating gross/taxable/non-taxable lines (incl. MWE-exempt lines when `tax_classification = MWE`) → output is a per-employee PDF plus batch download, for the client to issue and file.

### 6.13 Offboarding & Final Pay
HR initiates offboarding with an end date → engine runs the final-pay computation (Section 4.10): asset clearance, leave cash-out, 13th-month proration, tax annualization, net final pay → output is a Final `PayrollSheet`, auto-populated Quitclaim, and final BIR 2316; ESS access is revoked on the end date.

### 6.14 Applicant Onboarding (ATS)
Recruiter moves an applicant through the pipeline → on Hire, 1-click conversion creates an Active `Employee`, carrying over details and documents, and launches the relevant setup steps.

---

## 7. UI/UX

- **Branding:** "Sentire Payroll," premium deep-blue and slate palette; Tailwind + shadcn/ui; per-tenant logo and primary color.
- **Admin desktop:** collapsible left sidebar, top global search, dashboard metric widgets (headcount, payroll trend, upcoming payroll, holidays, on-leave, birthdays). Data grids for employees, DTRs, payroll sheets.
- **ESS mobile (PWA):** bottom navigation bar; a large central "Clock In" button; data tables collapse to vertical card views with no horizontal scrolling; selfie capture flow; payslip viewer.
- **Kiosk tablet:** distraction-free, large clock, numeric PIN keypad and/or QR scan for rapid queueing, selfie capture, branch-bound.

---

## 8. AI Assistant — Integration & Gating Map

The AI Assistant is an add-on bundled into the `PRO` tier, OFF by default, toggled per-tenant (and per-feature) from the Central Portal.

### 8.1 Control & Metering
- The Central Portal's `plan_tier` and `feature_flags` gate AI. Setting a tenant to `PRO` enables AI feature flags; each AI feature is independently toggleable.
- **All AI calls route through one internal metering gateway** that tags each call with `tenant_id` + feature, logs token usage to `AiUsage`, enforces per-tenant fair-use caps, and degrades gracefully (queues or disables a feature) when a cap is hit.
- **Cost controls:** Claude **Haiku 4.5** by default; **Sonnet** only for flagged complex reasoning; aggressive prompt-caching of system prompts, tool definitions, document templates, and per-tenant knowledge base; strict per-call max-token limits.

### 8.2 Touchpoint Map

| # | Feature | Default Model | Caching | Notes |
|---|---|---|---|---|
| 1 | Document extraction — receipts, government IDs, DTR/biometric exports | Haiku 4.5 (vision) | Extraction prompt + per-doc-type template | Highest token volume; metered hardest |
| 2 | Always-on HR assistant (admin + ESS chat) | Haiku 4.5; escalate to Sonnet for complex policy/computation questions | System prompt + tenant knowledge base + chat history | Cap messages/day per seat |
| 3 | Payslip / "why is my tax this?" Q&A | Haiku 4.5 | Explainer prompt + the employee's own sheet | Rides on #2 |
| 4 | Compliance helper — explain a BIR form, summarize a circular | Sonnet | Form/circular references | Admin-only, low volume |
| 5 | Résumé parsing (ATS) | Haiku 4.5 | Parse template | Tied to ATS |
| 6 | Payroll-run anomaly flagging | Rules-first; AI (Sonnet) optional second pass | — | Deterministic rules preferred; AI only for fuzzy cases |

---

## 9. Configuration Defaults

| Setting | Default |
|---|---|
| Deployment | Single application, logical multi-tenancy by `tenant_id` |
| Payroll cycle | Semi-monthly |
| Statutory deduction timing | Second (month-end) cutoff |
| Monthly-paid denominator | 261 working days |
| 13th-month basis | Strict DOLE (Basic Pay) |
| 13th-month & other benefits exclusion cap | ₱90,000 combined, annual |
| Employee tax classification | `Regular` by default; `MWE` per employee, validated vs. regional minimum wage |
| Compliance filing posture | Export-only (the client files) |
| First bank file format | BPI (others available) |
| DTR approval before payroll | Required (Admin override available) |
| Geofence handling | Flag-and-allow (never hard-reject) |
| Plan tiers | `STARTER`, `GROWTH`, `PRO` (AI add-on bundled into `PRO`) |
| Default roles | `Admin`, `Payroll`, `Employee` (custom roles supported) |
| Operator identity | `SUPER_ADMIN`, separate from tenant RBAC, MFA, fully audited |
| Statutory tables | Global (no `tenant_id`), `SUPER_ADMIN`-managed via the shared importer |
| Statutory admin endpoints | `/api/admin/statutory/*`, `SUPER_ADMIN` only; no tenant override |
| Field encryption | AES-256-GCM, envelope (DEK wrapped by KEK); env-var KEK now, KMS later; HMAC for searchable fields |
| Money arithmetic | Centralized `src/lib/money/` centavo module; round half up to the centavo |
| Engine tests | Golden-case suite (`Engine_Test_Spec.md`) required before any real payroll output |

---

## 10. Recommended Build Sequence

This section is sequencing guidance only. All features in Sections 1–9 are in scope; this is the order that delivers a sellable system fastest and keeps compliance risk contained. Nothing here is excluded.

1. **Foundation:** multi-tenancy + `tenant_id` row-level security, dynamic RBAC, security/DPA (envelope encryption, audit log, consent), R2 storage, the `src/lib/money/` centavo module, and the tenant setup wizard.
2. **Statutory core (D1 scope):** the effective-dated statutory tables seeded via the shared importer run as a **CLI seed** (no admin UI yet), plus the **resolver** the engine reads through. The `SUPER_ADMIN` statutory admin endpoints (`/api/admin/statutory/*`) are deferred to a later phase and reuse the same importer when built.
3. **Core payroll wedge:** employee master + StatutoryId + documents; **manual day-level DTR entry** + shift logic; DTR approval routing; leave & OT; the gross-to-net engine (stacking matrix, MWE/non-taxable, 13th-month) — built behind the `Engine_Test_Spec.md` quality gate; payroll book/sheet with corrections; payslips; BPI bank file + CSV; 1601-C data + 2316.
4. **Compliance depth:** year-end annualization + Alphalist; remaining statutory reports (R-3, RF1, MCRF); additional bank files; expense claims; loans; leave accrual automation; offboarding & final pay.
5. **Attendance & engagement:** CSV/biometric DTR import; ESS time clock with selfie + GPS geofence; Kiosk mode; e-forms; profile-update requests; analytics/pivots; statutory admin UI/endpoints.
6. **Growth modules:** ATS; asset tracking; incident/NTE; movements.
7. **AI Assistant add-on:** metering gateway, then the touchpoint features (Section 8), gated to `PRO`.

---

*Complete build specification. Compliance parameters (BIR withholding tables, de minimis ceilings, regional minimum wage) are loaded as effective-dated configuration data and verified against current BIR and RTWPB issuances before seeding.*
