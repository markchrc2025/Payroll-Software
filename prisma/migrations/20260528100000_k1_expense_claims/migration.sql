-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ATTACHED', 'PAID');

-- CreateEnum
CREATE TYPE "ExpenseTaxTreatment" AS ENUM ('NONTAXABLE_REIMBURSEMENT', 'DE_MINIMIS', 'TAXABLE');

-- AlterTable
ALTER TABLE "PayrollSheet" ADD COLUMN "expenseClaimsApplied" JSONB;

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "receiptKey" TEXT,
    "claimDate" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "taxTreatment" "ExpenseTaxTreatment",
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "payrollBookId" TEXT,
    "paidInBookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseClaim_tenantId_idx" ON "ExpenseClaim"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_tenantId_employeeId_idx" ON "ExpenseClaim"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_tenantId_status_idx" ON "ExpenseClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_payrollBookId_idx" ON "ExpenseClaim"("payrollBookId");

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_payrollBookId_fkey" FOREIGN KEY ("payrollBookId") REFERENCES "PayrollBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidInBookId_fkey" FOREIGN KEY ("paidInBookId") REFERENCES "PayrollBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "ExpenseClaim" ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "tenant_isolation" ON "ExpenseClaim"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Grant to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpenseClaim" TO payroll_app;
