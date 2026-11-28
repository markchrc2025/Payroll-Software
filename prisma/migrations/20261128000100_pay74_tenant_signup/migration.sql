-- PAY-74: self-serve sign-up, pending email verification. A platform table
-- (no tenantId): only the owner client (prismaAdmin) uses it. payroll_app
-- keeps the grants every table has (the runtime-role boot check, units 0.7
-- and 0.7a, requires them), but row security with only the owner's
-- admin_bypass policy means it sees no rows: no password or token hashes.
CREATE TABLE "TenantSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "payrollCycle" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "provisionedTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantSignup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantSignup_tokenHash_key" ON "TenantSignup"("tokenHash");
CREATE INDEX "TenantSignup_email_createdAt_idx" ON "TenantSignup"("email", "createdAt");
CREATE INDEX "TenantSignup_ipAddress_createdAt_idx" ON "TenantSignup"("ipAddress", "createdAt");

ALTER TABLE "TenantSignup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSignup" FORCE ROW LEVEL SECURITY;
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'TenantSignup' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "TenantSignup"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'TenantSignup', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantSignup" TO payroll_app';
  END IF;
END
$$;
