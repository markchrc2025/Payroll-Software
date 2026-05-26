# **Sentire Payroll: End-to-End Philippine Payroll Software Blueprint & Architecture**

**Target Market:** Philippine SMEs (Micro-businesses to Mid-Market enterprises with 500 \- 5,000+ employees).

**Objective:** A scalable, compliant, and automated HRIS & Payroll system with a premium user experience.

## **1\. Core Computation Engine (Philippine Labor Code Compliant)**

*This section defines the mathematical logic required for the backend architecture, derived from the standard DOLE rules and statutory agency tables.*

### **A. Salary Types & Conversion**

* **Monthly Paid Employees:** Fixed monthly rate. (Formula: (Monthly Rate x 12\) / Total Working Days in a Year \[e.g., 261, 313, 365\] \= Daily Rate)  
* **Daily Paid Employees:** Paid only for days worked. (Formula: Daily Rate x Days Worked)  
* **Hourly Rate Computation:** Daily Rate / Standard Hours per Day (usually 8\)  
* **Late/Undertime Deduction:** Computed per minute (Hourly Rate / 60\) \* Total Late/Undertime Minutes.

### **B. Gross-to-Net Computation Sequence (Method of Computation)**

*To ensure accuracy across all tiers, the system must follow this exact sequence during a payroll run:*

1. **Base Earnings:** Compute Base Pay for the current cutoff (e.g., Semi-monthly basic pay).  
2. **Deduct Tardiness:** Subtract Late and Undertime deductions based on the hourly rate.  
3. **Add Premium Pay:** Add Overtime (OT), Night Shift Differential (NSD), Rest Day, and Holiday premiums.  
4. **Add Taxable Allowances:** Add allowances subjected to tax (e.g., excess De Minimis, transportation allowances without liquidation).  
5. **Gross Taxable Income:** Sum of Steps 1 through 4\.  
6. **Deduct Statutory Contributions:** Subtract employee share for SSS, PhilHealth, and Pag-IBIG. *(Note: Contributions are usually deducted in specific cutoffs, e.g., SSS/PHIC on the 2nd half, HDMF on the 1st half, or split across both).*  
7. **Compute Withholding Tax:** Apply the BIR TRAIN Law tax table to the resulting amount after Step 6\.  
8. **Add Non-Taxable Allowances:** Add standard De Minimis benefits (Rice subsidy, Laundry, etc.) and non-taxable reimbursements.  
9. **Deduct Loans/Others:** Subtract SSS Loans, HDMF Loans, company cash advances, and other custom deductions.  
10. **Net Take-Home Pay:** The final payable amount transferred to the employee's bank account.

### **C. Premium & Overtime Multipliers (DOLE Standards)**

* **Regular Work OT:** 125% (1.25)  
* **Night Shift Differential (NSD):** \+10% (0.10) for work between 10:00 PM and 6:00 AM.  
* **Rest Day Work:** 130% (1.30)  
* **Rest Day OT:** 169% (1.69)  
* **Special Non-Working Holiday:** 130% (1.30)  
* **Special Holiday OT:** 169% (1.69)  
* **Special Holiday falling on Rest Day:** 150% (1.50)  
* **Special Holiday \+ Rest Day OT:** 195% (1.95)  
* **Regular Holiday:** 200% (2.0)  
* **Regular Holiday OT:** 260% (2.60)  
* **Regular Holiday falling on Rest Day:** 260% (2.60)  
* **Regular Holiday \+ Rest Day OT:** 338% (3.38)  
* **Double Holiday Worked:** 300% (3.0)

### **D. Statutory Deductions (2024/2025 Rates)**

* **SSS (Social Security System):** Table-based computation based on Monthly Salary Credit (MSC). (e.g., 2025 Table: EE share, ER share, EC, WISP).  
* **PhilHealth:** 5% of basic salary, split 50/50 between EE and ER. Floor: ₱10,000 / Ceiling: ₱100,000.  
* **Pag-IBIG (HDMF):** 2% EE / 2% ER based on Monthly Fund Salary (MFS) capped at ₱10,000 (Max contribution ₱200 EE / ₱200 ER).  
* **Withholding Tax (TRAIN Law):** Semi-monthly/Monthly tax tables based on taxable income after non-taxable allowances and statutory deductions.

## **2\. Platform Feature Modules**

### **Module 1: Employee Information Management (Core HRIS)**

*Must be highly scalable through bulk uploads and pagination to handle 5,000+ records smoothly.*

* **Comprehensive Profile:** Name, contact, address, civil status, birthdate, gender.  
* **Statutory IDs:** TIN, SSS, PhilHealth, Pag-IBIG numbers.  
* **Multi-Location & Branch Management:** Explicitly tag and group employees by physical locations, branches, or stores. This enables location-specific reporting, filtered payroll runs, and assigning specific geofences to specific branches.  
* **Employment Details:** Hire date, regularisation date, job title, department.  
* **Employee Lifecycle & Movement:** Generate and track digital Movement Forms for department transfers, branch reassignments, promotions, and salary adjustments.  
* **Incident Management:** Create, attach, and track Incident Reports (IR), Notice to Explain (NTE), disciplinary actions, and memos directly within the employee's 201 file.  
* **Salary Details:** Basic pay, pay frequency (Semi-monthly, Monthly, Weekly), Bank Account details for payroll crediting.  
* **Document Management:** Upload 201 file documents (contracts, valid IDs, medical clearances).  
* **Bulk Operations:** CSV/Excel mass import/export for employee onboarding and mass salary updates.

### **Module 2: Time & Attendance (T\&A)**

* **Digital Time Clock (Employee Login/Out):**  
  * **Web/Mobile Access (Personal Device):** Employees log in to their ESS portal via their personal mobile browser or dedicated app.  
  * **Shared Device Kiosk Mode (Cross-Platform):** A specialized web-based interface that turns ANY device (tablet, desktop PC, or spare smartphone browser) into a centralized punch clock for a specific branch or location. Employees without personal smartphones can simply approach the kiosk, enter their unique Employee PIN (or scan a printed QR badge), and time in/out.  
  * **Selfie Requirement:** Upon clicking "Time In" or "Time Out" (whether on personal ESS or the Kiosk), the application requires camera access to capture a live selfie. This prevents buddy-punching.  
  * **GPS & Geofencing:** The system captures the device's exact GPS coordinates. Admins can set distinct "Geofences" per branch (e.g., 50-meter radius around the Makati office vs. the Cebu warehouse). If a personal device log is outside the radius, it is flagged or rejected.  
* **Alternative Timekeeping Inputs:**  
  * Manual entry (Admin/HR only).  
  * Bulk upload of raw timesheet data (CSV from biometrics).  
  * *(Future Scaling)* API integration with existing biometric devices (ZKTeco, etc.).  
* **Schedule/Shift Management & Cross-Midnight Rules:**  
  * Create fixed shifts and flexible shifts.  
  * **Cross-Midnight Overtime Recognition:** Advanced shift logic that accurately identifies and attributes work hours, Night Shift Differentials (NSD), and Overtime when a single shift or OT session crosses over midnight into a new calendar day or a holiday.  
* **Leave Entitlement & Management:**  
  * **Earning Policies:** Custom leave accrual rules (e.g., earn 1.25 days per month worked, or lump-sum grant upon regularization).  
  * **Historical Reports:** Detailed ledger of leave credits earned, used, expired, and converted to cash.  
  * **Filing & Workflows:** Leave requests with multi-level approval workflows and automatic payroll deduction/conversion.  
* **Customizable DTR Submission & Approval Workflow:**  
  * To ensure tight rules, employees must review and "Submit" their Daily Time Record (DTR) at the end of the cutoff.  
  * **Routing:** Submitted DTRs route to the assigned Supervisor for Verification \-\> then to the Department Manager for Final Approval \-\> finally unlocked for HR/Payroll Processing.  
  * **Flexibility:** This approval chain is fully customizable per company (e.g., flat organizations can skip the supervisor step).

### **Module 3: Dynamic Payroll Processing**

* **Custom Allowances:**  
  * Create dynamic allowances (Rice Subsidy, Laundry, Medical, Transportation).  
  * Toggle configurations: Taxable vs. Non-Taxable (De Minimis limits).  
  * Frequency toggles: Every payroll period, first half only, second half only.  
* **Highly Customizable Deductions:**  
  * **Government Mandatories:** While utilizing strict DOLE/Agency tables by default, admins can fully customize SSS, PhilHealth, and Pag-IBIG settings. Includes overriding standard computations for specific employees, setting voluntary elevated contribution amounts (e.g., saving ₱1,000 for Pag-IBIG instead of the ₱200 mandate), and choosing exact cut-off deduction schedules.  
  * **Loans & Advances:** Manage SSS Loans, Pag-IBIG Salary Loans, Company Cash Advances. Track running balances and auto-stop deductions when fully paid.  
* **13th Month Pay Computation:** Automated prorated 13th-month pay calculation (Total Basic Salary earned in a year / 12).  
* **Final Pay / Quitclaim Computation:** Prorated 13th month, remaining leave conversions, tax refunds, and hold-out periods for resigning employees.  
* **One-Click Payroll Run:** Generate gross-to-net computations for thousands of employees in seconds based on approved DTRs.  
* **Payroll Register Review:** Detailed breakdown table (Basic, OT, Allowances, Gross, Statutory, Tax, Net) prior to finalization.

### **Module 4: Compliance & Reporting Analytics**

* **Advanced Payroll & Timesheet Reporting:**  
  * **Payroll Reports:** Downloadable, comprehensive Gross-to-Net registers, YTD (Year-to-Date) earnings reports, active loan balance summaries, and payroll variance reports (comparing current vs. previous cutoff).  
  * **Timesheet & Attendance Reports (Data Slicing):** Advanced timesheet analytics allowing HR/Admins to slice, dice, and pivot attendance data by *Department, Location, Branch, Cost Center, or specific Date Ranges*. Essential for tracking Overtime spend, identifying absenteeism trends, and allocating manpower costs accurately across different business units.  
* **Bank Advice/Files:** Generate standard bank text/CSV files for direct deposit (BDO, BPI, Metrobank, Security Bank, UnionBank).  
* **Statutory Reports:**  
  * SSS R-1A, R-3 forms / electronic files.  
  * PhilHealth ER2, RF1.  
  * Pag-IBIG MCRF.  
* **BIR Tax Compliance:**  
  * Monthly 1601-C data generation.  
  * Annualization (Year-end tax computation to determine tax payable vs. refund).  
  * BIR Form 2316 generation for all employees.  
  * Alphalist formatting.

### **Module 5: Employee Self-Service (ESS) Portal**

* **Employee Dashboard:** Mobile-responsive web app. Employees log in using their company email/phone and a secure password.  
* **Secure Payslip Access:**  
  * **View & Download:** Employees can view current and historical payslips.  
  * **Security:** Opening a payslip PDF or viewing the detailed breakdown requires a secondary PIN (e.g., a custom 4-digit PIN or their Date of Birth / TIN) to prevent shoulder-surfing.  
  * **Payslip Details:** Displays complete Gross-to-Net breakdown, YTD tax withheld, running loan balances, and remaining leave credits.  
* **Leave, Overtime & Adjustments:** Apply for leave, file for Overtime, Official Business (OB), or missed log adjustments with mandatory reason fields and attachment uploads.  
* **Dispute Mechanism:** A button on the DTR/Payslip view to "Report an Issue" directly to HR regarding missed OT or incorrect late deductions.

### **Module 6: Multi-Tenant Central Portal & Dynamic RBAC**

* **Multi-Tenant Master Portal:** A central administration layer for the SaaS owner/support team to manage all client organizations, monitor usage, process billing, and deploy global statutory table updates without touching individual client databases.  
* **Dynamic Roles & Permissions (Client Level):**  
  * Client organizations are not locked into rigid "Admin vs Employee" roles.  
  * HR administrators can create custom roles (e.g., "Payroll Master", "Line Supervisor", "Night Shift Manager", "Read-Only Auditor").  
  * **Granular Control:** Assign exact permissions (Create, Read, Update, Delete, Approve) for specific modules (e.g., a Supervisor can approve DTRs for their specific department but cannot view salary rates).

## **3\. Tiered Packaging Strategy**

*Based on your Financial Model pricing, structured to scale functionality as the business grows.*

### **Tier 1: Starter (₱299 Base \+ ₱49/employee)**

*Target: Micro-SMEs (1 \- 10 employees)*

* **Core HR:** Basic Employee Profiles, 201 File storage.  
* **Payroll:** Manual time entry / Basic timesheet upload.  
* **Computations:** Automated basic pay, SSS, PhilHealth, Pag-IBIG, and Withholding Tax.  
* **Allowances:** Standard De Minimis setup.  
* **Outputs:** Standard PDF Payslips (Admin downloads and distributes manually), Basic Payroll Register report.  
* *Limitation:* Single admin user, no bank file generation, no ESS portal (no selfie time clock), standard non-editable roles, single location only.

### **Tier 2: Growth (₱799 Base \+ ₱39/employee)**

*Target: Small Businesses (11 \- 30 employees)*

* **Everything in Starter, plus:**  
* **Employee Self-Service (ESS):** Digital payslip viewing, Leave filing, OT filing.  
* **Time & Attendance:** Digital Time Clock with Selfie & Geofencing via personal device.  
* **Kiosk Mode:** Access to the cross-platform Shared Device Kiosk (Tablet/Browser) for remote/branch employees without smartphones.  
* **Payout:** Bank File Generation (BPI, BDO, UnionBank, etc.).  
* **Compliance:** Generation of 1601-C data, SSS/PHIC/HDMF transmittal files.  
* **HRIS Extras:** Basic Incident Reports and Leave Entitlement Engine.  
* **Users:** Up to 3 Admin/HR/Manager roles.

### **Tier 3: Pro / Enterprise (₱1,999 Base \+ ₱29/employee)**

*Target: Medium to Large Enterprises (31 \- 5,000+ employees)*

* **Everything in Growth, plus:**  
* **Mass Scale Operations:** High-performance bulk processing, bulk shift assignments, mass salary adjustments.  
* **Organizational Complexity:** Advanced Multi-Location & Branch Management (unlimited branches, specific geo-fencing per location), Cost Center allocation, Departmental rollups, Movement Forms.  
* **Advanced T\&A & Analytics:** Cross-Midnight shift logic, Custom DTR routing workflows, and Full Timesheet/Payroll Data Slicing (by department/branch).  
* **Advanced Taxation:** Year-end Annualization, BIR Form 2316 auto-generation, Alphalist dat-file generation.  
* **Security & Audit:** Dynamic Roles and Permissions (Custom RBAC), Comprehensive Audit Logs (who edited what salary/time log and when), SSO (Single Sign-On).  
* **Integrations:** Developer API access (for pushing biometric data or integrating with external ERPs/Accounting software).

## **4\. Technical Non-Functional Requirements (for the AI)**

* **UI/UX & Branding (Sentire Payroll):** The platform must embody the **Sentire Payroll** brand identity with a premium, professional "blue-themed" design language. Prioritize high-quality UX and UI—clean layouts, intuitive navigation, ample whitespace, and fast, responsive data tables capable of handling thousands of rows smoothly. *(Directives for AI: Utilize Tailwind CSS deep blue and slate color palettes, and leverage premium component libraries like shadcn/ui to achieve a modern, trustworthy, and enterprise-grade feel).*  
* **Database Scalability:** Use relational databases (PostgreSQL/MySQL) with proper indexing on company\_id, employee\_id, and payroll\_period to ensure calculations for 5,000 employees complete in under 10 seconds. Implement strict Multi-Tenant isolation at the database query level.  
* **Precision:** Use Decimal data types for all monetary values to prevent floating-point rounding errors (crucial for tax and statutory calculations).  
* **Security:** PII (Personally Identifiable Information) and bank details must be encrypted at rest. Selfie images should be stored in secure cloud buckets (e.g., AWS S3) with signed URLs.  
* **Auditability:** Implement soft deletes and historical tracking. When a tax rate, department, or salary changes, historical payroll runs and DTRs must *not* be affected. Use effective dating for salary and policy increments.