-- CreateEnum
CREATE TYPE "TimekeepingTimezoneMode" AS ENUM ('COMPANY', 'EMPLOYEE');

-- AlterTable: company timezone + timekeeping mode (default Asia/Manila / COMPANY)
ALTER TABLE "Tenant"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN "timekeepingTimezoneMode" "TimekeepingTimezoneMode" NOT NULL DEFAULT 'COMPANY';

-- AlterTable: optional per-employee timezone override (used only in EMPLOYEE mode)
ALTER TABLE "Employee"
  ADD COLUMN "timezone" TEXT;
