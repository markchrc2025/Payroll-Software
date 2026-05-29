-- AlterTable
ALTER TABLE "StatutoryId" ADD COLUMN "numberHmac" TEXT;

-- CreateIndex
CREATE INDEX "StatutoryId_type_numberHmac_idx" ON "StatutoryId"("type", "numberHmac");
