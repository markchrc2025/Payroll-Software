-- Phase U1: Add a partial unique index for global (tenantId IS NULL) statutory rules.
--
-- The ORM-level @@unique([tenantId, category, version]) generates a standard
-- PostgreSQL UNIQUE constraint, which treats NULL as distinct — meaning two
-- global rows with the same (category, version) would both be allowed.
--
-- This partial index plugs the gap: it enforces (category, version) uniqueness
-- only on the rows where tenantId IS NULL (i.e., the published global baselines).
-- Tenant-specific overrides (tenantId IS NOT NULL) remain governed by the
-- existing composite UNIQUE constraint.

CREATE UNIQUE INDEX "StatutoryRule_global_cat_version_key"
  ON "StatutoryRule" (category, version)
  WHERE "tenantId" IS NULL;
