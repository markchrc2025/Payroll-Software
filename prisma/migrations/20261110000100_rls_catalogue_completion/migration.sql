-- =============================================================================
-- Unit 0.7 (T6): every tenant table gets the same RLS shape.
--
-- Measured on a database built from the 88 earlier migrations, 32 of the 69
-- tables carrying "tenantId" fell short of the shape the rest of the schema
-- uses (ENABLE + FORCE row level security, a tenant_isolation policy, and an
-- admin_bypass policy for the table owner, which prismaAdmin connects as):
--
--   19 tables had NO row level security at all, including EmploymentTerm,
--      EssInvite, EssPasswordReset, Invoice, Payment and TenantSubscription.
--      Once the runtime client connects as payroll_app (unit 0.7), RLS is the
--      layer that stops a query that forgot its tenant filter; on these
--      tables nothing would.
--    6 had RLS enabled but not FORCED (AttendanceLog, DTRRecord,
--      EmployeeShiftAssignment, EssSession, ExpenseClaim, ShiftSchedule).
--    7 were FORCED with tenant_isolation but no admin_bypass (Announcement,
--      EmployeeEducation, EmployeeTraining, EmployeeWorkExperience,
--      EssWebAuthnCredential, Holiday, UndertimeRequest): created after
--      20260530000000_z2_admin_bypassrls ran, so its loop never saw them. A
--      non-superuser owner sees ZERO rows there through prismaAdmin and
--      cannot insert. The 1 Sep production role inventory reported no RLS
--      table missing admin_bypass, so production appears to carry policies
--      the migrations do not create; this makes the two agree.
--
-- Idempotent and additive: each step runs only where the table lacks it.
-- Existing policies are NEVER replaced (User's and StatutoryRule's
-- tenant_isolation keep their "tenantId IS NULL OR ..." form). New
-- tenant_isolation policies use the exact expression every other table uses,
-- so rows with a NULL tenantId (CentralAuditEvent's platform events) are
-- visible to the owner only.
--
-- Precondition, checked first: the migrating role owns every tenant table
-- (ALTER TABLE and CREATE POLICY require it). If not, the migration stops
-- with the list rather than half-applying.
-- =============================================================================

DO $$
DECLARE
  r         record;
  not_owned text[];
  n_enable  int := 0;
  n_force   int := 0;
  n_iso     int := 0;
  n_bypass  int := 0;
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname)
    INTO not_owned
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped)
     AND NOT pg_has_role(current_user, c.relowner, 'USAGE');

  IF not_owned IS NOT NULL THEN
    RAISE EXCEPTION 'RLS catalogue: role % does not own these tenant tables: %', current_user, not_owned;
  END IF;

  FOR r IN
    SELECT c.relname::text AS t,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped)
     ORDER BY c.relname
  LOOP
    IF NOT r.rls THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.t);
      n_enable := n_enable + 1;
      RAISE NOTICE 'enable rls   -> %', r.t;
    END IF;

    IF NOT r.forced THEN
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.t);
      n_force := n_force + 1;
      RAISE NOTICE 'force rls    -> %', r.t;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = r.t AND policyname = 'tenant_isolation') THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true))',
        r.t
      );
      n_iso := n_iso + 1;
      RAISE NOTICE 'tenant_isolation -> %', r.t;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = r.t AND policyname = 'admin_bypass') THEN
      EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', r.t, r.owner);
      n_bypass := n_bypass + 1;
      RAISE NOTICE 'admin_bypass -> % (owner: %)', r.t, r.owner;
    END IF;
  END LOOP;

  RAISE NOTICE 'RLS catalogue: enabled %, forced %, tenant_isolation %, admin_bypass %',
    n_enable, n_force, n_iso, n_bypass;
END
$$;
