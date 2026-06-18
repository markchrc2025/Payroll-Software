-- Shift Schedule Rebuild: add code, requiredHours, gracePeriodMinutes, otThresholdMinutes
-- Make timeIn / timeOut nullable (FLEXIBLE shifts have no fixed time targets)

ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "requiredHours" FLOAT8;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otThresholdMinutes" INTEGER;
ALTER TABLE "ShiftSchedule" ALTER COLUMN "timeIn" DROP NOT NULL;
ALTER TABLE "ShiftSchedule" ALTER COLUMN "timeOut" DROP NOT NULL;
