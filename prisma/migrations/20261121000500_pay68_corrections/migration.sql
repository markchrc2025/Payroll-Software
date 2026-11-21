-- PAY-68 (1.13, Q1b): payroll corrections, a new document, never an edit.
CREATE TYPE "PayrollCorrectionStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

CREATE TABLE "PayrollCorrection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "originalSheetId" TEXT NOT NULL,
    "correctsId" TEXT,
    "controlNumber" TEXT,
    "status" "PayrollCorrectionStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "netEffectCents" BIGINT NOT NULL,
    "targetBookId" TEXT,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollCorrection_tenantId_idx" ON "PayrollCorrection"("tenantId");
CREATE INDEX "PayrollCorrection_originalSheetId_idx" ON "PayrollCorrection"("originalSheetId");
CREATE INDEX "PayrollCorrection_targetBookId_idx" ON "PayrollCorrection"("targetBookId");
CREATE UNIQUE INDEX "PayrollCorrection_tenantId_controlNumber_key" ON "PayrollCorrection"("tenantId", "controlNumber");
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_originalSheetId_fkey" FOREIGN KEY ("originalSheetId") REFERENCES "PayrollSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "PayrollCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_targetBookId_fkey" FOREIGN KEY ("targetBookId") REFERENCES "PayrollBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustment" ADD COLUMN "correctionId" TEXT;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "PayrollCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollCorrection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollCorrection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PayrollCorrection";
CREATE POLICY tenant_isolation ON "PayrollCorrection"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PayrollCorrection' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "PayrollCorrection"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'PayrollCorrection', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "PayrollCorrection" TO payroll_app';
  END IF;
END
$$;

-- An approved correction is a filed document: its figures never change again
-- (Q8b). Only cancelling it, or recording where it landed, is allowed.
CREATE OR REPLACE FUNCTION pay68_correction_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE changed text[];
BEGIN
  IF pay67_is_superuser() OR OLD.status = 'DRAFT' THEN RETURN NEW; END IF;
  changed := pay67_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'cancelledAt', 'targetBookId', 'updatedAt']);
  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION 'correction % is approved: % cannot be changed', COALESCE(OLD."controlNumber", OLD.id), array_to_string(changed, ', ') USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'correction % is cancelled', COALESCE(OLD."controlNumber", OLD.id) USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS pay68_correction_fixed ON "PayrollCorrection";
CREATE TRIGGER pay68_correction_fixed BEFORE UPDATE ON "PayrollCorrection"
  FOR EACH ROW EXECUTE FUNCTION pay68_correction_fixed();
