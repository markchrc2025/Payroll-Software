-- Wave E3 (PAY-215, decision 9): company shutdowns and blackout dates; the
-- Leave Planner's coverage limit per department.
ALTER TABLE "Department" ADD COLUMN "maxOnLeave" INTEGER;
CREATE TABLE "LeaveSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "departmentIds" JSONB NOT NULL DEFAULT '[]',
    "leaveTypeId" TEXT,
    "blackoutMode" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LeaveSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaveSchedule_kind_check" CHECK ("kind" IN ('SHUTDOWN', 'BLACKOUT')),
    CONSTRAINT "LeaveSchedule_mode_check" CHECK ("blackoutMode" IS NULL OR "blackoutMode" IN ('BLOCK', 'FLAG')),
    CONSTRAINT "LeaveSchedule_dates_check" CHECK ("endDate" >= "startDate")
);
CREATE INDEX "LeaveSchedule_tenantId_kind_idx" ON "LeaveSchedule"("tenantId", "kind");
ALTER TABLE "LeaveSchedule" ADD CONSTRAINT "LeaveSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveSchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LeaveSchedule";
CREATE POLICY tenant_isolation ON "LeaveSchedule"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'LeaveSchedule' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "LeaveSchedule"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'LeaveSchedule', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "LeaveSchedule" TO payroll_app';
  END IF;
END
$$;
