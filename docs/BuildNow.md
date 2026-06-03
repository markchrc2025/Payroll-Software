## ITEM 2 — Background Jobs with pg-boss

### Why pg-boss

pg-boss uses the existing Supabase PostgreSQL database as its job queue — no new service or infrastructure is needed. It is the right choice for this stage.

### Installation

```bash
npm install pg-boss
```

### Setup

Create a singleton pg-boss client at `lib/jobs/client.ts`:

```typescript
import PgBoss from 'pg-boss';

let boss: PgBoss;

export async function getJobQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
  }
  return boss;
}
```

Create a job worker bootstrap file at `lib/jobs/workers.ts` that registers all workers on startup. Call this from your Next.js instrumentation file (`instrumentation.ts`) so workers start when the server starts.

---

### Jobs to implement

Implement each job as a separate file under `lib/jobs/handlers/`. Each handler receives the job data and executes the async work.

---

#### Job 1: `payroll.run`

**Trigger:** HR clicks "Generate New Run" on the Payroll Runs page.

**Why async:** For tenants with 100+ employees, the Gross-to-Net loop can take 5–30 seconds — too long for a synchronous API route response. Offload it to a background job.

**Implementation:**
1. The API route (`POST /api/payroll/runs`) creates a `payroll_books` record with `status = 'PROCESSING'` and immediately enqueues a `payroll.run` job with the `payroll_book_id`.
2. Return a `202 Accepted` response to the client. The UI polls or subscribes via Supabase Realtime for the status change.
3. The job handler executes the full Gross-to-Net waterfall for each active employee in the period.
4. On completion: update `payroll_books.status = 'COMPLETED'`. On failure: set `status = 'FAILED'` and log the error.

**Job data shape:**
```typescript
{ payroll_book_id: string; company_id: string; initiated_by: string }
```

---

#### Job 2: `ot.approved`

**Trigger:** An OT application's status is updated to `APPROVED`.

**What it does:**
1. Fetch the OT application: `{ employee_id, date, hours }`.
2. Find the `daily_time_records` row for that `employee_id + date`.
3. Update `ot_hours` to the approved value.
4. Recalculate `total_hours_worked = effective_hours + ot_hours`.
5. Write to `dtr_audit_logs`: `{ actor: 'SYSTEM', action: 'OT_APPROVAL_SYNC', ... }`.
6. If no DTR row exists for the date (rest day OT), create one with `day_status = 'REST_DAY_OT'`.
7. Invalidate the Redis cache key for this employee's leave/hours summary if it exists.

**Job data shape:**
```typescript
{ ot_application_id: string; employee_id: string; date: string; hours: number; company_id: string }
```

---

#### Job 3: `dtr.submitted`

**Trigger:** Employee submits their period DTR.

**What it does:** Send a notification (email or in-app) to the assigned supervisor that a DTR is awaiting their review. Log the notification in the database.

**Job data shape:**
```typescript
{ dtr_submission_id: string; employee_id: string; supervisor_id: string; period: string; company_id: string }
```

---

#### Job 4: `payslip.publish`

**Trigger:** HR finalizes a payroll run (`payroll_books.status` changes to `FINALIZED`).

**What it does:**
1. For each employee in the payroll run, generate a PDF payslip using `@react-pdf/renderer`.
2. Upload the PDF to Cloudflare R2 under `payslips/{company_id}/{payroll_book_id}/{employee_id}.pdf`.
3. Update the `payroll_sheets` record with `payslip_url` (R2 object key).
4. Mark the payslip as `published = true` so it appears in the employee's ESS.

**Job data shape:**
```typescript
{ payroll_book_id: string; company_id: string }
```

---

#### Cron Job: `leave.accrual`

**Schedule:** Run on the 1st of every month at 1:00 AM.

**What it does:** For every active employee with an accrual-type leave policy (not lump-sum), compute and add the monthly accrual amount to their `leave_entitlements` balance. Cap at the policy's `max_accrual_balance` if set.

**Setup:** Register this as a pg-boss cron schedule in `workers.ts`:
```typescript
await boss.schedule('leave.accrual', '0 1 1 * *');
```

---

### Error handling for all jobs

- All jobs must have a `retryLimit` of 3 with exponential backoff.
- On final failure, write to an `job_failures` log table: `{ job_name, job_data, error_message, failed_at }`.
- Do not throw unhandled errors — always catch and log.

---

## ITEM 3 — Caching with Upstash Redis

### Installation

```bash
npm install @upstash/redis
```

### Setup

Create a singleton Redis client at `lib/cache/client.ts`:

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

Add to `.env.local`:
```
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

---

### Cache utility

Create a generic cache helper at `lib/cache/cache.ts` with a `getOrSet` function:

```typescript
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds?: number
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  if (ttlSeconds) {
    await redis.set(key, fresh, { ex: ttlSeconds });
  } else {
    await redis.set(key, fresh);
  }
  return fresh;
}

export async function invalidate(key: string): Promise<void> {
  await redis.del(key);
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}
```

---

### Cache keys and TTLs — implement exactly as specified

Create constants at `lib/cache/keys.ts`:

```typescript
export const CacheKeys = {
  statutory: (companyId: string, type: string) =>
    `sentire:${companyId}:statutory:${type}`,

  geofence: (companyId: string, branchId: string) =>
    `sentire:${companyId}:geofence:${branchId}`,

  employeeProfile: (companyId: string, employeeId: string) =>
    `sentire:${companyId}:employee:${employeeId}`,

  holidayCalendar: (companyId: string, year: number) =>
    `sentire:${companyId}:holidays:${year}`,

  leaveBalance: (companyId: string, employeeId: string) =>
    `sentire:${companyId}:leave:${employeeId}`,

  payrollSheet: (payrollSheetId: string) =>
    `sentire:payroll_sheet:${payrollSheetId}`,
};

export const TTL = {
  STATUTORY: 60 * 60 * 24 * 30,  // 30 days
  GEOFENCE: 60 * 60,              // 1 hour
  EMPLOYEE_PROFILE: 60 * 15,      // 15 minutes
  HOLIDAY_CALENDAR: 60 * 60 * 24, // 24 hours
  LEAVE_BALANCE: 60 * 5,          // 5 minutes
  PAYROLL_SHEET: undefined,       // indefinite — immutable once finalized
};
```

---

### Where to apply caching — integrate at these exact points

**1. Statutory tables** — wrap the DB fetch in the payroll computation engine:
```typescript
const sssTable = await getOrSet(
  CacheKeys.statutory(companyId, 'sss'),
  () => db.statutory_tables.findMany({ where: { type: 'SSS', company_id: companyId } }),
  TTL.STATUTORY
);
```
Apply the same pattern for `philhealth`, `pagibig`, and `bir_train`.

**2. Branch geofence** — wrap the fetch in the clock-in API route (`POST /api/attendance/clock-in`):
```typescript
const geofence = await getOrSet(
  CacheKeys.geofence(companyId, branchId),
  () => db.branches.findUnique({ where: { id: branchId }, select: { geofence_lat, geofence_lng, geofence_radius_meters } }),
  TTL.GEOFENCE
);
```
**Invalidate** in the branch geofence update API route after a successful save.

**3. Employee profile + shift** — wrap the fetch in any route that reads employee profile for computation (clock-in, DTR generation, payroll run):
```typescript
const employee = await getOrSet(
  CacheKeys.employeeProfile(companyId, employeeId),
  () => db.employee_profiles.findUnique({ where: { id: employeeId } }),
  TTL.EMPLOYEE_PROFILE
);
```
**Invalidate** when a Profile Update Request is approved.

**4. Holiday calendar** — wrap the fetch in the payroll engine's holiday lookup:
```typescript
const holidays = await getOrSet(
  CacheKeys.holidayCalendar(companyId, year),
  () => db.holidays.findMany({ where: { company_id: companyId, year } }),
  TTL.HOLIDAY_CALENDAR
);
```
**Invalidate** when HR adds, edits, or deletes a holiday.

**5. Leave balance summary** — wrap the ESS leave balance fetch:
```typescript
const balance = await getOrSet(
  CacheKeys.leaveBalance(companyId, employeeId),
  () => db.leave_entitlements.findMany({ where: { employee_id: employeeId } }),
  TTL.LEAVE_BALANCE
);
```
**Invalidate** when a leave request is approved or rejected.

**6. Finalized Payroll Sheets** — cache after a payroll sheet is frozen:
```typescript
await redis.set(CacheKeys.payrollSheet(payrollSheetId), payrollSheetData);
```
Never invalidate this key — payroll sheets are immutable by design.

---

### Environment variables to add

```
# pg-boss (uses existing Supabase DB — same DATABASE_URL already in use)
# No additional env vars needed for pg-boss

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

### Validation checklist after implementation

- [ ] pg-boss initializes on server start without errors
- [ ] `payroll.run` job is enqueued when HR clicks Generate New Run — API returns 202 immediately
- [ ] Payroll run completes asynchronously and updates `payroll_books.status` to COMPLETED
- [ ] `ot.approved` job fires when OT status changes to APPROVED and updates the correct DTR row
- [ ] `payslip.publish` job fires after payroll finalization and uploads PDFs to R2
- [ ] `leave.accrual` cron is registered and runs on schedule
- [ ] Failed jobs after 3 retries are logged to `job_failures` table
- [ ] Upstash Redis client connects without errors
- [ ] Statutory tables are fetched from cache on the second payroll run (no DB query)
- [ ] Geofence data is served from cache on second clock-in for the same branch
- [ ] Cache invalidates correctly when geofence is updated by HR
- [ ] Leave balance invalidates when a leave request is approved
- [ ] Finalized payroll sheets are cached indefinitely and never re-fetched from DB
- [ ] No existing API routes, payroll logic, or auth flows are broken

---

*Do not install Inngest, Vercel Cron, or any other job queue. Do not replace pg-boss with a different tool. Do not add Vercel KV — use Upstash Redis only.*
