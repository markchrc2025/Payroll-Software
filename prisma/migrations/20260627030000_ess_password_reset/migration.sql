-- One-time ESS password-reset tokens (forgot-password flow). Raw token emailed;
-- only its SHA-256 hash stored. Single-use + expiring.
CREATE TABLE IF NOT EXISTS "EssPasswordReset" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EssPasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EssPasswordReset_tokenHash_key" ON "EssPasswordReset"("tokenHash");
CREATE INDEX IF NOT EXISTS "EssPasswordReset_tenantId_idx" ON "EssPasswordReset"("tenantId");
CREATE INDEX IF NOT EXISTS "EssPasswordReset_employeeId_idx" ON "EssPasswordReset"("employeeId");

DO $$ BEGIN
  ALTER TABLE "EssPasswordReset"
    ADD CONSTRAINT "EssPasswordReset_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EssPasswordReset"
    ADD CONSTRAINT "EssPasswordReset_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
