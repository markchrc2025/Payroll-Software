## What's Already Built ✅

### Admin Desktop (Part 2)
| Journey Phase | Implementation |
|---|---|
| Company setup — Branches, Departments, Positions, Work Locations, Shift Schedules | `/branches`, `/departments`, `/positions`, `/work-locations`, `/shift-schedules` |
| Holiday Calendar, Leave Policies, Pay Rules, Roles | `/settings/holidays`, `/settings/leave-policies`, `/settings/pay-rules`, `/settings/roles` |
| Employee create/edit/import (CSV bulk) | `/employees`, `/employees/new`, `/employees/[id]/edit`, `api/employees/bulk-import` |
| ATS — Job postings + Applicant pipeline | `/recruitment` + `api/job-postings`, `api/applicants` |
| Daily T&A dashboard + DTR override | `/attendance` |
| Leave approval (Admin) | `/leave` |
| OT approval (Admin) with approve/reject | `/ot-applications` |
| Expense claim approval (Admin) | `/expense-claims` |
| Profile update request approval | `/profile-update-requests` |
| Payroll run — generate, recompute, finalize | `/payroll`, `/payroll/[id]` |
| FINAL_PAY run type | Exists in payroll |
| Tax annualization | `api/payroll/runs/[id]/annualize` |
| Bank file generation (6 banks) | `api/payroll/runs/[id]/bank-files` |
| All statutory reports | SSS, PhilHealth, Pag-IBIG, BIR 1601-C, BIR 2316, Alphalist — all under `api/payroll/reports/` |
| Assets, Loans, Incidents, Movements | Dedicated pages + APIs |

### ESS Mobile (Part 3)
| Journey Phase | Implementation |
|---|---|
| GPS Clock-In / Clock-Out with selfie | `/ess/clock` |
| Leave filing | `/ess/leaves` |
| Payslip viewing (PIN-protected) | `/ess/payslips` |
| Kiosk clock-in (PIN entry) | `/(kiosk)` |

---

## Gaps — Missing from the User Journey 🔴

### ESS Module (High Priority)
These are defined in the User Journey but have **no ESS UI page**:

| Journey Step | Missing ESS Route | Notes |
|---|---|---|
| Step 7 — File OT Request | `/ess/ot-applications` | API (`api/ot-applications`) exists; ESS UI missing |
| Step 8 — File Undertime | `/ess/undertime` | Neither API nor UI exists |
| Step 9 — Submit Expense Claim | `/ess/expense-claims` | `api/ess/expense-claims` exists; ESS UI missing |
| Step 12 — Request Profile Update | `/ess/profile` | `api/ess/profile` exists; ESS UI missing |
| Step 13 — View Assigned Assets | `/ess/assets` | No ESS-side asset viewer |
| Step 6 — View Leave Balance | `/ess/leaves` (balance tab) | Needs balance sub-view (may be partial) |
| Step 14–15 — Offboarding final payslip + revocation notice | ESS lockout screen | No final confirmation screen |

### Admin Desktop (Medium Priority)
| Journey Step | Gap |
|---|---|
| Step 22–25 — Offboarding workflow | No "Initiate Offboarding" UI on `/employees/[id]`. Final Pay run type exists but the wizard (separation type, last day, asset clearance, quitclaim/2316 generation) is not wired up |
| Step 11 — 1-Click Convert Applicant to Employee | Needs verification — the recruitment page may not have this conversion trigger |
| Step 1 — Setup Wizard on first login | No guided onboarding wizard for new tenants |
| Step 8 — Employee bank account on profile update | Needs confirm this is editable in the employee edit page |

### Compliance / Reports
| Item | Status |
|---|---|
| Quitclaim auto-generation (PDF) | Not found — mentioned in blueprint |
| BIR 2316 PDF for final pay | API exists; PDF rendering needs confirmation |

---

## Recommended Build Order

```
1. ESS — OT filing page        (uses existing api/ot-applications)
2. ESS — Expense claims page   (uses existing api/ess/expense-claims)
3. ESS — Profile update page   (uses existing api/ess/profile)
4. ESS — Undertime filing      (new API + UI)
5. ESS — Asset viewer          (read-only)
6. Admin — Offboarding wizard  (/employees/[id]/offboard — highest complexity)
7. Admin — ATS 1-click convert to employee
```

The payroll engine, statutory reports, and approval workflows are well-built. The main gap is the **ESS self-service surface** — employees can clock in and view payslips, but can't file OT, claims, undertime, or manage their profile from mobile yet.