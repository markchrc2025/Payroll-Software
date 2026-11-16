-- PAY-141: paydays and DTR cutoff windows per pay cycle.
--
-- 1. PayrollBook: the pay date and the DTR cutoff window of a run created from
--    a payday. NULL on every existing run (they keep using their own period
--    for attendance).
ALTER TABLE "PayrollBook"
  ADD COLUMN IF NOT EXISTS "payDate"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cutoffStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cutoffEnd"   TIMESTAMP(3);

-- 2. PaySchedule: one row per company and scheduled cycle (SEMI_MONTHLY,
--    MONTHLY). No row = the default (15th and month-end, cutoff = pay period).
CREATE TABLE IF NOT EXISTS "PaySchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cycle" "PayFrequency" NOT NULL,
    "payDay1" INTEGER NOT NULL,
    "cutoff1StartDay" INTEGER NOT NULL,
    "cutoff1EndDay" INTEGER NOT NULL,
    "payDay2" INTEGER,
    "cutoff2StartDay" INTEGER,
    "cutoff2EndDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaySchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaySchedule_cycle_scheduled" CHECK ("cycle" IN ('SEMI_MONTHLY', 'MONTHLY')),
    CONSTRAINT "PaySchedule_days_range" CHECK (
      "payDay1" BETWEEN 1 AND 31 AND "cutoff1StartDay" BETWEEN 1 AND 31 AND "cutoff1EndDay" BETWEEN 1 AND 31
      AND ("payDay2" IS NULL OR "payDay2" BETWEEN 1 AND 31)
      AND ("cutoff2StartDay" IS NULL OR "cutoff2StartDay" BETWEEN 1 AND 31)
      AND ("cutoff2EndDay" IS NULL OR "cutoff2EndDay" BETWEEN 1 AND 31)
    ),
    CONSTRAINT "PaySchedule_slot2_shape" CHECK (
      ("cycle" = 'SEMI_MONTHLY' AND "payDay2" IS NOT NULL AND "cutoff2StartDay" IS NOT NULL AND "cutoff2EndDay" IS NOT NULL)
      OR ("cycle" = 'MONTHLY' AND "payDay2" IS NULL AND "cutoff2StartDay" IS NULL AND "cutoff2EndDay" IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaySchedule_tenantId_cycle_key" ON "PaySchedule"("tenantId", "cycle");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaySchedule_tenantId_fkey') THEN
    ALTER TABLE "PaySchedule" ADD CONSTRAINT "PaySchedule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- 3. Row level security, the shape every tenant table has (unit 0.7 T6).
ALTER TABLE "PaySchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaySchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PaySchedule";
CREATE POLICY tenant_isolation ON "PaySchedule"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$
DECLARE
  own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'PaySchedule' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "PaySchedule"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'PaySchedule', own_role);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "PaySchedule" TO payroll_app';
  END IF;
END
$$;
