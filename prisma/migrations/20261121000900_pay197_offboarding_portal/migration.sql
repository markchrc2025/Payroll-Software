-- PAY-197 part 2 (ruling 4): the offboarding portal: sign-in links, sessions,
-- and the forms the leaving employee files. These tables are reached before
-- the tenant is known (a link or a session token), so the lookup runs as the
-- owner like the ESS credential links; every read after it is in the tenant.
ALTER TABLE "OffboardingCase" ADD COLUMN     "coeRequestedAt" TIMESTAMP(3),
ADD COLUMN     "exitQuestionnaire" JSONB,
ADD COLUMN     "exitQuestionnaireAt" TIMESTAMP(3),
ADD COLUMN     "personalInfo" JSONB,
ADD COLUMN     "personalInfoAt" TIMESTAMP(3);
CREATE TABLE "OffboardingPortalLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffboardingPortalLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OffboardingPortalSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffboardingPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OffboardingPortalLink_tokenHash_key" ON "OffboardingPortalLink"("tokenHash");
CREATE INDEX "OffboardingPortalLink_caseId_idx" ON "OffboardingPortalLink"("caseId");
CREATE UNIQUE INDEX "OffboardingPortalSession_tokenHash_key" ON "OffboardingPortalSession"("tokenHash");
CREATE INDEX "OffboardingPortalSession_caseId_idx" ON "OffboardingPortalSession"("caseId");
ALTER TABLE "OffboardingPortalLink" ADD CONSTRAINT "OffboardingPortalLink_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OffboardingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OffboardingPortalSession" ADD CONSTRAINT "OffboardingPortalSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OffboardingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OffboardingPortalLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OffboardingPortalLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OffboardingPortalLink";
CREATE POLICY tenant_isolation ON "OffboardingPortalLink"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'OffboardingPortalLink' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "OffboardingPortalLink"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'OffboardingPortalLink', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "OffboardingPortalLink" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "OffboardingPortalSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OffboardingPortalSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OffboardingPortalSession";
CREATE POLICY tenant_isolation ON "OffboardingPortalSession"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'OffboardingPortalSession' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "OffboardingPortalSession"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'OffboardingPortalSession', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "OffboardingPortalSession" TO payroll_app';
  END IF;
END
$$;
