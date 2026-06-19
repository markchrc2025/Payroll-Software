-- Leave → DTR linkage (Phase 4): paid/unpaid split on leave transactions and
-- paid-leave minutes / leave link on the daily DTR record.

-- CreateEnum (guarded so the migration is re-runnable)
DO $$ BEGIN
  CREATE TYPE "LeavePortion" AS ENUM ('FULL', 'HALF_AM', 'HALF_PM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: leave transaction paid/unpaid split + day portion
ALTER TABLE "LeaveTransaction" ADD COLUMN IF NOT EXISTS "dayPortion"  "LeavePortion" NOT NULL DEFAULT 'FULL';
ALTER TABLE "LeaveTransaction" ADD COLUMN IF NOT EXISTS "paidUnits"   DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "LeaveTransaction" ADD COLUMN IF NOT EXISTS "unpaidUnits" DECIMAL(8,4) NOT NULL DEFAULT 0;

-- Backfill: existing USAGE leaves were fully paid under the old logic.
UPDATE "LeaveTransaction" SET "paidUnits" = "amount" WHERE "type" = 'USAGE' AND "paidUnits" = 0;

-- AlterTable: DTR paid-leave credit + leave link
ALTER TABLE "DTRRecord" ADD COLUMN IF NOT EXISTS "paidLeaveMinutes"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DTRRecord" ADD COLUMN IF NOT EXISTS "leaveTransactionId" TEXT;

-- FK: DTRRecord.leaveTransactionId → LeaveTransaction.id (set null on delete)
DO $$ BEGIN
  ALTER TABLE "DTRRecord"
    ADD CONSTRAINT "DTRRecord_leaveTransactionId_fkey"
    FOREIGN KEY ("leaveTransactionId") REFERENCES "LeaveTransaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "DTRRecord_leaveTransactionId_idx" ON "DTRRecord"("leaveTransactionId");
