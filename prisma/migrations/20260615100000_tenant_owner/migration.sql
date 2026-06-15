-- Add ownerUserId to Tenant: designates the tenant's Super Admin / primary owner.
-- Central Portal admins can override it; tenants can self-transfer via Settings.
-- Apply in the Supabase SQL editor, then run: npx prisma generate

-- 1. Add column
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- 2. FK + index (SET NULL if the user is ever hard-deleted)
ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_ownerUserId_fkey";
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Tenant_ownerUserId_idx" ON "Tenant"("ownerUserId");

-- 3. Backfill: set owner to the oldest active, non-deleted user per tenant
--    (i.e. the user who was created first — the original provisioned admin).
UPDATE "Tenant" t
SET "ownerUserId" = (
  SELECT u."id"
  FROM "User" u
  WHERE u."tenantId" = t."id"
    AND u."deletedAt" IS NULL
    AND u."isActive" = TRUE
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE t."deletedAt" IS NULL
  AND t."ownerUserId" IS NULL;
