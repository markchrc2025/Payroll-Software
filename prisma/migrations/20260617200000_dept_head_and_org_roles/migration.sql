-- Phase 0: Identity layer — Department head + OrgRole
-- Apply in Supabase SQL editor, then run: npx prisma generate

-- 1. Rename Department.managerId → headId (the column existed but had no FK constraint)
ALTER TABLE "Department" RENAME COLUMN "managerId" TO "headId";

-- 2. Add proper FK constraint for Department.headId → Employee.id
ALTER TABLE "Department"
  ADD CONSTRAINT "Department_headId_fkey"
  FOREIGN KEY ("headId") REFERENCES "Employee"("id") ON DELETE SET NULL;

-- 3. Add index for Department.headId
CREATE INDEX "Department_headId_idx" ON "Department"("headId");

-- 4. Create OrgRole table (org-wide singleton roles: hr_manager, ceo)
CREATE TABLE "OrgRole" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "roleKey"    TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgRole_tenantId_roleKey_key" ON "OrgRole"("tenantId", "roleKey");
CREATE INDEX "OrgRole_tenantId_idx"    ON "OrgRole"("tenantId");
CREATE INDEX "OrgRole_employeeId_idx"  ON "OrgRole"("employeeId");

ALTER TABLE "OrgRole"
  ADD CONSTRAINT "OrgRole_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

ALTER TABLE "OrgRole"
  ADD CONSTRAINT "OrgRole_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
