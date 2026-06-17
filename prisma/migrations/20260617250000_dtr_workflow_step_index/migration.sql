-- Phase C — DTR approval moves onto the configurable ApprovalWorkflow engine.
-- Adds a step pointer so DTRSubmission can advance through ApprovalStep rows
-- (module = 'DTR') the same way LeaveTransaction does.

ALTER TABLE "DTRSubmission" ADD COLUMN IF NOT EXISTS "currentStepIndex" INTEGER NOT NULL DEFAULT 0;
