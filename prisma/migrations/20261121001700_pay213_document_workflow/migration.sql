-- Wave C3 (PAY-213): Document Workflow, letter templates and employees' requests.
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "showsSalary" BOOLEAN NOT NULL DEFAULT false,
    "availableInEss" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentTemplate_tenantId_idx" ON "DocumentTemplate"("tenantId");
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "purpose" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "renderedTitle" TEXT,
    "renderedBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentRequest_tenantId_status_idx" ON "DocumentRequest"("tenantId", "status");
CREATE INDEX "DocumentRequest_employeeId_idx" ON "DocumentRequest"("employeeId");
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An issued letter's text never changes.
CREATE OR REPLACE FUNCTION pay213_document_request_issued() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'APPROVED' AND (NEW."renderedTitle" IS DISTINCT FROM OLD."renderedTitle"
      OR NEW."renderedBody" IS DISTINCT FROM OLD."renderedBody" OR NEW."status" IS DISTINCT FROM OLD."status") THEN
    RAISE EXCEPTION 'An issued document request cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER pay213_document_request_issued BEFORE UPDATE ON "DocumentRequest"
  FOR EACH ROW EXECUTE FUNCTION pay213_document_request_issued();

-- Approving document requests: its own permission, given to the Administrator role.
INSERT INTO "Permission" ("id", "module", "action", "label") VALUES
  (gen_random_uuid()::text, 'DOCUMENTS', 'APPROVE', 'Approve document requests')
ON CONFLICT ("module", "action") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Administrator' AND r."isSystem" = true AND r."deletedAt" IS NULL
  AND p."module" = 'DOCUMENTS' AND p."action" = 'APPROVE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DocumentTemplate";
CREATE POLICY tenant_isolation ON "DocumentTemplate"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DocumentTemplate' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "DocumentTemplate"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'DocumentTemplate', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "DocumentTemplate" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "DocumentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DocumentRequest";
CREATE POLICY tenant_isolation ON "DocumentRequest"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DocumentRequest' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "DocumentRequest"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'DocumentRequest', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "DocumentRequest" TO payroll_app';
  END IF;
END
$$;
