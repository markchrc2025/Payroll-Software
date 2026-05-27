/**
 * Prisma Seed — creates demo data for local development.
 *
 * Run with:
 *   npx prisma db seed
 *
 * After seeding, copy the printed DEV_COMPANY_ID and DEV_USER_ID
 * into your .env.local file.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database…\n");

  // ── 1. Company ─────────────────────────────────────────────────────────────
  let company = await prisma.company.findFirst({
    where: { name: "Demo Corp Philippines, Inc.", deletedAt: null },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Demo Corp Philippines, Inc.",
        tradeName: "Demo Corp",
        industry: "Technology",
        contactEmail: "hr@democorp.ph",
        contactPhone: "02-8000-0001",
        subscriptionTier: "STARTER",
        subscriptionStatus: "ACTIVE",
      },
    });
  }
  console.log(`✅  Company:     ${company.name}  (${company.id})`);

  // ── 2. Departments ──────────────────────────────────────────────────────────
  const [hrDept, engDept, salesDept] = await Promise.all([
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Human Resources" } },
      update: {},
      create: { companyId: company.id, name: "Human Resources", description: "HR Department" },
    }),
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Engineering" } },
      update: {},
      create: { companyId: company.id, name: "Engineering", description: "Software & IT" },
    }),
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Sales" } },
      update: {},
      create: { companyId: company.id, name: "Sales", description: "Sales & Marketing" },
    }),
  ]);
  console.log(`✅  Departments: HR, Engineering, Sales`);

  // ── 3. Branches ─────────────────────────────────────────────────────────────
  const [manilaHQ, cebuBranch] = await Promise.all([
    prisma.branch.upsert({
      where: { companyId_name: { companyId: company.id, name: "Manila HQ" } },
      update: {},
      create: {
        companyId: company.id,
        name: "Manila HQ",
        city: "Makati City",
        province: "Metro Manila",
        isHeadOffice: true,
      },
    }),
    prisma.branch.upsert({
      where: { companyId_name: { companyId: company.id, name: "Cebu Branch" } },
      update: {},
      create: {
        companyId: company.id,
        name: "Cebu Branch",
        city: "Cebu City",
        province: "Cebu",
        isHeadOffice: false,
      },
    }),
  ]);
  console.log(`✅  Branches:    Manila HQ, Cebu Branch`);

  // ── 4. Role ─────────────────────────────────────────────────────────────────
  let adminRole = await prisma.role.findFirst({
    where: { companyId: company.id, name: "HR Admin", deletedAt: null },
  });
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        companyId: company.id,
        name: "HR Admin",
        description: "Full HR & Payroll access",
      },
    });
  }

  // ── 5. Admin User ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin1234!", 10);
  let adminUser = await prisma.user.findFirst({
    where: { companyId: company.id, email: "admin@democorp.ph", deletedAt: null },
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        companyId: company.id,
        email: "admin@democorp.ph",
        passwordHash,
        firstName: "System",
        lastName: "Administrator",
        systemRole: "COMPANY_USER",
        roleId: adminRole.id,
        isActive: true,
      },
    });
  }
  console.log(`✅  User:        ${adminUser.email}  (${adminUser.id})`);

  // ── 6. Sample Employees ──────────────────────────────────────────────────────
  const employeeSeeds = [
    {
      firstName: "Maria",
      lastName: "Santos",
      middleName: "Reyes",
      gender: "FEMALE" as const,
      civilStatus: "MARRIED" as const,
      workEmail: "m.santos@democorp.ph",
      mobileNumber: "09171000001",
      jobTitle: "HR Manager",
      departmentId: hrDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2020-03-01"),
      regularizationDate: new Date("2020-09-01"),
      basicSalary: "65000",
    },
    {
      firstName: "Jose",
      lastName: "Dela Cruz",
      middleName: "Bautista",
      gender: "MALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "j.delacruz@democorp.ph",
      mobileNumber: "09171000002",
      jobTitle: "Senior Engineer",
      departmentId: engDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2021-06-15"),
      regularizationDate: new Date("2021-12-15"),
      basicSalary: "75000",
    },
    {
      firstName: "Ana",
      lastName: "Reyes",
      middleName: "Cruz",
      gender: "FEMALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "a.reyes@democorp.ph",
      mobileNumber: "09171000003",
      jobTitle: "Software Engineer",
      departmentId: engDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "PROBATIONARY" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2025-01-06"),
      basicSalary: "45000",
    },
    {
      firstName: "Ramon",
      lastName: "Villanueva",
      gender: "MALE" as const,
      civilStatus: "MARRIED" as const,
      workEmail: "r.villanueva@democorp.ph",
      mobileNumber: "09171000004",
      jobTitle: "Sales Manager",
      departmentId: salesDept.id,
      branchId: cebuBranch.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2019-09-01"),
      regularizationDate: new Date("2020-03-01"),
      basicSalary: "70000",
    },
    {
      firstName: "Liza",
      lastName: "Fernandez",
      gender: "FEMALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "l.fernandez@democorp.ph",
      mobileNumber: "09171000005",
      jobTitle: "Sales Representative",
      departmentId: salesDept.id,
      branchId: cebuBranch.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "PROBATIONARY" as const,
      payFrequency: "MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2025-04-01"),
      basicSalary: "28000",
    },
    {
      firstName: "Miguel",
      lastName: "Torres",
      gender: "MALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "m.torres@democorp.ph",
      mobileNumber: "09171000006",
      jobTitle: "Junior Engineer",
      departmentId: engDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "PROBATIONARY" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2025-05-01"),
      basicSalary: "30000",
    },
    {
      firstName: "Patricia",
      lastName: "Castillo",
      gender: "FEMALE" as const,
      civilStatus: "MARRIED" as const,
      workEmail: "p.castillo@democorp.ph",
      mobileNumber: "09171000007",
      jobTitle: "HR Specialist",
      departmentId: hrDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2022-02-14"),
      regularizationDate: new Date("2022-08-14"),
      basicSalary: "40000",
    },
    {
      firstName: "Carlos",
      lastName: "Mendoza",
      gender: "MALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "c.mendoza@democorp.ph",
      mobileNumber: "09171000008",
      jobTitle: "DevOps Engineer",
      departmentId: engDept.id,
      branchId: manilaHQ.id,
      employmentType: "CASUAL" as const,
      employmentStatus: "CONTRACTUAL" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2025-01-01"),
      endOfContractDate: new Date("2025-12-31"),
      basicSalary: "55000",
    },
    {
      firstName: "Jennifer",
      lastName: "Pascual",
      gender: "FEMALE" as const,
      civilStatus: "SINGLE" as const,
      workEmail: "j.pascual@democorp.ph",
      mobileNumber: "09171000009",
      jobTitle: "Marketing Specialist",
      departmentId: salesDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2023-03-20"),
      regularizationDate: new Date("2023-09-20"),
      basicSalary: "38000",
    },
    {
      firstName: "Roberto",
      lastName: "Aquino",
      gender: "MALE" as const,
      civilStatus: "MARRIED" as const,
      workEmail: "r.aquino@democorp.ph",
      mobileNumber: "09171000010",
      jobTitle: "Accountant",
      departmentId: hrDept.id,
      branchId: manilaHQ.id,
      employmentType: "FULL_TIME" as const,
      employmentStatus: "REGULAR" as const,
      payFrequency: "SEMI_MONTHLY" as const,
      salaryType: "MONTHLY" as const,
      hireDate: new Date("2021-01-04"),
      regularizationDate: new Date("2021-07-04"),
      basicSalary: "50000",
    },
  ];

  let empCount = 0;
  for (const seed of employeeSeeds) {
    empCount++;
    const employeeNumber = `EMP-${String(empCount).padStart(4, "0")}`;
    const { basicSalary, endOfContractDate, regularizationDate, ...empData } = seed;

    const existing = await prisma.employee.findFirst({
      where: { companyId: company.id, workEmail: empData.workEmail },
    });

    if (existing) continue;

    const emp = await prisma.employee.create({
      data: {
        ...empData,
        companyId: company.id,
        employeeNumber,
        ...(regularizationDate && { regularizationDate }),
        ...(endOfContractDate && { endOfContractDate }),
        birthDate: null,
      },
    });

    await prisma.employeeSalary.create({
      data: {
        employeeId: emp.id,
        companyId: company.id,
        basicSalary,
        salaryType: emp.salaryType,
        effectiveDate: emp.hireDate,
        reason: "Initial hire",
        createdByUserId: adminUser.id,
      },
    });
  }
  console.log(`✅  Employees:   ${empCount} sample employees seeded`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────");
  console.log("✅ Seed complete! Add the following to your .env.local:\n");
  console.log(`DEV_COMPANY_ID="${company.id}"`);
  console.log(`DEV_USER_ID="${adminUser.id}"`);
  console.log("─────────────────────────────────────────────────────────\n");
  console.log("Login credentials:");
  console.log("  Email:    admin@democorp.ph");
  console.log("  Password: Admin1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
