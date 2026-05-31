-- Phase V: Undertime Requests

CREATE TABLE "UndertimeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "undertimeMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UndertimeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UndertimeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UndertimeRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UndertimeRequest";
CREATE POLICY tenant_isolation ON "UndertimeRequest"
    USING  ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "UndertimeRequest" TO payroll_app;

CREATE INDEX "UndertimeRequest_tenantId_idx"            ON "UndertimeRequest"("tenantId");
CREATE INDEX "UndertimeRequest_tenantId_employeeId_idx" ON "UndertimeRequest"("tenantId", "employeeId");
CREATE INDEX "UndertimeRequest_tenantId_status_idx"     ON "UndertimeRequest"("tenantId", "status");
CREATE INDEX "UndertimeRequest_tenantId_date_idx"       ON "UndertimeRequest"("tenantId", "date");

ALTER TABLE "UndertimeRequest" ADD CONSTRAINT "UndertimeRequest_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UndertimeRequest" ADD CONSTRAINT "UndertimeRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
