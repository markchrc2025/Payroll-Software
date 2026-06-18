-- Replace the hardcoded PositionLevel enum on Position with a FK to JobLevel.
-- This lets each Position be assigned to a user-defined Level, and enables
-- the Add Employee wizard to filter positions by the selected Level.

-- 1. Add the FK column
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "levelId" TEXT;

-- 2. FK constraint (SET NULL so deleting a JobLevel doesn't orphan positions)
DO $$ BEGIN
  ALTER TABLE "Position" ADD CONSTRAINT "Position_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "JobLevel"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Index
CREATE INDEX IF NOT EXISTS "Position_levelId_idx" ON "Position"("levelId");

-- 4. Drop the old enum column (existing enum values cannot be auto-mapped to
--    JobLevel IDs; users reassign levels via the Positions page).
ALTER TABLE "Position" DROP COLUMN IF EXISTS "level";
