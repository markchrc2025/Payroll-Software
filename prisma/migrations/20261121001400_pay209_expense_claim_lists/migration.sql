-- Wave A2 (PAY-209, decision 6, Mark 21 Nov 2026): expense claims take their
-- category and type from the company's lists; limits are flagged, not blocking.
ALTER TABLE "ExpenseClaim" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN "typeId" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN "limitFlags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ExpenseClaim" ADD COLUMN "taxTreatmentReason" TEXT;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ExpenseClaim_tenantId_employeeId_categoryId_claimDate_idx"
  ON "ExpenseClaim"("tenantId", "employeeId", "categoryId", "claimDate");
-- Claims filed before this change keep their text category and no list link.
