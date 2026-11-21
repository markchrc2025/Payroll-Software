-- Wave F2 and F3 (PAY-216): team discussion, and document and form sharing
-- with acknowledgements.
CREATE TABLE "DiscussionThread" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}', "authorEmployeeId" TEXT, "authorUserId" TEXT, "authorName" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]', "hiddenAt" TIMESTAMP(3), "hiddenByUserId" TEXT, "hiddenReason" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscussionThread_tenantId_lastActivityAt_idx" ON "DiscussionThread"("tenantId", "lastActivityAt");
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DiscussionComment" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "body" TEXT NOT NULL,
    "authorEmployeeId" TEXT, "authorUserId" TEXT, "authorName" TEXT NOT NULL, "mentions" JSONB NOT NULL DEFAULT '[]',
    "hiddenAt" TIMESTAMP(3), "hiddenByUserId" TEXT, "hiddenReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscussionComment_threadId_createdAt_idx" ON "DiscussionComment"("threadId", "createdAt");
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SharedDocument" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "audience" JSONB NOT NULL DEFAULT '{}',
    "requiresAck" BOOLEAN NOT NULL DEFAULT false, "currentVersion" INTEGER NOT NULL DEFAULT 1, "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SharedDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SharedDocument_tenantId_idx" ON "SharedDocument"("tenantId");
ALTER TABLE "SharedDocument" ADD CONSTRAINT "SharedDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SharedDocumentVersion" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "storageKey" TEXT, "data" BYTEA,
    "note" TEXT, "uploadedByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedDocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedDocumentVersion_documentId_version_key" ON "SharedDocumentVersion"("documentId", "version");
ALTER TABLE "SharedDocumentVersion" ADD CONSTRAINT "SharedDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SharedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SharedDocumentAck" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "version" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL, "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedDocumentAck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedDocumentAck_documentId_version_employeeId_key" ON "SharedDocumentAck"("documentId", "version", "employeeId");
ALTER TABLE "SharedDocumentAck" ADD CONSTRAINT "SharedDocumentAck_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SharedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscussionThread" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DiscussionThread";
CREATE POLICY tenant_isolation ON "DiscussionThread"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DiscussionThread' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "DiscussionThread"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'DiscussionThread', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "DiscussionThread" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "DiscussionComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscussionComment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DiscussionComment";
CREATE POLICY tenant_isolation ON "DiscussionComment"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DiscussionComment' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "DiscussionComment"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'DiscussionComment', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "DiscussionComment" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "SharedDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharedDocument" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SharedDocument";
CREATE POLICY tenant_isolation ON "SharedDocument"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SharedDocument' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "SharedDocument"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'SharedDocument', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "SharedDocument" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "SharedDocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharedDocumentVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SharedDocumentVersion";
CREATE POLICY tenant_isolation ON "SharedDocumentVersion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SharedDocumentVersion' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "SharedDocumentVersion"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'SharedDocumentVersion', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "SharedDocumentVersion" TO payroll_app';
  END IF;
END
$$;

ALTER TABLE "SharedDocumentAck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharedDocumentAck" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SharedDocumentAck";
CREATE POLICY tenant_isolation ON "SharedDocumentAck"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SharedDocumentAck' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "SharedDocumentAck"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'SharedDocumentAck', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "SharedDocumentAck" TO payroll_app';
  END IF;
END
$$;
