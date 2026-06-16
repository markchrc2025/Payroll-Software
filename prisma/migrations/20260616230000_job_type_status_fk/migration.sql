-- CreateTable JobType
CREATE TABLE "JobType" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobType_tenantId_name_key" ON "JobType"("tenantId", "name");
CREATE INDEX "JobType_tenantId_idx" ON "JobType"("tenantId");

-- CreateTable JobStatus
CREATE TABLE "JobStatus" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobStatus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobStatus_tenantId_name_key" ON "JobStatus"("tenantId", "name");
CREATE INDEX "JobStatus_tenantId_idx" ON "JobStatus"("tenantId");

-- Seed JobTypes per tenant
INSERT INTO "JobType" ("id", "tenantId", "name", "rank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", jt.name, jt.rank, NOW(), NOW()
FROM "Tenant" t
CROSS JOIN (VALUES ('Permanent',0),('Contract',1),('Probationary',2),('Casual',3),('Project-based',4)) AS jt(name, rank)
ON CONFLICT DO NOTHING;

INSERT INTO "JobType" ("id", "tenantId", "name", "rank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sub."tenantId", sub."jobType", 99, NOW(), NOW()
FROM (SELECT DISTINCT "tenantId", "jobType" FROM "EmploymentTerm" WHERE "jobType" IS NOT NULL) sub
WHERE NOT EXISTS (SELECT 1 FROM "JobType" jt WHERE jt."tenantId" = sub."tenantId" AND LOWER(jt."name") = LOWER(sub."jobType"))
ON CONFLICT DO NOTHING;

INSERT INTO "JobType" ("id", "tenantId", "name", "rank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sub."tenantId", sub."jobType", 99, NOW(), NOW()
FROM (SELECT DISTINCT "tenantId", "jobType" FROM "Employee" WHERE "jobType" IS NOT NULL) sub
WHERE NOT EXISTS (SELECT 1 FROM "JobType" jt WHERE jt."tenantId" = sub."tenantId" AND LOWER(jt."name") = LOWER(sub."jobType"))
ON CONFLICT DO NOTHING;

-- Seed JobStatuses per tenant
INSERT INTO "JobStatus" ("id", "tenantId", "name", "rank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", js.name, js.rank, NOW(), NOW()
FROM "Tenant" t
CROSS JOIN (VALUES ('Confirmed',0),('Probation',1),('Resigned',2),('Terminated',3)) AS js(name, rank)
ON CONFLICT DO NOTHING;

INSERT INTO "JobStatus" ("id", "tenantId", "name", "rank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sub."tenantId", sub."jobStatus", 99, NOW(), NOW()
FROM (SELECT DISTINCT "tenantId", "jobStatus" FROM "EmploymentTerm" WHERE "jobStatus" IS NOT NULL) sub
WHERE NOT EXISTS (SELECT 1 FROM "JobStatus" js WHERE js."tenantId" = sub."tenantId" AND LOWER(js."name") = LOWER(sub."jobStatus"))
ON CONFLICT DO NOTHING;

-- Add FK columns
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "jobTypeId" TEXT REFERENCES "JobType"("id") ON DELETE SET NULL;
ALTER TABLE "EmploymentTerm" ADD COLUMN IF NOT EXISTS "jobTypeId" TEXT REFERENCES "JobType"("id") ON DELETE SET NULL;
ALTER TABLE "EmploymentTerm" ADD COLUMN IF NOT EXISTS "jobStatusId" TEXT REFERENCES "JobStatus"("id") ON DELETE SET NULL;
ALTER TABLE "EmployeeMovement" ADD COLUMN IF NOT EXISTS "toJobTypeId" TEXT REFERENCES "JobType"("id") ON DELETE SET NULL;
ALTER TABLE "EmployeeMovement" ADD COLUMN IF NOT EXISTS "toJobStatusId" TEXT REFERENCES "JobStatus"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Employee_jobTypeId_idx" ON "Employee"("jobTypeId");
CREATE INDEX IF NOT EXISTS "EmploymentTerm_jobTypeId_idx" ON "EmploymentTerm"("jobTypeId");
CREATE INDEX IF NOT EXISTS "EmploymentTerm_jobStatusId_idx" ON "EmploymentTerm"("jobStatusId");

-- Backfill from existing string values
UPDATE "Employee" e SET "jobTypeId" = jt."id"
FROM "JobType" jt WHERE jt."tenantId" = e."tenantId" AND LOWER(jt."name") = LOWER(e."jobType") AND e."jobType" IS NOT NULL;

UPDATE "EmploymentTerm" et SET "jobTypeId" = jt."id"
FROM "JobType" jt WHERE jt."tenantId" = et."tenantId" AND LOWER(jt."name") = LOWER(et."jobType") AND et."jobType" IS NOT NULL;

UPDATE "EmploymentTerm" et SET "jobStatusId" = js."id"
FROM "JobStatus" js WHERE js."tenantId" = et."tenantId" AND LOWER(js."name") = LOWER(et."jobStatus") AND et."jobStatus" IS NOT NULL;

UPDATE "EmployeeMovement" em SET "toJobTypeId" = jt."id"
FROM "JobType" jt WHERE jt."tenantId" = em."tenantId" AND LOWER(jt."name") = LOWER(em."toJobType") AND em."toJobType" IS NOT NULL;

UPDATE "EmployeeMovement" em SET "toJobStatusId" = js."id"
FROM "JobStatus" js WHERE js."tenantId" = em."tenantId" AND LOWER(js."name") = LOWER(em."toJobStatus") AND em."toJobStatus" IS NOT NULL;

-- Drop old string columns
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "jobType";
ALTER TABLE "EmploymentTerm" DROP COLUMN IF EXISTS "jobType";
ALTER TABLE "EmploymentTerm" DROP COLUMN IF EXISTS "jobStatus";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "toJobType";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "toJobStatus";
