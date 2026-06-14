-- CreateTable: Placement
CREATE TABLE IF NOT EXISTS "Placement" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "employeeId"    TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "positionId"    TEXT,
  "jobTitle"      TEXT,
  "lineManagerId" TEXT,
  "departmentId"  TEXT,
  "branchId"      TEXT,
  "level"         TEXT,
  "remark"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmploymentTerm
CREATE TABLE IF NOT EXISTS "EmploymentTerm" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "employeeId"       TEXT NOT NULL,
  "effectiveDate"    TIMESTAMP(3) NOT NULL,
  "jobType"          TEXT,
  "jobStatus"        TEXT,
  "leaveWorkflowKey" TEXT,
  "workdayKey"       TEXT,
  "holidayKey"       TEXT,
  "termStart"        TIMESTAMP(3),
  "termEnd"          TIMESTAMP(3),
  "remark"           TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmploymentTerm_pkey" PRIMARY KEY ("id")
);

-- Foreign keys: Placement
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_lineManagerId_fkey"
  FOREIGN KEY ("lineManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys: EmploymentTerm
ALTER TABLE "EmploymentTerm" ADD CONSTRAINT "EmploymentTerm_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmploymentTerm" ADD CONSTRAINT "EmploymentTerm_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes: Placement
CREATE INDEX IF NOT EXISTS "Placement_tenantId_employeeId_idx" ON "Placement"("tenantId", "employeeId");
CREATE INDEX IF NOT EXISTS "Placement_tenantId_effectiveDate_idx" ON "Placement"("tenantId", "effectiveDate");

-- Indexes: EmploymentTerm
CREATE INDEX IF NOT EXISTS "EmploymentTerm_tenantId_employeeId_idx" ON "EmploymentTerm"("tenantId", "employeeId");
CREATE INDEX IF NOT EXISTS "EmploymentTerm_tenantId_effectiveDate_idx" ON "EmploymentTerm"("tenantId", "effectiveDate");
