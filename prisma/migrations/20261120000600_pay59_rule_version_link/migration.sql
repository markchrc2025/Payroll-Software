-- PAY-59 (plan 1.4, R59): link a payslip to the statutory rule VERSION that
-- priced it. A map of category to { id, version, effectiveFrom, legalBasis },
-- written when the payslip is computed. Null on payslips computed before this.
ALTER TABLE "PayrollSheet" ADD COLUMN "statutoryRuleVersions" JSONB;
