-- Create LeaveWorkflow table
CREATE TABLE "LeaveWorkflow" (
  "id"          TEXT        NOT NULL,
  "tenantId"    TEXT        NOT NULL,
  "code"        TEXT        NOT NULL,
  "description" TEXT,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "approvers"   JSONB       NOT NULL DEFAULT '[]',
  "notify"      TEXT        NOT NULL DEFAULT 'none',
  "recipients"  JSONB       NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "LeaveWorkflow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveWorkflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LeaveWorkflow_tenantId_code_key"  ON "LeaveWorkflow"("tenantId", "code");
CREATE INDEX        "LeaveWorkflow_tenantId_idx"        ON "LeaveWorkflow"("tenantId");
CREATE INDEX        "LeaveWorkflow_deletedAt_idx"       ON "LeaveWorkflow"("deletedAt");

-- Seed the three default templates per tenant
INSERT INTO "LeaveWorkflow" ("id", "tenantId", "code", "description", "isActive", "approvers", "notify", "recipients", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  s.code,
  s.description,
  s.is_active,
  s.approvers::jsonb,
  s.notify,
  s.recipients::jsonb,
  NOW(),
  NOW()
FROM "Tenant" t
CROSS JOIN (VALUES
  ('DEFAULT',    'Default leave approval flow for all employees',       true,  '["line_manager","dept_head"]', 'finalrej', '["hr_manager"]'),
  ('EXECUTIVE',  'Senior & director-level leave requests',              true,  '["dept_head","ceo"]',          'interim',  '["hr_manager"]'),
  ('FIELD STAFF','Daily-paid field and warehouse staff',                false, '["supervisor"]',               'none',     '[]')
) AS s(code, description, is_active, approvers, notify, recipients)
WHERE NOT EXISTS (
  SELECT 1 FROM "LeaveWorkflow" lw
  WHERE lw."tenantId" = t."id" AND lw."code" = s.code
);
