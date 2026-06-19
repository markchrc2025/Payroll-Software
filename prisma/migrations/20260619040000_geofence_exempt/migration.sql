-- Geofence (Phase 6): per-employee geofence exemption.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "geofenceExempt" BOOLEAN NOT NULL DEFAULT false;
