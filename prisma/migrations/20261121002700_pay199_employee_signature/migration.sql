-- PAY-199 (ruling 5, Mark 20 Nov 2026): the employee's e-signature, uploaded
-- in ESS and written on their BIR 2316 PDF.
CREATE TABLE "EmployeeSignature" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL, "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeSignature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeSignature_employeeId_key" ON "EmployeeSignature"("employeeId");
CREATE INDEX "EmployeeSignature_tenantId_idx" ON "EmployeeSignature"("tenantId");
ALTER TABLE "EmployeeSignature" ADD CONSTRAINT "EmployeeSignature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeSignature" ADD CONSTRAINT "EmployeeSignature_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeSignature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeSignature" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmployeeSignature";
CREATE POLICY tenant_isolation ON "EmployeeSignature"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'EmployeeSignature' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "EmployeeSignature"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'EmployeeSignature', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeSignature" TO payroll_app';
  END IF;
END
$$;
