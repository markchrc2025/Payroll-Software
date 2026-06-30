-- Employee background: Education, Work Experience, Training.
-- Repeatable per-employee history records. Tenant-scoped (RLS via
-- app.current_tenant_id), soft-deleted. Hand-written + idempotent.

-- ── Enum: EducationLevel ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "EducationLevel" AS ENUM (
    'ELEMENTARY', 'HIGH_SCHOOL', 'SENIOR_HIGH', 'VOCATIONAL',
    'COLLEGE', 'MASTERS', 'DOCTORATE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── EmployeeEducation ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmployeeEducation" (
  "id"              TEXT NOT NULL,
  "employeeId"      TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "level"           "EducationLevel",
  "school"          TEXT NOT NULL,
  "degree"          TEXT,
  "fieldOfStudy"    TEXT,
  "startYear"       INTEGER,
  "endYear"         INTEGER,
  "honors"          TEXT,
  "notes"           TEXT,
  "createdByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "EmployeeEducation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeEducation_tenantId_idx"   ON "EmployeeEducation"("tenantId");
CREATE INDEX IF NOT EXISTS "EmployeeEducation_employeeId_idx" ON "EmployeeEducation"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeEducation_deletedAt_idx"  ON "EmployeeEducation"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "EmployeeEducation"
    ADD CONSTRAINT "EmployeeEducation_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmployeeEducation"
    ADD CONSTRAINT "EmployeeEducation_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "EmployeeEducation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeEducation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "EmployeeEducation";
CREATE POLICY "tenant_isolation" ON "EmployeeEducation"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeEducation" TO payroll_app;

-- ── EmployeeWorkExperience ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmployeeWorkExperience" (
  "id"               TEXT NOT NULL,
  "employeeId"       TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "companyName"      TEXT NOT NULL,
  "position"         TEXT NOT NULL,
  "startDate"        TIMESTAMP(3),
  "endDate"          TIMESTAMP(3),
  "location"         TEXT,
  "description"      TEXT,
  "reasonForLeaving" TEXT,
  "createdByUserId"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "EmployeeWorkExperience_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeWorkExperience_tenantId_idx"   ON "EmployeeWorkExperience"("tenantId");
CREATE INDEX IF NOT EXISTS "EmployeeWorkExperience_employeeId_idx" ON "EmployeeWorkExperience"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeWorkExperience_deletedAt_idx"  ON "EmployeeWorkExperience"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "EmployeeWorkExperience"
    ADD CONSTRAINT "EmployeeWorkExperience_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmployeeWorkExperience"
    ADD CONSTRAINT "EmployeeWorkExperience_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "EmployeeWorkExperience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeWorkExperience" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "EmployeeWorkExperience";
CREATE POLICY "tenant_isolation" ON "EmployeeWorkExperience"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeWorkExperience" TO payroll_app;

-- ── EmployeeTraining ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmployeeTraining" (
  "id"                  TEXT NOT NULL,
  "employeeId"          TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "provider"            TEXT,
  "trainingDate"        TIMESTAMP(3),
  "hours"               INTEGER,
  "certificateKey"      TEXT,
  "certificateFileName" TEXT,
  "certificateMimeType" TEXT,
  "certificateFileSize" INTEGER,
  "expiresAt"           TIMESTAMP(3),
  "notes"               TEXT,
  "createdByUserId"     TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  "deletedAt"           TIMESTAMP(3),
  CONSTRAINT "EmployeeTraining_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeTraining_tenantId_idx"   ON "EmployeeTraining"("tenantId");
CREATE INDEX IF NOT EXISTS "EmployeeTraining_employeeId_idx" ON "EmployeeTraining"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeTraining_deletedAt_idx"  ON "EmployeeTraining"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "EmployeeTraining"
    ADD CONSTRAINT "EmployeeTraining_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmployeeTraining"
    ADD CONSTRAINT "EmployeeTraining_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "EmployeeTraining" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeTraining" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "EmployeeTraining";
CREATE POLICY "tenant_isolation" ON "EmployeeTraining"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeTraining" TO payroll_app;
