-- Phase 3: Level → default LeaveWorkflow policy

ALTER TABLE "JobLevel" ADD COLUMN "defaultLeaveWorkflowId" TEXT;
CREATE INDEX "JobLevel_defaultLeaveWorkflowId_idx" ON "JobLevel"("defaultLeaveWorkflowId");

ALTER TABLE "JobLevel"
  ADD CONSTRAINT "JobLevel_defaultLeaveWorkflowId_fkey"
  FOREIGN KEY ("defaultLeaveWorkflowId") REFERENCES "LeaveWorkflow"("id") ON DELETE SET NULL;
