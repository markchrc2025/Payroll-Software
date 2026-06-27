-- One-time email invitations to activate ESS access (set a password).
-- The raw token is emailed; only its SHA-256 hash is stored. Single-use + expiring.
CREATE TABLE IF NOT EXISTS "EssInvite" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EssInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EssInvite_tokenHash_key" ON "EssInvite"("tokenHash");
CREATE INDEX IF NOT EXISTS "EssInvite_tenantId_idx" ON "EssInvite"("tenantId");
CREATE INDEX IF NOT EXISTS "EssInvite_employeeId_idx" ON "EssInvite"("employeeId");

DO $$ BEGIN
  ALTER TABLE "EssInvite"
    ADD CONSTRAINT "EssInvite_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EssInvite"
    ADD CONSTRAINT "EssInvite_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
