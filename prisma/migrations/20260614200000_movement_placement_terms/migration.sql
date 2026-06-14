-- Movement redesign: add Placement / Employment Terms scope to EmployeeMovement
-- Run in Supabase SQL editor before deploying, then run: npx prisma generate

-- New MovementType enum values
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PLACEMENT_CHANGE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TERMS_CHANGE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'COMBINED_CHANGE';

-- New EmployeeMovement columns
ALTER TABLE "EmployeeMovement"
  ADD COLUMN IF NOT EXISTS "toLineManagerId"    TEXT,
  ADD COLUMN IF NOT EXISTS "toJobType"          TEXT,
  ADD COLUMN IF NOT EXISTS "toJobStatus"        TEXT,
  ADD COLUMN IF NOT EXISTS "toLeaveWorkflowKey" TEXT,
  ADD COLUMN IF NOT EXISTS "toWorkdayKey"       TEXT,
  ADD COLUMN IF NOT EXISTS "toHolidayKey"       TEXT,
  ADD COLUMN IF NOT EXISTS "toTermStart"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "toTermEnd"          TIMESTAMPTZ;
