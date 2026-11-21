-- Wave A: the lists each company keeps, one table keyed by list.
CREATE TABLE "LookupItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LookupItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LookupItem_tenantId_list_code_key" ON "LookupItem"("tenantId", "list", "code");
CREATE INDEX "LookupItem_tenantId_list_idx" ON "LookupItem"("tenantId", "list");
ALTER TABLE "LookupItem" ADD CONSTRAINT "LookupItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LookupItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LookupItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LookupItem";
CREATE POLICY tenant_isolation ON "LookupItem"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'LookupItem' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "LookupItem"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'LookupItem', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "LookupItem" TO payroll_app';
  END IF;
END
$$;
