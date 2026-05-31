-- CreateEnum
CREATE TYPE "DTRManualReasonCode" AS ENUM ('FORGOT_CLOCK_IN', 'FORGOT_CLOCK_OUT', 'GPS_FAILURE', 'KIOSK_OFFLINE', 'SYSTEM_ERROR', 'SCHEDULE_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DTRSubmissionStatus" AS ENUM ('SUBMITTED', 'SUPERVISOR_APPROVED', 'MANAGER_APPROVED', 'RETURNED');

-- AlterTable
ALTER TABLE "DTRRecord" ADD COLUMN     "effectiveTimeIn" TIMESTAMP(3),
ADD COLUMN     "effectiveTimeOut" TIMESTAMP(3),
ADD COLUMN     "manualActorId" TEXT,
ADD COLUMN     "manualActorRole" TEXT,
ADD COLUMN     "manualNotes" TEXT,
ADD COLUMN     "manualReasonCode" "DTRManualReasonCode",
ADD COLUMN     "manualTimeIn" TIMESTAMP(3),
ADD COLUMN     "manualTimeOut" TIMESTAMP(3),
ADD COLUMN     "manualUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "officialTimeIn" TIMESTAMP(3),
ADD COLUMN     "officialTimeOut" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DTRSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DTRSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "supervisorId" TEXT,
    "supervisorActedAt" TIMESTAMP(3),
    "managerId" TEXT,
    "managerActedAt" TIMESTAMP(3),
    "returnedReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DTRSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DTRAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dtrRecordId" TEXT NOT NULL,
    "dtrSubmissionId" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fieldChanged" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reasonCode" "DTRManualReasonCode" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DTRAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DTRSubmission_tenantId_idx" ON "DTRSubmission"("tenantId");

-- CreateIndex
CREATE INDEX "DTRSubmission_tenantId_employeeId_idx" ON "DTRSubmission"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "DTRSubmission_tenantId_status_idx" ON "DTRSubmission"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DTRSubmission_tenantId_periodStart_periodEnd_idx" ON "DTRSubmission"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "DTRSubmission_tenantId_employeeId_periodStart_periodEnd_key" ON "DTRSubmission"("tenantId", "employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "DTRAuditLog_tenantId_idx" ON "DTRAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "DTRAuditLog_dtrRecordId_idx" ON "DTRAuditLog"("dtrRecordId");

-- CreateIndex
CREATE INDEX "DTRAuditLog_dtrSubmissionId_idx" ON "DTRAuditLog"("dtrSubmissionId");

-- CreateIndex
CREATE INDEX "DTRAuditLog_actorId_idx" ON "DTRAuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "DTRSubmission" ADD CONSTRAINT "DTRSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRSubmission" ADD CONSTRAINT "DTRSubmission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRSubmission" ADD CONSTRAINT "DTRSubmission_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRSubmission" ADD CONSTRAINT "DTRSubmission_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRAuditLog" ADD CONSTRAINT "DTRAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRAuditLog" ADD CONSTRAINT "DTRAuditLog_dtrRecordId_fkey" FOREIGN KEY ("dtrRecordId") REFERENCES "DTRRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DTRAuditLog" ADD CONSTRAINT "DTRAuditLog_dtrSubmissionId_fkey" FOREIGN KEY ("dtrSubmissionId") REFERENCES "DTRSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
