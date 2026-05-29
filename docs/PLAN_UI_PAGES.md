# Plan: Remaining UI Pages — Phases 1–7

> Materialized 2026-05-29. Reflects Blueprint §2.2, §2.3, §2.4, §2.5, §2.6, §2.8, §1.2, §1.1, §5.7, §8.
> Covers the 13 unbuilt UI areas identified in the coverage audit after Priorities 1–6 completed.

## Context & Conventions

All dashboard pages follow the established pattern: `"use client"` directive, `useEffect` on mount for data fetch, `<Table>` list with `<Skeleton>` loading rows, `<Sheet>` for create/edit forms, `toast()` (sonner) for feedback. Button navigation uses `Button render={<Link href="..." />}`. `DropdownMenuTrigger` uses `buttonVariants({ variant, size })` as `className` (no `asChild`). Money is stored as `BigInt` centavos; display via `Number(cents) / 100` formatted as `₱#,###.##`. All API responses via `centavosToJson()`. Selects use `onValueChange={(v) => setState(v ?? fallback)}`.

Status badges use `<Badge>` with variant. Recommended palette:
- PENDING / DRAFT → `secondary`
- OPEN / ACTIVE / SUBMITTED → `default` (blue)
- APPROVED / FINALIZED → `outline` green
- REJECTED / CANCELLED → `destructive`
- FOR_REVIEW / ON_HOLD → yellow (custom className)

Permissions: `requirePermission(req, "MODULE", "ACTION")` guards all admin API routes. ESS routes use `getEssContext(req)`. SUPER_ADMIN routes use `getSuperAdminContext()`.

---

## Phase 1 — CRUD Extensions

*Four pages/tabs that follow the simplest Table+Sheet pattern. No multi-stage workflows. Can be built in parallel.*

### 1A — Positions (5th tab in Settings)

**File to modify**: `src/app/(dashboard)/settings/page.tsx`

Add a 5th tab labelled "Positions" with icon `Briefcase` (lucide). Mirror the structure of the existing "Roles" tab in that file: a `PositionsTab` component defined inline. State shape: `positions[]`, `isLoading`, `sheetOpen`, `editing: Position | null`, `form: { title, level, description }`, `submitting`.

**APIs used**:
- `GET /api/positions` — permission: `SETTINGS:READ`. Returns `{ id, title, level, description, _count: { employees } }[]`
- `POST /api/positions` body: `{ title, level, description? }`
- `PATCH /api/positions/[id]` body: same fields, partial
- `DELETE /api/positions/[id]`

**Table columns**: Title, Level badge (`ENTRY` / `MID` / `SENIOR` / `MANAGER` / `DIRECTOR` / `EXECUTIVE` — each a different badge color), Description (truncated to 60 chars), Employee Count (from `_count.employees`), Actions (Edit + Delete).

**Sheet fields**: `title` (Input, required), `level` (Select — 6 options), `description` (Textarea, optional).

**Notes**: Soft-delete only. The `createSchema` in the positions API currently lists 5 levels (`ENTRY`→`DIRECTOR`); add `EXECUTIVE` to the UI select but also confirm the schema accepts it.

---

### 1B — Loans Page

**File to create**: `src/app/(dashboard)/loans/page.tsx`

**Nav addition** in `src/app/(dashboard)/layout.tsx`: Operations section, between Payroll and Reports. Icon: `CreditCard`. Label: "Loans". `href: "/loans"`.

**APIs used**:
- `GET /api/loans` — filter: `employeeId`, `status`, `loanType`, `page`, `limit`
- `POST /api/loans` body: `{ employeeId, loanType, principalCents, installmentAmountCents, startDate, referenceNumber?, notes? }`
- `PATCH /api/loans/[id]` body: `{ referenceNumber?, installmentAmountCents?, notes?, status? }`
- `POST /api/loans/[id]/cancel`

**State shape**: `loans[]`, `isLoading`, `sheetOpen`, `editing: Loan | null`, `form { employeeId, loanType, principal, installment, startDate, referenceNumber, notes }`, `employees[]` (fetched once from `GET /api/employees?limit=500` for select), `submitting`.

**Table columns**: Employee (lastName, firstName + employeeNumber), Loan Type badge (SSS=blue, PAGIBIG=green, CASH_ADVANCE=yellow, COMPANY=secondary), Principal ₱, Installment ₱, Balance ₱, Status badge (ACTIVE=default, PAID=outline, CANCELLED=destructive, ON_HOLD=secondary), Start Date, Actions.

**Filters** (above table): status Select, loanType Select.

**Sheet fields (Create)**: employeeId (searchable Select — pre-fetch employees list), loanType (Select), principal amount peso input (convert on submit: `Math.round(parseFloat(val) * 100)`), installment amount peso input, startDate (Input `type="date"`), referenceNumber (optional), notes (Textarea, optional).

**Sheet fields (Edit)**: referenceNumber, installmentAmount, notes. Do not allow editing employeeId, loanType, or principal after creation.

**Row actions**: Cancel button visible only on ACTIVE loans — show a `<Dialog>` confirm before `POST /api/loans/[id]/cancel`.

---

### 1C — Expense Claims Page

**File to create**: `src/app/(dashboard)/expense-claims/page.tsx`

**Nav addition**: Operations section, after Loans. Icon: `Receipt`. Label: "Expenses". `href: "/expense-claims"`.

**APIs used**:
- `GET /api/expense-claims` — filter: `employeeId`, `status`, `dateFrom`, `dateTo`, `page`, `limit`
- `POST /api/expense-claims` body: `{ employeeId, claimDate, description, totalAmountCents, category, taxTreatment, receiptUrl? }`
- `POST /api/expense-claims/[id]/submit`
- `POST /api/expense-claims/[id]/approve` body: `{ taxTreatment }`
- `POST /api/expense-claims/[id]/reject` body: `{ rejectionReason }`
- `POST /api/expense-claims/[id]/attach` body: `{ targetPayrollBookId }`

**Status workflow** (displayed as badges + action buttons in the row):
- `DRAFT` → Submit button (POST `.../submit`)
- `SUBMITTED` → Approve button (opens ApproveSheet) + Reject button (opens RejectSheet)
- `APPROVED` → Attach button (opens AttachSheet — dropdown of DRAFT payroll runs from `GET /api/payroll/runs?status=DRAFT`)
- `ATTACHED` / `REJECTED` — no further actions

**Table columns**: Employee, Date, Description (truncated), Amount ₱, Tax Treatment, Status badge, Actions.

**Create Sheet fields**: employeeId (Select), claimDate (Input date), description (Input), amount peso (Input), category (Input), taxTreatment (Select: `GROSS_UP` / `NORMAL`), receiptUrl (optional).

**Approve Sheet**: taxTreatment Select (required), Submit.

**Reject Sheet**: rejectionReason Textarea (required), Submit.

**Attach Sheet**: payrollBookId Select (label: period start–end from the run list), Submit.

---

### 1D — Assets Page

**File to create**: `src/app/(dashboard)/assets/page.tsx`

**Nav addition**: Workforce section, after Branches. Icon: `PackageSearch`. Label: "Assets". `href: "/assets"`.

**APIs used**:
- `GET /api/assets` — filter: `status`, `category`, `page`, `limit`
- `POST /api/assets` body: `{ assetCode, name, category, brand?, model?, serialNumber?, purchaseDate?, purchaseCostCents?, condition, notes? }`
- `PATCH /api/assets/[id]`
- `DELETE /api/assets/[id]`
- `POST /api/assets/[id]/assign` body: `{ employeeId, conditionAtAssign, assignmentNotes? }`
- `POST /api/assets/[id]/return` body: `{ conditionAtReturn, returnNotes? }`

**Table columns**: Asset Code, Name, Category, Brand/Model, Status badge (AVAILABLE=default, ASSIGNED=outline, UNDER_REPAIR=secondary, RETIRED=secondary, DISPOSED=destructive), Condition badge, Assigned To (employee name from current assignment or "—"), Purchase Cost ₱, Actions.

**Create Sheet**: assetCode (Input), name, category (Input free-text), brand?, model?, serialNumber?, purchaseDate (Input date), purchaseCost peso, condition (Select: `EXCELLENT` / `GOOD` / `FAIR` / `POOR` / `DAMAGED`), notes?.

**Edit Sheet**: name, category, condition, notes. Status is changed via Assign/Return actions, not direct edit.

**Assign Sheet** (opens when status=`AVAILABLE`): employeeId (Select from employees list), conditionAtAssign (Select), assignmentNotes?.

**Return Sheet** (opens when status=`ASSIGNED`): conditionAtReturn (Select), returnNotes?.

**Row actions**: Edit always available. Assign when `AVAILABLE`. Return when `ASSIGNED`. Delete (soft) when `AVAILABLE` only.

---

## Phase 2 — HR Approval Workflows

*Four pages with multi-stage status, rejection flows, and conditional action buttons. Build in order: Incidents → Movements → OT Applications → Profile Requests.*

### 2A — Incidents / NTE Page

**File to create**: `src/app/(dashboard)/incidents/page.tsx`

**Nav addition**: new **"HR Ops"** section (between Workforce and Operations sections). Icon: `AlertCircle`. Label: "Incidents". `href: "/incidents"`.

**APIs used**:
- `GET /api/incidents` — filter: `type`, `status`, `employeeId`, `page`, `limit`
- `POST /api/incidents` body: `{ employeeId, type, subject, description, incidentDate, responseDeadline?, attachmentUrls? }`
- `PATCH /api/incidents/[id]` body: `{ subject?, description?, status?, responseDeadline?, employeeResponse? }`
- `POST /api/incidents/[id]/resolve` body: `{ resolution }`

**Table columns**: Employee, Type badge (`NTE`=yellow, `INCIDENT_REPORT`=secondary, `NOTICE_OF_DECISION`=default, `DISCIPLINARY_ACTION`=destructive, `COMMENDATION`=outline, `MEMO`=secondary, `OTHER`=secondary), Subject (truncated), Incident Date, Deadline, Status badge (`OPEN`=default, `UNDER_REVIEW`=secondary, `RESOLVED`=outline, `CLOSED`=secondary, `ESCALATED`=destructive), Actions.

**Filters**: type Select, status Select, employee search (Input, debounce 300ms → adds `employeeId` query param).

**Create Sheet**: employeeId (Select), type (Select over `IncidentType` enum), subject (Input), description (Textarea), incidentDate (Input date), responseDeadline (Input date, optional).

**Edit Sheet**: subject, description, status (Select), responseDeadline, employeeResponse (Textarea — employee's written reply).

**Resolve Sheet** (visible on `OPEN` / `UNDER_REVIEW` rows): resolution Textarea (required). On submit: `POST /api/incidents/[id]/resolve { resolution }`.

---

### 2B — Employee Movements Page

**File to create**: `src/app/(dashboard)/movements/page.tsx`

**Nav addition**: HR Ops section. Icon: `ArrowRightLeft`. Label: "Movements". `href: "/movements"`.

**APIs used**:
- `GET /api/movements` — filter: `status`, `employeeId`, `page`, `limit`
- `POST /api/employees/[id]/movements` body: `{ movementType, effectiveDate, reason?, notes?, fromX?, toX? }` — X fields depend on movementType
- `POST /api/movements/[id]/approve`
- `POST /api/movements/[id]/reject` body: `{ rejectionReason }`
- `POST /api/movements/[id]/cancel`

**Table columns**: Employee, Movement Type badge, Effective Date, Change Summary (dynamic: "→ Engineering" for dept transfer, "+₱5,000" for salary adj), Status badge (`PENDING`=secondary, `FOR_REVIEW`=yellow, `APPROVED`=outline, `REJECTED`=destructive, `CANCELLED`=destructive), Actions.

**Filters**: status Select, movementType Select.

**Create Sheet** — fields shown/hidden dynamically based on `movementType`:
- All types: employeeId (Select), movementType (Select over `MovementType` enum), effectiveDate (Input date), reason (Textarea), notes?.
- `DEPARTMENT_TRANSFER`: fromDepartmentId + toDepartmentId (Select from departments list).
- `BRANCH_TRANSFER`: fromBranchId + toBranchId (Select from branches list).
- `PROMOTION` / `DEMOTION`: fromPositionId + toPositionId (Select from positions list); optionally fromBasicSalaryCents / toBasicSalaryCents.
- `SALARY_ADJUSTMENT`: fromBasicSalaryCents + toBasicSalaryCents (peso inputs).
- `STATUS_CHANGE` / `REGULARIZATION`: fromStatus + toStatus (Select over `EmploymentStatus` enum).
- `TITLE_CHANGE`: fromJobTitle + toJobTitle (Input).

**Approval two-stage**: `PENDING` → Approve (POST `/approve`) or Reject (Sheet with rejectionReason) or Cancel. `FOR_REVIEW` → Approve again (same endpoint, second stage) or Reject. The approver cannot be the creator — API enforces this (returns 403); show toast "You cannot approve your own request" on 403.

---

### 2C — OT Applications Page

**File to create**: `src/app/(dashboard)/ot-applications/page.tsx`

**Nav addition**: Operations section, between "Time & Attendance" and "Leave". Icon: `Clock`. Label: "OT Applications". `href: "/ot-applications"`.

**APIs used**:
- `GET /api/ot-applications` — filter: `employeeId`, `status`, `dateFrom`, `dateTo`, `page`, `limit`
- `POST /api/employees/[id]/ot-applications` body: `{ date, hoursRequested, justification }`
- `POST /api/ot-applications/[id]/approve` — permission: `TIMESHEETS:APPROVE`; idempotent
- `POST /api/ot-applications/[id]/reject` body: `{ rejectionReason? }`

**Table columns**: Employee, Date, Hours Requested, Justification (truncated to 80 chars), Status badge (`PENDING`=secondary, `APPROVED`=outline, `REJECTED`=destructive, `CANCELLED`=destructive), Submitted At, Actions.

**Filters**: status Select, dateFrom / dateTo (Input dates).

**Create Sheet**: employeeId (Select), date (Input date), hoursRequested (Input number, step 0.5, min 0.5, max 24), justification (Textarea).

**Row actions (PENDING only)**: Approve button (direct POST, no sheet), Reject button (opens a small sheet with optional rejectionReason Textarea).

**Note**: `POST /api/ot-applications/[id]/approve` also sets `otMinutes` on the linked `DTRRecord` if one exists for that date — purely server-side, UI just shows the updated status.

---

### 2D — Profile Update Requests Page

**File to create**: `src/app/(dashboard)/profile-update-requests/page.tsx`

**Nav addition**: HR Ops section. Icon: `UserCog`. Label: "Profile Requests". `href: "/profile-update-requests"`.

**⚠️ Missing API**: There is no tenant-wide `GET /api/profile-update-requests` endpoint. Before building the UI, create `src/app/api/profile-update-requests/route.ts` with a `GET` handler that calls `getAuthContext`, queries `tx.profileUpdateRequest.findMany({ where: { tenantId }, include: { employee: { select: { id, employeeNumber, firstName, lastName } } }, orderBy: { createdAt: "desc" }, skip, take })`. Filters: `status`, `employeeId`, `page`, `limit`.

**APIs used**:
- `GET /api/profile-update-requests` (new endpoint above)
- `POST /api/profile-update-requests/[id]/approve` — commits the field change to the Employee row atomically
- `POST /api/profile-update-requests/[id]/reject` body: `{ rejectionReason? }`

**Table columns**: Employee, Field (human-readable label mapping — `bankAccountNumber` → "Bank Account Number", `firstName` → "First Name", etc.), Old Value (masked: `bankAccountNumber` / `bankAccountName` show last 4 chars only; all others shown plain), Requested Value (same masking), Status badge, Submitted At, Actions.

**No Create form on this page** — employees submit via ESS (`POST /api/ess/profile`); HR admins can submit via the employee detail edit page.

**Row actions (PENDING only)**: Approve button (direct POST), Reject button (Sheet with optional rejectionReason).

---

## Phase 3 — Recruitment / ATS

### 3A — Recruitment Page

**File to create**: `src/app/(dashboard)/recruitment/page.tsx`

**Nav addition**: new **"Talent"** section (after HR Ops, before Operations). Icon: `Users2`. Label: "Recruitment". `href: "/recruitment"`.

Two tabs using the same `<Tabs>` pattern as `/leave`: **Job Postings** | **Applicants**.

---

#### Tab 1 — Job Postings

**APIs used**:
- `GET /api/job-postings` — filter: `status`, `departmentId`, `branchId`, `positionId`, `page`, `limit`
- `POST /api/job-postings` body: `{ title, code?, departmentId?, branchId?, positionId?, headcount, description?, status }`
- `PATCH /api/job-postings/[id]` — partial update including status
- `DELETE /api/job-postings/[id]` — soft-delete; only `DRAFT` or `CLOSED`

**Table columns**: Code, Title, Department, Branch, Position, Headcount, Status badge (`DRAFT`=secondary, `OPEN`=default, `CLOSED`=secondary, `ON_HOLD`=yellow), Opened At, Actions.

**Status actions** (inline buttons in row):
- `DRAFT` → "Open" button → `PATCH { status: "OPEN", openedAt: new Date().toISOString() }`
- `OPEN` → "Close" button → `PATCH { status: "CLOSED", closedAt: new Date().toISOString() }`

**Create/Edit Sheet**: title (Input), code (Input, optional), departmentId (Select), branchId (Select), positionId (Select), headcount (Input number, default 1), description (Textarea, optional).

---

#### Tab 2 — Applicants

**⚠️ Missing API routes**: the directories `src/app/api/applicants/[id]/advance/`, `hire/`, `reject/`, `notes/` exist but contain no `route.ts` files. Create them before building the UI:
- `advance/route.ts`: `POST` — advances stage by one step (`APPLIED→SCREENING→INTERVIEW→ASSESSMENT→OFFER`). Returns updated applicant.
- `reject/route.ts`: `POST` body `{ rejectionReason }` — sets stage to `REJECTED`.
- `hire/route.ts`: `POST` — creates an `Employee` record from applicant data (firstName, lastName, email), sets `hiredEmployeeId` on the Applicant row, returns `{ employeeId }`.
- `notes/route.ts`: `GET` — list notes for applicant; `POST` body `{ body }` — creates `ApplicantNote`.

**APIs used** (once created):
- `GET /api/applicants` — filter: `jobPostingId`, `stage`, `source`, `page`, `limit`
- `POST /api/applicants` body: `{ jobPostingId, firstName, lastName, email?, phone?, source, assignedToUserId? }`
- `PATCH /api/applicants/[id]` body: `{ stage?, rating?, assignedToUserId?, rejectionReason? }`
- `POST /api/applicants/[id]/advance`
- `POST /api/applicants/[id]/reject` body: `{ rejectionReason }`
- `POST /api/applicants/[id]/hire` → returns `{ employeeId }`, then redirect to `/employees/[employeeId]`
- `GET /api/applicants/[id]/notes` + `POST /api/applicants/[id]/notes` body: `{ body }`

**Table columns**: Name (firstName + lastName), Email, Phone, Job Posting (title), Source badge, Stage badge (`APPLIED`=secondary, `SCREENING`=yellow, `INTERVIEW`=default, `ASSESSMENT`=default, `OFFER`=outline, `HIRED`=outline green, `REJECTED`=destructive), Rating (1–5 rendered as ★ glyphs), Assigned To, Actions.

**Filters**: jobPostingId (Select from job postings list), stage Select.

**Add Applicant Sheet**: jobPostingId (Select, required), firstName, lastName, email?, phone?, source (Select: `ONLINE_POSTING` / `REFERRAL` / `HEADHUNTED` / `WALK_IN` / `AGENCY`), assignedToUserId?.

**Row actions**: Advance Stage button (`POST /advance`), Reject (Sheet with rejectionReason), Hire (`POST /hire` → redirect to `/employees/[employeeId]`).

**Rating**: clicking a star (1–5) calls `PATCH /api/applicants/[id] { rating: n }`.

**Notes Sheet**: `<Sheet>` showing existing notes (fetched from `GET .../notes`) as a read-only list + a Textarea + Submit button (`POST .../notes { body }`). Open via a Notes icon button in the row.

---

## Phase 4 — ESS PWA

*Separate route group. Mobile-first. No shared layout with the tenant dashboard. ESS Bearer token stored in `localStorage`.*

**New route group root**: `src/app/(ess)/`

### 4A — ESS Layout

**File to create**: `src/app/(ess)/layout.tsx`

A minimal `"use client"` layout. No sidebar. Full viewport height. Bottom navigation bar with 4 tabs: Home (`/ess`), Payslips (`/ess/payslips`), Leave (`/ess/leaves`), Clock (`/ess/clock`). Uses `usePathname()` to highlight the active tab. Styling: `fixed bottom-0 inset-x-0 h-16 bg-white border-t flex items-center justify-around`. Icons: `LayoutDashboard`, `FileText`, `CalendarDays`, `Timer`.

**Token guard**: if `localStorage.ess_token` is absent, redirect to `/ess/login`.

### 4B — ESS Login

**File to create**: `src/app/(ess)/ess/login/page.tsx`

`"use client"`. Two-mode form toggled by a link: **Employee Number + Date of Birth** or **Employee Number + PIN**. Fields: `tenantId` (derived from `window.location.hostname` subdomain or `?tenant=` query param), `employeeNumber`, `birthDate` (Input `type="date"`) or `pin` (Input `type="password"`). On submit: `POST /api/ess/auth { tenantId, employeeNumber, birthDate? OR pin? }`. On success: store token in `localStorage.ess_token`, redirect to `/ess`.

**API response shape**: `{ data: { token: string, expiresAt: string, employee: { id, firstName } } }`.

### 4C — ESS Dashboard

**File to create**: `src/app/(ess)/ess/page.tsx`

Welcome card: "Good morning, [firstName]!" from `GET /api/ess/profile`. Quick link cards for Payslips, Leave, Clock In/Out. All API calls include `Authorization: Bearer <localStorage.ess_token>`.

### 4D — ESS Payslips

**File to create**: `src/app/(ess)/ess/payslips/page.tsx`

`GET /api/ess/payslips` — paginated list. Columns: Period (periodStart – periodEnd), Gross Pay ₱, WHT ₱, Net Pay ₱, View button. View: `GET /api/ess/payslips/[bookId]` — renders the full structured payslip JSON inside a `<Sheet>` showing all line items (earnings, deductions, statutory, loans, net). A "Print" button calls `window.print()`.

### 4E — ESS Leaves

**File to create**: `src/app/(ess)/ess/leaves/page.tsx`

Two tabs: **Balances** | **My Requests**.

Balances tab: `GET /api/ess/leave-balances` (query: `year=current`). Table: Leave Type, Opening, Earned, Used, Forfeited, Available (= earned − used − forfeited).

Requests tab: `GET /api/ess/leaves` (filter: `status`). Table: Leave Type, Start Date, End Date, Days, Status badge, Reason. "File Leave" Sheet: leaveTypeId (Select), startDate / endDate (Input dates), amount (Input number), reason (Textarea). On submit: `POST /api/ess/leaves { leaveTypeId, startDate, endDate, amount, reason? }`.

### 4F — ESS Clock

**File to create**: `src/app/(ess)/ess/clock/page.tsx`

Large centered UI. Live time display (update via `setInterval` every second). Two large buttons: "Clock In" and "Clock Out" — disable the one matching the inferred current state. On click: request browser geolocation (`navigator.geolocation.getCurrentPosition`). Optionally prompt webcam selfie: `<video autoPlay ref={videoRef}>` + canvas snapshot → upload via a pre-sign endpoint → get `selfieKey`. Then: `POST /api/ess/clock { punchType, latitude, longitude, selfieKey? }`. Result: success card with employee name, timestamp, and geofence status (`INSIDE` / `OUTSIDE` / `UNKNOWN`). Auto-clear after 5 seconds.

**Consent note**: the punch API validates `BIOMETRIC_SELFIE` and `GEOLOCATION` consent records. If consent is missing the API returns 403. The UI should show a friendly "Please accept consent in your profile" message, not a raw error.

### 4G — PWA Manifest

**File to create**: `public/manifest.json`

```json
{
  "name": "Sentire ESS",
  "short_name": "Sentire",
  "display": "standalone",
  "start_url": "/ess/login",
  "background_color": "#ffffff",
  "theme_color": "#0ea5e9",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

Add `<link rel="manifest" href="/manifest.json">` to the ESS layout `<head>`. Icon PNG files must be placed in `public/`.

---

## Phase 5 — Kiosk Interface

*Separate route group. Full-screen, dark-themed, tablet-optimized. Device-token auth (`Authorization: Kiosk <deviceToken>`).*

**New route group root**: `src/app/(kiosk)/`

### 5A — Kiosk Layout

**File to create**: `src/app/(kiosk)/layout.tsx`

Full-screen dark layout (`className="min-h-screen bg-gray-950 text-white flex flex-col"`). No nav bar. Reads `localStorage.kiosk_token` — if absent, render a "Setup required" message or redirect to `/kiosk/setup`.

### 5B — Kiosk Setup

**File to create**: `src/app/(kiosk)/kiosk/setup/page.tsx`

Single Input for device token + "Pair Device" button. On submit: send a probe request to `POST /api/kiosk/punch` with an intentionally invalid payload to verify the token. A 422 (validation fail) response (not 401) means the token is valid. Store token in `localStorage.kiosk_token`. Redirect to `/kiosk`.

**Note**: There is no dedicated device-registration endpoint. `Authorization: Kiosk <token>` is validated inline by `prismaAdmin.kiosk.findFirst({ where: { deviceToken: token } })`. Pairing is simply confirming the token resolves to a `Kiosk` row.

### 5C — Kiosk Main Screen

**File to create**: `src/app/(kiosk)/kiosk/page.tsx`

**Step 1 — Employee lookup**: Large Input field for employee number (`inputMode="numeric"`). "Punch In" and "Punch Out" toggle buttons (or auto-detect from last attendance log).

**Step 2 — PIN entry**: 4×3 numeric keypad (digits 0–9 + delete + submit). Display masked PIN as `●●●●`. On submit: `POST /api/kiosk/punch { employeeNumber, pin, punchType, latitude?, longitude?, selfieKey? }` with header `Authorization: Kiosk <localStorage.kiosk_token>`.

**Optional selfie**: activate `<video autoPlay>` and capture a canvas snapshot before submitting if the `Kiosk` row has `requiresSelfie = true` (store this flag in localStorage after setup).

**Success screen**: employee full name, formatted timestamp, punch type, geofence status badge. Auto-reset to Step 1 after 5 seconds.

**Error screen**: message (Invalid PIN / Employee not found / Already punched). Auto-reset after 3 seconds.

---

## Phase 6 — SUPER_ADMIN Portal

*Separate route group. Uses `getSuperAdminContext()` auth. Bypasses tenant RLS via `prismaAdmin`. Invisible to regular tenant users.*

**New route group root**: `src/app/(admin)/`

### 6A — Admin Layout

**File to create**: `src/app/(admin)/layout.tsx`

Server component layout (no `"use client"`). Sidebar with nav items: Tenants, Statutory, Audit Log. Red "SUPER_ADMIN" badge in sidebar header. Auth guard: call `getSuperAdminContext()` — if null, redirect to `/admin/login`. Import from `@/lib/super-admin-auth`.

### 6B — Admin Login

**File to create**: `src/app/(admin)/admin/login/page.tsx`

`"use client"`. Email + password form. On submit: `POST /api/auth/super-admin` (create this route if it does not exist — it should call `getSuperAdminContext()` server-side and set a session cookie). On success, redirect to `/admin/tenants`. If `requiresMfa: true` in response, show a TOTP input field for the second step.

**⚠️ Pre-check**: Read `src/lib/super-admin-auth.ts` first to confirm the exact auth mechanism (env-level credentials vs. DB-stored SUPER_ADMIN user) before building this page.

### 6C — Tenants List

**File to create**: `src/app/(admin)/admin/tenants/page.tsx`

**APIs used**: `GET /api/admin/tenants` (search, page, limit), `POST /api/admin/tenants`.

**Table columns**: Name, Subdomain, Industry, Tier badge (`STARTER`=secondary, `GROWTH`=default, `PRO`=outline), Status badge (`ACTIVE`=outline, `TRIALING`=default, `PAST_DUE`=yellow, `CANCELLED`=destructive), Created At. Row is clickable → `/admin/tenants/[id]`.

**Filters**: search Input (debounce 300ms → re-fetch).

**Create Sheet**: name, tradeName?, subdomain?, industry?, subscriptionTier (Select), subscriptionStatus (Select), billingEmail?, featureFlags — checklist of known flag keys (`ai_enabled`, `ats`, `kiosk`, `expense_claims`, `asset_tracking`) rendered as `<Checkbox>` rows.

### 6D — Tenant Detail

**File to create**: `src/app/(admin)/admin/tenants/[id]/page.tsx`

`use(params)` for `id`. Four tabs:

**Overview tab**: Editable form — name, tradeName, subdomain, industry, billingEmail, contactEmail, contactPhone, trialEndsAt (Input `type="datetime-local"`). Save → `PATCH /api/admin/tenants/[id]`.

**Subscription tab**: subscriptionTier (Select), subscriptionStatus (Select). Save → same PATCH endpoint.

**Feature Flags tab**: toggle grid of known flags. Each row: flag name (formatted), short description (static), `<Switch>` toggle. On toggle: `PATCH /api/admin/tenants/[id] { featureFlagsPatch: { [key]: boolean } }`. Note: `featureFlagsPatch` is **merged**, not replaced — existing flags not in the patch are preserved.

**Audit Log tab**: filtered view of `GET /api/admin/audit-log?tenantId=[id]` — columns: Timestamp, Actor userId, Action, Entity, Entity ID, IP.

### 6E — Statutory Rules

**File to create**: `src/app/(admin)/admin/statutory/page.tsx`

Six tabs: **SSS** | **PhilHealth** | **Pag-IBIG** | **BIR** | **De Minimis** | **Min Wage**. Each tab shares the same component parameterized by category + API path:

| Tab | API path |
|---|---|
| SSS | `/api/admin/statutory/sss` |
| PhilHealth | `/api/admin/statutory/philhealth` |
| Pag-IBIG | `/api/admin/statutory/pagibig` |
| BIR | `/api/admin/statutory/bir` |
| De Minimis | `/api/admin/statutory/deminimis` |
| Min Wage | `/api/admin/statutory/minwage` |

**Table columns**: Version, Effective From, Effective To (or "Current"), Legal Basis, Created At, Actions (Edit `effectiveTo` / `legalBasis` via `PATCH /api/admin/statutory/[category]/[id]`).

**Add Rule Sheet**: effectiveFrom (Input `type="datetime-local"`), effectiveTo? (optional), legalBasis (Input), version (Input), payload (Textarea — raw JSON with a hint comment showing the expected shape for that category). On submit: show a `<Dialog>` confirm step — "This will add a new statutory rule effective [date]. This cannot be undone." — before calling `POST`.

### 6F — Audit Log

**File to create**: `src/app/(admin)/admin/audit-log/page.tsx`

Read-only. `GET /api/admin/audit-log` — filter: `tenantId`, `action`, `entity`, `entityId`, `from`, `to`, `page`, `limit`.

**Table columns**: Timestamp, Tenant (tenantId), Actor User ID, Action badge, Entity, Entity ID, IP Address. An expand chevron on each row shows a collapsed JSON diff of `changes` field.

**Filters**: tenantId Select (populated from tenants list), action Select (over `AuditAction` enum), from / to Input dates.

---

## Phase 7 — AI Assistant UI

*Integrated into tenant dashboard. Feature-flagged via `featureFlags.ai_enabled`. Four tabs.*

### 7A — AI Page

**File to create**: `src/app/(dashboard)/ai/page.tsx`

**Nav addition**: Administration section, above Settings. Icon: `Sparkles`. Label: "AI Assistant". `href: "/ai"`.

On mount: check feature flag (derive from session or `GET /api/settings/feature-flags`). If `ai_enabled` is false, render an upgrade card: "AI Assistant is available on the PRO plan. Contact your administrator to upgrade."

Four tabs: **HR Chat** | **Compliance** | **Payslip Q&A** | **Usage**.

---

#### Tab 1 — HR Chat

`POST /api/ai/chat` body: `{ messages: [{ role, content }][], useSonnet?: boolean }`.

State: `messages: { role: "user" | "assistant", content: string }[]`. Render each message as a chat bubble (user = right-aligned blue; assistant = left-aligned gray). Textarea + Send button at bottom. On send: append user message to state, POST the full messages array, append assistant response on success.

`useSonnet` toggle checkbox for complex queries. Token counter below input: "Prompt: N | Response: N" from response fields `inputTokens` / `outputTokens`.

Starter prompt chips (static, horizontal scroll): "How do I compute 13th month pay?", "What is the SSS contribution table for 2026?", "How do I handle a maternity leave request?", "What is the minimum wage in NCR?". Clicking a chip populates the textarea.

---

#### Tab 2 — Compliance Helper

`POST /api/ai/compliance` body: `{ messages: [{ role, content }][] }`.

Same chat UI as Tab 1 but with separate `messages` state. System context is set server-side in `src/lib/ai/prompts.ts` — no extra UI needed. Label above the chat: "Ask questions about Philippine labor law, BIR compliance, and DOLE regulations."

---

#### Tab 3 — Payslip Q&A

`POST /api/ai/payslip-qa` body: `{ messages, payrollBookId?, employeeId? }`.

Two-step selector before chat appears: first a Select for payroll run (`GET /api/payroll/runs?status=FINALIZED`), then a Select for employee from that run. Once both are selected, render the chat UI. Context label: "Analyzing payslip for [employee name], period [start–end]." Separate `messages` state from other tabs.

---

#### Tab 4 — Usage

`GET /api/ai/usage` — query: `from`, `to`.

Date range inputs (from / to), defaulting to last 30 days. Fetch on mount and on filter change.

Summary cards (row of 4): Total Input Tokens, Total Output Tokens, Total Calls, Est. Cost (sum of `estimatedCostCents` / 100 formatted as ₱).

Touchpoint breakdown table: Touchpoint (`HR_CHAT` / `PAYSLIP_QA` / `COMPLIANCE_HELPER` / `ANOMALY_FLAGGING` / `DOC_EXTRACTION` / `RESUME_PARSE`), Calls, Input Tokens, Output Tokens, % of Total (inline CSS `<div style={{ width: "X%" }} className="bg-sky-500 h-2 rounded">` progress bar). No chart library.

---

## Navigation Changes Summary

Modify `src/app/(dashboard)/layout.tsx`.

**New icon imports**: `CreditCard, Receipt, PackageSearch, AlertCircle, ArrowRightLeft, Clock, UserCog, Users2, Sparkles, Briefcase` from `"lucide-react"`.

**Updated `navSections` array**:

```
Overview:          Dashboard

Workforce:         Employees | Departments | Branches | Assets

HR Ops (new):      Movements | Incidents | Profile Requests

Operations:        Time & Attendance | OT Applications | Leave | Payroll
                   Expense Claims | Loans | Reports

Talent (new):      Recruitment

Administration:    AI Assistant | Settings
```

---

## New API Routes Required Before UI Build

These routes do not yet exist and must be created before their UI phases:

| Route | Phase | Purpose |
|---|---|---|
| `GET /api/profile-update-requests` | 2D | Tenant-wide list with status/employeeId/page/limit filters |
| `POST /api/applicants/[id]/advance` | 3A | Advance stage one step |
| `POST /api/applicants/[id]/hire` | 3A | Create Employee from applicant, set hiredEmployeeId |
| `POST /api/applicants/[id]/reject` | 3A | Set stage=REJECTED with rejectionReason |
| `GET+POST /api/applicants/[id]/notes` | 3A | List and add ApplicantNote rows |

Additionally: confirm or create a SUPER_ADMIN session endpoint at `POST /api/auth/super-admin` (Phase 6B depends on this).

---

## File Manifest

**Modified**:
- `src/app/(dashboard)/layout.tsx` — new nav sections + icons
- `src/app/(dashboard)/settings/page.tsx` — add PositionsTab

**New — dashboard pages** (Phase 1–3, 7):
- `src/app/(dashboard)/loans/page.tsx`
- `src/app/(dashboard)/expense-claims/page.tsx`
- `src/app/(dashboard)/assets/page.tsx`
- `src/app/(dashboard)/incidents/page.tsx`
- `src/app/(dashboard)/movements/page.tsx`
- `src/app/(dashboard)/ot-applications/page.tsx`
- `src/app/(dashboard)/profile-update-requests/page.tsx`
- `src/app/(dashboard)/recruitment/page.tsx`
- `src/app/(dashboard)/ai/page.tsx`

**New — ESS route group** (Phase 4):
- `src/app/(ess)/layout.tsx`
- `src/app/(ess)/ess/login/page.tsx`
- `src/app/(ess)/ess/page.tsx`
- `src/app/(ess)/ess/payslips/page.tsx`
- `src/app/(ess)/ess/leaves/page.tsx`
- `src/app/(ess)/ess/clock/page.tsx`
- `public/manifest.json`

**New — Kiosk route group** (Phase 5):
- `src/app/(kiosk)/layout.tsx`
- `src/app/(kiosk)/kiosk/page.tsx`
- `src/app/(kiosk)/kiosk/setup/page.tsx`

**New — Admin route group** (Phase 6):
- `src/app/(admin)/layout.tsx`
- `src/app/(admin)/admin/login/page.tsx`
- `src/app/(admin)/admin/tenants/page.tsx`
- `src/app/(admin)/admin/tenants/[id]/page.tsx`
- `src/app/(admin)/admin/statutory/page.tsx`
- `src/app/(admin)/admin/audit-log/page.tsx`

**New — missing API routes** (prerequisite):
- `src/app/api/profile-update-requests/route.ts`
- `src/app/api/applicants/[id]/advance/route.ts`
- `src/app/api/applicants/[id]/hire/route.ts`
- `src/app/api/applicants/[id]/reject/route.ts`
- `src/app/api/applicants/[id]/notes/route.ts`

---

## Verification Checklist

After completing each phase, run: `npx tsc --noEmit` (zero `src/` errors) and `npx vitest run` (124 tests passing).

**Phase 1**: Positions tab visible in Settings with create/edit/delete. Loans: create loan, cancel it, verify balance zeroes. Expense Claims: walk DRAFT→SUBMIT→APPROVE→ATTACH lifecycle. Assets: assign asset, verify Assigned To column shows employee name, return it.

**Phase 2**: Incidents: create NTE, resolve it, verify status=RESOLVED. Movements: two-stage approval (PENDING→FOR_REVIEW→APPROVED) — confirm Employee row updated after APPROVED. OT Apps: approve updates DTRRecord `otMinutes` (verify via `/api/attendance`). Profile Requests: approve commits field to Employee row (verify via `GET /api/employees/[id]`).

**Phase 3 (ATS)**: Create job posting → open it → add applicant → advance through all stages → hire → confirm Employee created + redirect lands on employee detail.

**Phase 4 (ESS)**: Login with test employee (employeeNumber + birthDate). View payslip in sheet. File leave → verify PENDING entry in admin leave page. Clock in → check `AttendanceLog` row in DB.

**Phase 5 (Kiosk)**: Pair device with valid `Kiosk.deviceToken`. Punch in employee via PIN → check `AttendanceLog` row. Invalid PIN shows error message and auto-resets.

**Phase 6 (Admin)**: Login as SUPER_ADMIN. Create tenant → visible in list. Toggle feature flag → confirm `featureFlags` JSON updated in DB. Add statutory rule with future effectiveFrom → confirm it does not affect current-period payroll compute. View audit log → entries present.

**Phase 7 (AI)**: Send HR Chat message → confirm `AiUsage` row created in DB. Usage tab shows correct token totals. Set `featureFlags.ai_enabled = false` for a test tenant → upgrade card shown instead of chat UI.

---

## Decisions

- Positions is a 5th tab in Settings — not a separate nav item — to keep navigation lean.
- Profile Update Requests is a standalone admin queue page (not per-employee), because HR needs a cross-employee view.
- ESS and Kiosk are separate route groups because they use different auth mechanisms (ESS Bearer token, Kiosk device token) and require different layouts from the tenant dashboard.
- SUPER_ADMIN portal is isolated at `/admin/` — it never shares layout or session with tenant users.
- AI chat history is in-memory React state only — no server-side conversation persistence.
- No new chart library — AI Usage uses inline CSS progress bars (`width: X%`).
- ATS defaults to table view. A Kanban board per ApplicantStage is a future iteration.
- Assets nav goes in the Workforce section (not a separate section) because it is employee-centric.
