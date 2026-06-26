-- AlterTable: "no negative pay" safeguard. Max % of monthly gross that an
-- employee's statutory + loan deductions may consume. New loans that would
-- breach this cap are blocked at creation time.
ALTER TABLE "Tenant"
  ADD COLUMN "maxDeductionPctOfGross" INTEGER NOT NULL DEFAULT 50;
