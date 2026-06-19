-- Overtime policy (Phase 2): per-shift OT approval + break-deduction rule,
-- plus advisory suggested-OT minutes on the daily DTR record.

-- CreateEnum (guarded so the migration is re-runnable)
DO $$ BEGIN
  CREATE TYPE "OtBreakMode" AS ENUM ('NONE', 'SINGLE', 'TIERED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: per-shift overtime policy
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otRequiresApproval" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otAutoApprove"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otBreakMode"        "OtBreakMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otBreakTriggerHours" DECIMAL(5,2);
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otBreakBlockHours"   DECIMAL(5,2);
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "otBreakMinutes"      INTEGER;

-- AlterTable: advisory suggested OT (never paid)
ALTER TABLE "DTRRecord" ADD COLUMN IF NOT EXISTS "suggestedOtMinutes" INTEGER NOT NULL DEFAULT 0;
