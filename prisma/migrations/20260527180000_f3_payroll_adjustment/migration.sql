-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('ADDITION', 'DEDUCTION');

-- AlterTable
ALTER TABLE "PayrollSheet" ADD COLUMN     "adjustmentsApplied" JSONB;

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollBookId" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollAdjustment_tenantId_idx" ON "PayrollAdjustment"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollBookId_idx" ON "PayrollAdjustment"("payrollBookId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_employeeId_idx" ON "PayrollAdjustment"("employeeId");

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payrollBookId_fkey" FOREIGN KEY ("payrollBookId") REFERENCES "PayrollBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: PayrollAdjustment
ALTER TABLE "PayrollAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollAdjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "PayrollAdjustment"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollAdjustment" TO payroll_app;
