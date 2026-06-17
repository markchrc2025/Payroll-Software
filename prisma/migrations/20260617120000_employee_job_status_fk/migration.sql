-- Replace the free-text Employee.jobDescription column with a JobStatus FK
-- (mirrors the existing Employee.jobTypeId wiring). JobStatus rows are already
-- seeded per tenant by 20260616230000_job_type_status_fk.

-- 1. Add the FK column
ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "jobStatusId" TEXT REFERENCES "JobStatus"("id") ON DELETE SET NULL;

-- 2. Backfill from the old free-text value by case-insensitive name match
UPDATE "Employee" e
SET "jobStatusId" = js."id"
FROM "JobStatus" js
WHERE js."tenantId" = e."tenantId"
  AND LOWER(js."name") = LOWER(e."jobDescription")
  AND e."jobDescription" IS NOT NULL;

-- 3. Index to match Prisma schema
CREATE INDEX IF NOT EXISTS "Employee_jobStatusId_idx" ON "Employee"("jobStatusId");

-- 4. Drop the old free-text column
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "jobDescription";
