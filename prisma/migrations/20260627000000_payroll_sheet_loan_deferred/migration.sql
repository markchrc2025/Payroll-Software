-- AlterTable: record loan installment deferred by the "no negative pay" floor.
-- In REGULAR/YEAR_END runs, loan amortization that won't fit within net pay is
-- deferred (carried in the loan balance) so net never goes negative. This
-- column persists how much was deferred this period so the payslip and payroll
-- review can show that amortization was paused.
ALTER TABLE "PayrollSheet"
  ADD COLUMN "loanDeferredCents" BIGINT NOT NULL DEFAULT 0;
