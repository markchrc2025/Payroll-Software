-- Mark's ruling (22 Nov 2026 00:30): the employer assigns the HR manager who
-- signs BIR 2316 (Items 53 and 55) and uploads that person's e-signature.
CREATE TABLE "Bir2316Signatory" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "position" TEXT NOT NULL, "mimeType" TEXT, "data" BYTEA,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bir2316Signatory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bir2316Signatory_tenantId_key" ON "Bir2316Signatory"("tenantId");
ALTER TABLE "Bir2316Signatory" ADD CONSTRAINT "Bir2316Signatory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bir2316Signatory" ADD CONSTRAINT "Bir2316Signatory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bir2316Signatory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bir2316Signatory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Bir2316Signatory";
CREATE POLICY tenant_isolation ON "Bir2316Signatory"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Bir2316Signatory' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "Bir2316Signatory"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'Bir2316Signatory', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Bir2316Signatory" TO payroll_app';
  END IF;
END
$$;
