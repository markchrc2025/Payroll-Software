-- Wave G3 (PAY-217): incident decision outcomes. A suspension becomes unpaid
-- DTR days tagged with the incident; a dismissal opens an offboarding case.
ALTER TABLE "IncidentReport" ADD COLUMN "suspensionStartDate" TIMESTAMP(3);
ALTER TABLE "IncidentReport" ADD COLUMN "suspensionDates" JSONB;
ALTER TABLE "IncidentReport" ADD COLUMN "offboardingCaseId" TEXT;
ALTER TABLE "DTRRecord" ADD COLUMN "incidentReportId" TEXT;
CREATE INDEX "DTRRecord_incidentReportId_idx" ON "DTRRecord"("incidentReportId");
