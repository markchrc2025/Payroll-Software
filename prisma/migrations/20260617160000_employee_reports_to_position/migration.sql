-- Org Chart: allow an employee to report to a (vacant) position/role instead of
-- a specific person. NULL by default; set when a card is dropped on a vacant node.

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "reportsToPositionId" TEXT;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_reportsToPositionId_fkey"
  FOREIGN KEY ("reportsToPositionId") REFERENCES "Position"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Employee_reportsToPositionId_idx"
  ON "Employee"("reportsToPositionId");
