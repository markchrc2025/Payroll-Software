-- Migration: R2-backed company logo + employee photo uploads
-- Run manually in Supabase SQL editor (Schema: public)
--
-- Adds object-storage key columns so logos/photos can be uploaded to the
-- tenant-namespaced R2 bucket instead of only referencing an external URL.

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "logoKey" TEXT;

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "photoKey" TEXT;
