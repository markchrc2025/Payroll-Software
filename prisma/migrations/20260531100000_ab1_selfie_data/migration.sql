-- Add selfieData column to AttendanceLog for storing raw JPEG bytes
-- when Cloudflare R2 is not configured (dev/on-prem environments).
ALTER TABLE "AttendanceLog" ADD COLUMN IF NOT EXISTS "selfieData" BYTEA;
