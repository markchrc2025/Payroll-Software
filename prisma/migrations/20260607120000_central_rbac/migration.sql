-- Phase: central_rbac
-- Central Portal (SUPER_ADMIN) roles & permissions. Mirrors the tenant
-- Role/Permission/RolePermission trio but is global (tenantId = NULL admins).
--
-- This migration is SAFE to run on a live DB:
--   • Seeds the 10-item permission catalog (5 modules x READ/MANAGE).
--   • Creates the built-in "Super Admin" role with every permission.
--   • Backfills ALL existing central admins onto that role so nobody loses
--     access when enforcement goes live.

-- CreateEnum
CREATE TYPE "CentralModule" AS ENUM ('TENANTS', 'BILLING', 'SUPPORT', 'USERS', 'ROLES');

-- CreateEnum
CREATE TYPE "CentralAction" AS ENUM ('READ', 'MANAGE');

-- CreateTable
CREATE TABLE "CentralRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CentralRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralPermission" (
    "id" TEXT NOT NULL,
    "module" "CentralModule" NOT NULL,
    "action" "CentralAction" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "CentralPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralRolePermission" (
    "centralRoleId" TEXT NOT NULL,
    "centralPermissionId" TEXT NOT NULL,

    CONSTRAINT "CentralRolePermission_pkey" PRIMARY KEY ("centralRoleId", "centralPermissionId")
);

-- CreateIndex
CREATE INDEX "CentralRole_deletedAt_idx" ON "CentralRole"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CentralPermission_module_action_key" ON "CentralPermission"("module", "action");

-- AlterTable: add the central role pointer to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "centralRoleId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_centralRoleId_idx" ON "User"("centralRoleId");

-- AddForeignKey
ALTER TABLE "CentralRolePermission" ADD CONSTRAINT "CentralRolePermission_centralRoleId_fkey" FOREIGN KEY ("centralRoleId") REFERENCES "CentralRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentralRolePermission" ADD CONSTRAINT "CentralRolePermission_centralPermissionId_fkey" FOREIGN KEY ("centralPermissionId") REFERENCES "CentralPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_centralRoleId_fkey" FOREIGN KEY ("centralRoleId") REFERENCES "CentralRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- SEED: permission catalog (10 rows)
-- =============================================================================
INSERT INTO "CentralPermission" ("id", "module", "action", "label") VALUES
  ('cperm_tenants_read',  'TENANTS', 'READ',   'View tenants'),
  ('cperm_tenants_manage','TENANTS', 'MANAGE', 'Manage tenants'),
  ('cperm_billing_read',  'BILLING', 'READ',   'View billing'),
  ('cperm_billing_manage','BILLING', 'MANAGE', 'Manage billing'),
  ('cperm_support_read',  'SUPPORT', 'READ',   'View support'),
  ('cperm_support_manage','SUPPORT', 'MANAGE', 'Manage support'),
  ('cperm_users_read',    'USERS',   'READ',   'View admin users'),
  ('cperm_users_manage',  'USERS',   'MANAGE', 'Manage admin users'),
  ('cperm_roles_read',    'ROLES',   'READ',   'View roles'),
  ('cperm_roles_manage',  'ROLES',   'MANAGE', 'Manage roles')
ON CONFLICT ("module", "action") DO NOTHING;

-- =============================================================================
-- SEED: built-in "Super Admin" role with every permission
-- =============================================================================
INSERT INTO "CentralRole" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES (
  'crole_super_admin',
  'Super Admin',
  'Full, unrestricted access to all Central Portal features. Built-in and cannot be deleted.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CentralRolePermission" ("centralRoleId", "centralPermissionId")
SELECT 'crole_super_admin', "id" FROM "CentralPermission"
ON CONFLICT DO NOTHING;

-- =============================================================================
-- BACKFILL: every existing central admin keeps full access
-- =============================================================================
UPDATE "User"
SET "centralRoleId" = 'crole_super_admin'
WHERE "tenantId" IS NULL
  AND "systemRole" = 'SUPER_ADMIN'
  AND "deletedAt" IS NULL
  AND "centralRoleId" IS NULL;

-- =============================================================================
-- GRANTS (Render uses the payroll_app role; Supabase does not — the DO block
-- swallows the error there so the whole script still succeeds.)
-- =============================================================================
DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON "CentralRole" TO payroll_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON "CentralPermission" TO payroll_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON "CentralRolePermission" TO payroll_app;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'role payroll_app does not exist; skipping grants';
END $$;
