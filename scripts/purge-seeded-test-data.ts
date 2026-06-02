import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEMO_TENANT_NAME = "Demo Corp Philippines, Inc.";
const DEFAULT_SMOKE_TENANT_IDS = ["cmpnn0rrj0000yi73i6fcm5ih"];
const SEEDED_TEST_EMAILS = [
  "admin@democorp.ph",
  "manager@democorp.ph",
  "hrlead@democorp.ph",
];

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL or DIRECT_DATABASE_URL");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type Args = {
  execute: boolean;
  includeDemoByName: boolean;
  tenantIds: string[];
  includeDemoPatternNames: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    execute: false,
    includeDemoByName: true,
    tenantIds: [],
    includeDemoPatternNames: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--execute") {
      args.execute = true;
      continue;
    }

    if (token === "--no-demo-name") {
      args.includeDemoByName = false;
      continue;
    }

    if (token === "--include-demo-pattern-names") {
      args.includeDemoPatternNames = true;
      continue;
    }

    if (token === "--tenant-id") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--tenant-id requires a value");
      }
      args.tenantIds.push(next);
      i += 1;
      continue;
    }

    if (token.startsWith("--tenant-id=")) {
      args.tenantIds.push(token.split("=", 2)[1]);
      continue;
    }
  }

  return args;
}

async function resolveTargetTenantIds(opts: Args): Promise<string[]> {
  const ids = new Set<string>([...DEFAULT_SMOKE_TENANT_IDS, ...opts.tenantIds]);

  if (opts.includeDemoByName) {
    const demoTenant = await prisma.tenant.findFirst({
      where: { name: DEMO_TENANT_NAME, deletedAt: null },
      select: { id: true },
    });
    if (demoTenant?.id) ids.add(demoTenant.id);
  }

  if (opts.includeDemoPatternNames) {
    const matched = await prisma.tenant.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: "demo", mode: "insensitive" } },
          { tradeName: { contains: "demo", mode: "insensitive" } },
          { subdomain: { contains: "demo", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    for (const t of matched) ids.add(t.id);
  }

  return Array.from(ids);
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function findTenantScopedTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenantId'
    ORDER BY table_name ASC
  `;

  return rows
    .map((r) => r.table_name)
    .filter((name) => name !== "Tenant");
}

async function countRowsByTable(tableNames: string[], tenantIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (const tableName of tableNames) {
    const tableIdent = quoteIdent(tableName);
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${tableIdent} WHERE "tenantId" = ANY($1::text[])`,
      tenantIds
    );
    counts.set(tableName, Number(result[0]?.count ?? 0n));
  }

  return counts;
}

async function deleteTenantRows(
  tx: Prisma.TransactionClient,
  tenantIds: string[]
): Promise<Map<string, number>> {
  const deletedByTable = new Map<string, number>();

  if (tenantIds.length === 0) {
    return deletedByTable;
  }

  const whereTenant = { tenantId: { in: tenantIds } };

  const del = async (key: string, countPromise: Promise<{ count: number }>) => {
    const result = await countPromise;
    deletedByTable.set(key, (deletedByTable.get(key) ?? 0) + result.count);
  };

  // Attendance and approval trails.
  await del("DTRAuditLog", tx.dTRAuditLog.deleteMany({ where: whereTenant }));
  await del("DTRSubmission", tx.dTRSubmission.deleteMany({ where: whereTenant }));
  await del("AttendanceLog", tx.attendanceLog.deleteMany({ where: whereTenant }));
  await del("DTRRecord", tx.dTRRecord.deleteMany({ where: whereTenant }));

  // Payroll and expense flows.
  await del("ExpenseClaim", tx.expenseClaim.deleteMany({ where: whereTenant }));
  await del("PayrollAdjustment", tx.payrollAdjustment.deleteMany({ where: whereTenant }));
  await del("PayrollSheet", tx.payrollSheet.deleteMany({ where: whereTenant }));
  await del("PayrollBook", tx.payrollBook.deleteMany({ where: whereTenant }));

  // Time-off and period inputs.
  await del("LeaveTransaction", tx.leaveTransaction.deleteMany({ where: whereTenant }));
  await del("LeaveBalance", tx.leaveBalance.deleteMany({ where: whereTenant }));
  await del("OTApplication", tx.oTApplication.deleteMany({ where: whereTenant }));
  await del("UndertimeRequest", tx.undertimeRequest.deleteMany({ where: whereTenant }));
  await del("PeriodInput", tx.periodInput.deleteMany({ where: whereTenant }));
  await del("Loan", tx.loan.deleteMany({ where: whereTenant }));

  // Employee linked records.
  await del("EmployeePayComponent", tx.employeePayComponent.deleteMany({ where: whereTenant }));
  await del("AssetAssignment", tx.assetAssignment.deleteMany({ where: whereTenant }));
  await del("EmployeeDocument", tx.employeeDocument.deleteMany({ where: whereTenant }));
  await del("EmployeeSalary", tx.employeeSalary.deleteMany({ where: whereTenant }));
  await del("EmployeeMovement", tx.employeeMovement.deleteMany({ where: whereTenant }));
  await del("IncidentReport", tx.incidentReport.deleteMany({ where: whereTenant }));
  await del("StatutoryId", tx.statutoryId.deleteMany({ where: whereTenant }));
  await del("ConsentRecord", tx.consentRecord.deleteMany({ where: whereTenant }));
  await del("EssSession", tx.essSession.deleteMany({ where: whereTenant }));
  await del("ProfileUpdateRequest", tx.profileUpdateRequest.deleteMany({ where: whereTenant }));
  await del("EmployeeShiftAssignment", tx.employeeShiftAssignment.deleteMany({ where: whereTenant }));

  // ATS and related audit/comment data.
  await del("ApplicantNote", tx.applicantNote.deleteMany({ where: whereTenant }));
  await del("Applicant", tx.applicant.deleteMany({ where: whereTenant }));
  await del("JobPosting", tx.jobPosting.deleteMany({ where: whereTenant }));

  // Operational configs and assets.
  await del("Holiday", tx.holiday.deleteMany({ where: whereTenant }));
  await del("Kiosk", tx.kiosk.deleteMany({ where: whereTenant }));
  await del("Geofence", tx.geofence.deleteMany({ where: whereTenant }));
  await del("Asset", tx.asset.deleteMany({ where: whereTenant }));
  await del("DTRApprovalConfig", tx.dTRApprovalConfig.deleteMany({ where: whereTenant }));

  // People and access control.
  await del("Employee", tx.employee.deleteMany({ where: whereTenant }));
  await del("User", tx.user.deleteMany({ where: whereTenant }));

  const roleIds = await tx.role.findMany({
    where: whereTenant,
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));
  if (roleIds.length > 0) {
    await del("RolePermission", tx.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }));
  }
  await del("Role", tx.role.deleteMany({ where: whereTenant }));

  // Structural rows that are usually seeded.
  await del("LeaveType", tx.leaveType.deleteMany({ where: whereTenant }));
  await del("ShiftSchedule", tx.shiftSchedule.deleteMany({ where: whereTenant }));
  await del("PayComponent", tx.payComponent.deleteMany({ where: whereTenant }));
  await del("Position", tx.position.deleteMany({ where: whereTenant }));
  await del("Branch", tx.branch.deleteMany({ where: whereTenant }));
  await del("Department", tx.department.deleteMany({ where: whereTenant }));
  await del("WorkLocation", tx.workLocation.deleteMany({ where: whereTenant }));

  // Tenant-scoped logs and rules.
  await del("AuditLog", tx.auditLog.deleteMany({ where: whereTenant }));
  await del("AiUsage", tx.aiUsage.deleteMany({ where: whereTenant }));
  await del("StatutoryRule", tx.statutoryRule.deleteMany({ where: whereTenant }));

  return deletedByTable;
}

async function purgeSeededUsersByEmail(): Promise<number> {
  const result = await prisma.user.deleteMany({
    where: {
      email: { in: SEEDED_TEST_EMAILS },
      OR: [{ tenantId: null }, { tenantId: { not: null } }],
    },
  });
  return result.count;
}

async function purgeTenantWithRlsContext(tenantId: string): Promise<Map<string, number>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    const deletedByTable = await deleteTenantRows(tx, [tenantId]);
    const tenantDelete = await tx.tenant.deleteMany({ where: { id: tenantId } });
    deletedByTable.set("Tenant", (deletedByTable.get("Tenant") ?? 0) + tenantDelete.count);
    return deletedByTable;
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const tenantIds = await resolveTargetTenantIds(options);
  const tenantRows = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true, subdomain: true },
  });

  console.log("Seed/Test purge target resolution");
  console.log(`- execute mode: ${options.execute ? "ON" : "DRY RUN"}`);
  console.log(`- target tenant count: ${tenantRows.length}`);
  for (const t of tenantRows) {
    console.log(`  - ${t.id} | ${t.name} | ${t.subdomain ?? "(no-subdomain)"}`);
  }
  if (tenantRows.length === 0) {
    console.log("No target tenants found. Checking for seeded users only.");
  }

  const targetTenantIds = tenantRows.map((t) => t.id);
  const tables = await findTenantScopedTables();
  const preCounts = await countRowsByTable(tables, targetTenantIds);

  const preTotal = Array.from(preCounts.values()).reduce((a, b) => a + b, 0);
  console.log(`- tenant-scoped rows matched before purge: ${preTotal}`);

  const seededUsers = await prisma.user.findMany({
    where: { email: { in: SEEDED_TEST_EMAILS } },
    select: { id: true, email: true, tenantId: true },
  });
  console.log(`- seeded/test users matched before purge: ${seededUsers.length}`);

  if (!options.execute) {
    console.log("\nDry run complete. Re-run with --execute to purge.");
    return;
  }

  const deletedByTable = new Map<string, number>();
  for (const tenantId of targetTenantIds) {
    const oneTenantMap = await purgeTenantWithRlsContext(tenantId);
    for (const [k, v] of oneTenantMap.entries()) {
      deletedByTable.set(k, (deletedByTable.get(k) ?? 0) + v);
    }
  }
  const deletedTenants = deletedByTable.get("Tenant") ?? 0;
  const deletedSeedUsers = await purgeSeededUsersByEmail();

  const postTenantRows = await prisma.tenant.findMany({
    where: { id: { in: targetTenantIds } },
    select: { id: true },
  });

  const postCounts = await countRowsByTable(tables, targetTenantIds);
  const postTotal = Array.from(postCounts.values()).reduce((a, b) => a + b, 0);

  const globalStatRules = await prisma.statutoryRule.count({ where: { tenantId: null } });

  console.log("\nPurge results");
  console.log(`- tables touched: ${deletedByTable.size}`);
  console.log(`- tenants deleted: ${deletedTenants}`);
  console.log(`- seeded/test users deleted by email: ${deletedSeedUsers}`);
  console.log(`- tenant-scoped rows matched after purge: ${postTotal}`);
  console.log(`- target tenants still present: ${postTenantRows.length}`);
  console.log(`- global statutory rules kept (tenantId null): ${globalStatRules}`);

  if (postTenantRows.length > 0 || postTotal > 0) {
    throw new Error("Post-purge verification failed: seeded/test residue remains.");
  }

  console.log("\nDone: seeded/test tenant data removed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
