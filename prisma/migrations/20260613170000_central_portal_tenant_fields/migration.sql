-- Central Portal: tenant segmentation + account-health fields.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "region"      TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ownerName"   TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER;
