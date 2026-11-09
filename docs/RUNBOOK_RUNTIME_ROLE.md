# Runbook: switching the runtime database role to `payroll_app` (unit 0.7)

Until unit 0.7, the runtime client (`src/lib/prisma.ts`, the only client
`withTenant` uses) resolved `DIRECT_DATABASE_URL ?? DATABASE_URL`, so it
connected as the owner. Every RLS table carries `admin_bypass TO owner USING
(true)`, so for that client RLS isolated nothing (#214). After 0.7:

| Variable | Role | Used by |
|---|---|---|
| `DATABASE_URL` | `payroll_app` (RLS applies) | `src/lib/prisma.ts` via `withTenant` |
| `DIRECT_DATABASE_URL` | owner | `prismaAdmin`, pg-boss, `prisma migrate deploy` |

Neither falls back to the other. `scripts/start.sh` runs
`scripts/db/assert-runtime-role.mjs` after migrations and refuses to start the
server if `DATABASE_URL` lands on a superuser, a BYPASSRLS role, a table owner,
a role any `USING (true)` policy applies to, a role with a tenant preset, or a
role missing grants.

## Preconditions

1. Dokploy health check and update config are set on the Payroll app
   (`FailureAction: rollback`, `Order: start-first`). Without them a refused
   start is an outage instead of "the old version keeps serving".
2. The two migration PRs are merged and deployed: payroll_app grants
   (`20261110000000_payroll_app_runtime_grants`) and the RLS catalogue
   (`20261110000100_rls_catalogue_completion`). Neither changes runtime
   behaviour on its own.

## Steps (owner, in the dashboards; no secret passes through chat)

1. **pgAdmin, connected as `postgres`** on shared-postgres. Confirm the role:

   ```sql
   SELECT rolname, rolcanlogin, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = 'payroll_app';
   ```

   Expected: one row, `rolsuper = f`, `rolbypassrls = f`.

2. **Generate a password inside pgAdmin** and copy it once:

   ```sql
   SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') AS pw;
   ```

3. **Give the role a login** (paste the value in place of `<pw>`):

   ```sql
   ALTER ROLE payroll_app LOGIN PASSWORD '<pw>';
   ```

4. **Dokploy, Payroll app, Environment tab.** Set
   `DATABASE_URL=postgresql://payroll_app:<pw>@shared-postgres-dwdmih:5432/<payroll database>`.
   Leave `DIRECT_DATABASE_URL` exactly as it is. Deploy. Before the 0.7 code
   merges this has no runtime effect (the old code still prefers
   `DIRECT_DATABASE_URL`), so it is safe to do first.

5. **Merge the 0.7 runtime PR.** In the deploy's runtime log, expect:

   ```
   [assert-runtime-role] runtime role OK: payroll_app is constrained by RLS.
   ```

   If instead you see `REFUSING TO START`, the lines above it name the failed
   check, and the previous container keeps serving. Fix the variable and deploy
   again.

6. **Verify on the real thing:** `/api/health` returns `"status":"ok"`; sign in
   as an HR admin; open Employees, a payroll run, and Leave; sign in to ESS as
   an employee and open the payslip list. Anything that is suddenly EMPTY (not
   an error) is the dominant risk of this change: report it with the page URL.

## Going back

Revert the 0.7 runtime merge commit on `main`. Do not point `DATABASE_URL` back
at the owner: the boot assertion refuses that by design.

## Still app-layer guarded after 0.7 (A5, report only)

Tables with no `tenantId` and no RLS: `BackupRun`, `BillingPackage`,
`CentralPermission`, `CentralRole`, `CentralRolePermission`,
`PasswordResetToken`, `Permission`, `RolePermission`, `Tenant`.
`User` is RLS-covered but permissive: its `tenant_isolation` also admits rows
with `tenantId IS NULL` (platform users), so those rows are visible inside
every tenant's `withTenant`.
