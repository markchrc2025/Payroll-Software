-- Wave A3 (PAY-210): incidents take their category, type and decision from the
-- company's lists. The decision's outcome is copied at resolution.
ALTER TABLE "IncidentReport" ADD COLUMN "typeId" TEXT;
ALTER TABLE "IncidentReport" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "IncidentReport" ADD COLUMN "decisionId" TEXT;
ALTER TABLE "IncidentReport" ADD COLUMN "decisionSuspensionDays" INTEGER;
ALTER TABLE "IncidentReport" ADD COLUMN "decisionIsDismissal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_decisionSuspensionDays_check"
  CHECK ("decisionSuspensionDays" IS NULL OR "decisionSuspensionDays" > 0);
