-- =============================================================================
-- Unit 0.7 (stop-check A1): grants the RLS-constrained runtime role needs.
--
-- Unit 0.7 moves the runtime client (src/lib/prisma.ts, used only inside
-- withTenant) from the owner role, which every table's admin_bypass policy
-- lets see all rows, onto payroll_app, which RLS actually constrains. Before
-- this migration payroll_app held SELECT/INSERT/UPDATE/DELETE on only 35 of 78
-- public tables (one GRANT per earlier migration, added by hand and often
-- forgotten), so the switch would have turned 43 tables into
-- "permission denied" errors.
--
-- This grants the whole schema once, and sets DEFAULT PRIVILEGES so every
-- table a FUTURE migration creates is covered without anyone remembering to.
-- Isolation is not the grant's job: RLS policies decide which rows
-- payroll_app sees. _prisma_migrations is excluded; the runtime never needs it.
--
-- Safe in production: payroll_app already exists there (the 35 earlier GRANTs
-- applied). On a fresh cluster, scripts/db/ensure-roles.mjs creates it first
-- (unit 0.21). GRANT on objects the migrating role cannot grant on is a
-- WARNING, not an error; the 0.7 boot assertion checks the result.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    RAISE EXCEPTION 'role payroll_app does not exist: run scripts/db/ensure-roles.mjs first (unit 0.21)';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO payroll_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payroll_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO payroll_app;

REVOKE ALL ON TABLE "_prisma_migrations" FROM payroll_app;

-- Objects created later by the role running migrations (the owner).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO payroll_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO payroll_app;
