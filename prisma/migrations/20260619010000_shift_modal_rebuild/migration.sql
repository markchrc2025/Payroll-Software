-- Shift modal rebuild: add OPEN shift type, new break policies, and core time window columns.
ALTER TYPE "ShiftType"   ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "BreakPolicy" ADD VALUE IF NOT EXISTS 'FLOATING';
ALTER TYPE "BreakPolicy" ADD VALUE IF NOT EXISTS 'PUNCH_IN_OUT';
ALTER TYPE "BreakPolicy" ADD VALUE IF NOT EXISTS 'PAID_BREAK';
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "coreTimeIn"  TEXT;
ALTER TABLE "ShiftSchedule" ADD COLUMN IF NOT EXISTS "coreTimeOut" TEXT;
