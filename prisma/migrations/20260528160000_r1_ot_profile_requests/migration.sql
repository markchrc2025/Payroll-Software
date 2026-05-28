-- Phase R: OT Applications + Profile Update Requests
-- Also applies missed annualizationData column from Phase O migration.

-- ---------------------------------------------------------------------------
-- Missed from Phase O (annualization data JSONB on PayrollSheet)
-- ---------------------------------------------------------------------------
ALTER TABLE "PayrollSheet" ADD COLUMN IF NOT EXISTS "annualizationData" JSONB;

-- ---------------------------------------------------------------------------
-- OTApplication
-- ---------------------------------------------------------------------------
CREATE TABLE "OTApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OTApplication_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OTApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OTApplication" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OTApplication";
CREATE POLICY tenant_isolation ON "OTApplication"
    USING  ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "OTApplication" TO payroll_app;

CREATE INDEX "OTApplication_tenantId_idx"            ON "OTApplication"("tenantId");
CREATE INDEX "OTApplication_tenantId_employeeId_idx" ON "OTApplication"("tenantId", "employeeId");
CREATE INDEX "OTApplication_tenantId_status_idx"     ON "OTApplication"("tenantId", "status");
CREATE INDEX "OTApplication_tenantId_date_idx"       ON "OTApplication"("tenantId", "date");

ALTER TABLE "OTApplication" ADD CONSTRAINT "OTApplication_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTApplication" ADD CONSTRAINT "OTApplication_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ProfileUpdateRequest
-- ---------------------------------------------------------------------------
CREATE TABLE "ProfileUpdateRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfileUpdateRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProfileUpdateRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfileUpdateRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProfileUpdateRequest";
CREATE POLICY tenant_isolation ON "ProfileUpdateRequest"
    USING  ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ProfileUpdateRequest" TO payroll_app;

CREATE INDEX "ProfileUpdateRequest_tenantId_idx"            ON "ProfileUpdateRequest"("tenantId");
CREATE INDEX "ProfileUpdateRequest_tenantId_employeeId_idx" ON "ProfileUpdateRequest"("tenantId", "employeeId");
CREATE INDEX "ProfileUpdateRequest_tenantId_status_idx"     ON "ProfileUpdateRequest"("tenantId", "status");

ALTER TABLE "ProfileUpdateRequest" ADD CONSTRAINT "ProfileUpdateRequest_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfileUpdateRequest" ADD CONSTRAINT "ProfileUpdateRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
