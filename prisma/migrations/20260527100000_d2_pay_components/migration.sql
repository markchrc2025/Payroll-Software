
-- CreateEnum
CREATE TYPE "PayComponentKind" AS ENUM ('ALLOWANCE', 'BONUS', 'COMMISSION', 'OTHER_EARNING', 'REIMBURSEMENT', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayComponentTaxability" AS ENUM ('TAXABLE', 'NON_TAXABLE', 'DE_MINIMIS', 'STATUTORY_EXEMPT');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('SSS', 'PAGIBIG', 'CASH_ADVANCE', 'COMPANY');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "PayComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "taxability" "PayComponentTaxability" NOT NULL DEFAULT 'TAXABLE',
    "deMinimisCode" TEXT,
    "includeIn13thMonth" BOOLEAN NOT NULL DEFAULT false,
    "includeInSssBase" BOOLEAN NOT NULL DEFAULT false,
    "includeInPhilHealthBase" BOOLEAN NOT NULL DEFAULT false,
    "includeInPagibigBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payComponentId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodInput" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "daysWorked" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lateUndertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularOtHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "restDayHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "specialHolidayHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "regularHolidayHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "nightDiffHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "hazardHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "loanType" "LoanType" NOT NULL,
    "referenceNumber" TEXT,
    "principalCents" BIGINT NOT NULL,
    "installmentCents" BIGINT NOT NULL,
    "balanceCents" BIGINT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "closedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayComponent_tenantId_idx" ON "PayComponent"("tenantId");

-- CreateIndex
CREATE INDEX "PayComponent_tenantId_kind_idx" ON "PayComponent"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "PayComponent_deletedAt_idx" ON "PayComponent"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayComponent_tenantId_code_key" ON "PayComponent"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EmployeePayComponent_tenantId_idx" ON "EmployeePayComponent"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeePayComponent_tenantId_employeeId_idx" ON "EmployeePayComponent"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeePayComponent_employeeId_payComponentId_effectiveFro_idx" ON "EmployeePayComponent"("employeeId", "payComponentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PeriodInput_tenantId_idx" ON "PeriodInput"("tenantId");

-- CreateIndex
CREATE INDEX "PeriodInput_tenantId_periodStart_periodEnd_idx" ON "PeriodInput"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PeriodInput_employeeId_periodStart_idx" ON "PeriodInput"("employeeId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodInput_tenantId_employeeId_periodStart_periodEnd_key" ON "PeriodInput"("tenantId", "employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Loan_tenantId_idx" ON "Loan"("tenantId");

-- CreateIndex
CREATE INDEX "Loan_tenantId_employeeId_status_idx" ON "Loan"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "Loan_tenantId_status_idx" ON "Loan"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayComponent" ADD CONSTRAINT "EmployeePayComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayComponent" ADD CONSTRAINT "EmployeePayComponent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayComponent" ADD CONSTRAINT "EmployeePayComponent_payComponentId_fkey" FOREIGN KEY ("payComponentId") REFERENCES "PayComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodInput" ADD CONSTRAINT "PeriodInput_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodInput" ADD CONSTRAINT "PeriodInput_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- ROW-LEVEL SECURITY (Phase D2)
-- Tenant isolation: every read/write must carry app.current_tenant_id GUC.
-- payroll_user (BYPASSRLS) used by migrations/seeders is exempt.
-- =============================================================================

ALTER TABLE "PayComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayComponent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayComponent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "EmployeePayComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeePayComponent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmployeePayComponent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PeriodInput" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PeriodInput" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PeriodInput"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Loan"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Grant CRUD to runtime (NOBYPASSRLS) role
GRANT SELECT, INSERT, UPDATE, DELETE ON "PayComponent" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeePayComponent" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PeriodInput" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Loan" TO payroll_app;
