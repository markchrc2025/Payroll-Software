-- PAY-198 (Mark, 20 Nov 2026): lates and undertime reduce the 13th month
-- base; a company may opt not to deduct them.
ALTER TABLE "Tenant" ADD COLUMN "thirteenthMonthDeductLates" BOOLEAN NOT NULL DEFAULT true;
