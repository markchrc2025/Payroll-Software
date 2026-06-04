-- AddColumn: companyCode to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "companyCode" TEXT;

-- Unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Tenant_companyCode_key'
  ) THEN
    ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_companyCode_key" UNIQUE ("companyCode");
  END IF;
END$$;

-- Backfill existing tenants: derive from name (uppercase, alphanumeric only)
UPDATE "Tenant"
SET "companyCode" = UPPER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
WHERE "companyCode" IS NULL;
