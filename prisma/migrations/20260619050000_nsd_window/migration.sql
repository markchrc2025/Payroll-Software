-- NSD computation policy (Phase 7): configurable night-shift differential
-- window. NSD remains always-on; only the window is tenant-configurable.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nsdWindowStart" TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nsdWindowEnd"   TEXT NOT NULL DEFAULT '06:00';
