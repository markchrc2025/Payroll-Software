-- PAY-217 Causeless (Mark, 21 Nov 22:25): a note on an employee with an
-- optional attachment, without a cause, decision or sanction.
CREATE TABLE "CauselessNote" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL, "note" TEXT NOT NULL,
    "fileName" TEXT, "mimeType" TEXT, "fileSize" INTEGER, "storageKey" TEXT, "data" BYTEA,
    "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CauselessNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CauselessNote_tenantId_noteDate_idx" ON "CauselessNote"("tenantId", "noteDate");
CREATE INDEX "CauselessNote_employeeId_idx" ON "CauselessNote"("employeeId");
ALTER TABLE "CauselessNote" ADD CONSTRAINT "CauselessNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CauselessNote" ADD CONSTRAINT "CauselessNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CauselessNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CauselessNote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CauselessNote";
CREATE POLICY tenant_isolation ON "CauselessNote"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'CauselessNote' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "CauselessNote"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'CauselessNote', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "CauselessNote" TO payroll_app';
  END IF;
END
$$;
