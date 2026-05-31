# Sentire Payroll: Master Architecture & Feature Blueprint
**Version 2.0 — Updated with GPS Geofencing Implementation Spec**

**Target Market:** Philippine SMEs (Micro-businesses to Mid-Market enterprises with 500–5,000+ employees).

**Objective:** A scalable, compliant, and automated HRIS & Payroll system with a premium user experience.

---

## 1. Core Computation Engine (Philippine Labor Code Compliant)

### A. Salary Types, Conversion, & Definitions

- **Monthly Paid:** Fixed monthly rate. (Formula: (Monthly Rate × 12) / Total Working Days in a Year [e.g., 261, 313, 365] = Daily Rate)
- **Daily Paid:** Paid only for days worked. (Formula: Daily Rate × Days Worked)
- **Hourly Rate Computation:** Daily Rate / Standard Hours per Day (usually 8)
- **Late/Undertime Deduction:** (Hourly Rate / 60) × Total Late/Undertime Minutes.
- **System Definitions:**
  - *Regular Pay:* Fixed base rate without deductions for absences/lates.
  - *Basic Pay:* Actual earned pay (Regular Pay minus tardiness/absences).

### B. Gross-to-Net Computation Sequence

*The engine must execute this exact waterfall sequence during a payroll run to generate the Payroll Sheet:*

1. **Base Earnings:** Compute Base Pay.
2. **Deduct Tardiness/Absences:** Subtract Late/Undertime deductions.
3. **Add Premium Pay:** Add OT, Night Shift Differential (NSD), Rest Day, and Holiday pay.
4. **Add Taxable Allowances/Bonuses:** Add custom taxable components.
5. **Gross Taxable Income:** Sum of Steps 1 through 4.
6. **Deduct Statutory Contributions:** SSS, PhilHealth, Pag-IBIG (applied to specific cutoffs).
7. **Compute Withholding Tax:** Apply BIR TRAIN Law table.
8. **Add Non-Taxable Allowances & Claims:** De Minimis benefits, approved expense reimbursements.
9. **Deduct Loans/Others:** SSS/HDMF Loans, cash advances.
10. **Net Take-Home Pay:** Final payable amount.

### C. 13th Month Pay Computation Engine

- **DOLE Formula:** Total Basic Salary Earned for the Year / 12.
- **Admin Configuration Toggle:**
  - *Option A (Strict DOLE):* Compute against **Basic Pay** (excludes unpaid lates/absences).
  - *Option B (Company Policy):* Compute against **Regular Pay** (ignores lates/absences).
- *Exclusions:* OT, premium pay, allowances are excluded unless customized by HR.

### D. Premium Multipliers (DOLE Standards)

| Scenario | Multiplier |
|---|---|
| Regular Work OT | 125% (1.25) |
| Night Shift Differential (NSD) | +10% (0.10) |
| Rest Day Work | 130% (1.30) |
| Rest Day OT | 169% (1.69) |
| Special Non-Working Holiday | 130% (1.30) |
| Special Holiday OT | 169% (1.69) |
| Regular Holiday | 200% (2.00) |
| Regular Holiday OT | 260% (2.60) |
| Double Holiday Worked | 300% (3.00) |

---

## 2. Platform Feature Modules

### Module 1: Comprehensive HRIS

- **Organizational Attributes:** Tag employees by Work Location, Branch, Department, Position, and Level (Entry, Mid, Senior, Manager, Director).
- **Company Dashboard:** Noticeboard, Holidays, Employees on Leave, Birthdays.
- **Employee Profile & 201 Files:** Statutory IDs, digital documents.
- **Asset Tracking:** Track assigned equipment (serial numbers, conditions) for final pay clearance.
- **Incident Management & Movements:** Memos, Notice to Explain (NTE), and digital Movement Forms (promotions/transfers).

### Module 2: Applicant Tracking System (ATS)

- **Pipeline:** Kanban board (Applied → Shortlisted → Interviewed → Offered → Hired).
- **Seamless Onboarding:** 1-click conversion from "Hired Applicant" to "Active Employee".

### Module 3: Time & Attendance (T&A)

- **Digital Time Clock (ESS):** Mobile log-in with **Selfie Capture** and **GPS Geofencing** (see Section 6 for full implementation spec).
- **Kiosk Mode:** Cross-platform web interface for branch tablets. Geofence check is bypassed — kiosk is physically fixed at the branch.
- **Shift Logic:** Fixed/Flexible shifts, and Cross-Midnight OT recognition.
- **Leave Entitlement:** Custom earning policies (accrual vs. lump-sum) and historical ledgers.
- **Period DTR Submission:** At the end of each cutoff period, employees submit their packaged DTR for approval. Each daily entry contains two layers — an immutable Official record (GPS/selfie captured) and an editable Manual override section. See Workflow 10 and Workflow 11 for full logic.
- **DTR Approval Chain:** Submitted DTR flows through Supervisor (review + edit rights) → Manager (read-only + audit log visibility) before the payroll engine consumes it.
- **DTR Audit Log:** Every manual edit to a DTR entry is immutably logged: field changed, old value, new value, actor, timestamp, and reason.

### Module 4: Dynamic Payroll, Records & Claims

- **Payroll Book:** A master historical ledger of all organizational payroll runs.
- **Payroll Sheet:** A granular, printable breakdown documenting every component (base, premiums, deductions) per employee for a specific run.
- **Custom Components:** Admins can build custom Allowances and Bonuses (Taxable/Non-Taxable).
- **Expense Claims:** Employees file reimbursements with receipt uploads.

### Module 5: Compliance & Analytics

- **Data Slicing:** Pivot Timesheets/Payroll by Department, Branch, Location, or Level.
- **Bank Files:** Auto-generate BDO, BPI, UnionBank, Metrobank batch files.
- **Statutory Reports:** SSS R-1A/R-3, PhilHealth ER2/RF1, Pag-IBIG MCRF, BIR 1601-C, Form 2316, Alphalist.

### Module 6: ESS & Multi-Tenant RBAC

- **Secure Payslips:** PIN/DOB-protected viewing on mobile.
- **E-Forms:** Digital builder for internal requests (IT tickets, shift changes).
- **Dynamic Roles:** Custom permissions (e.g., "Branch Supervisor", "Payroll Read-Only").
- **Master Portal:** For the Sentire SaaS owner to manage client subscriptions.

---

## 3. Front-End UI/UX Architecture

- **Branding:** "Sentire Payroll" utilizes a premium deep blue and slate palette (Tailwind CSS, shadcn/ui).
- **Admin Desktop:** Collapsible left sidebar, top global search, metric widgets (Headcount, Payroll Trend).
- **ESS Mobile (PWA):** Bottom navigation bar. Massive central "Clock In" button. Data tables convert to vertical "Card Views" to prevent horizontal scrolling.
- **Kiosk Tablet:** Distraction-free, massive clock, numeric keypad/QR scanner for rapid queueing.

---

## 4. Data Architecture Connectivity

- **Company (Tenant):** Root node. Enforces database multi-tenancy.
- **Employee_Profile:** Central hub linking Department, Work_Location, Branch, Position, and Shift_Schedule.
- **Attendance_Log:** Raw clock-in data (Selfie, GPS coordinates, accuracy radius in meters). Immutable — never edited.
- **Daily_Time_Record (DTR):** The computed daily record derived from Attendance_Log vs. Shift_Schedule. Contains two layers per day:
  - *Official layer (immutable):* `official_time_in`, `official_time_out` — sourced from Attendance_Log, locked permanently.
  - *Manual layer (audited):* `manual_time_in`, `manual_time_out`, `manual_reason_code`, `manual_notes`, `manual_actor_id`, `manual_actor_role`, `manual_timestamp` — editable by Employee or Supervisor with a required reason.
  - *Effective layer (computed):* `effective_time_in`, `effective_time_out` — system-derived: uses Manual values if present, otherwise Official. Supervisor's manual entry always overrides the employee's manual entry. This is the layer consumed by the Payroll Engine.
- **DTR_Submission:** Represents a packaged cutoff-period DTR submitted by an employee for approval. One record per employee per payroll period. Fields: `employee_id`, `payroll_period_id`, `submitted_at`, `status` (Submitted / Supervisor Reviewed / Supervisor Approved / Manager Approved / Returned), `returned_reason`.
- **DTR_Audit_Log:** Immutable log of every manual edit to any DTR day entry. Fields: `dtr_id`, `actor_id`, `actor_role` (Employee / Supervisor), `field_changed`, `old_value`, `new_value`, `reason_code`, `notes`, `timestamp`. Visible to Managers and HR Admins; read-only.
- **DTR_Manual_Reason_Code:** Predefined lookup table of allowed reasons for manual time entries. Values: `FORGOT_CLOCK_IN`, `FORGOT_CLOCK_OUT`, `GPS_FAILURE`, `KIOSK_OFFLINE`, `SYSTEM_ERROR`, `SCHEDULE_CHANGE`, `OTHER` (requires notes).
- **Payroll_Book:** Represents one Payroll Period (e.g., May 15–30).
- **Payroll_Sheet:** Child of Payroll_Book. Stores the frozen Gross-to-Net line items per employee.
- **Branch:** Stores geofence configuration — `geofence_lat`, `geofence_lng`, `geofence_radius_meters`.

---

## 5. Deep-Dive Workflows (Structural Logic for AI)

*The following logic dictates exactly how the front-end inputs manipulate the back-end database state.*

### Workflow 1: Employee Clock-In (DTR Generation) — Updated with Geofencing

- **Trigger:** Employee approaches Kiosk or uses ESS Mobile.
- **User Action:** Opens ESS → Taps "Clock In" → Browser requests location permission → Camera snaps selfie → Taps "Confirm".
- **System Logic:**
  1. Browser calls `navigator.geolocation.getCurrentPosition()` with a 10-second timeout.
  2. **Permission denied:** Clock-in is blocked. Error message: *"Location access is required to clock in. Please enable it in your browser settings."*
  3. **GPS timeout / no signal:** Clock-in is blocked. Error message: *"Unable to detect your location. Please move to an area with better signal and try again."*
  4. System receives `{ latitude, longitude, accuracy }` from the device.
  5. System queries Employee_Profile → fetches assigned Branch → retrieves `geofence_lat`, `geofence_lng`, `geofence_radius_meters`.
  6. System applies **Haversine formula** to calculate straight-line distance (meters) between device coordinates and branch center.
  7. **Accuracy buffer applied:** Effective allowed distance = `geofence_radius_meters + min(device_accuracy_meters, 30)`. This prevents false rejections from device GPS drift (capped at 30m buffer).
  8. **Distance > effective radius:** Clock-in is blocked. Error message: *"You are [X]m from [Branch Name]. You must be within [radius]m to clock in."*
  9. **Distance ≤ effective radius:** Proceed.
  10. Saves Attendance_Log: `{ employee_id, timestamp, latitude, longitude, accuracy_meters, geofence_passed: true, selfie_url }`.
  11. Computes against Shift_Schedule to identify Tardiness/Undertime minutes.
- **Final Output:** Updates the Daily_Time_Record row for that specific day.
- **Kiosk Exception:** Steps 1–8 are skipped. Kiosk is physically fixed at the branch. Attendance_Log records the kiosk's stored static coordinates.

### Workflow 2: Leave & Undertime (UT) Application

- **Trigger:** Employee needs to be absent or leave early.
- **User Action:** Opens ESS → "File Leave" or "File UT" → Selects dates → Uploads Medical Cert (if Sick Leave) → Submits.
- **System Logic:**
  1. Status set to Pending. System checks Leave_Entitlement balance.
  2. Routes to assigned Supervisor. Supervisor clicks "Approve".
  3. System deducts 1 day from Leave_Entitlement balance.
  4. System overwrites the Daily_Time_Record for that date, marking it "Paid Leave" (bypassing absence deductions).
- **Final Output:** Employee is paid basic rate for the day without penalization.

### Workflow 3: Overtime (OT) Application

- **Trigger:** Employee works beyond scheduled shift.
- **User Action:** ESS → "File OT" → Inputs exact hours (e.g., 2 hours) → Adds justification.
- **System Logic:**
  1. System cross-references the Attendance_Log. (Rejects OT if there is no actual clock-out time supporting the claim.)
  2. Routes to Manager. Manager clicks "Approve".
  3. System updates the Daily_Time_Record to reflect +2 Approved OT Hours.
- **Final Output:** The Payroll Engine will now query these 2 hours and apply the 125% multiplier during the next run. Unapproved OT is *ignored* by the engine.

### Workflow 4: Expense Claims & Reimbursements

- **Trigger:** Employee pays for a client meal or transportation.
- **User Action:** ESS → "Claims" → Uploads OR/Receipt photo → Inputs amount (₱500).
- **System Logic:**
  1. Routes to HR/Finance. Finance verifies receipt and clicks "Approve".
  2. System creates a Payroll_Adjustment record tagged as "Non-Taxable Addition".
  3. System attaches this record to the *next upcoming* Payroll_Book.
- **Final Output:** The ₱500 is added to the employee's Net Take-Home Pay in the next Payroll Sheet, completely bypassing the withholding tax computation.

### Workflow 5: Profile Update (Security Safeguard)

- **Trigger:** Employee changes bank accounts.
- **User Action:** ESS → "Edit Info" → Inputs new Bank Account number.
- **System Logic:**
  1. To prevent fraud, the Employee_Profile is NOT updated immediately.
  2. A Profile_Update_Request is generated and routed to HR Admin.
  3. HR verifies identity and clicks "Approve".
- **Final Output:** Database commits the change. The next bank file generation uses the new account.

### Workflow 6: HR Applying Company Holidays

- **Trigger:** A national holiday approaches.
- **User Action:** HR Admin → Settings → "Holiday Calendar" → Selects Date → Selects Type (e.g., Regular Holiday) → Selects Scope (Global vs Branch).
- **System Logic:**
  1. Holiday is saved to the Holiday_Calendar table.
  2. During the Payroll Run, the Engine intercepts the Daily_Time_Record for all employees on that date.
  3. If DTR = "No Log", Engine injects 100% Basic Pay (Holiday Pay).
  4. If DTR = "Present", Engine applies 200% multiplier to the base hours worked.
- **Final Output:** Automated premium pay without manual HR intervention.

### Workflow 7: End-to-End Payroll Run (The Book & The Sheet)

- **Trigger:** Payroll Cutoff ends (e.g., 15th of the month).
- **User Action:** HR navigates to "Payroll Book" → Clicks "Generate New Run".
- **System Logic:**
  1. **Locking:** System locks all DTRs for the period. No more employee edits allowed.
  2. **Initialization:** Creates a new Payroll_Book ID.
  3. **Batch Loop:** Engine loops through every active Employee_Profile.
  4. **Computation:** Executes the Gross-to-Net sequence (Section 1B), fetching base rates, approved OT, Lates, Holiday multipliers, Claims, and Statutory Tables.
  5. **Snapshot:** Generates a Payroll_Sheet record for each employee, permanently freezing the computed values so future salary raises don't retroactively alter past books.
- **Final Output:** HR reviews the master Payroll Sheet data grid. Clicks "Finalize". System generates Bank Advice CSVs and publishes secure digital Payslips to the ESS.

### Workflow 8: Final Pay & Offboarding Computation

- **Trigger:** Employee resigns or is terminated.
- **User Action:** HR → Employee Profile → "Initiate Offboarding" → Sets End Date.
- **System Logic (The Offboarding Engine):**
  1. **Access Revocation:** Schedules ESS lockout for the End Date.
  2. **Asset Clearance:** System queries Asset_Tracking. Flags HR if the employee has unreturned laptops/uniforms. HR can input a monetary deduction equivalent to the asset cost.
  3. **Leave Conversion:** Queries Leave_Entitlement. Converts unused Vacation Leaves into monetary value.
  4. **13th Month Proration:** Calculates YTD Basic Pay / 12.
  5. **Tax Annualization:** Calculates Total YTD Income vs. Total YTD Tax Withheld. Automatically generates a Tax Refund addition or Tax Payable deduction.
  6. **Final Computation:** Sums unpaid salary + 13th Month + Leave Cash-out + Tax Refund − Asset Deductions.
- **Final Output:** System generates a specialized Final Payroll_Sheet. Automatically populates the legal **Quitclaim** document and the final **BIR Form 2316** for the employee's signature.

### Workflow 10: Period DTR Submission & Approval Chain (New)

- **Trigger:** Cutoff period ends (e.g., May 31). Employee is notified via ESS to review and submit their DTR.
- **User Action (Employee):** ESS → DTR → "My DTR" → selects the current cutoff period → reviews each day's record → taps "Submit DTR".
- **System Logic:**
  1. System locks the employee's ability to add new Manual entries for that period after submission.
  2. Creates a `DTR_Submission` record with status = **Submitted**.
  3. DTR_Submission appears immediately on the HR Admin's DTR Records view, regardless of approval status.
  4. Notification sent to assigned Supervisor.
- **Supervisor Review:**
  1. Supervisor opens the DTR_Submission → sees each day as a row: Official Time In/Out (locked, greyed) + Manual Time In/Out (editable).
  2. Supervisor can edit the Manual Time In/Out on any day — must select a `DTR_Manual_Reason_Code` and optional notes.
  3. Every supervisor edit writes an immutable entry to `DTR_Audit_Log` (actor_role = Supervisor).
  4. Supervisor's manual entry overrides any existing employee manual entry for that day in the Effective layer.
  5. Supervisor clicks "Approve & Forward to Manager". Status → **Supervisor Approved**.
  6. Supervisor may also click "Return to Employee" with a note. Status → **Returned**.
- **Manager Review:**
  1. Manager opens the DTR_Submission → views the daily breakdown (Official + Manual + Effective columns) — all fields read-only.
  2. Manager can open the **DTR Audit Log** panel: see all manual edits (employee and supervisor), with timestamps and reasons.
  3. Manager clicks "Approve". Status → **Manager Approved**. DTR is now locked and eligible for the next Payroll Run.
  4. Manager may click "Return to Supervisor" with a note. Status → **Returned**.
- **Payroll Engine Rule:** Only DTR_Submissions with status = **Manager Approved** are consumed during a payroll run. Unapproved or returned submissions are flagged in the Payroll Pre-Run Review and must be resolved before the run can be finalized.
- **Final Output:** Approved DTR_Submission feeds the Gross-to-Net computation using Effective Time In/Out values for each day in the period.

### Workflow 11: Manual DTR Entry (Employee & Supervisor) (New)

- **Trigger:** An employee's Official clock-in or clock-out is missing, incorrect, or needs a legitimate correction.
- **Employee User Action:** ESS → DTR → selects the cutoff period → finds the affected day → taps the Manual Time In or Manual Time Out field.
- **System Logic (Employee):**
  1. System displays a form: Manual Time field (time picker) + Reason Code dropdown + Notes (required if Reason = OTHER).
  2. Employee cannot edit: Official Time In, Official Time Out, or Effective values directly.
  3. On submit: Manual value is saved. `DTR_Audit_Log` entry written (actor_role = Employee).
  4. The Effective layer immediately recalculates using the new Manual value.
  5. Employee can only enter manual entries before submitting the period DTR. After submission, the Manual fields are locked to the employee.
- **Supervisor User Action:** Admin Desktop → DTR Records → opens a DTR_Submission → selects the affected day row → clicks the Manual Time In or Manual Time Out cell.
  1. Same form appears: time picker + Reason Code + Notes.
  2. Supervisor can edit Manual entries at any point during their review, even after employee has already submitted.
  3. Supervisor's entry always takes precedence over the employee's manual entry in the Effective layer.
  4. `DTR_Audit_Log` entry written (actor_role = Supervisor).
- **Override Priority (Effective Layer):**
  - Priority 1: Supervisor's manual entry (if exists)
  - Priority 2: Employee's manual entry (if exists)
  - Priority 3: Official captured value (GPS/selfie)
- **Final Output:** The Effective Time In/Out reflects the correct values for payroll computation while the Official record remains permanently intact as the audit baseline.

### Workflow 9: HR Branch Geofence Setup (New)

- **Trigger:** A new branch is created, or HR needs to update an existing branch's geofence.
- **User Action:** HR Admin → Settings → Branch Management → Select Branch → "Configure Geofence".
- **System Logic:**
  1. HR is presented with an interactive map (Google Maps Embed API or Mapbox GL JS).
  2. HR drags a pin to the exact branch location (or searches the address to auto-center).
  3. HR sets the **enforcement radius** using a slider (minimum: 30m, maximum: 500m, default: 100m).
  4. A visual circle overlay shows the geofence boundary in real time on the map.
  5. HR clicks "Save Geofence".
  6. System writes `geofence_lat`, `geofence_lng`, `geofence_radius_meters` to the Branch record.
  7. System immediately begins enforcing the new geofence on all subsequent clock-ins for employees assigned to that branch.
- **Final Output:** Branch record updated. All affected employees will be subject to the new geofence on their next clock-in attempt.

---

## 6. Technical Implementation Notes

### GPS Geofencing — Implementation Spec

#### Tech Stack (Zero-Cost Core)

| Component | Technology | Cost | Purpose |
|---|---|---|---|
| Device Location | Browser Geolocation API (`navigator.geolocation`) | Free (built-in) | Retrieves device GPS coordinates |
| Distance Calculation | Haversine Formula (pure JS/backend math) | Free (no API) | Computes straight-line distance between two lat/lng points |
| Map UI for HR Setup | Google Maps Embed API or Mapbox GL JS | Free tier sufficient | Visual pin placement and radius circle for HR admin |
| Geofence Data | Branch table in app DB | — | Stores center coordinates + radius per branch |

#### Haversine Formula Reference

```
R = 6,371,000  // Earth radius in meters

φ1, φ2 = latitude of point 1 and 2 (in radians)
Δφ = φ2 − φ1
Δλ = λ2 − λ1

a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
c = 2 × atan2(√a, √(1−a))
distance = R × c  // Result in meters
```

This is computed server-side (not client-side) to prevent tampering.

#### GPS Accuracy & Drift Handling

Mobile GPS accuracy varies from ~5m (clear outdoor signal) to ~50m+ (indoors/urban canyon). To prevent legitimate employees from being falsely rejected:

- The device reports `coords.accuracy` — a radius in meters within which the true location lies.
- The system applies an **accuracy buffer:** effective allowed distance = `geofence_radius + min(coords.accuracy, 30)`.
- The 30m cap prevents abuse (employees in poor signal areas cannot exploit unlimited buffers).
- The raw accuracy value is logged to Attendance_Log for audit purposes.

#### Enforcement Radius Guidance for HR

| Branch Type | Recommended Radius |
|---|---|
| Single-floor office | 50–100m |
| Mall / multi-floor building | 100–150m |
| Outdoor / field site | 150–300m |
| Multi-building campus | 200–500m |

#### Kiosk Mode Exception

Kiosk devices are physically installed at the branch. GPS checks are not performed on Kiosk clock-ins. Instead, the system records the **Branch's stored geofence center coordinates** in the Attendance_Log as the clock-in location. This maintains a consistent audit trail.

#### Clock-In Error States

| Condition | User-Facing Message | System Action |
|---|---|---|
| Location permission denied | "Location access is required to clock in. Please enable it in your browser settings." | Block clock-in |
| GPS timeout (>10 seconds) | "Unable to detect your location. Please move to an area with better signal." | Block clock-in |
| Outside geofence | "You are [X]m from [Branch Name]. You must be within [radius]m to clock in." | Block clock-in, log attempt |
| Inside geofence | *(none — proceeds normally)* | Allow clock-in |

#### Audit Trail

Every Attendance_Log record stores:

```
{
  employee_id,
  timestamp,
  latitude,
  longitude,
  accuracy_meters,
  geofence_passed,       // true / false
  geofence_distance_m,   // actual computed distance
  geofence_radius_m,     // branch radius at time of attempt
  clock_in_method,       // "ESS_MOBILE" or "KIOSK"
  selfie_url
}
```

This allows HR to audit disputed clock-in rejections with full evidence.

---

*End of Blueprint v2.0*
