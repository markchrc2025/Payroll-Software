# Sentire Payroll — End-to-End User Journey v1.0
**Two Perspectives. One System.**

| | |
|---|---|
| **Scope** | Full lifecycle from sales through daily operations |
| **Perspectives** | Provider (Sentire Software) · Tenant (Customer) |
| **Surfaces** | Admin Desktop Browser · ESS Mobile PWA |
| **Based On** | Sentire Payroll Master Blueprint v2.0 |
| **Date** | May 2026 |

---

## How to Read This Document

This document maps the complete end-to-end journey of the Sentire Payroll platform from two distinct perspectives:

| Perspective | What It Covers |
|---|---|
| **Provider Perspective** | How Sentire Software (us) onboards, supports, and manages customers. Covers sales, tenant provisioning, training, billing, and ongoing support. |
| **Tenant Perspective** | How the customer's HR team and employees set up and operate the platform. Split into Admin Desktop and ESS Mobile journeys. |

Each step is structured as: **Phase** → **Step** → **Actor** → **System Response**.

> **Blueprint Reference:** All workflows align with the Sentire Payroll Master Blueprint v2.0. Section references are noted where relevant.

---

# PART 1: Provider Perspective (Sentire Software)

> This section covers the journey from Sentire's side — how we acquire customers, provision their tenants, provide training, and support them in production.

---

## 🔵 Phase 1: Sales & Lead Management

### Step 1 — Lead Generation
- Marketing channels: website contact form, referrals, partnerships with HR consultants
- Prospect expresses interest in a Philippine-compliant payroll + HRIS platform
- Lead is logged in CRM and assigned to a Sales Associate

### Step 2 — Discovery Call & Demo
- Sales conducts needs assessment: company size, payroll complexity, number of branches, current pain points
- Full platform demo is given: HRIS, ATS, T&A (GPS clock-in), Payroll run, ESS mobile
- Compliance needs confirmed: SSS, PhilHealth, Pag-IBIG, BIR TRAIN Law
- Subscription tier recommended based on headcount

### Step 3 — Proposal, Pricing & Contract
- Formal proposal sent with subscription tiers and per-employee-per-month pricing
- Contract signed electronically
- Billing cycle confirmed (monthly or annual)
- Sales hands off to Customer Success (CS) team with an account brief

---

## 🔵 Phase 2: Tenant Onboarding

### Step 4 — Tenant Provisioning in Master Portal
- CS opens the Sentire Master Portal
- Creates new tenant account: company name, subscription tier, max employee count, billing date
- System provisions an isolated database instance for the tenant (multi-tenancy enforced)
- Welcome email automatically sent to the Company Admin with activation link and temporary credentials

### Step 5 — Kick-Off Call & Implementation Support
- CS schedules a kick-off call with the client's HR Admin
- Walks through the initial setup checklist: company profile, branches, departments, shifts
- Provides the employee import CSV template; assists with data mapping
- Validates statutory table configuration: SSS bracket, PhilHealth rate (5%), Pag-IBIG rate
- Guides HR through holiday calendar setup from DOLE proclamation

### Step 6 — Training

| Session | Audience | Coverage |
|---|---|---|
| Admin Training | HR Managers | Full platform walkthrough covering all 6 modules: HRIS, ATS, T&A, Payroll, Compliance, RBAC |
| Payroll Staff Training | Payroll Team | Focused session on payroll run, Gross-to-Net review, bank file generation, statutory reports |
| Employee Orientation | All Employees | How to install the ESS Mobile PWA, set PIN, clock in with GPS, and file leaves/OT |

### Step 7 — Supervised Go-Live
- CS monitors the client's first live payroll run
- Validates all computed values against a test payroll spreadsheet provided by the client
- Any discrepancies are resolved before finalizing
- Client signs off on go-live confirmation
- Account is marked **Active** in the Master Portal

---

## 🔵 Phase 3: Ongoing Provider Operations

### Step 8 — Billing & Subscription Management
- Monthly invoices generated automatically based on active employee count
- CS handles plan upgrades as headcount grows beyond tier limit
- Annual renewal reminders sent 30 days before expiry

### Step 9 — Support & Ticket Resolution

| Priority | Definition | SLA |
|---|---|---|
| **P1 — Payroll Blocking** | Payroll run cannot be completed | Respond within 2 hours, resolve within 4 hours |
| **P2 — Functional Issue** | Feature not working as expected | 1 business day response |
| **P3 — How-To / Training** | Configuration help or guidance | 2 business days |

### Step 10 — Statutory Table Updates
- When DOLE, BIR, SSS, PhilHealth, or Pag-IBIG releases updated rates or brackets, Sentire pushes the update to all tenants
- Tenants are notified via in-app banner and email
- No action required from tenants — tables update automatically before the next payroll run

### Step 11 — Tenant Health Monitoring
- Master Portal dashboards show: last login date, last payroll run date, support ticket volume per tenant
- CS flags tenants who have not run payroll in over 45 days for a check-in call
- Churn risk scoring based on engagement signals

---

# PART 2: Tenant Perspective — Admin Desktop Browser

> This covers the journey of the Company Admin and HR/Payroll Managers operating Sentire Payroll on a desktop browser.

> **Platform Surface:** Full-featured web application with a collapsible left sidebar, global search, and metric dashboard widgets. Optimized for desktop and laptop browsers.

---

## 🟦 Phase 1: Company Onboarding (One-Time Setup)

### Step 1 — Account Activation
- Company Admin receives welcome email from Sentire
- Clicks activation link → sets a secure password
- Logs in to the Admin portal for the first time
- **Setup Wizard launches automatically**, guiding through Steps 2–8

### Step 2 — Company Profile Setup
- Enter company legal name, logo, registered address, and TIN
- Set payroll schedule: Semi-Monthly (1st–15th / 16th–30th), Monthly, or Weekly
- Set standard working hours per day (default: 8 hours) and working days per week
- Configure tardiness grace period (e.g., 5 minutes before late deduction begins)
- Set fiscal year start month for 13th month computation

### Step 3 — Branch Setup & Geofence Configuration
- Click **Add Branch** for each office, store, or work site
- Enter branch name, address, and assign a Branch Manager
- Configure GPS Geofence *(Blueprint Section 6)*:
  - Drop a pin on the interactive Google Maps picker to mark the branch location
  - Set enforcement radius using a slider: **30m to 500m** (default: 100m)
  - A visual circle overlay shows the geofence boundary in real time
  - Click **Save** — geofence is immediately active for all employees assigned to this branch

### Step 4 — Organizational Structure
- Create **Departments** (e.g., Operations, Finance, HR, Sales)
- Define **Positions** within each department (e.g., "Cashier", "Accountant")
- Assign **Seniority Levels**: Entry, Mid, Senior, Manager, Director
- Define **Work Locations** (e.g., Main Office, Warehouse, Work From Home)

### Step 5 — Payroll Configuration
- Select salary computation type per group: **Monthly Paid** or **Daily Paid**
- Verify pre-loaded statutory deduction tables (SSS, PhilHealth, Pag-IBIG)
- Configure 13th month computation method: Strict DOLE (Basic Pay) or Company Policy (Regular Pay)
- Build custom **Allowance** components (e.g., Rice Allowance, Transportation) — mark Taxable or Non-Taxable
- Build custom **Bonus** components (e.g., Performance Bonus) — mark Taxable or Non-Taxable

### Step 6 — Holiday Calendar
- Add all national Regular Holidays (e.g., New Year, Labor Day, Christmas)
- Add Special Non-Working Holidays
- Set scope per holiday: **Global** (all branches) or **Branch-Specific** (local city holiday)
- System will automatically apply correct DOLE premium multipliers during payroll runs

### Step 7 — Shift Schedule Setup
- Create named shifts (e.g., "Morning Shift 8AM–5PM", "Night Shift 10PM–7AM")
- Define break schedules and grace periods per shift
- Enable Cross-Midnight OT recognition for night-shift employees
- Flexible shift option: no fixed start time, only total hours required per day

### Step 8 — Employee Import & Profile Creation
- Download the Sentire Employee Import CSV Template
- Populate: full name, SSS No., PhilHealth No., Pag-IBIG No., TIN, bank account, bank name, salary, department, branch, position, level, shift
- Upload completed CSV — system validates each row and flags errors
- Review validation results, fix errors, re-upload
- Alternatively: manually create employee profiles one by one
- Assign each employee to a department, branch, position, level, and shift

---

## 🟦 Phase 2: Recruitment & Onboarding (ATS Module)

### Step 9 — Create a Job Requisition
- HR navigates to the ATS module → **New Job Opening**
- Fills in: job title, department, required level, salary range, job description
- Job opening appears as the first column in the Kanban board: **Applied**

### Step 10 — Manage the Applicant Pipeline
- Drag applicant cards across Kanban stages: **Applied → Screening → Interview → Offer**
- Log interview notes and scores on each applicant card
- Mark a stage as rejected (`REJECTED`) or withdrawn (`WITHDRAWN`) with a reason for recordkeeping

### Step 11 — Hire & Convert to Employee
- HR moves applicant to **Offer** stage → extends offer (salary, start date, benefits)
- On acceptance, click **1-Click Convert to Employee**
- System pre-fills the employee profile form from the applicant record
- HR completes statutory IDs, bank account, and shift assignment
- New employee is now active and can receive their ESS onboarding link

---

## 🟦 Phase 3: Daily Time & Attendance Operations

### Step 12 — DTR Records: Period Submission View *(Blueprint Workflows 10 & 11)*

> **Important:** The DTR Records module shows **period-level submissions** — one row per employee per cutoff — not individual daily log lines. Raw daily clock-in/out data lives in the Attendance Log tab and is system-generated.

The DTR Records table columns:

| Column | Description |
|---|---|
| Employee | Name + Employee ID |
| Cutoff Period | e.g., May 16–31, 2026 |
| Submitted | Date employee submitted the DTR |
| Days Present / Total | e.g., 12 / 15 |
| Total Hours Worked | Computed from Effective Time values |
| Tardiness | Total late minutes across the period |
| OT Hours | Total approved OT hours |
| Status | Submitted / Supervisor Approved / Manager Approved / Returned |
| Actions | View · Audit Log |

**Key rules:**
- A DTR row appears as soon as the employee submits, regardless of whether Supervisor or Manager has acted
- Clicking a row opens the **daily breakdown**: each day shows Official Time In/Out (locked, greyed out) alongside Manual Time In/Out (editable by Supervisor) and the computed Effective values
- The Payroll Engine only consumes DTRs with status = **Manager Approved**; unapproved submissions are flagged in the Pre-Run Review

### Step 12a — Supervisor: Review & Edit a DTR Submission

| Actor | Action | System Response |
|---|---|---|
| Supervisor | Opens a submitted DTR → reviews each day row. | Table shows 6 time columns per day: Official In · Official Out (locked) / Manual In · Manual Out (editable) / Effective In · Effective Out (computed). |
| Supervisor | Spots a day where Official Time Out is missing (employee forgot to clock out). Clicks the Manual Time Out cell for that day. | A form appears: time picker + Reason Code dropdown (Forgot Clock-Out, GPS Failure, Kiosk Offline, System Error, Schedule Change, Other) + Notes field. |
| Supervisor | Selects time, picks reason, adds notes. Clicks Save. | Manual Time Out is saved. Effective Time Out updates immediately. An immutable entry is written to DTR_Audit_Log (actor = Supervisor). |
| Supervisor | Reviews all days. Clicks "Approve & Forward to Manager". | DTR_Submission status → **Supervisor Approved**. Manager is notified. |

### Step 12b — Manager: Audit Review & Final Approval

| Actor | Action | System Response |
|---|---|---|
| Manager | Opens the DTR_Submission forwarded by Supervisor. | All time fields are **read-only**. A side panel shows the full DTR Audit Log: every manual edit, who made it (Employee or Supervisor), what changed, reason, and timestamp. |
| Manager | Reviews the audit log. All edits look legitimate. Clicks "Approve". | DTR_Submission status → **Manager Approved**. DTR is locked. Eligible for next Payroll Run. |
| Manager | Spots a suspicious Supervisor edit with no notes. Clicks "Return to Supervisor" with a note. | Status → **Returned**. Supervisor is notified with the Manager's note. Supervisor must re-review and re-submit. |

### Step 13 — Approve or Reject Leave Requests *(Blueprint Workflow 2)*
- Notification arrives when an employee submits a leave request via ESS
- HR/Supervisor opens the request: sees leave type, dates, and attached medical certificate (if SL)
- Clicks **Approve** or **Reject** (with a comment)
- If approved: system deducts from leave balance and marks DTR as **Paid Leave**

### Step 14 — Approve or Reject OT Requests *(Blueprint Workflow 3)*
- OT request arrives with date, hours claimed, and justification
- Manager cross-checks the employee's actual clock-out time in the Attendance Log
- If clock-out does not support the OT claim, request is rejected
- If approved: system adds approved OT hours to the DTR; payroll engine applies the correct premium multiplier (125% regular, 130% rest day, etc.)

### Step 15 — Approve Expense Claims *(Blueprint Workflow 4)*
- Finance receives claim notification: amount, description, and receipt photo attached
- Verifies receipt authenticity and amount
- If approved: system creates a **Non-Taxable Payroll Adjustment**, attaches it to the next upcoming payroll run

### Step 16 — Approve Bank Account Change Requests *(Blueprint Workflow 5)*
- Employee requests a bank account update via ESS
- HR Admin verifies employee identity (call, in-person, or document check)
- Approves or rejects the Profile Update Request
- If approved: database updates immediately; next bank file generation uses the new account

---

## 🟦 Phase 4: Payroll Run Operations

> **Blueprint Reference:** This phase implements the Gross-to-Net waterfall (Section 1B) and Workflow 7 (End-to-End Payroll Run).

### Step 17 — Pre-Payroll Review (Cutoff Day)
- HR confirms all DTRs are complete: no missing clock-outs, all OT approved
- Verifies all leave approvals are processed
- Checks that all approved expense claims are attached to this period
- Reviews the holiday calendar for any holidays in the period

### Step 18 — Lock DTRs & Generate Payroll Run
- HR navigates to **Payroll Book** → clicks **Generate New Run**
- System locks all DTRs for the period — no further employee edits are allowed
- System creates a new Payroll Book ID and loops through every active employee
- Engine executes the Gross-to-Net sequence per employee:
  1. Compute Base Pay → subtract Tardiness/Absences
  2. Add approved OT, NSD, and Holiday premiums
  3. Add taxable allowances/bonuses
  4. Deduct SSS, PhilHealth, Pag-IBIG
  5. Compute withholding tax (BIR TRAIN Law)
  6. Add non-taxable allowances and approved expense claims
  7. Deduct SSS/HDMF loans and cash advances
  8. Output **Net Take-Home Pay**
- Each result is frozen as a **Payroll Sheet** record (immutable snapshot)

### Step 19 — Review the Payroll Sheet
- HR reviews the master Payroll Sheet grid — one row per employee
- Clicks any row to expand the full gross-to-net breakdown
- Makes manual adjustments if needed (reason logged for audit)

### Step 20 — Finalize & Distribute
- HR clicks **Finalize Payroll** (irreversible action — system confirms before proceeding)
- System generates bank advice files in the correct format for each bank: BDO, BPI, UnionBank, Metrobank
- Digital payslips are published to each employee's ESS (PIN-protected)
- HR submits bank files to the company's bank for salary crediting

### Step 21 — Statutory Report Generation

| Report | Purpose |
|---|---|
| SSS R-1A / R-3 | Monthly employee contributions report for SSS |
| PhilHealth ER2 / RF1 | PhilHealth premium remittance report |
| Pag-IBIG MCRF | HDMF monthly contribution remittance form |
| BIR 1601-C | Monthly withholding tax remittance return |
| BIR Form 2316 | Annual certificate of compensation per employee |
| Alphalist | Annual employee income and tax withheld list for BIR |

---

## 🟦 Phase 5: Employee Offboarding

> **Blueprint Reference:** Workflow 8 (Final Pay & Offboarding Computation).

### Step 22 — Initiate Offboarding
- HR navigates to the employee's profile → clicks **Initiate Offboarding**
- Selects separation type: Resigned, Terminated, End of Contract, Retirement
- Sets the last working day
- System schedules ESS access revocation for the last working day

### Step 23 — Asset Clearance
- System queries Asset Tracking for all items assigned to this employee
- HR marks each asset as: Returned, Unreturned, or Damaged
- For unreturned or damaged items: HR inputs the monetary deduction equivalent

### Step 24 — Final Pay Computation
The system automatically calculates:
- Unpaid salary for days worked in the final period
- Unused Vacation Leave days converted to cash (Daily Rate × remaining days)
- 13th Month Pay proration: YTD Basic Pay / 12
- Tax Annualization: total YTD income vs. total YTD tax withheld → outputs a Tax Refund or Tax Payable
- Less: asset deductions, outstanding loans, cash advances

HR reviews and confirms before generating documents.

### Step 25 — Document Generation
- System auto-populates the legal **Quitclaim** document with employee details, separation type, and final pay breakdown
- System generates the final **BIR Form 2316** with annualized tax figures
- Both documents are printed for the employee's wet signature
- Signed copies are uploaded to the employee's 201 file for recordkeeping

### Step 26 — ESS Access Revocation
- On the last working day, the system automatically locks the employee's ESS account
- Employee can no longer clock in, view payslips, or file requests
- Employee record is archived (not deleted) for statutory retention purposes

---

# PART 3: Tenant Perspective — ESS Mobile PWA (Employee)

> This covers the employee's journey using the ESS (Employee Self-Service) Mobile Progressive Web App.

> **Platform Surface:** Mobile PWA accessed via any smartphone browser. No app store download required. Bottom navigation bar, card views to prevent horizontal scrolling, and a large central Clock In/Out button.

---

## 🟢 Phase 1: Employee Onboarding

### Step 1 — Receiving Access & Setting Up
- Employee receives an SMS or email from HR with the Sentire ESS link and a temporary PIN
- Opens the link in their mobile browser (Chrome, Safari, etc.)
- Prompted to **Add to Home Screen** for app-like access (no App Store required)
- On first login: enters temporary PIN → immediately prompted to set a new personal PIN (4–6 digits)
- Profile screen loads: employee reviews personal info, statutory IDs, bank account, and assigned branch
- If any information is incorrect: files a **Profile Update Request** (HR reviews and corrects)

---

## 🟢 Phase 2: Daily Time & Attendance

### Step 2 — GPS Clock-In (ESS Mobile) *(Blueprint Workflow 1 + Section 6)*

| Actor | Action | System Response |
|---|---|---|
| Employee | Opens ESS app. Taps the large **Clock In** button on the home screen. | App checks if it is within the employee's scheduled shift window. |
| Browser | Requests location permission if not already granted. | Employee taps **Allow**. GPS acquires coordinates (up to 10-second timeout). |
| System | Calculates distance from assigned branch using the Haversine formula (server-side). | If outside geofence radius: punch is **allowed** but flagged — `outsideGeofence = true` and distance in metres are recorded in the Attendance Log. No error is shown; clock-in proceeds. |
| System | Opens the device camera for selfie capture (consent verified first). | Employee sees live camera feed. A circle overlay guides the selfie frame. |
| Employee | Positions face within the circle. Taps **Confirm**. | System saves the Attendance Log: timestamp, GPS coordinates, `outsideGeofence` flag, distance in metres, selfie key, punch source. DTR for the day is updated. |
| Employee | Clock-in confirmed. Recorded time stamp is displayed. | Employee proceeds to their workstation. |

### Step 2a — Manual Time Entry (ESS) *(Blueprint Workflow 11)*

Sometimes an employee forgets to clock in or out, or the GPS fails. They can correct this through the Manual entry section — without touching the official captured record.

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → DTR → "My DTR" → selects the current cutoff period → finds the affected day. | Daily breakdown shows: Official Time In/Out (greyed, locked) and Manual Time In/Out (editable). |
| Employee | Taps the Manual Time In or Manual Time Out field. | Form appears: time picker + Reason Code (Forgot Clock-In/Out, GPS Failure, Kiosk Offline, System Error, Schedule Change, Other) + Notes (required if Other). |
| Employee | Inputs the correct time, selects reason, adds notes. Taps Save. | Manual value saved. Effective Time recalculates immediately. DTR_Audit_Log entry written (actor = Employee). Official values remain unchanged. |

> **Key constraint:** Employee can only add manual entries while the period DTR is still open (before submission). Once submitted, the Manual fields are locked to the employee — only a Supervisor can edit from that point.

### Step 3 — GPS Clock-Out
- Same flow as Clock-In — employee taps **Clock Out** at the end of their shift
- GPS check and selfie are captured again
- System calculates total hours worked for the day
- If hours exceed scheduled shift: extra time appears as **Pending OT** (requires manager approval before payroll counts it)

### Step 4 — Kiosk Clock-In (Alternative)
If the branch has a tablet kiosk set up by the employer:
- Employee walks up to the kiosk and enters their PIN on the numeric keypad (or scans their QR code)
- Kiosk camera captures the selfie
- GPS check is **skipped** — kiosk is physically at the branch
- Attendance Log records the branch's stored static coordinates

### Step 5 — Submit Period DTR *(Blueprint Workflow 10)*

At the end of each cutoff period, the employee reviews and formally submits their DTR for the approval chain.

| Actor | Action | System Response |
|---|---|---|
| Employee | Receives an ESS notification: "Your DTR for May 16–31 is ready for review." | ESS → DTR → "My DTR" → cutoff period opens showing all 15 days. |
| Employee | Reviews each day: Official Time In/Out (greyed, read-only), Manual Time In/Out (if entered), Effective Time (computed), and computed Hours/Late/OT per day. | Any days with missing clock-outs or anomalies are highlighted in amber for attention. |
| Employee | Corrects any missing manual entries (see Step 2a). Reviews the full period summary (total hours, total tardiness, total OT). | Running totals update as manual entries are saved. |
| Employee | Satisfied with the record. Taps "Submit DTR". | DTR_Submission created. Status = **Submitted**. Manual fields are now locked to the employee. Supervisor is notified. Employee sees a confirmation: "Your DTR has been submitted and is awaiting supervisor review." |

---

## 🟢 Phase 3: Leave, Overtime & Undertime

### Step 5 — File a Leave Request *(Blueprint Workflow 2)*

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → Leave tab → taps **File Leave**. | System shows current leave balance per type (SL, VL, EL). |
| Employee | Selects leave type, start date, and end date. | System checks balance — warns if insufficient days remain. |
| Employee | For Sick Leave: photographs medical certificate. Adds remarks. Taps **Submit**. | Status set to **Pending**. Notification sent to assigned supervisor. |
| Supervisor | Reviews request in Admin Desktop. Approves or rejects with a comment. | If approved: leave balance deducted. DTR marked **Paid Leave**. Employee notified. |

### Step 6 — View Leave Balance
- ESS → Leave → **My Balance**
- Shows remaining days for each leave type: Sick Leave, Vacation Leave, Emergency Leave
- Shows full leave history: dates used, status, and approving supervisor

### Step 7 — File Overtime *(Blueprint Workflow 3)*

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → OT tab → **File OT**. Selects date, inputs hours (e.g., 2 hours), adds justification. | System cross-checks: if Attendance Log has no supporting clock-out, the form is rejected before submission. |
| Employee | If Attendance Log is valid: submits the OT request. | Status set to **Pending**. Manager receives notification. |
| Manager | Reviews in Admin Desktop. Verifies against clock-out log. Approves or rejects. | If approved: DTR updated with +N OT hours. Payroll engine applies the correct premium multiplier. |

### Step 8 — File Undertime
- ESS → Undertime → **File Undertime**
- Selects date, inputs the early departure time, and adds a reason
- Submits for supervisor review
- If approved: DTR reflects the undertime; deduction is calculated in payroll

---

## 🟢 Phase 4: Expense Claims

### Step 9 — Submit an Expense Claim *(Blueprint Workflow 4)*

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → Claims → **New Claim**. Taps camera icon to photograph the official receipt (OR). | System accepts JPG/PNG. Image stored securely. |
| Employee | Inputs amount (in Pesos) and expense description. Taps **Submit**. | Status set to **Pending**. Finance team notified. |
| Finance | Opens claim in Admin Desktop. Reviews receipt photo and amount. Approves or rejects. | If approved: a **Non-Taxable Payroll Adjustment** is created and attached to the next payroll run. |
| Payslip | On next payroll run, the approved claim amount appears as a Non-Taxable Addition. | The amount bypasses withholding tax entirely — employee receives the full amount. |

### Step 10 — Track Claim Status
- ESS → Claims → view list of all submitted claims
- Each claim shows: date, amount, description, and status (Pending / Approved / Rejected)
- Rejected claims show the finance reviewer's reason

---

## 🟢 Phase 5: Payslips

### Step 11 — View & Download Payslip

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → Payslips tab. Sees list of all payroll periods. | |
| Employee | Taps on a period (e.g., "May 16–31, 2026"). | System prompts for PIN entry. |
| Employee | Enters personal PIN. | Payslip unlocks and displays the full gross-to-net breakdown. |
| Employee | Reviews: Basic Pay, OT, NSD, Holiday Pay, SSS/PhilHealth/Pag-IBIG deductions, withholding tax, net pay. | |
| Employee | Optionally downloads/shares as PDF. | System generates a formatted PDF payslip. |

---

## 🟢 Phase 6: Profile Management

### Step 12 — Request a Profile Update *(Blueprint Workflow 5)*

> **Security Note:** Profile changes (especially bank account) are NOT applied immediately. They require HR Admin approval to prevent payroll fraud.

| Actor | Action | System Response |
|---|---|---|
| Employee | ESS → Profile → **Edit Info**. Updates bank account, address, or emergency contact. | System does **NOT** apply the change immediately. |
| System | Creates a Profile Update Request and notifies HR Admin. | |
| HR Admin | Verifies employee identity (call, in-person, or document upload). Approves or rejects. | If approved: database commits the change. Next bank file uses the new account number. |

### Step 13 — View Assigned Assets
- ESS → Profile → **My Assets**
- Shows all equipment assigned by the company: laptop serial number, uniform, access card, etc.
- Employee uses this as a reference checklist during resignation or offboarding

---

## 🟢 Phase 7: Employee Offboarding (ESS View)

### Step 14 — Receiving Final Pay
- HR initiates offboarding in Admin Desktop — employee is notified via ESS
- Employee continues to clock in normally until their last working day
- On the last working day, ESS automatically locks after the final clock-out
- **Final payslip** (including 13th month proration, leave cash-out, tax refund/payable) appears in the Payslips tab before access is revoked
- Employee downloads or screenshots their final payslip and BIR Form 2316 before ESS locks

### Step 15 — ESS Access Revocation
- At midnight on the last working day, ESS login is disabled
- Employee can no longer clock in, view records, or submit requests
- A final confirmation screen is shown on last login: *"Your access will end tonight. Please download any records you need."*

---

*End of Sentire Payroll User Journey v1.0 · Sentire Software · May 2026*
