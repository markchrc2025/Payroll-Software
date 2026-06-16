-- Add departmentId FK to Position table
ALTER TABLE "Position"
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Position_departmentId_idx" ON "Position"("departmentId");
