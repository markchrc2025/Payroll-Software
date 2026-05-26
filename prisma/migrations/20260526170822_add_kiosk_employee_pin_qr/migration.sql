/*
  Warnings:

  - A unique constraint covering the columns `[companyId,qrBadgeCode]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "kioskPinHash" TEXT,
ADD COLUMN     "qrBadgeCode" TEXT;

-- CreateTable
CREATE TABLE "Kiosk" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "requiresSelfie" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Kiosk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kiosk_deviceToken_key" ON "Kiosk"("deviceToken");

-- CreateIndex
CREATE INDEX "Kiosk_companyId_idx" ON "Kiosk"("companyId");

-- CreateIndex
CREATE INDEX "Kiosk_branchId_idx" ON "Kiosk"("branchId");

-- CreateIndex
CREATE INDEX "Kiosk_deletedAt_idx" ON "Kiosk"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_qrBadgeCode_key" ON "Employee"("companyId", "qrBadgeCode");

-- AddForeignKey
ALTER TABLE "Kiosk" ADD CONSTRAINT "Kiosk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kiosk" ADD CONSTRAINT "Kiosk_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
