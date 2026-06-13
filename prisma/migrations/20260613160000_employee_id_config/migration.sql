-- Employee ID format configuration columns on Tenant.
-- Run manually in Supabase SQL editor before deploying.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdPrefix"      TEXT    NOT NULL DEFAULT 'EMP-';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdIncludeYear" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdPadding"     INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdSuffix"      TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdNextSeq"     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "empIdSeqYear"     INTEGER;
