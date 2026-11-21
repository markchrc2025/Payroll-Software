-- PAY-197: Offboarding, part 1: clearance checklist, cases and clearance items.
CREATE TYPE "OffboardingCaseStatus" AS ENUM ('OPEN', 'CLEARED', 'CLOSED');
CREATE TYPE "ClearanceItemStatus" AS ENUM ('PENDING', 'CLEARED');
CREATE TABLE "ClearanceTemplateItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "signatoryUserId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClearanceTemplateItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OffboardingCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "separationReason" "SeparationReason" NOT NULL,
    "lastWorkingDay" TIMESTAMP(3) NOT NULL,
    "status" "OffboardingCaseStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "clearedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClearanceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "signatoryUserId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ClearanceItemStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "clearedAt" TIMESTAMP(3),
    "clearedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearanceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClearanceTemplateItem_tenantId_idx" ON "ClearanceTemplateItem"("tenantId");
CREATE INDEX "OffboardingCase_tenantId_status_idx" ON "OffboardingCase"("tenantId", "status");
CREATE INDEX "OffboardingCase_employeeId_idx" ON "OffboardingCase"("employeeId");
CREATE INDEX "ClearanceItem_tenantId_idx" ON "ClearanceItem"("tenantId");
CREATE INDEX "ClearanceItem_caseId_idx" ON "ClearanceItem"("caseId");
CREATE INDEX "ClearanceItem_signatoryUserId_status_idx" ON "ClearanceItem"("signatoryUserId", "status");
ALTER TABLE "ClearanceTemplateItem" ADD CONSTRAINT "ClearanceTemplateItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClearanceTemplateItem" ADD CONSTRAINT "ClearanceTemplateItem_signatoryUserId_fkey" FOREIGN KEY ("signatoryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OffboardingCase" ADD CONSTRAINT "OffboardingCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OffboardingCase" ADD CONSTRAINT "OffboardingCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OffboardingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_signatoryUserId_fkey" FOREIGN KEY ("signatoryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClearanceTemplateItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClearanceTemplateItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClearanceTemplateItem";
CREATE POLICY tenant_isolation ON "ClearanceTemplateItem"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ClearanceTemplateItem' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "ClearanceTemplateItem"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'ClearanceTemplateItem', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ClearanceTemplateItem" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "OffboardingCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OffboardingCase" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OffboardingCase";
CREATE POLICY tenant_isolation ON "OffboardingCase"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'OffboardingCase' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "OffboardingCase"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'OffboardingCase', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "OffboardingCase" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "ClearanceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClearanceItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClearanceItem";
CREATE POLICY tenant_isolation ON "ClearanceItem"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ClearanceItem' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "ClearanceItem"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'ClearanceItem', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ClearanceItem" TO payroll_app';
  END IF;
END
$$;
