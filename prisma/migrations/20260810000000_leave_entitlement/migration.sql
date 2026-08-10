-- =============================================================================
-- Unit 0.13 — LeaveEntitlement + accrual idempotency key.
--
-- WHY: the accrual job had no notion of an entitlement window. It iterated every
-- active leave type × every non-resigned employee on every run, and because its
-- cron is daily it would have granted a MONTHLY entitlement's full amount every
-- day. Nothing has fired yet (production shows zero LeaveType rows and zero
-- LeaveBalance rows), so this is a landmine defused rather than damage repaired.
--
-- TWO CHANGES:
--   1. "LeaveEntitlement" — the per-employee, per-leave-type period that accrual
--      is anchored to, with a per-entitlement pro-rate toggle and a snapshot of
--      the accrual amount/frequency at issue.
--   2. "LeaveTransaction"."entitlementId" + "periodKey" with a UNIQUE constraint,
--      so a grant is idempotent ATOMICALLY. "periodKey" is NULL on every
--      non-accrual row and Postgres treats NULLs as distinct in a unique index,
--      so USAGE/ADJUSTMENT/CARRYOVER/FORFEITURE/CONVERSION rows can never collide
--      — no partial index and no raw predicate needed.
--
-- RLS: "LeaveEntitlement" is tenant-owned and follows the SAME recipe as every
-- other tenant-owned table — ENABLE + FORCE ROW LEVEL SECURITY, a tenant_isolation
-- policy on "tenantId", an admin_bypass policy for the owner role, and CRUD
-- granted to payroll_app. Nothing existing is weakened or special-cased. The
-- admin_bypass policy must be created HERE because 20260530000000_z2_admin_bypassrls
-- only looped over tables that had a policy at the time it ran.
--
-- Hand-written + idempotent: every statement is IF NOT EXISTS or guarded, so
-- this is a harmless no-op on a database that has already applied it.
-- =============================================================================

-- 1. LeaveEntitlement ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LeaveEntitlement" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "employeeId"       TEXT NOT NULL,
    "leaveTypeId"      TEXT NOT NULL,
    "startDate"        TIMESTAMP(3) NOT NULL,
    "endDate"          TIMESTAMP(3),
    "proRate"          BOOLEAN NOT NULL DEFAULT false,
    "accrualAmount"    DECIMAL(6,4) NOT NULL,
    "accrualFrequency" "AccrualFrequency" NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "deletedAt"        TIMESTAMP(3),

    CONSTRAINT "LeaveEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaveEntitlement_tenantId_idx"
  ON "LeaveEntitlement"("tenantId");
CREATE INDEX IF NOT EXISTS "LeaveEntitlement_employeeId_leaveTypeId_idx"
  ON "LeaveEntitlement"("employeeId", "leaveTypeId");
CREATE INDEX IF NOT EXISTS "LeaveEntitlement_deletedAt_idx"
  ON "LeaveEntitlement"("deletedAt");

-- Foreign keys. ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL, so each is
-- guarded on pg_constraint to keep the migration re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveEntitlement_tenantId_fkey') THEN
    ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveEntitlement_employeeId_fkey') THEN
    ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveEntitlement_leaveTypeId_fkey') THEN
    ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_leaveTypeId_fkey"
      FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- 2. Row-level security for LeaveEntitlement -----------------------------------
--    Identical shape to the loop in 20260527070000_enable_rls.
ALTER TABLE "LeaveEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveEntitlement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LeaveEntitlement";
CREATE POLICY tenant_isolation ON "LeaveEntitlement"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- admin_bypass for the table owner, resolved dynamically for portability —
-- same approach as 20260530000000_z2_admin_bypassrls, which cannot cover a table
-- created after it ran.
DO $$
DECLARE
  own_role text;
BEGIN
  SELECT tableowner INTO own_role
    FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'LeaveEntitlement'
   LIMIT 1;

  IF own_role IS NULL THEN
    RAISE NOTICE 'Could not determine table owner — skipping admin_bypass on LeaveEntitlement.';
  ELSE
    EXECUTE format('DROP POLICY IF EXISTS admin_bypass ON %I', 'LeaveEntitlement');
    EXECUTE format(
      'CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)',
      'LeaveEntitlement', own_role
    );
    RAISE NOTICE '  admin_bypass → LeaveEntitlement (owner: %)', own_role;
  END IF;
END
$$;

-- CRUD for the runtime (NOBYPASSRLS) role. Guarded on the role existing so this
-- migration also applies cleanly to a scratch/CI database that has no
-- payroll_app role — the unguarded GRANTs in earlier migrations do not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "LeaveEntitlement" TO payroll_app';
  ELSE
    RAISE NOTICE 'Role payroll_app not present — skipping GRANT on LeaveEntitlement.';
  END IF;
END
$$;

-- 3. LeaveTransaction: entitlement link + period key ---------------------------
ALTER TABLE "LeaveTransaction"
  ADD COLUMN IF NOT EXISTS "entitlementId" TEXT,
  ADD COLUMN IF NOT EXISTS "periodKey"     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveTransaction_entitlementId_fkey') THEN
    ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_entitlementId_fkey"
      FOREIGN KEY ("entitlementId") REFERENCES "LeaveEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- THE idempotency guarantee. Every existing row has entitlementId = NULL and
-- periodKey = NULL; NULLs are distinct in a Postgres unique index, so this
-- constraint is satisfied by all historical data and constrains ACCRUAL rows only.
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveTransaction_entitlementId_type_periodKey_key"
  ON "LeaveTransaction"("entitlementId", "type", "periodKey");
