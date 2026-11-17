-- PAY-168: keep how a 13th month (YEAR_END) sheet was worked out, so the run
-- page and the payslip can show it. Nullable; older sheets stay null.
ALTER TABLE "PayrollSheet" ADD COLUMN IF NOT EXISTS "thirteenthMonthBreakdown" JSONB;
