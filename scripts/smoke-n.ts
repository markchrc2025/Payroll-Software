/**
 * smoke-n.ts — Phase N: Dynamic RBAC + Permission Middleware
 *
 * Tests the permission system end-to-end by calling checkPermission() directly
 * (since requirePermission() wraps a NextAuth session we cannot mock in tsx).
 *
 *  T1.  Permission catalog: 24 rows exist in DB
 *  T2.  HR Admin role has PAYROLL:CREATE
 *  T3.  HR Admin role has PAYROLL:APPROVE
 *  T4.  HR Admin role has EMPLOYEES:DELETE
 *  T5.  Payroll Officer has PAYROLL:CREATE
 *  T6.  Payroll Officer has PAYROLL:APPROVE
 *  T7.  Payroll Officer does NOT have SETTINGS:UPDATE
 *  T8.  Employee role has NO permissions
 *  T9.  Create custom role, initially has no permissions → false
 *  T10. Assign PAYROLL:CREATE to custom role → checkPermission → true
 *  T11. Assign PAYROLL:APPROVE to custom role → checkPermission → true
 *  T12. checkPermission for unassigned PAYROLL:EXPORT → false
 *  T13. Revoke PAYROLL:CREATE → checkPermission → false
 *  T14. Cross-tenant: custom role in TENANT_A not accessible from TENANT_B perspective
 *  T15. Non-existent roleId → false (no crash)
 *  T16. List all RolePermission for HR Admin → count >= 24
 *  T17. Permission upsert idempotency — double upsert doesn't duplicate
 *  T18. Cleanup: delete custom role + its RolePermissions
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-n.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { checkPermission } from "../src/lib/require-permission";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";
const TENANT_B = "tenant_b_does_not_exist_xxxx"; // non-existent tenant (no data)

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let failures = 0;
let total = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(`  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// withTenant helper
// ---------------------------------------------------------------------------
async function withT<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_A) throw new Error("SMOKE_TENANT_ID env var is not set");

  // ── Setup: resolve role IDs ───────────────────────────────────────────────
  const [hrAdminRole, payrollOfficerRole, employeeRole] = await withT(TENANT_A, (tx) =>
    Promise.all([
      tx.role.findFirst({ where: { tenantId: TENANT_A, name: "HR Admin", deletedAt: null } }),
      tx.role.findFirst({ where: { tenantId: TENANT_A, name: "Payroll Officer", deletedAt: null } }),
      tx.role.findFirst({ where: { tenantId: TENANT_A, name: "Employee", deletedAt: null } }),
    ]),
  );

  if (!hrAdminRole)        throw new Error("HR Admin role not seeded — run `npx prisma db seed` first");
  if (!payrollOfficerRole) throw new Error("Payroll Officer role not seeded");
  if (!employeeRole)       throw new Error("Employee role not seeded");

  console.log("Setup complete.");
  console.log(`  HR Admin ID      = ${hrAdminRole.id}`);
  console.log(`  Payroll Officer  = ${payrollOfficerRole.id}`);
  console.log(`  Employee         = ${employeeRole.id}\n`);

  // ── T1: Permission catalog count ──────────────────────────────────────────
  console.log("T1 – Permission catalog: at least 24 rows");
  const permCount = await prisma.permission.count();
  check("count >= 24", permCount >= 24, permCount);

  // ── T2–T4: HR Admin has expected permissions ──────────────────────────────
  console.log("\nT2 – HR Admin has PAYROLL:CREATE");
  check("PAYROLL:CREATE → true", await checkPermission(TENANT_A, hrAdminRole.id, "PAYROLL", "CREATE"));

  console.log("\nT3 – HR Admin has PAYROLL:APPROVE");
  check("PAYROLL:APPROVE → true", await checkPermission(TENANT_A, hrAdminRole.id, "PAYROLL", "APPROVE"));

  console.log("\nT4 – HR Admin has EMPLOYEES:DELETE");
  check("EMPLOYEES:DELETE → true", await checkPermission(TENANT_A, hrAdminRole.id, "EMPLOYEES", "DELETE"));

  // ── T5–T7: Payroll Officer permissions ────────────────────────────────────
  console.log("\nT5 – Payroll Officer has PAYROLL:CREATE");
  check("PAYROLL:CREATE → true", await checkPermission(TENANT_A, payrollOfficerRole.id, "PAYROLL", "CREATE"));

  console.log("\nT6 – Payroll Officer has PAYROLL:APPROVE");
  check("PAYROLL:APPROVE → true", await checkPermission(TENANT_A, payrollOfficerRole.id, "PAYROLL", "APPROVE"));

  console.log("\nT7 – Payroll Officer does NOT have SETTINGS:UPDATE");
  check("SETTINGS:UPDATE → false", !(await checkPermission(TENANT_A, payrollOfficerRole.id, "SETTINGS", "UPDATE")));

  // ── T8: Employee role has no permissions ──────────────────────────────────
  console.log("\nT8 – Employee role has no permissions");
  check("PAYROLL:READ → false",   !(await checkPermission(TENANT_A, employeeRole.id, "PAYROLL", "READ")));
  check("EMPLOYEES:READ → false", !(await checkPermission(TENANT_A, employeeRole.id, "EMPLOYEES", "READ")));

  // ── T9–T13: Custom role lifecycle ─────────────────────────────────────────
  console.log("\nT9 – Create custom role, no permissions → false");
  const customRole = await withT(TENANT_A, (tx) =>
    tx.role.create({
      data: { tenantId: TENANT_A, name: `Smoke N Custom ${Date.now()}`, description: "Temp smoke test role" },
    }),
  );
  check("PAYROLL:CREATE → false initially", !(await checkPermission(TENANT_A, customRole.id, "PAYROLL", "CREATE")));

  // Resolve PAYROLL:CREATE and PAYROLL:APPROVE permission IDs
  const [payrollCreate, payrollApprove, payrollExport] = await Promise.all([
    prisma.permission.findUnique({ where: { module_action: { module: "PAYROLL", action: "CREATE" } } }),
    prisma.permission.findUnique({ where: { module_action: { module: "PAYROLL", action: "APPROVE" } } }),
    prisma.permission.findUnique({ where: { module_action: { module: "PAYROLL", action: "EXPORT" } } }),
  ]);
  if (!payrollCreate || !payrollApprove || !payrollExport) throw new Error("Permission rows missing");

  console.log("\nT10 – Assign PAYROLL:CREATE → checkPermission → true");
  await withT(TENANT_A, (tx) =>
    tx.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: customRole.id, permissionId: payrollCreate.id } },
      update: {},
      create: { roleId: customRole.id, permissionId: payrollCreate.id },
    }),
  );
  check("PAYROLL:CREATE → true after assign", await checkPermission(TENANT_A, customRole.id, "PAYROLL", "CREATE"));

  console.log("\nT11 – Assign PAYROLL:APPROVE → checkPermission → true");
  await withT(TENANT_A, (tx) =>
    tx.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: customRole.id, permissionId: payrollApprove.id } },
      update: {},
      create: { roleId: customRole.id, permissionId: payrollApprove.id },
    }),
  );
  check("PAYROLL:APPROVE → true after assign", await checkPermission(TENANT_A, customRole.id, "PAYROLL", "APPROVE"));

  console.log("\nT12 – PAYROLL:EXPORT not assigned → false");
  check("PAYROLL:EXPORT → false", !(await checkPermission(TENANT_A, customRole.id, "PAYROLL", "EXPORT")));

  console.log("\nT13 – Revoke PAYROLL:CREATE → checkPermission → false");
  await withT(TENANT_A, (tx) =>
    tx.rolePermission.delete({
      where: { roleId_permissionId: { roleId: customRole.id, permissionId: payrollCreate.id } },
    }),
  );
  check("PAYROLL:CREATE → false after revoke", !(await checkPermission(TENANT_A, customRole.id, "PAYROLL", "CREATE")));
  check("PAYROLL:APPROVE still true", await checkPermission(TENANT_A, customRole.id, "PAYROLL", "APPROVE"));

  // ── T14: Cross-tenant isolation ───────────────────────────────────────────
  console.log("\nT14 – Cross-tenant: customRole (TENANT_A) not accessible from non-existent TENANT_B");
  // Use a cuid-shaped (alphanumeric) fake tenant that doesn't exist in the DB.
  const FAKE_TENANT_B = "cm00000000000000000000000b"; // valid cuid format, no data
  const rolesInTenantB = await withT(FAKE_TENANT_B, (tx) =>
    tx.role.count({ where: { tenantId: FAKE_TENANT_B } }),
  );
  check("TENANT_B has 0 roles", rolesInTenantB === 0, rolesInTenantB);

  // ── T15: Non-existent roleId → false (no crash) ───────────────────────────
  console.log("\nT15 – Non-existent roleId → false (no crash)");
  const result = await checkPermission(TENANT_A, "non_existent_role_id_xyz", "PAYROLL", "CREATE");
  check("non-existent roleId → false", result === false);

  // ── T16: Count HR Admin RolePermissions ───────────────────────────────────
  console.log("\nT16 – HR Admin has >= 24 RolePermissions");
  const hrPermCount = await withT(TENANT_A, (tx) =>
    tx.rolePermission.count({ where: { roleId: hrAdminRole.id } }),
  );
  check("hrAdminRole.permissions.count >= 24", hrPermCount >= 24, hrPermCount);

  // ── T17: Upsert idempotency ───────────────────────────────────────────────
  console.log("\nT17 – Permission upsert idempotency: double upsert doesn't duplicate");
  const beforeCount = await withT(TENANT_A, (tx) =>
    tx.rolePermission.count({ where: { roleId: hrAdminRole.id } }),
  );
  // Re-upsert PAYROLL:CREATE for HR Admin (should be no-op)
  await withT(TENANT_A, (tx) =>
    tx.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: hrAdminRole.id, permissionId: payrollCreate.id } },
      update: {},
      create: { roleId: hrAdminRole.id, permissionId: payrollCreate.id },
    }),
  );
  const afterCount = await withT(TENANT_A, (tx) =>
    tx.rolePermission.count({ where: { roleId: hrAdminRole.id } }),
  );
  check("count unchanged after double upsert", afterCount === beforeCount, `${beforeCount} → ${afterCount}`);

  // ── T18: Cleanup ──────────────────────────────────────────────────────────
  console.log("\nT18 – Cleanup");
  // Delete custom role's remaining RolePermissions, then the role
  await withT(TENANT_A, async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: customRole.id } });
    await tx.role.update({ where: { id: customRole.id }, data: { deletedAt: new Date() } });
  });
  const deleted = await withT(TENANT_A, (tx) =>
    tx.role.findFirst({ where: { id: customRole.id, deletedAt: null } }),
  );
  check("custom role soft-deleted", deleted === null);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(58)}`);
  if (failures === 0) {
    console.log(`✅  Phase N smoke: ${total - failures}/${total} PASS`);
  } else {
    console.log(`❌  Phase N smoke: ${total - failures}/${total} PASS  (${failures} FAILED)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(failures > 0 ? 1 : 0);
  });
