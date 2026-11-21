-- PAY-166: a retroactive salary increase is a batch of corrections, one per payslip of the period.
ALTER TABLE "PayrollCorrection" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CORRECTION';
ALTER TABLE "PayrollCorrection" ADD COLUMN "batchId" TEXT;
CREATE INDEX "PayrollCorrection_tenantId_batchId_idx" ON "PayrollCorrection"("tenantId", "batchId");
