-- Job Level master module + FK wiring.
-- Apply in the Supabase SQL editor before deploying, then run: npx prisma generate

-- 1. New JobLevel master table -------------------------------------------------
CREATE TABLE IF NOT EXISTS "JobLevel" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "rank"        INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "JobLevel_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "JobLevel" DROP CONSTRAINT IF EXISTS "JobLevel_tenantId_fkey";
ALTER TABLE "JobLevel" ADD CONSTRAINT "JobLevel_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "JobLevel_tenantId_name_key" ON "JobLevel"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "JobLevel_tenantId_idx" ON "JobLevel"("tenantId");
CREATE INDEX IF NOT EXISTS "JobLevel_deletedAt_idx" ON "JobLevel"("deletedAt");

-- 2. Seed the standard level set for every tenant -----------------------------
INSERT INTO "JobLevel" ("id", "tenantId", "name", "rank")
SELECT
  gen_random_uuid()::text,
  t."id",
  v."name",
  v."rank"
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Entry', 1), ('Junior', 2), ('Mid', 3), ('Senior', 4),
  ('Lead', 5), ('Manager', 6), ('Executive', 7)
) AS v("name", "rank")
ON CONFLICT ("tenantId", "name") DO NOTHING;

-- 2b. Seed any distinct pre-existing free-text level values not already present
INSERT INTO "JobLevel" ("id", "tenantId", "name", "rank")
SELECT DISTINCT gen_random_uuid()::text, e."tenantId", trim(e."jobLevel"), 100
FROM "Employee" e
WHERE e."jobLevel" IS NOT NULL AND trim(e."jobLevel") <> ''
ON CONFLICT ("tenantId", "name") DO NOTHING;

-- 3. Add FK columns ------------------------------------------------------------
ALTER TABLE "Employee"         ADD COLUMN IF NOT EXISTS "levelId"     TEXT;
ALTER TABLE "Placement"        ADD COLUMN IF NOT EXISTS "levelId"     TEXT;
ALTER TABLE "EmployeeMovement" ADD COLUMN IF NOT EXISTS "toLevelId"   TEXT;
ALTER TABLE "EmployeeMovement" ADD COLUMN IF NOT EXISTS "fromLevelId" TEXT;

-- 4. Best-effort backfill FKs by case-insensitive name match -------------------
UPDATE "Employee" e SET "levelId" = jl."id"
FROM "JobLevel" jl
WHERE jl."tenantId" = e."tenantId"
  AND e."jobLevel" IS NOT NULL
  AND lower(trim(e."jobLevel")) = lower(jl."name");

UPDATE "Placement" p SET "levelId" = jl."id"
FROM "JobLevel" jl
WHERE jl."tenantId" = p."tenantId"
  AND p."level" IS NOT NULL
  AND lower(trim(p."level")) = lower(jl."name");

UPDATE "EmployeeMovement" m SET "toLevelId" = jl."id"
FROM "JobLevel" jl
WHERE jl."tenantId" = m."tenantId"
  AND m."toJobLevel" IS NOT NULL
  AND lower(trim(m."toJobLevel")) = lower(jl."name");

UPDATE "EmployeeMovement" m SET "fromLevelId" = jl."id"
FROM "JobLevel" jl
WHERE jl."tenantId" = m."tenantId"
  AND m."fromJobLevel" IS NOT NULL
  AND lower(trim(m."fromJobLevel")) = lower(jl."name");

-- 5. FK constraints + indexes --------------------------------------------------
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_levelId_fkey";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Employee_levelId_idx" ON "Employee"("levelId");

ALTER TABLE "Placement" DROP CONSTRAINT IF EXISTS "Placement_levelId_fkey";
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeMovement" DROP CONSTRAINT IF EXISTS "EmployeeMovement_toLevelId_fkey";
ALTER TABLE "EmployeeMovement" ADD CONSTRAINT "EmployeeMovement_toLevelId_fkey"
  FOREIGN KEY ("toLevelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeMovement" DROP CONSTRAINT IF EXISTS "EmployeeMovement_fromLevelId_fkey";
ALTER TABLE "EmployeeMovement" ADD CONSTRAINT "EmployeeMovement_fromLevelId_fkey"
  FOREIGN KEY ("fromLevelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Drop old free-text columns ------------------------------------------------
ALTER TABLE "Employee"         DROP COLUMN IF EXISTS "jobLevel";
ALTER TABLE "Placement"        DROP COLUMN IF EXISTS "level";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "toJobLevel";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "fromJobLevel";
