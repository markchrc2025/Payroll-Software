-- Phase M1: Employee Self-Service sessions

-- CreateTable
CREATE TABLE "EssSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EssSession_tokenHash_key" ON "EssSession"("tokenHash");

-- CreateIndex
CREATE INDEX "EssSession_tenantId_idx" ON "EssSession"("tenantId");

-- CreateIndex
CREATE INDEX "EssSession_employeeId_idx" ON "EssSession"("employeeId");

-- CreateIndex
CREATE INDEX "EssSession_expiresAt_idx" ON "EssSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "EssSession" ADD CONSTRAINT "EssSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssSession" ADD CONSTRAINT "EssSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "EssSession" ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "tenant_isolation" ON "EssSession"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Grant to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON "EssSession" TO payroll_app;
