# Integration harness (unit 0.24)

Boots the whole application (`next dev`, the same route handlers, proxy and
auth a browser request goes through) against a real Postgres, seeds its own
fixtures, drives it over HTTP, deletes what it seeded, and exits:

| Exit | Meaning |
|---|---|
| 0 | every scenario passed |
| 1 | at least one finding (the report says which, and why) |
| 2 | the harness could not run (never reported as clean) |

```bash
INTEGRATION_ADMIN_URL=postgresql://postgres:pw@localhost:5432/postgres \
  npm run test:integration -- --fresh
```

`INTEGRATION_ADMIN_URL` must be able to `CREATE ROLE` and `CREATE DATABASE`:
use a throwaway cluster or the CI service container, never production.
`--fresh` drops and recreates the `sentire_it` database first; `--keep` leaves
the seeded rows. The JSON report goes to `integration-report.json`.

## Why it exists

The unit tests migrate and run as the `postgres` superuser, which bypasses row
level security entirely. That is how unit 0.7's catalogue gaps (19 tenant
tables with no RLS, 7 with no `admin_bypass`) stayed invisible. The harness
uses production's role shape instead:

| Role | Attributes | Used for |
|---|---|---|
| `it_owner` | LOGIN, not superuser, not BYPASSRLS, owns the database | migrations, seeding, `DIRECT_DATABASE_URL` (prismaAdmin, pg-boss) |
| `it_runtime` | LOGIN, inherits `payroll_app` only | `DATABASE_URL` (the runtime client behind `withTenant`) |

## Scenarios

Each reports two signals (REP-1): `effect`, what came back, and `authDenied`,
whether the app refused. Expectations are hand-written ids for rows the harness
seeded (REP-2, REP-3). A should-be-allowed case fails if authorization stopped
it or the tenant's own rows did not all come back ("disappeared"), or another
tenant's rows came back ("leak"). A should-be-denied case fails only if it took
effect.

| | Scenario |
|---|---|
| S0 | tenant A and tenant B admins sign in through the real Auth.js credentials flow |
| S1 | `/api/employees`: exactly the caller's tenant's employees |
| S2 | `/api/departments`: same |
| S3 | `/api/employees/ess`: same |
| S4 | reading the other tenant's employee by id: 404 |
| S5 | signed out: 401 |
| S6 | `/api/job-levels`: same as S1 (a table that had no RLS before unit 0.7) |
| S7 | the app's connections include `it_runtime`, i.e. tenant traffic really ran on the RLS-constrained role |

## Known red (REP-4)

On `main` before unit 0.7 merges, **S7 is a finding**: only `it_owner`
connects, because `src/lib/prisma.ts` prefers `DIRECT_DATABASE_URL` (#214).
That is the bug class 0.7 fixes, seen from the outside. With the 0.7 stack
(0.21, 0.7 A1, 0.7 T6, 0.7 runtime) merged, all 13 scenarios pass. The CI job is
advisory until then. Remediation options: (a) merge 0.7, then make the job
blocking; (b) keep it advisory and track S7 by hand.

## Adding scenarios

Seed in `seed()`, delete in `cleanup()` (it already removes every row carrying
one of the run's tenant ids), assert with `expectExactly` or `expectNotFound`.
Unit 1.17 (the write-path principal audit) builds on this.
