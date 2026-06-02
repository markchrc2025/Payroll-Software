/**
 * Sentire Payroll — Prisma Seed (Phase B2)
 *
 * Creates a single demo Tenant with departments, branches, positions,
 * an HR Admin user, and 10 sample employees.
 *
 * Monetary values are stored in BigInt centavos.
 * Sensitive fields (TIN, SSS, etc.) go through the encryption extension.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const pesos = (php: number): bigint => BigInt(Math.round(php * 100));

async function main() {
  console.log("🌱 Seeding database…\n");

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  let tenant = await prisma.tenant.findFirst({
    where: { name: "Demo Corp Philippines, Inc.", deletedAt: null },
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo Corp Philippines, Inc.",
        tradeName: "Demo Corp",
        subdomain: "demo",
        industry: "Technology",
        contactEmail: "hr@democorp.ph",
        contactPhone: "02-8000-0001",
        subscriptionTier: "STARTER",
        subscriptionStatus: "ACTIVE",
        featureFlags: { ai_assistant: false, ats: false },
      },
    });
  }
  console.log(`✅  Tenant:      ${tenant.name}  (${tenant.id})`);

  // ── 2. Work Locations ──────────────────────────────────────────────────────
  const [ncrLoc, cebuLoc] = await Promise.all([
    prisma.workLocation.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Metro Manila HQ" } },
      update: {},
      create: { tenantId: tenant.id, name: "Metro Manila HQ", region: "NCR", city: "Makati City", province: "Metro Manila" },
    }),
    prisma.workLocation.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Cebu Office" } },
      update: {},
      create: { tenantId: tenant.id, name: "Cebu Office", region: "07", city: "Cebu City", province: "Cebu" },
    }),
  ]);
  console.log(`✅  Locations:   Metro Manila HQ (NCR), Cebu Office (07)`);

  // ── 3. Departments ─────────────────────────────────────────────────────────
  const [hrDept, engDept, salesDept] = await Promise.all([
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Human Resources" } },
      update: {},
      create: { tenantId: tenant.id, name: "Human Resources", description: "HR Department" },
    }),
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Engineering" } },
      update: {},
      create: { tenantId: tenant.id, name: "Engineering", description: "Software & IT" },
    }),
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Sales" } },
      update: {},
      create: { tenantId: tenant.id, name: "Sales", description: "Sales & Marketing" },
    }),
  ]);

  // ── 4. Branches ────────────────────────────────────────────────────────────
  const [manilaHQ, cebuBranch] = await Promise.all([
    prisma.branch.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Manila HQ" } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: "Manila HQ",
        workLocationId: ncrLoc.id,
        city: "Makati City",
        province: "Metro Manila",
        isHeadOffice: true,
      },
    }),
    prisma.branch.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Cebu Branch" } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: "Cebu Branch",
        workLocationId: cebuLoc.id,
        city: "Cebu City",
        province: "Cebu",
        isHeadOffice: false,
      },
    }),
  ]);
  console.log(`✅  Branches:    Manila HQ, Cebu Branch`);

  // ── 5. Positions ───────────────────────────────────────────────────────────
  const positionSeeds: Array<{ title: string; level: "ENTRY" | "MID" | "SENIOR" | "MANAGER" | "DIRECTOR" | "EXECUTIVE" }> = [
    { title: "HR Manager", level: "MANAGER" },
    { title: "HR Specialist", level: "MID" },
    { title: "Senior Engineer", level: "SENIOR" },
    { title: "Software Engineer", level: "MID" },
    { title: "Junior Engineer", level: "ENTRY" },
    { title: "DevOps Engineer", level: "SENIOR" },
    { title: "Sales Manager", level: "MANAGER" },
    { title: "Sales Representative", level: "ENTRY" },
    { title: "Marketing Specialist", level: "MID" },
    { title: "Accountant", level: "MID" },
  ];
  const positions: Record<string, string> = {};
  for (const p of positionSeeds) {
    const row = await prisma.position.upsert({
      where: { tenantId_title: { tenantId: tenant.id, title: p.title } },
      update: {},
      create: { tenantId: tenant.id, title: p.title, level: p.level },
    });
    positions[p.title] = row.id;
  }

  // ── 6a. Permission catalog (global — no tenantId) ─────────────────────────
  // Seed all meaningful (module, action) pairs used by requirePermission().
  type PermSeed = { module: string; action: string; label: string };
  const permSeeds: PermSeed[] = [
    // EMPLOYEES
    { module: "EMPLOYEES", action: "CREATE",  label: "Add employees" },
    { module: "EMPLOYEES", action: "READ",    label: "View employees" },
    { module: "EMPLOYEES", action: "UPDATE",  label: "Edit employees" },
    { module: "EMPLOYEES", action: "DELETE",  label: "Deactivate employees" },
    // PAYROLL
    { module: "PAYROLL",   action: "CREATE",  label: "Create payroll runs" },
    { module: "PAYROLL",   action: "READ",    label: "View payroll data" },
    { module: "PAYROLL",   action: "APPROVE", label: "Finalize payroll runs" },
    { module: "PAYROLL",   action: "EXPORT",  label: "Download bank files" },
    // TIMESHEETS
    { module: "TIMESHEETS", action: "CREATE",  label: "Enter DTR records" },
    { module: "TIMESHEETS", action: "READ",    label: "View DTR records" },
    { module: "TIMESHEETS", action: "UPDATE",  label: "Edit DTR records" },
    { module: "TIMESHEETS", action: "APPROVE", label: "Approve DTR records" },
    // LEAVES
    { module: "LEAVES",    action: "READ",    label: "View leave requests" },
    { module: "LEAVES",    action: "APPROVE", label: "Approve leave requests" },
    // REPORTS
    { module: "REPORTS",   action: "READ",    label: "View statutory reports" },
    { module: "REPORTS",   action: "EXPORT",  label: "Export statutory reports" },
    // COMPLIANCE
    { module: "COMPLIANCE", action: "READ",   label: "View compliance data" },
    { module: "COMPLIANCE", action: "EXPORT", label: "Export compliance data" },
    // SETTINGS
    { module: "SETTINGS",  action: "CREATE",  label: "Create settings records" },
    { module: "SETTINGS",  action: "READ",    label: "View tenant settings" },
    { module: "SETTINGS",  action: "UPDATE",  label: "Edit tenant settings" },
    { module: "SETTINGS",  action: "DELETE",  label: "Delete settings records" },
    // ROLES
    { module: "ROLES",     action: "CREATE",  label: "Create roles" },
    { module: "ROLES",     action: "READ",    label: "View roles" },
    { module: "ROLES",     action: "UPDATE",  label: "Edit roles" },
    { module: "ROLES",     action: "DELETE",  label: "Delete roles" },
  ];

  const permMap: Record<string, string> = {}; // "MODULE:ACTION" → id
  for (const p of permSeeds) {
    const existing = await prisma.permission.findUnique({
      where: { module_action: { module: p.module as never, action: p.action as never } },
    });
    const row = existing ?? await prisma.permission.create({
      data: { module: p.module as never, action: p.action as never, label: p.label },
    });
    permMap[`${p.module}:${p.action}`] = row.id;
  }
  console.log(`✅  Permissions: ${permSeeds.length} permissions seeded`);

  // ── 6b. Roles: HR Admin, Payroll Officer, Employee ────────────────────────
  async function upsertRole(name: string, description: string, isSystem = true) {
    const existing = await prisma.role.findFirst({
      where: { tenantId: tenant!.id, name, deletedAt: null },
    });
    if (existing) {
      // Ensure isSystem flag is up-to-date in case the role was created before this field existed
      if (existing.isSystem !== isSystem) {
        return prisma.role.update({ where: { id: existing.id }, data: { isSystem } });
      }
      return existing;
    }
    return prisma.role.create({
      data: { tenantId: tenant!.id, name, description, isSystem },
    });
  }

  const adminRole = await upsertRole("HR Admin", "Full HR & Payroll access");
  const payrollRole = await upsertRole("Payroll Officer", "Create and finalize payroll runs");
  const employeeRole = await upsertRole("Employee", "ESS-only access — no admin permissions");

  // Assign all permissions to HR Admin
  const adminPerms = Object.values(permMap);
  for (const permissionId of adminPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId } },
      update: {},
      create: { roleId: adminRole.id, permissionId },
    });
  }

  // Assign payroll + report permissions to Payroll Officer
  const payrollPerms = ["PAYROLL:CREATE","PAYROLL:READ","PAYROLL:APPROVE","PAYROLL:EXPORT","REPORTS:READ","REPORTS:EXPORT","TIMESHEETS:READ"];
  for (const key of payrollPerms) {
    const permissionId = permMap[key];
    if (!permissionId) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: payrollRole.id, permissionId } },
      update: {},
      create: { roleId: payrollRole.id, permissionId },
    });
  }

  // Employee role has no admin permissions (ESS only)
  void employeeRole; // intentionally empty
  console.log(`✅  Roles:       HR Admin (${adminPerms.length} perms), Payroll Officer (${payrollPerms.length} perms), Employee (0 perms)`);

  // ── 6c. Admin User ────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin1234!", 10);
  let adminUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "admin@democorp.ph", deletedAt: null },
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: "admin@democorp.ph",
        passwordHash,
        firstName: "System",
        lastName: "Administrator",
        systemRole: "TENANT_USER",
        roleId: adminRole.id,
        isActive: true,
      },
    });
  }
  console.log(`✅  User:        ${adminUser.email}  (${adminUser.id})`);

  // ── 7. Employees ───────────────────────────────────────────────────────────
  type EmpSeed = {
    firstName: string; lastName: string; middleName?: string;
    gender: "FEMALE" | "MALE";
    civilStatus: "MARRIED" | "SINGLE";
    workEmail: string; mobileNumber: string;
    positionTitle: string;
    departmentId: string; branchId: string;
    employmentType: "FULL_TIME" | "PART_TIME" | "CASUAL";
    employmentStatus: "REGULAR" | "PROBATIONARY" | "CONTRACTUAL";
    payFrequency: "SEMI_MONTHLY" | "MONTHLY";
    salaryType: "MONTHLY";
    hireDate: Date;
    regularizationDate?: Date;
    endOfContractDate?: Date;
    basicSalaryPhp: number;
  };

  const employeeSeeds: EmpSeed[] = [
    { firstName: "Maria", lastName: "Santos", middleName: "Reyes", gender: "FEMALE", civilStatus: "MARRIED", workEmail: "m.santos@democorp.ph", mobileNumber: "09171000001", positionTitle: "HR Manager", departmentId: hrDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2020-03-01"), regularizationDate: new Date("2020-09-01"), basicSalaryPhp: 65000 },
    { firstName: "Jose", lastName: "Dela Cruz", middleName: "Bautista", gender: "MALE", civilStatus: "SINGLE", workEmail: "j.delacruz@democorp.ph", mobileNumber: "09171000002", positionTitle: "Senior Engineer", departmentId: engDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2021-06-15"), regularizationDate: new Date("2021-12-15"), basicSalaryPhp: 75000 },
    { firstName: "Ana", lastName: "Reyes", middleName: "Cruz", gender: "FEMALE", civilStatus: "SINGLE", workEmail: "a.reyes@democorp.ph", mobileNumber: "09171000003", positionTitle: "Software Engineer", departmentId: engDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "PROBATIONARY", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2025-01-06"), basicSalaryPhp: 45000 },
    { firstName: "Ramon", lastName: "Villanueva", gender: "MALE", civilStatus: "MARRIED", workEmail: "r.villanueva@democorp.ph", mobileNumber: "09171000004", positionTitle: "Sales Manager", departmentId: salesDept.id, branchId: cebuBranch.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2019-09-01"), regularizationDate: new Date("2020-03-01"), basicSalaryPhp: 70000 },
    { firstName: "Liza", lastName: "Fernandez", gender: "FEMALE", civilStatus: "SINGLE", workEmail: "l.fernandez@democorp.ph", mobileNumber: "09171000005", positionTitle: "Sales Representative", departmentId: salesDept.id, branchId: cebuBranch.id, employmentType: "FULL_TIME", employmentStatus: "PROBATIONARY", payFrequency: "MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2025-04-01"), basicSalaryPhp: 28000 },
    { firstName: "Miguel", lastName: "Torres", gender: "MALE", civilStatus: "SINGLE", workEmail: "m.torres@democorp.ph", mobileNumber: "09171000006", positionTitle: "Junior Engineer", departmentId: engDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "PROBATIONARY", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2025-05-01"), basicSalaryPhp: 30000 },
    { firstName: "Patricia", lastName: "Castillo", gender: "FEMALE", civilStatus: "MARRIED", workEmail: "p.castillo@democorp.ph", mobileNumber: "09171000007", positionTitle: "HR Specialist", departmentId: hrDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2022-02-14"), regularizationDate: new Date("2022-08-14"), basicSalaryPhp: 40000 },
    { firstName: "Carlos", lastName: "Mendoza", gender: "MALE", civilStatus: "SINGLE", workEmail: "c.mendoza@democorp.ph", mobileNumber: "09171000008", positionTitle: "DevOps Engineer", departmentId: engDept.id, branchId: manilaHQ.id, employmentType: "CASUAL", employmentStatus: "CONTRACTUAL", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2025-01-01"), endOfContractDate: new Date("2025-12-31"), basicSalaryPhp: 55000 },
    { firstName: "Jennifer", lastName: "Pascual", gender: "FEMALE", civilStatus: "SINGLE", workEmail: "j.pascual@democorp.ph", mobileNumber: "09171000009", positionTitle: "Marketing Specialist", departmentId: salesDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2023-03-20"), regularizationDate: new Date("2023-09-20"), basicSalaryPhp: 38000 },
    { firstName: "Roberto", lastName: "Aquino", gender: "MALE", civilStatus: "MARRIED", workEmail: "r.aquino@democorp.ph", mobileNumber: "09171000010", positionTitle: "Accountant", departmentId: hrDept.id, branchId: manilaHQ.id, employmentType: "FULL_TIME", employmentStatus: "REGULAR", payFrequency: "SEMI_MONTHLY", salaryType: "MONTHLY", hireDate: new Date("2021-01-04"), regularizationDate: new Date("2021-07-04"), basicSalaryPhp: 50000 },
  ];

  let empCount = 0;
  for (const seed of employeeSeeds) {
    empCount++;
    const employeeNumber = `EMP-${String(empCount).padStart(4, "0")}`;
    const { basicSalaryPhp, endOfContractDate, regularizationDate, positionTitle, ...empData } = seed;

    const existing = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, workEmail: empData.workEmail },
    });
    if (existing) continue;

    const emp = await prisma.employee.create({
      data: {
        ...empData,
        tenantId: tenant.id,
        employeeNumber,
        positionId: positions[positionTitle],
        jobTitle: positionTitle,
        ...(regularizationDate && { regularizationDate }),
        ...(endOfContractDate && { endOfContractDate }),
        birthDate: null,
      },
    });

    await prisma.employeeSalary.create({
      data: {
        employeeId: emp.id,
        tenantId: tenant.id,
        basicSalaryCents: pesos(basicSalaryPhp),
        salaryType: emp.salaryType,
        effectiveDate: emp.hireDate,
        reason: "Initial hire",
        createdByUserId: adminUser.id,
      },
    });
  }
  console.log(`✅  Employees:   ${empCount} sample employees seeded`);

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("✅ Seed complete! Add the following to your .env.local:\n");
  console.log(`DEV_TENANT_ID="${tenant.id}"`);
  console.log(`DEV_USER_ID="${adminUser.id}"`);
  console.log("─────────────────────────────────────────────────────────\n");
  console.log("Login credentials:");
  console.log("  admin@democorp.ph / Admin1234!\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
