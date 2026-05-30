/**
 * Sentire Payroll — Reset Seed
 *
 * Deletes all data created by prisma/seed.ts for the demo tenant
 * ("Demo Corp Philippines, Inc."). Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/reset-seed.ts
 *   npm run seed:reset
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const DEMO_TENANT_NAME = "Demo Corp Philippines, Inc.";

async function main() {
  console.log("🗑️  Resetting seed data…\n");

  const tenant = await prisma.tenant.findFirst({
    where: { name: DEMO_TENANT_NAME, deletedAt: null },
  });

  if (!tenant) {
    console.log("ℹ️  Demo tenant not found — nothing to reset.");
    return;
  }

  console.log(`Found tenant: ${tenant.name} (${tenant.id})\n`);

  const tid = tenant.id;

  // 1. Employee salary history
  const empIds = await prisma.employee
    .findMany({ where: { tenantId: tid }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  const salaryCount = await prisma.employeeSalary.deleteMany({
    where: { tenantId: tid },
  });
  console.log(`✅  Deleted ${salaryCount.count} salary records`);

  // 2. Everything else linked to employees
  if (empIds.length > 0) {
    const dtItems = [
      prisma.leaveBalance.deleteMany({ where: { tenantId: tid } }),
      prisma.leaveTransaction.deleteMany({ where: { tenantId: tid } }),
      prisma.employeePayComponent.deleteMany({ where: { tenantId: tid } }),
      prisma.loan.deleteMany({ where: { tenantId: tid } }),
      prisma.periodInput.deleteMany({ where: { tenantId: tid } }),
      prisma.employeeDocument.deleteMany({ where: { tenantId: tid } }),
      prisma.employeeMovement.deleteMany({ where: { tenantId: tid } }),
      prisma.statutoryId.deleteMany({ where: { tenantId: tid } }),
      prisma.incidentReport.deleteMany({ where: { tenantId: tid } }),
      prisma.auditLog.deleteMany({ where: { tenantId: tid } }),
    ];
    const counts = await Promise.all(dtItems);
    console.log(
      `✅  Deleted ancillary employee data (${counts.reduce((s, c) => s + c.count, 0)} rows)`
    );
  }

  // 3. Employees
  const empCount = await prisma.employee.deleteMany({ where: { tenantId: tid } });
  console.log(`✅  Deleted ${empCount.count} employees`);

  // 4. Users
  const userCount = await prisma.user.deleteMany({ where: { tenantId: tid } });
  console.log(`✅  Deleted ${userCount.count} users`);

  // 5. Role permissions → roles
  const roles = await prisma.role.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const roleIds = roles.map((r) => r.id);

  if (roleIds.length > 0) {
    const rpCount = await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    console.log(`✅  Deleted ${rpCount.count} role-permission assignments`);
  }

  const roleCount = await prisma.role.deleteMany({ where: { tenantId: tid } });
  console.log(`✅  Deleted ${roleCount.count} roles`);

  // 6. Structural data
  const [branchCount, deptCount, posCount, locCount, payCompCount, shiftCount] =
    await Promise.all([
      prisma.branch.deleteMany({ where: { tenantId: tid } }),
      prisma.department.deleteMany({ where: { tenantId: tid } }),
      prisma.position.deleteMany({ where: { tenantId: tid } }),
      prisma.workLocation.deleteMany({ where: { tenantId: tid } }),
      prisma.payComponent.deleteMany({ where: { tenantId: tid } }),
      prisma.shiftSchedule.deleteMany({ where: { tenantId: tid } }),
    ]);
  console.log(
    `✅  Deleted structural data: ${branchCount.count} branches, ${deptCount.count} departments, ` +
    `${posCount.count} positions, ${locCount.count} work locations, ${payCompCount.count} pay components, ` +
    `${shiftCount.count} shift schedules`
  );

  // 7. Statutory rules seeded for this tenant (if any)
  const srCount = await prisma.statutoryRule.deleteMany({ where: { tenantId: tid } });
  if (srCount.count > 0) console.log(`✅  Deleted ${srCount.count} statutory rules`);

  // 8. Leave types seeded for this tenant
  const ltCount = await prisma.leaveType.deleteMany({ where: { tenantId: tid } });
  if (ltCount.count > 0) console.log(`✅  Deleted ${ltCount.count} leave types`);

  // 9. Tenant itself
  await prisma.tenant.delete({ where: { id: tid } });
  console.log(`✅  Deleted tenant: ${DEMO_TENANT_NAME}\n`);

  console.log("─────────────────────────────────────────────────────────");
  console.log("✅ Reset complete. Run `npm run seed` to re-seed.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
