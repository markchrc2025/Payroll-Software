-- Universal Approval Workflow — generalize Leave-only workflow into a cross-module engine.
-- Renames LeaveWorkflow → ApprovalWorkflow, LeaveApproval → ApprovalStep (polymorphic via
-- module + entityId), moves workflow assignment into Placement, and drops the per-term
-- leaveWorkflowKey override. Idempotent guards so it can be re-run safely.

-- 1. Rename the workflow template table.
ALTER TABLE "LeaveWorkflow" RENAME TO "ApprovalWorkflow";

-- 2. Rename the JobLevel default-workflow FK column.
ALTER TABLE "JobLevel" RENAME COLUMN "defaultLeaveWorkflowId" TO "defaultWorkflowId";
ALTER INDEX IF EXISTS "JobLevel_defaultLeaveWorkflowId_idx" RENAME TO "JobLevel_defaultWorkflowId_idx";

-- 3. Rename LeaveApproval → ApprovalStep; make it polymorphic.
ALTER TABLE "LeaveApproval" RENAME TO "ApprovalStep";
ALTER TABLE "ApprovalStep" RENAME COLUMN "leaveTransactionId" TO "entityId";

-- 3a. Drop the old FK to LeaveTransaction (ApprovalStep is now polymorphic).
ALTER TABLE "ApprovalStep" DROP CONSTRAINT IF EXISTS "LeaveApproval_leaveTransactionId_fkey";

-- 4. Rename the status enum.
ALTER TYPE "LeaveApprovalStatus" RENAME TO "ApprovalStepStatus";

-- 5. Add the module discriminator enum + column (default LEAVE for existing rows).
DO $$ BEGIN
  CREATE TYPE "ApprovalModule" AS ENUM ('LEAVE', 'DTR', 'EXPENSE', 'DOCUMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "ApprovalStep" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL DEFAULT 'LEAVE';
ALTER TABLE "ApprovalStep"
  ALTER COLUMN "module" DROP DEFAULT,
  ALTER COLUMN "module" TYPE "ApprovalModule" USING "module"::"ApprovalModule";

-- 5a. Re-point indexes for the polymorphic shape.
DROP INDEX IF EXISTS "LeaveApproval_tenantId_leaveTransactionId_idx";
DROP INDEX IF EXISTS "ApprovalStep_tenantId_leaveTransactionId_idx";
CREATE INDEX IF NOT EXISTS "ApprovalStep_tenantId_module_entityId_idx"
  ON "ApprovalStep"("tenantId", "module", "entityId");

-- 6. Add Placement.workflowId (effective-dated workflow assignment).
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "workflowId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Placement" ADD CONSTRAINT "Placement_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Placement_workflowId_idx" ON "Placement"("workflowId");

-- 7. Drop the per-term and denormalized leaveWorkflowKey columns.
ALTER TABLE "EmploymentTerm" DROP COLUMN IF EXISTS "leaveWorkflowKey";
ALTER TABLE "Employee"       DROP COLUMN IF EXISTS "leaveWorkflowKey";

-- 8. Rename EmployeeMovement.toLeaveWorkflowKey → toWorkflowId and convert to an FK.
--    The old column held a workflow *code* string; the new one is a workflow *id*. Clear
--    existing values rather than attempt a code→id backfill.
ALTER TABLE "EmployeeMovement" RENAME COLUMN "toLeaveWorkflowKey" TO "toWorkflowId";
UPDATE "EmployeeMovement" SET "toWorkflowId" = NULL;
DO $$ BEGIN
  ALTER TABLE "EmployeeMovement" ADD CONSTRAINT "EmployeeMovement_toWorkflowId_fkey"
    FOREIGN KEY ("toWorkflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 9. Migrate the approvers JSON shape: string[] → {roleKey,forLeave,forDtr,forExpense,forDocument}[].
--    Existing leave-only chains apply to Leave, DTR, and Expense by default; Document opt-in later.
UPDATE "ApprovalWorkflow"
SET "approvers" = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'roleKey',     elem.value,
      'forLeave',    true,
      'forDtr',      true,
      'forExpense',  true,
      'forDocument', false
    )
  ), '[]'::jsonb)
  FROM jsonb_array_elements_text("approvers"::jsonb) AS elem
)
WHERE jsonb_typeof("approvers"::jsonb) = 'array'
  AND ("approvers"::jsonb = '[]'::jsonb
       OR jsonb_typeof("approvers"::jsonb -> 0) = 'string');
