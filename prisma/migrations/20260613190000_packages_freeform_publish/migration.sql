-- Billing packages become free-form plans: drop the one-per-tier uniqueness,
-- make tier optional, and add publish/order flags.
DROP INDEX IF EXISTS "BillingPackage_tier_key";
ALTER TABLE "BillingPackage" ALTER COLUMN "tier" DROP NOT NULL;
ALTER TABLE "BillingPackage" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BillingPackage" ADD COLUMN IF NOT EXISTS "sortOrder"   INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "BillingPackage_isPublished_idx" ON "BillingPackage"("isPublished");
