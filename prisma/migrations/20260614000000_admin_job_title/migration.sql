-- Migration: Add jobTitle to User (Central Portal administrator profile)
-- Run manually in Supabase SQL editor (Schema: public) BEFORE deploying the
-- code that selects this column.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
