-- PAY-133: new companies deduct statutory contributions on the FIRST payday of
-- the month by default. Only the column default changes; existing companies
-- keep the rule they already have (no UPDATE).
ALTER TABLE "Tenant" ALTER COLUMN "statutoryCutoffRule" SET DEFAULT 'FIRST_CUTOFF';
