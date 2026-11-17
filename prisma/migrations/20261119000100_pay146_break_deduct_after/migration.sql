-- PAY-146 (HR.my review D5, Mark 16 Nov 2026): an unpaid meal break is
-- deducted only on days whose span is longer than this company setting.
-- Hand-written and idempotent; Tenant already has RLS and grants.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "breakDeductAfterMinutes" INTEGER NOT NULL DEFAULT 300;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Tenant_breakDeductAfterMinutes_range'
  ) THEN
    ALTER TABLE "Tenant"
      ADD CONSTRAINT "Tenant_breakDeductAfterMinutes_range"
      CHECK ("breakDeductAfterMinutes" BETWEEN 0 AND 1440);
  END IF;
END $$;
