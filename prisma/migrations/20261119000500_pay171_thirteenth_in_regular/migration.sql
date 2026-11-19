-- PAY-171: a REGULAR run may also pay the 13th month on its payslips.
ALTER TABLE "PayrollBook" ADD COLUMN IF NOT EXISTS "includeThirteenthMonth" BOOLEAN NOT NULL DEFAULT false;
