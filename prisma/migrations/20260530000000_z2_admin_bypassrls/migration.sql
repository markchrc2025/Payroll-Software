-- =============================================================================
-- Sentire Payroll — Z2: Admin BYPASSRLS Policies
--
-- On managed PostgreSQL hosts (e.g. Render), the database owner role does NOT
-- automatically carry the BYPASSRLS attribute, and we cannot ALTER ROLE without
-- superuser access. Since every table uses FORCE ROW LEVEL SECURITY, even the
-- owner is blocked unless it has an explicit permissive policy.
--
-- This migration discovers every table in the public schema that has at least
-- one RLS policy (i.e. tenant_isolation) and adds a second, permissive
-- "admin_bypass" policy restricted to the DB owner role (sentiredb_user on
-- Render, payroll_user on local dev). This policy UNIONS (OR) with the
-- existing tenant_isolation policy, so the admin role sees all rows while
-- normal app connections remain tenant-scoped.
--
-- Safe to re-run: uses DROP POLICY IF EXISTS before CREATE POLICY.
-- =============================================================================

DO $$
DECLARE
  tbl      text;
  own_role text;
BEGIN
  -- Resolve the actual table owner dynamically so this migration is portable
  -- (payroll_user locally, sentiredb_user on Render, etc.).
  SELECT tableowner
    INTO own_role
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename   = 'Tenant'
   LIMIT 1;

  IF own_role IS NULL THEN
    RAISE NOTICE 'Could not determine table owner — skipping admin_bypass policies.';
    RETURN;
  END IF;

  RAISE NOTICE 'Granting admin_bypass policies to role: %', own_role;

  FOR tbl IN
    SELECT DISTINCT tablename
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_bypass ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)',
      tbl, own_role
    );
    RAISE NOTICE '  admin_bypass → %', tbl;
  END LOOP;
END
$$;
