-- Migration: ag1_jobs_schema
-- Adds PROCESSING state to PayrollBookStatus enum and payslipKey to PayrollSheet

-- Add PROCESSING to the PayrollBookStatus enum
ALTER TYPE "PayrollBookStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- Add payslipKey column to PayrollSheet
ALTER TABLE "PayrollSheet" ADD COLUMN IF NOT EXISTS "payslipKey" TEXT;
