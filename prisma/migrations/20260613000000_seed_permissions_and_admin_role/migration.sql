-- Seed the global Permission catalog (all module × action combos used by requirePermission).
-- Idempotent — safe to run on a live database.

INSERT INTO "Permission" ("id", "module", "action", "label") VALUES
  -- EMPLOYEES
  (gen_random_uuid()::text, 'EMPLOYEES', 'CREATE',  'Create employees'),
  (gen_random_uuid()::text, 'EMPLOYEES', 'READ',    'View employees'),
  (gen_random_uuid()::text, 'EMPLOYEES', 'UPDATE',  'Edit employees'),
  (gen_random_uuid()::text, 'EMPLOYEES', 'DELETE',  'Delete employees'),
  (gen_random_uuid()::text, 'EMPLOYEES', 'APPROVE', 'Approve employee requests'),
  (gen_random_uuid()::text, 'EMPLOYEES', 'EXPORT',  'Export employee data'),
  -- DEPARTMENTS / BRANCHES / MOVEMENTS / DOCUMENTS / AUDIT (READ+WRITE)
  (gen_random_uuid()::text, 'DEPARTMENTS', 'CREATE', 'Create departments'),
  (gen_random_uuid()::text, 'DEPARTMENTS', 'READ',   'View departments'),
  (gen_random_uuid()::text, 'DEPARTMENTS', 'UPDATE', 'Edit departments'),
  (gen_random_uuid()::text, 'DEPARTMENTS', 'DELETE', 'Delete departments'),
  (gen_random_uuid()::text, 'BRANCHES', 'CREATE', 'Create branches'),
  (gen_random_uuid()::text, 'BRANCHES', 'READ',   'View branches'),
  (gen_random_uuid()::text, 'BRANCHES', 'UPDATE', 'Edit branches'),
  (gen_random_uuid()::text, 'BRANCHES', 'DELETE', 'Delete branches'),
  (gen_random_uuid()::text, 'MOVEMENTS', 'CREATE', 'Create movements'),
  (gen_random_uuid()::text, 'MOVEMENTS', 'READ',   'View movements'),
  (gen_random_uuid()::text, 'MOVEMENTS', 'UPDATE', 'Edit movements'),
  (gen_random_uuid()::text, 'MOVEMENTS', 'DELETE', 'Delete movements'),
  (gen_random_uuid()::text, 'DOCUMENTS', 'CREATE', 'Upload documents'),
  (gen_random_uuid()::text, 'DOCUMENTS', 'READ',   'View documents'),
  (gen_random_uuid()::text, 'DOCUMENTS', 'DELETE', 'Delete documents'),
  (gen_random_uuid()::text, 'AUDIT', 'READ', 'View audit logs'),
  -- PAYROLL
  (gen_random_uuid()::text, 'PAYROLL', 'CREATE', 'Create payroll runs'),
  (gen_random_uuid()::text, 'PAYROLL', 'READ',   'View payroll'),
  (gen_random_uuid()::text, 'PAYROLL', 'UPDATE', 'Edit payroll'),
  (gen_random_uuid()::text, 'PAYROLL', 'DELETE', 'Delete payroll'),
  (gen_random_uuid()::text, 'PAYROLL', 'APPROVE','Approve payroll'),
  (gen_random_uuid()::text, 'PAYROLL', 'EXPORT', 'Export payroll'),
  -- TIMESHEETS
  (gen_random_uuid()::text, 'TIMESHEETS', 'CREATE', 'Create timesheets'),
  (gen_random_uuid()::text, 'TIMESHEETS', 'READ',   'View timesheets'),
  (gen_random_uuid()::text, 'TIMESHEETS', 'UPDATE', 'Edit timesheets'),
  (gen_random_uuid()::text, 'TIMESHEETS', 'APPROVE','Approve timesheets'),
  -- LEAVES
  (gen_random_uuid()::text, 'LEAVES', 'CREATE', 'Create leave requests'),
  (gen_random_uuid()::text, 'LEAVES', 'READ',   'View leaves'),
  (gen_random_uuid()::text, 'LEAVES', 'UPDATE', 'Edit leaves'),
  (gen_random_uuid()::text, 'LEAVES', 'APPROVE','Approve leave requests'),
  (gen_random_uuid()::text, 'LEAVES', 'DELETE', 'Delete leave records'),
  -- REPORTS / COMPLIANCE
  (gen_random_uuid()::text, 'REPORTS',    'READ',   'View reports'),
  (gen_random_uuid()::text, 'REPORTS',    'EXPORT', 'Export reports'),
  (gen_random_uuid()::text, 'COMPLIANCE', 'READ',   'View compliance'),
  (gen_random_uuid()::text, 'COMPLIANCE', 'EXPORT', 'Export compliance reports'),
  -- SETTINGS
  (gen_random_uuid()::text, 'SETTINGS', 'CREATE', 'Create settings'),
  (gen_random_uuid()::text, 'SETTINGS', 'READ',   'View settings'),
  (gen_random_uuid()::text, 'SETTINGS', 'UPDATE', 'Edit settings'),
  (gen_random_uuid()::text, 'SETTINGS', 'DELETE', 'Delete settings'),
  -- ROLES
  (gen_random_uuid()::text, 'ROLES', 'CREATE', 'Create roles'),
  (gen_random_uuid()::text, 'ROLES', 'READ',   'View roles'),
  (gen_random_uuid()::text, 'ROLES', 'UPDATE', 'Edit roles'),
  (gen_random_uuid()::text, 'ROLES', 'DELETE', 'Delete roles'),
  -- INCIDENTS
  (gen_random_uuid()::text, 'INCIDENTS', 'CREATE', 'Create incidents'),
  (gen_random_uuid()::text, 'INCIDENTS', 'READ',   'View incidents'),
  (gen_random_uuid()::text, 'INCIDENTS', 'UPDATE', 'Edit incidents'),
  (gen_random_uuid()::text, 'INCIDENTS', 'DELETE', 'Delete incidents')
ON CONFLICT ("module", "action") DO NOTHING;

-- ============================================================================
-- Fix existing tenants: for each tenant that has users but no Administrator
-- role, create an Administrator role and assign all permissions to it, then
-- assign it to all users in that tenant who currently have roleId = NULL.
-- ============================================================================

DO $$
DECLARE
  t RECORD;
  role_id TEXT;
BEGIN
  FOR t IN
    SELECT DISTINCT "tenantId" FROM "User"
    WHERE "roleId" IS NULL AND "systemRole" = 'TENANT_USER'
  LOOP
    -- Create Administrator role if not already present
    INSERT INTO "Role" ("id", "tenantId", "name", "description", "isSystem", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      t."tenantId",
      'Administrator',
      'Full access to all modules',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT ("tenantId", "name") DO NOTHING;

    -- Get the role id (handles both newly created and pre-existing)
    SELECT "id" INTO role_id FROM "Role"
    WHERE "tenantId" = t."tenantId" AND "name" = 'Administrator' AND "deletedAt" IS NULL
    LIMIT 1;

    -- Assign all permissions to the Administrator role
    INSERT INTO "RolePermission" ("roleId", "permissionId")
    SELECT role_id, "id" FROM "Permission"
    ON CONFLICT ("roleId", "permissionId") DO NOTHING;

    -- Assign the role to all unroled tenant users in this tenant
    UPDATE "User"
    SET "roleId" = role_id
    WHERE "tenantId" = t."tenantId"
      AND "roleId" IS NULL
      AND "systemRole" = 'TENANT_USER';
  END LOOP;
END $$;
