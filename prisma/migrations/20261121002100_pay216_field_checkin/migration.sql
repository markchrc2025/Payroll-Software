-- Wave F1 (PAY-216, decision 10): field check-in. A field worker's punch is
-- checked against every fence that applies; outside all is accepted and flagged.
ALTER TABLE "Employee" ADD COLUMN "fieldWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobType" ADD COLUMN "fieldWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AttendanceLog" ADD COLUMN "siteName" TEXT;
