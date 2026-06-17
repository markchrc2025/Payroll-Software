-- Phase 2: Leave Approval Engine
-- Add currentStepIndex to LeaveTransaction and create LeaveApproval table.

ALTER TABLE "LeaveTransaction" ADD COLUMN "currentStepIndex" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "LeaveApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

CREATE TABLE "LeaveApproval" (
  "id"                 TEXT         NOT NULL,
  "tenantId"           TEXT         NOT NULL,
  "leaveTransactionId" TEXT         NOT NULL,
  "stepIndex"          INTEGER      NOT NULL,
  "roleKey"            TEXT         NOT NULL,
  "approverEmployeeId" TEXT         NOT NULL,
  "status"             "LeaveApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "actedByUserId"      TEXT,
  "actedAt"            TIMESTAMP(3),
  "note"               TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaveApproval_tenantId_leaveTransactionId_idx"
  ON "LeaveApproval"("tenantId", "leaveTransactionId");

CREATE INDEX "LeaveApproval_approverEmployeeId_status_idx"
  ON "LeaveApproval"("approverEmployeeId", "status");

ALTER TABLE "LeaveApproval"
  ADD CONSTRAINT "LeaveApproval_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

ALTER TABLE "LeaveApproval"
  ADD CONSTRAINT "LeaveApproval_leaveTransactionId_fkey"
  FOREIGN KEY ("leaveTransactionId") REFERENCES "LeaveTransaction"("id") ON DELETE CASCADE;

ALTER TABLE "LeaveApproval"
  ADD CONSTRAINT "LeaveApproval_approverEmployeeId_fkey"
  FOREIGN KEY ("approverEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
