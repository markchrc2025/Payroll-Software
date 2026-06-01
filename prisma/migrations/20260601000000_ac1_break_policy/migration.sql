-- Migration: ac1_break_policy
-- Adds BreakPolicy enum and breakPolicy column to ShiftSchedule.
--
-- FIXED_DEDUCTION (default): system auto-deducts breakMinutes from the worked span.
--   workedMinutes = (lastOUT − firstIN) − breakMinutes
--   Employee does NOT need to clock out for lunch.
--
-- TRACK_ACTUAL: system sums only paired IN-OUT intervals.
--   workedMinutes = Σ(OUT_i − IN_i)
--   Employee must clock out before lunch and clock back in after.

CREATE TYPE "BreakPolicy" AS ENUM ('FIXED_DEDUCTION', 'TRACK_ACTUAL');

ALTER TABLE "ShiftSchedule"
  ADD COLUMN "breakPolicy" "BreakPolicy" NOT NULL DEFAULT 'FIXED_DEDUCTION';
