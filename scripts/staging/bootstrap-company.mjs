// STAGING ONLY (run by scripts/start.sh when STAGING_EMBEDDED_DB=1).
//
// Creates the QA company the way Central's POST /api/admin/tenants does: the
// tenant, an "Administrator" role holding every permission, and the admin user
// who owns the tenant. Everything else (branch, schedules, employees,
// attendance, runs) is created through the app's own API by seed-data.mjs, so
// staging exercises the real code paths.
//
// The admin password is STAGING_ADMIN_PASSWORD, generated in Dokploy and read
// there (Environment tab); it is never printed.
import pg from "pg";
import bcrypt from "bcryptjs";
import { QA_COMPANY } from "./qa-company.mjs";

const url = process.env.DIRECT_DATABASE_URL;
const password = process.env.STAGING_ADMIN_PASSWORD;
if (!url || !url.includes("@127.0.0.1:")) {
  console.error("::error:: bootstrap-company runs only against the embedded staging database (127.0.0.1).");
  process.exit(1);
}
if (!password || password.length < 16) {
  console.error("::error:: STAGING_ADMIN_PASSWORD is missing or shorter than 16 characters. Generate it in Dokploy (generate_secret) and redeploy.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query("BEGIN");
  const existing = await c.query(`SELECT id FROM "Tenant" WHERE "companyCode" = $1`, [QA_COMPANY.companyCode]);
  if (existing.rowCount > 0) {
    console.log(`[staging] QA company ${QA_COMPANY.companyCode} already exists; bootstrap skipped`);
    await c.query("ROLLBACK");
  } else {
    const hash = await bcrypt.hash(password, 12);
    const t = await c.query(
      `INSERT INTO "Tenant" (id, name, "companyCode", country, timezone, "updatedAt")
       VALUES ($1, $2, $3, 'Philippines', 'Asia/Manila', now()) RETURNING id`,
      [QA_COMPANY.tenantId, QA_COMPANY.name, QA_COMPANY.companyCode],
    );
    const tenantId = t.rows[0].id;
    await c.query(
      `INSERT INTO "Role" (id, "tenantId", name, description, "isSystem", "updatedAt")
       VALUES ($1, $2, 'Administrator', 'Full access to all modules', true, now())`,
      [QA_COMPANY.roleId, tenantId],
    );
    const perms = await c.query(
      `INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission"`,
      [QA_COMPANY.roleId],
    );
    await c.query(
      `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "roleId", "isActive", "updatedAt")
       VALUES ($1, $2, $3, $4, 'QA', 'Admin', 'TENANT_USER', $5, true, now())`,
      [QA_COMPANY.userId, tenantId, QA_COMPANY.adminEmail, hash, QA_COMPANY.roleId],
    );
    await c.query(`UPDATE "Tenant" SET "ownerUserId" = $1 WHERE id = $2`, [QA_COMPANY.userId, tenantId]);
    await c.query("COMMIT");
    console.log(`[staging] QA company "${QA_COMPANY.name}" (${QA_COMPANY.companyCode}) created; admin ${QA_COMPANY.adminEmail}; ${perms.rowCount} permissions`);
  }
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("::error:: staging bootstrap failed:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
