-- Repair: bring "EmployeeMovement" in line with the current schema on databases
-- where 20260614200000_movement_placement_terms was never applied (so the later
-- workday→shift and term-end→next-review migrations had no "toWorkdayKey" /
-- "toTermEnd" source columns to convert).
--
-- Apply in the Supabase SQL editor, then run: npx prisma generate
--
-- Every statement is idempotent (ADD VALUE / ADD COLUMN ... IF NOT EXISTS), so
-- this is a harmless no-op on any database that already ran the full chain.

-- 1. MovementType enum values introduced by the movement redesign ---------------
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PLACEMENT_CHANGE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TERMS_CHANGE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'COMBINED_CHANGE';

-- 2. Movement scope columns expected by the current schema ----------------------
--    "toShiftScheduleId" / "toLevelId" / "fromLevelId" already exist (added with
--    their FKs by the job-level and workday→shift migrations). "toNextReviewDate"
--    is created here directly because "toTermEnd" never existed to be renamed.
--    Types match the unannotated DateTime? fields in schema.prisma -> TIMESTAMP(3).
ALTER TABLE "EmployeeMovement"
  ADD COLUMN IF NOT EXISTS "toLineManagerId"    TEXT,
  ADD COLUMN IF NOT EXISTS "toJobType"          TEXT,
  ADD COLUMN IF NOT EXISTS "toJobStatus"        TEXT,
  ADD COLUMN IF NOT EXISTS "toLeaveWorkflowKey" TEXT,
  ADD COLUMN IF NOT EXISTS "toHolidayKey"       TEXT,
  ADD COLUMN IF NOT EXISTS "toTermStart"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "toNextReviewDate"   TIMESTAMP(3);
