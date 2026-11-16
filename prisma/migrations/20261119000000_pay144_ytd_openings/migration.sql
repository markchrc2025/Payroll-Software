-- PAY-144 (Mark, 16 Nov 2026, HR.my review D4 = C): year-to-date openings.
--
-- A company that joins Sentire mid-year (or hires someone who worked for
-- another employer earlier in the year) enters what was paid before Sentire.
-- 13th month, the 90,000 exemption, year-end annualization, final pay and the
-- 2316 read these rows. No existing data changes: a company without openings
-- computes exactly as before.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'YtdOpeningSource') THEN
    CREATE TYPE "YtdOpeningSource" AS ENUM ('PRIOR_PAYROLL', 'PREVIOUS_EMPLOYER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "EmployeeYtdOpening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "source" "YtdOpeningSource" NOT NULL,
    "previousEmployerName" TEXT,
    "previousEmployerTin" TEXT,
    "basicPayEarnedCents" BIGINT NOT NULL DEFAULT 0,
    "thirteenthMonthPaidCents" BIGINT NOT NULL DEFAULT 0,
    "taxableCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "withholdingTaxCents" BIGINT NOT NULL DEFAULT 0,
    "nontaxable13MonthAndBenefitsCents" BIGINT NOT NULL DEFAULT 0,
    "sssEeCents" BIGINT NOT NULL DEFAULT 0,
    "philhealthEeCents" BIGINT NOT NULL DEFAULT 0,
    "pagibigEeCents" BIGINT NOT NULL DEFAULT 0,
    "otherNontaxableCents" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeYtdOpening_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeYtdOpening_year_range" CHECK ("year" BETWEEN 2000 AND 2099),
    CONSTRAINT "EmployeeYtdOpening_amounts_nonnegative" CHECK (
      "basicPayEarnedCents" >= 0 AND "thirteenthMonthPaidCents" >= 0
      AND "taxableCompensationCents" >= 0 AND "withholdingTaxCents" >= 0
      AND "nontaxable13MonthAndBenefitsCents" >= 0
      AND "sssEeCents" >= 0 AND "philhealthEeCents" >= 0 AND "pagibigEeCents" >= 0
      AND "otherNontaxableCents" >= 0
    ),
    -- A CHECK rejects only on FALSE, so the NULL cases are written out.
    CONSTRAINT "EmployeeYtdOpening_source_shape" CHECK (
      ("source" = 'PRIOR_PAYROLL'
        AND "previousEmployerName" IS NULL AND "previousEmployerTin" IS NULL)
      OR ("source" = 'PREVIOUS_EMPLOYER'
        AND "previousEmployerName" IS NOT NULL AND length(btrim("previousEmployerName")) > 0
        AND "basicPayEarnedCents" = 0 AND "thirteenthMonthPaidCents" = 0
        AND "sssEeCents" = 0 AND "philhealthEeCents" = 0 AND "pagibigEeCents" = 0
        AND "otherNontaxableCents" = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeYtdOpening_tenantId_employeeId_year_source_key"
  ON "EmployeeYtdOpening"("tenantId", "employeeId", "year", "source");
CREATE INDEX IF NOT EXISTS "EmployeeYtdOpening_tenantId_year_idx"
  ON "EmployeeYtdOpening"("tenantId", "year");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeYtdOpening_tenantId_fkey') THEN
    ALTER TABLE "EmployeeYtdOpening" ADD CONSTRAINT "EmployeeYtdOpening_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeYtdOpening_employeeId_fkey') THEN
    ALTER TABLE "EmployeeYtdOpening" ADD CONSTRAINT "EmployeeYtdOpening_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- Row level security, the shape every tenant table has (unit 0.7 T6).
ALTER TABLE "EmployeeYtdOpening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeYtdOpening" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmployeeYtdOpening";
CREATE POLICY tenant_isolation ON "EmployeeYtdOpening"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$
DECLARE
  own_role text;
BEGIN
  SELECT tableowner INTO own_role FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'EmployeeYtdOpening' LIMIT 1;
  IF own_role IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass ON "EmployeeYtdOpening"';
    EXECUTE format('CREATE POLICY admin_bypass ON %I TO %I USING (true) WITH CHECK (true)', 'EmployeeYtdOpening', own_role);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "EmployeeYtdOpening" TO payroll_app';
  END IF;
END
$$;
