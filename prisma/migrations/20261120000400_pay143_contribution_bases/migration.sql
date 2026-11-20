-- PAY-143 (Mark, 16 Nov 2026): contributions stay on basic pay by default; a
-- company may include other earnings per contribution. All off by default.
ALTER TABLE "Tenant" ADD COLUMN "sssIncludeEarnings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "sssIncludePremiums" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "philhealthIncludeEarnings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "philhealthIncludePremiums" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "pagibigIncludeEarnings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "pagibigIncludePremiums" BOOLEAN NOT NULL DEFAULT false;
