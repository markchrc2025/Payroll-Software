-- Workday → Shift Schedule: replace free-text workdayKey with a FK to ShiftSchedule.
-- Apply in the Supabase SQL editor before deploying, then run: npx prisma generate

-- 1. Add FK columns ------------------------------------------------------------
ALTER TABLE "Employee"         ADD COLUMN IF NOT EXISTS "shiftScheduleId"   TEXT;
ALTER TABLE "EmploymentTerm"   ADD COLUMN IF NOT EXISTS "shiftScheduleId"   TEXT;
ALTER TABLE "EmployeeMovement" ADD COLUMN IF NOT EXISTS "toShiftScheduleId" TEXT;

-- 2. Best-effort backfill by matching workdayKey to a ShiftSchedule name -------
--    Guarded by column-existence checks so the migration is safe even when the
--    source column was never added (e.g. it was skipped in an earlier migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Employee' AND column_name = 'workdayKey'
  ) THEN
    UPDATE "Employee" e SET "shiftScheduleId" = s."id"
    FROM "ShiftSchedule" s
    WHERE s."tenantId" = e."tenantId"
      AND e."workdayKey" IS NOT NULL
      AND lower(trim(e."workdayKey")) = lower(s."name");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'EmploymentTerm' AND column_name = 'workdayKey'
  ) THEN
    UPDATE "EmploymentTerm" et SET "shiftScheduleId" = s."id"
    FROM "ShiftSchedule" s
    WHERE s."tenantId" = et."tenantId"
      AND et."workdayKey" IS NOT NULL
      AND lower(trim(et."workdayKey")) = lower(s."name");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'EmployeeMovement' AND column_name = 'toWorkdayKey'
  ) THEN
    UPDATE "EmployeeMovement" m SET "toShiftScheduleId" = s."id"
    FROM "ShiftSchedule" s
    WHERE s."tenantId" = m."tenantId"
      AND m."toWorkdayKey" IS NOT NULL
      AND lower(trim(m."toWorkdayKey")) = lower(s."name");
  END IF;
END $$;

-- 3. FK constraints + index ----------------------------------------------------
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_shiftScheduleId_fkey";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftScheduleId_fkey"
  FOREIGN KEY ("shiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Employee_shiftScheduleId_idx" ON "Employee"("shiftScheduleId");

ALTER TABLE "EmploymentTerm" DROP CONSTRAINT IF EXISTS "EmploymentTerm_shiftScheduleId_fkey";
ALTER TABLE "EmploymentTerm" ADD CONSTRAINT "EmploymentTerm_shiftScheduleId_fkey"
  FOREIGN KEY ("shiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeMovement" DROP CONSTRAINT IF EXISTS "EmployeeMovement_toShiftScheduleId_fkey";
ALTER TABLE "EmployeeMovement" ADD CONSTRAINT "EmployeeMovement_toShiftScheduleId_fkey"
  FOREIGN KEY ("toShiftScheduleId") REFERENCES "ShiftSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Drop old free-text columns ------------------------------------------------
ALTER TABLE "Employee"         DROP COLUMN IF EXISTS "workdayKey";
ALTER TABLE "EmploymentTerm"   DROP COLUMN IF EXISTS "workdayKey";
ALTER TABLE "EmployeeMovement" DROP COLUMN IF EXISTS "toWorkdayKey";
