-- Wave A1 (PAY-208, decisions 4 and 5, Mark 21 Nov 2026).

-- The payout bank picked from the company's Bank list.
ALTER TABLE "Employee" ADD COLUMN "bankId" TEXT;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_bankId_fkey"
  FOREIGN KEY ("bankId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- When HR noted the employee's consent to record ethnicity and religion.
ALTER TABLE "Employee" ADD COLUMN "sensitiveDataConsentAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "sensitiveDataConsentByUserId" TEXT;

-- The two sensitive-data permissions. Granted to each company's system
-- Administrator role only; other roles get them when the owner ticks them.
INSERT INTO "Permission" ("id", "module", "action", "label") VALUES
  (gen_random_uuid()::text, 'SENSITIVE_DATA', 'READ',   'View ethnicity and religion'),
  (gen_random_uuid()::text, 'SENSITIVE_DATA', 'UPDATE', 'Record ethnicity and religion')
ON CONFLICT ("module", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Administrator' AND r."isSystem" = true AND r."deletedAt" IS NULL
  AND p."module" = 'SENSITIVE_DATA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Ethnicity and religion recorded before this change had no consent noted.
-- They are kept (deleting them would lose what HR collected) but stay hidden
-- from roles without the permission, and a change needs consent noted first.
