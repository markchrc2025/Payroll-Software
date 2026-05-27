-- =============================================================================
-- Sentire Payroll — Phase D1: Statutory Configuration Engine
--
-- Creates the StatutoryRule table + StatutoryCategory enum and enables RLS.
--
-- RLS model (differs from the standard tenant_isolation policy):
--   • SELECT — allowed when "tenantId" IS NULL (global baseline) OR
--     "tenantId" = current_setting('app.current_tenant_id', true).
--     This lets every tenant transparently read BIR/SSS/PhilHealth/HDMF
--     published values that ship in the global seed.
--   • INSERT/UPDATE/DELETE — restricted via WITH CHECK to
--     "tenantId" = current_setting('app.current_tenant_id', true).
--     The app role (payroll_app, NOBYPASSRLS) therefore cannot mutate
--     global rows; those are loaded only by migrations / seed scripts
--     running as the migration owner (payroll_user, BYPASSRLS).
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatutoryCategory" AS ENUM ('SSS_SCHEDULE', 'PHILHEALTH_SCHEDULE', 'PAGIBIG_SCHEDULE', 'BIR_WITHHOLDING_TABLE', 'DE_MINIMIS_CEILING', 'MINIMUM_WAGE_RATE');

-- CreateTable
CREATE TABLE "StatutoryRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "category" "StatutoryCategory" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "legalBasis" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatutoryRule_category_effectiveFrom_idx" ON "StatutoryRule"("category", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StatutoryRule_tenantId_category_effectiveFrom_idx" ON "StatutoryRule"("tenantId", "category", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryRule_tenantId_category_version_key" ON "StatutoryRule"("tenantId", "category", "version");

-- AddForeignKey
ALTER TABLE "StatutoryRule" ADD CONSTRAINT "StatutoryRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security: tenant-scoped writes, global-or-tenant reads.
-- ---------------------------------------------------------------------------
ALTER TABLE "StatutoryRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatutoryRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StatutoryRule";
CREATE POLICY tenant_isolation ON "StatutoryRule"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );
