-- PAY-171: a pay component may be ticked as a bonus (13th month and other
-- benefits for the year's 90,000 exemption).
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "isBonus" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "isOneOff" BOOLEAN NOT NULL DEFAULT false;
