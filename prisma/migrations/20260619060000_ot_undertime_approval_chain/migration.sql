-- Wire OT Applications and Undertime Requests into the ApprovalWorkflow chain.
-- Both modules piggyback on the forDtr flag in ApprovalWorkflow.approvers so
-- existing DTR-step configurations automatically cover OT and Undertime too.

-- Extend the ApprovalModule enum with the two new modules.
ALTER TYPE "ApprovalModule" ADD VALUE IF NOT EXISTS 'OT';
ALTER TYPE "ApprovalModule" ADD VALUE IF NOT EXISTS 'UNDERTIME';

-- Add the active-step pointer to OTApplication (mirrors DTRSubmission / LeaveTransaction).
ALTER TABLE "OTApplication"
  ADD COLUMN IF NOT EXISTS "currentStepIndex" INT NOT NULL DEFAULT 0;

-- Add the active-step pointer to UndertimeRequest.
ALTER TABLE "UndertimeRequest"
  ADD COLUMN IF NOT EXISTS "currentStepIndex" INT NOT NULL DEFAULT 0;
