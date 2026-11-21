-- Wave G1 (PAY-217): bulk salary adjustments.
CREATE TYPE "SalaryAdjustmentRule" AS ENUM ('PERCENT', 'FIXED', 'MIN_WAGE');

CREATE TABLE "SalaryAdjustmentBatch" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "rule" "SalaryAdjustmentRule" NOT NULL,
    "percentBasisPoints" INTEGER, "fixedCents" BIGINT, "effectiveDate" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING', "createdByUserId" TEXT, "approvedByUserId" TEXT, "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT, "retroBatchId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryAdjustmentBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalaryAdjustmentBatch_tenantId_createdAt_idx" ON "SalaryAdjustmentBatch"("tenantId", "createdAt");
ALTER TABLE "SalaryAdjustmentBatch" ADD CONSTRAINT "SalaryAdjustmentBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalaryAdjustmentLine" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
    "salaryType" "SalaryType" NOT NULL, "fromCents" BIGINT NOT NULL, "toCents" BIGINT NOT NULL,
    "movementId" TEXT, "splitAdjustmentId" TEXT,
    CONSTRAINT "SalaryAdjustmentLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalaryAdjustmentLine_batchId_employeeId_key" ON "SalaryAdjustmentLine"("batchId", "employeeId");
CREATE INDEX "SalaryAdjustmentLine_employeeId_idx" ON "SalaryAdjustmentLine"("employeeId");
ALTER TABLE "SalaryAdjustmentLine" ADD CONSTRAINT "SalaryAdjustmentLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalaryAdjustmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustmentLine" ADD CONSTRAINT "SalaryAdjustmentLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalaryAdjustmentBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalaryAdjustmentBatch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SalaryAdjustmentBatch";
CREATE POLICY tenant_isolation ON "SalaryAdjustmentBatch"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SalaryAdjustmentBatch' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "SalaryAdjustmentBatch"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'SalaryAdjustmentBatch', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "SalaryAdjustmentBatch" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "SalaryAdjustmentLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalaryAdjustmentLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SalaryAdjustmentLine";
CREATE POLICY tenant_isolation ON "SalaryAdjustmentLine"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SalaryAdjustmentLine' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "SalaryAdjustmentLine"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'SalaryAdjustmentLine', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "SalaryAdjustmentLine" TO payroll_app';
  END IF;
END
$$;

