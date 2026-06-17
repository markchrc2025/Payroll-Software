-- Reporting chain in Placement + Movements
-- Adds immediateSupervisorId to Placement (snapshot history) and
-- from/to reporting-chain fields to EmployeeMovement (the change event).

-- Placement: snapshot the immediate supervisor alongside the line manager.
ALTER TABLE "Placement" ADD COLUMN "immediateSupervisorId" TEXT;
ALTER TABLE "Placement"
  ADD CONSTRAINT "Placement_immediateSupervisorId_fkey"
  FOREIGN KEY ("immediateSupervisorId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmployeeMovement: capture both sides of the reporting chain on a change.
-- (These mirror the existing bare-scalar toLineManagerId field — no FK,
--  consistent with how movement target columns are modelled.)
ALTER TABLE "EmployeeMovement" ADD COLUMN "fromLineManagerId" TEXT;
ALTER TABLE "EmployeeMovement" ADD COLUMN "fromImmediateSupervisorId" TEXT;
ALTER TABLE "EmployeeMovement" ADD COLUMN "toImmediateSupervisorId" TEXT;
