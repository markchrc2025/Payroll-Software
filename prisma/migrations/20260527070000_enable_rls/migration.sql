-- =============================================================================
-- Sentire Payroll — Phase B2: Enable Postgres Row-Level Security
--
-- Every tenant-scoped table is locked down with a tenant_isolation policy that
-- compares "tenantId" to the per-transaction GUC `app.current_tenant_id`.
--
-- `withTenant(tenantId, fn)` in src/lib/with-tenant.ts wraps every request in
-- a transaction that issues `SET LOCAL app.current_tenant_id = '<cuid>'`.
--
-- Tables NOT covered (intentionally):
--   • Tenant            — keyed by id; SUPER_ADMIN-only via app layer.
--   • Permission        — global catalog (no tenant column).
--   • RolePermission    — joined via Role; protected through that table.
--   • User              — tenantId is NULL for SUPER_ADMIN; we cannot enforce
--                          a strict equality policy. App layer guards listings.
--                          (RLS is still enabled with a permissive policy that
--                           allows the row when tenantId IS NULL OR matches.)
-- =============================================================================

-- Migrations run as the schema owner (a superuser in this dev cluster), which
-- bypasses RLS by design. The runtime app role (payroll_app) is the one that
-- must be non-superuser & NOBYPASSRLS — that is verified at app startup, not
-- here. FORCE ROW LEVEL SECURITY below also applies the policy to table
-- owners, so even a superuser running plain queries would be filtered when
-- the GUC is unset, except superusers always bypass RLS regardless. This is
-- acceptable because superusers should never serve user traffic.

-- ---------------------------------------------------------------------------
-- User: special policy (NULL tenantId for SUPER_ADMIN is always visible to
-- itself; SUPER_ADMIN access is enforced at the app layer because we cannot
-- model "see everything" via a per-tenant GUC).
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- ---------------------------------------------------------------------------
-- All other tenant-scoped tables — strict equality.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'Role',
    'WorkLocation',
    'Department',
    'Branch',
    'Position',
    'Employee',
    'StatutoryId',
    'EmployeeDocument',
    'EmployeeSalary',
    'EmployeeMovement',
    'IncidentReport',
    'Geofence',
    'LeaveType',
    'LeaveBalance',
    'LeaveTransaction',
    'DTRApprovalConfig',
    'Kiosk',
    'AuditLog',
    'ConsentRecord',
    'AiUsage'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      tbl
    );
  END LOOP;
END
$$;
