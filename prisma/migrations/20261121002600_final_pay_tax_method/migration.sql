-- Mark's ruling (21 Nov 2026 22:25, confirmed 22:40): how final pay settles the
-- year's withholding tax is a company setting. REFUND_AND_WITHHOLD_FINAL
-- (default): the tax withheld earlier in the year is returned and the final
-- pay is taxed by itself. ANNUALIZE: the year is annualized at separation
-- (RR 2-98) and settled both ways (PAY-156).
CREATE TYPE "FinalPayTaxMethod" AS ENUM ('REFUND_AND_WITHHOLD_FINAL', 'ANNUALIZE');
ALTER TABLE "Tenant" ADD COLUMN "finalPayTaxMethod" "FinalPayTaxMethod" NOT NULL DEFAULT 'REFUND_AND_WITHHOLD_FINAL';
