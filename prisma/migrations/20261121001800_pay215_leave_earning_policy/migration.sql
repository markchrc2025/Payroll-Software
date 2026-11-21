-- Wave E1 (PAY-215): Leave Earning Policies write employees' leave entitlements.
CREATE TABLE "LeaveEarningPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "accrualFrequency" "AccrualFrequency" NOT NULL,
    "accrualAmount" DECIMAL(6,4) NOT NULL,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "proRate" BOOLEAN NOT NULL DEFAULT true,
    "earnFrom" TEXT NOT NULL DEFAULT 'HIRE',
    "carryOverCap" DECIMAL(6,4),
    "expiresAfterMonths" INTEGER,
    "convertUnusedToCash" BOOLEAN NOT NULL DEFAULT false,
    "assignment" JSONB NOT NULL DEFAULT '{}',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LeaveEarningPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaveEarningPolicy_earnFrom_check" CHECK ("earnFrom" IN ('HIRE', 'REGULARIZATION'))
);
CREATE INDEX "LeaveEarningPolicy_tenantId_idx" ON "LeaveEarningPolicy"("tenantId");
ALTER TABLE "LeaveEarningPolicy" ADD CONSTRAINT "LeaveEarningPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveEarningPolicy" ADD CONSTRAINT "LeaveEarningPolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveEntitlement" ADD COLUMN "policyId" TEXT;
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeaveEarningPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveEarningPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveEarningPolicy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LeaveEarningPolicy";
CREATE POLICY tenant_isolation ON "LeaveEarningPolicy"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'LeaveEarningPolicy' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "LeaveEarningPolicy"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'LeaveEarningPolicy', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "LeaveEarningPolicy" TO payroll_app';
  END IF;
END
$$;
