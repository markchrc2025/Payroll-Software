-- Phase W: ATS (Applicant Tracking System)
-- JobPosting, Applicant, ApplicantNote models + RLS + GRANT

-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicantStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicantSource" AS ENUM ('REFERRAL', 'ONLINE_POSTING', 'WALK_IN', 'AGENCY', 'OTHER');

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "departmentId" TEXT,
    "branchId" TEXT,
    "positionId" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "resumeKey" TEXT,
    "stage" "ApplicantStage" NOT NULL DEFAULT 'APPLIED',
    "source" "ApplicantSource" NOT NULL DEFAULT 'ONLINE_POSTING',
    "rating" INTEGER,
    "assignedToUserId" TEXT,
    "hiredEmployeeId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicantNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicantNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPosting_tenantId_idx" ON "JobPosting"("tenantId");
CREATE INDEX "JobPosting_tenantId_status_idx" ON "JobPosting"("tenantId", "status");
CREATE INDEX "JobPosting_departmentId_idx" ON "JobPosting"("departmentId");
CREATE UNIQUE INDEX "JobPosting_tenantId_code_key" ON "JobPosting"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Applicant_hiredEmployeeId_key" ON "Applicant"("hiredEmployeeId");
CREATE INDEX "Applicant_tenantId_idx" ON "Applicant"("tenantId");
CREATE INDEX "Applicant_tenantId_stage_idx" ON "Applicant"("tenantId", "stage");
CREATE INDEX "Applicant_jobPostingId_idx" ON "Applicant"("jobPostingId");

-- CreateIndex
CREATE INDEX "ApplicantNote_tenantId_idx" ON "ApplicantNote"("tenantId");
CREATE INDEX "ApplicantNote_applicantId_idx" ON "ApplicantNote"("applicantId");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApplicantNote" ADD CONSTRAINT "ApplicantNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicantNote" ADD CONSTRAINT "ApplicantNote_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicantNote" ADD CONSTRAINT "ApplicantNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "JobPosting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobPosting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "JobPosting"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Applicant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Applicant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Applicant"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ApplicantNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicantNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ApplicantNote"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON "JobPosting" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Applicant" TO payroll_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApplicantNote" TO payroll_app;
