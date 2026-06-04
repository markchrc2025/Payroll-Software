-- Migration: ah1_pay_schedule_days
-- Add BI_WEEKLY to PayFrequency enum and payDay1/payDay2 columns to Tenant

ALTER TYPE "PayFrequency" ADD VALUE IF NOT EXISTS 'BI_WEEKLY';

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "payDay1" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "payDay2" INTEGER;
