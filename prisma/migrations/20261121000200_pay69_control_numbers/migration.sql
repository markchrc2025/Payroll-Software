-- PAY-69 (Q3b, Mark 17 Nov 2026): document control numbers, gapless per
-- company, document type and year, issued when a run is finalized.

-- 1. The counters.
CREATE TABLE "DocumentSeries" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "docType"    TEXT NOT NULL,
  "seriesYear" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSeries_tenantId_docType_seriesYear_key" ON "DocumentSeries"("tenantId", "docType", "seriesYear");
CREATE INDEX "DocumentSeries_tenantId_idx" ON "DocumentSeries"("tenantId");
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentSeries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DocumentSeries";
CREATE POLICY tenant_isolation ON "DocumentSeries"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
DO $$
DECLARE own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DocumentSeries' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "DocumentSeries"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'DocumentSeries', own_role);
  END IF;
END
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "DocumentSeries" TO payroll_app';
  END IF;
END
$$;

-- 2. The numbers on runs and payslips.
ALTER TABLE "PayrollBook" ADD COLUMN "controlNumber" TEXT;
ALTER TABLE "PayrollSheet" ADD COLUMN "controlNumber" TEXT;
CREATE UNIQUE INDEX "PayrollBook_tenantId_controlNumber_key" ON "PayrollBook"("tenantId", "controlNumber");
CREATE UNIQUE INDEX "PayrollSheet_tenantId_controlNumber_key" ON "PayrollSheet"("tenantId", "controlNumber");

-- 3. Number the runs already finalized, in the order they were finalized,
--    and their payslips by employee name, so the history has no gap either.
WITH runs AS (
  SELECT b.id, b."tenantId", EXTRACT(YEAR FROM b."periodEnd")::int AS y,
         ROW_NUMBER() OVER (PARTITION BY b."tenantId", EXTRACT(YEAR FROM b."periodEnd")
                            ORDER BY b."finalizedAt" NULLS FIRST, b."createdAt", b.id) AS n
    FROM "PayrollBook" b
   WHERE b.status = 'FINALIZED'
)
UPDATE "PayrollBook" b
   SET "controlNumber" = 'PR-' || runs.y || '-' || LPAD(runs.n::text, 4, '0')
  FROM runs WHERE runs.id = b.id;

WITH slips AS (
  SELECT s.id, EXTRACT(YEAR FROM b."periodEnd")::int AS y,
         ROW_NUMBER() OVER (PARTITION BY s."tenantId", EXTRACT(YEAR FROM b."periodEnd")
                            ORDER BY b."finalizedAt" NULLS FIRST, b."createdAt", b.id, e."lastName", e."firstName", e.id) AS n
    FROM "PayrollSheet" s
    JOIN "PayrollBook" b ON b.id = s."payrollBookId"
    JOIN "Employee" e ON e.id = s."employeeId"
   WHERE b.status = 'FINALIZED'
)
UPDATE "PayrollSheet" s
   SET "controlNumber" = 'PS-' || slips.y || '-' || LPAD(slips.n::text, 6, '0')
  FROM slips WHERE slips.id = s.id;

INSERT INTO "DocumentSeries" (id, "tenantId", "docType", "seriesYear", "lastNumber", "updatedAt")
SELECT 'ds_' || md5(b."tenantId" || 'PAYROLL_RUN' || EXTRACT(YEAR FROM b."periodEnd")::int), b."tenantId", 'PAYROLL_RUN',
       EXTRACT(YEAR FROM b."periodEnd")::int, COUNT(*), now()
  FROM "PayrollBook" b WHERE b."controlNumber" IS NOT NULL
 GROUP BY b."tenantId", EXTRACT(YEAR FROM b."periodEnd");

INSERT INTO "DocumentSeries" (id, "tenantId", "docType", "seriesYear", "lastNumber", "updatedAt")
SELECT 'ds_' || md5(s."tenantId" || 'PAYSLIP' || EXTRACT(YEAR FROM b."periodEnd")::int), s."tenantId", 'PAYSLIP',
       EXTRACT(YEAR FROM b."periodEnd")::int, COUNT(*), now()
  FROM "PayrollSheet" s JOIN "PayrollBook" b ON b.id = s."payrollBookId"
 WHERE s."controlNumber" IS NOT NULL
 GROUP BY s."tenantId", EXTRACT(YEAR FROM b."periodEnd");

-- 4. Once issued, a control number never changes (Q8b: document control
--    numbers are never editable).
CREATE OR REPLACE FUNCTION pay69_control_number_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."controlNumber" IS NOT NULL AND NEW."controlNumber" IS DISTINCT FROM OLD."controlNumber" THEN
    RAISE EXCEPTION 'control number % cannot be changed', OLD."controlNumber" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS pay69_book_control_number_fixed ON "PayrollBook";
CREATE TRIGGER pay69_book_control_number_fixed BEFORE UPDATE OF "controlNumber" ON "PayrollBook"
  FOR EACH ROW EXECUTE FUNCTION pay69_control_number_is_fixed();
DROP TRIGGER IF EXISTS pay69_sheet_control_number_fixed ON "PayrollSheet";
CREATE TRIGGER pay69_sheet_control_number_fixed BEFORE UPDATE OF "controlNumber" ON "PayrollSheet"
  FOR EACH ROW EXECUTE FUNCTION pay69_control_number_is_fixed();
