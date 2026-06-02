-- Migration: ad1_holiday_calendar
-- Adds HolidayCategory enum, HolidayScope enum, and Holiday table.
-- Holiday rows are tenant-scoped and RLS-protected via the existing
-- tenant_isolation policy that fires on all tables with a tenantId column.

CREATE TYPE "HolidayCategory" AS ENUM (
  'LEGAL',
  'SPECIAL_NON_WORKING',
  'SPECIAL_ONE_TIME',
  'AREA_SPECIFIC'
);

CREATE TYPE "HolidayScope" AS ENUM (
  'COMPANY_WIDE',
  'BRANCH_SPECIFIC'
);

CREATE TABLE "Holiday" (
  "id"                    TEXT NOT NULL,
  "tenantId"              TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "category"              "HolidayCategory" NOT NULL,
  "date"                  TIMESTAMP(3) NOT NULL,
  "recurringAnnually"     BOOLEAN NOT NULL DEFAULT false,
  "scope"                 "HolidayScope" NOT NULL DEFAULT 'COMPANY_WIDE',
  "branchIds"             JSONB NOT NULL DEFAULT '[]',
  "region"                TEXT,
  "provinceCity"          TEXT,
  "proclamationReference" TEXT,
  "notes"                 TEXT,
  "isTentative"           BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId"       TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "deletedAt"             TIMESTAMP(3),

  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- Foreign key to Tenant
ALTER TABLE "Holiday"
  ADD CONSTRAINT "Holiday_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Indexes
CREATE INDEX "Holiday_tenantId_idx"          ON "Holiday"("tenantId");
CREATE INDEX "Holiday_tenantId_date_idx"     ON "Holiday"("tenantId", "date");
CREATE INDEX "Holiday_tenantId_category_idx" ON "Holiday"("tenantId", "category");
CREATE INDEX "Holiday_deletedAt_idx"         ON "Holiday"("deletedAt");

-- Enable RLS and apply the existing tenant_isolation policy
ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Holiday" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "Holiday"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Grant runtime app role access (payroll_app connects as non-superuser with RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON "Holiday" TO payroll_app;
