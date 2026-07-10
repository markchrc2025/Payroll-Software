-- Link a User to its Authenticize (OIDC IdP) subject, set on first tenant SSO
-- sign-in. Nullable; not globally unique (one person may have accounts in
-- several tenants) but unique per tenant. Hand-written + idempotent.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authenticizeUserId" TEXT;

-- Unique within a tenant. Postgres treats NULLs as distinct, so unlinked rows
-- (authenticizeUserId IS NULL) never collide.
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_authenticizeUserId_key"
  ON "User" ("tenantId", "authenticizeUserId");
