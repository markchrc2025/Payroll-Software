-- AlterTable: persist DEDUCTION-kind payroll adjustments on the sheet so net
-- pay reconciles against the itemized deductions.
ALTER TABLE "PayrollSheet"
  ADD COLUMN "adjustmentDeductionsCents" BIGINT NOT NULL DEFAULT 0;
