-- Employee Self-Service access lifecycle + scheduled deactivation.
-- Employees do NOT get ESS access on creation — HR must grant it.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EssAccessStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: ESS access fields. Existing employees default to NOT_INVITED
-- (they must be explicitly invited/activated before they can sign in).
ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "essAccessStatus" "EssAccessStatus" NOT NULL DEFAULT 'NOT_INVITED',
  ADD COLUMN IF NOT EXISTS "essInvitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "essActivatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "essInvitedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "essLastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "essDeactivateAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "essDeactivateReason" TEXT,
  ADD COLUMN IF NOT EXISTS "essDeactivateScheduledByUserId" TEXT;

-- Index for the hourly deactivation sweep (find ACTIVE rows past their schedule).
CREATE INDEX IF NOT EXISTS "Employee_essDeactivateAt_idx" ON "Employee"("essDeactivateAt");
