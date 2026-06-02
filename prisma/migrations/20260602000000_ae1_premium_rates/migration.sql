-- Migration AE1: Premium Rate Configuration + full PeriodInput expansion
-- Adds PremiumRateConfig model for tenant-configurable multipliers and fills
-- the missing PeriodInput columns that the engine types already reference.

-- 1. PremiumMultiplierKey enum -----------------------------------------------
CREATE TYPE "PremiumMultiplierKey" AS ENUM (
  'OT',
  'NSD',
  'REST_DAY',
  'REST_DAY_OT',
  'SPECIAL_HOLIDAY',
  'SPECIAL_HOLIDAY_OT',
  'SPECIAL_HOLIDAY_REST_DAY',
  'SPECIAL_HOLIDAY_REST_DAY_OT',
  'REGULAR_HOLIDAY',
  'REGULAR_HOLIDAY_OT',
  'REGULAR_HOLIDAY_REST_DAY',
  'REGULAR_HOLIDAY_REST_DAY_OT',
  'DOUBLE_HOLIDAY',
  'DOUBLE_HOLIDAY_OT',
  'DOUBLE_HOLIDAY_REST_DAY',
  'DOUBLE_HOLIDAY_REST_DAY_OT',
  'HAZARD',
  'NO_WORK_REGULAR_HOLIDAY'
);

-- 2. PremiumRateConfig table --------------------------------------------------
CREATE TABLE "PremiumRateConfig" (
  "id"           TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "multiplierKey" "PremiumMultiplierKey" NOT NULL,
  "rate"         DECIMAL(8,4) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PremiumRateConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PremiumRateConfig"
  ADD CONSTRAINT "PremiumRateConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "PremiumRateConfig_tenantId_multiplierKey_key"
  ON "PremiumRateConfig"("tenantId", "multiplierKey");

CREATE INDEX "PremiumRateConfig_tenantId_idx"
  ON "PremiumRateConfig"("tenantId");

-- 3. Fill in previously-missing PeriodInput columns --------------------------
-- Group A: already in types.ts as optional but never in the DB schema
ALTER TABLE "PeriodInput"
  ADD COLUMN IF NOT EXISTS "restDayOtHours"              DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "specialHolidayOtHours"       DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "regularHolidayOtHours"       DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "doubleHolidayHours"          DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "noWorkRegularHolidayDays"    DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffOtHours"            DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRestDayHours"       DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRegularHolidayHours"   DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRegularHolidayOtHours" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- Group B: brand-new compound-scenario fields
ALTER TABLE "PeriodInput"
  ADD COLUMN IF NOT EXISTS "dayOffDutyDays"                        DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDaySpecialHolidayHours"            DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDaySpecialHolidayOtHours"          DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDayRegularHolidayHours"            DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDayRegularHolidayOtHours"          DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDayDoubleHolidayHours"             DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "restDayDoubleHolidayOtHours"           DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "doubleHolidayOtHours"                  DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRestDayOtHours"               DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffSpecialHolidayHours"          DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffSpecialHolidayOtHours"        DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffSpecialHolidayRestDayHours"   DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffSpecialHolidayRestDayOtHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRegularHolidayRestDayHours"   DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffRegularHolidayRestDayOtHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffDoubleHolidayHours"           DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffDoubleHolidayOtHours"         DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffDoubleHolidayRestDayHours"    DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nightDiffDoubleHolidayRestDayOtHours"  DECIMAL(6,2) NOT NULL DEFAULT 0;
