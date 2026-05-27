-- CreateEnum
CREATE TYPE "PayrollBookStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunType" AS ENUM ('REGULAR', 'OFF_CYCLE', 'FINAL_PAY', 'YEAR_END');

-- CreateTable
CREATE TABLE "PayrollBook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cycle" "PayFrequency" NOT NULL,
    "runType" "PayrollRunType" NOT NULL DEFAULT 'REGULAR',
    "status" "PayrollBookStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollBookId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxClassificationSnapshot" "TaxClassification" NOT NULL,
    "regionSnapshot" TEXT,
    "payFrequencySnapshot" "PayFrequency" NOT NULL,
    "salaryTypeSnapshot" "SalaryType" NOT NULL,
    "basicSalaryCentsSnapshot" BIGINT NOT NULL,
    "workingDaysDenominatorSnapshot" INTEGER NOT NULL,
    "statutoryDeductedSnapshot" BOOLEAN NOT NULL,
    "basePayCents" BIGINT NOT NULL DEFAULT 0,
    "lateUndertimeDeductionCents" BIGINT NOT NULL DEFAULT 0,
    "otPayCents" BIGINT NOT NULL DEFAULT 0,
    "nsdPayCents" BIGINT NOT NULL DEFAULT 0,
    "holidayPayCents" BIGINT NOT NULL DEFAULT 0,
    "hazardPayCents" BIGINT NOT NULL DEFAULT 0,
    "restDayPayCents" BIGINT NOT NULL DEFAULT 0,
    "taxableAllowancesCents" BIGINT NOT NULL DEFAULT 0,
    "grossCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "mweExemptCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "nontaxableBasicCents" BIGINT NOT NULL DEFAULT 0,
    "nontaxableCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "nontaxable13MonthAndBenefitsCents" BIGINT NOT NULL DEFAULT 0,
    "grossTaxableIncomeCents" BIGINT NOT NULL DEFAULT 0,
    "sssEeCents" BIGINT NOT NULL DEFAULT 0,
    "sssErCents" BIGINT NOT NULL DEFAULT 0,
    "sssEcCents" BIGINT NOT NULL DEFAULT 0,
    "philhealthEeCents" BIGINT NOT NULL DEFAULT 0,
    "philhealthErCents" BIGINT NOT NULL DEFAULT 0,
    "pagibigEeCents" BIGINT NOT NULL DEFAULT 0,
    "pagibigErCents" BIGINT NOT NULL DEFAULT 0,
    "withholdingTaxCents" BIGINT NOT NULL DEFAULT 0,
    "nontaxableAdditionsCents" BIGINT NOT NULL DEFAULT 0,
    "loanDeductionsCents" BIGINT NOT NULL DEFAULT 0,
    "netPayCents" BIGINT NOT NULL DEFAULT 0,
    "payComponentsApplied" JSONB NOT NULL DEFAULT '[]',
    "loanPaymentsApplied" JSONB NOT NULL DEFAULT '[]',
    "periodInputSnapshot" JSONB NOT NULL DEFAULT '{}',
    "statutoryBreakdown" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollBook_tenantId_idx" ON "PayrollBook"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollBook_tenantId_status_idx" ON "PayrollBook"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PayrollBook_tenantId_periodEnd_idx" ON "PayrollBook"("tenantId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBook_tenantId_periodStart_periodEnd_runType_key" ON "PayrollBook"("tenantId", "periodStart", "periodEnd", "runType");

-- CreateIndex
CREATE INDEX "PayrollSheet_tenantId_idx" ON "PayrollSheet"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollSheet_tenantId_employeeId_idx" ON "PayrollSheet"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollSheet_payrollBookId_idx" ON "PayrollSheet"("payrollBookId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSheet_payrollBookId_employeeId_key" ON "PayrollSheet"("payrollBookId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollBook" ADD CONSTRAINT "PayrollBook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSheet" ADD CONSTRAINT "PayrollSheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSheet" ADD CONSTRAINT "PayrollSheet_payrollBookId_fkey" FOREIGN KEY ("payrollBookId") REFERENCES "PayrollBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSheet" ADD CONSTRAINT "PayrollSheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- D3: Row-Level Security for PayrollBook + PayrollSheet
-- Both tables are tenant-scoped. payroll_app runs as NOBYPASSRLS and must set
-- app.current_tenant_id via `withTenant` for every statement.
-- =============================================================================

ALTER TABLE "PayrollBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollBook" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PayrollBook"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PayrollSheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollSheet" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PayrollSheet"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollBook"  TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollSheet" TO payroll_app;
