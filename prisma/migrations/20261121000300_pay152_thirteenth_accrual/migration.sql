-- PAY-152: the 13th month accrued on each regular payslip, recorded at finalize.
ALTER TABLE "PayrollSheet" ADD COLUMN "thirteenthAccrualBasisCents" BIGINT;
ALTER TABLE "PayrollSheet" ADD COLUMN "thirteenthAccrualCents" BIGINT;
