/**
 * POST /api/employees/bulk-import
 *
 * Accepts a multipart/form-data upload with a "file" field containing a CSV.
 * Validates each row with csvEmployeeRowSchema, then inserts valid rows in
 * a single Prisma transaction. Returns a summary of successes and failures.
 *
 * Required CSV columns:
 *   first_name, last_name, hire_date, employment_type,
 *   pay_frequency, salary_type, basic_salary
 *
 * Optional: middle_name, birth_date, gender, civil_status, mobile_number,
 *           work_email, department_name, branch_name, job_title,
 *           employment_status, bank_name, bank_account_number, bank_account_name
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { csvEmployeeRowSchema } from "@/lib/validations/employee";
import { parseCsvString } from "@/lib/utils/csv";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  // --- Parse multipart form ---
  const formData = await req.formData().catch(() => null);
  if (!formData) return err("Expected multipart/form-data");

  const file = formData.get("file") as File | null;
  if (!file) return err("No file uploaded. Provide a 'file' field.");

  const csvText = await file.text();
  const { rows, parseErrors } = parseCsvString(csvText);

  if (parseErrors.length > 0) {
    return err("CSV parsing failed", 400, parseErrors);
  }

  if (rows.length === 0) {
    return err("CSV file is empty or has no data rows.");
  }

  // --- Pre-load dept & branch lookup maps for this company ---
  const [departments, branches] = await Promise.all([
    prisma.department.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.branch.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const branchMap = new Map(branches.map((b) => [b.name.toLowerCase(), b.id]));

  // --- Determine next employee number offset ---
  const lastEmployee = await prisma.employee.findFirst({
    where: { companyId: auth.companyId },
    orderBy: { createdAt: "desc" },
    select: { employeeNumber: true },
  });
  let nextNum = lastEmployee
    ? parseInt(lastEmployee.employeeNumber.replace(/\D/g, ""), 10) + 1
    : 1;

  // --- Validate each row ---
  const validRows: Array<{
    rowIndex: number;
    data: ReturnType<typeof csvEmployeeRowSchema.parse>;
    departmentId: string | null;
    branchId: string | null;
    employeeNumber: string;
  }> = [];

  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // 1-indexed, +1 for header row
    const parsed = csvEmployeeRowSchema.safeParse(rows[i]);

    if (!parsed.success) {
      const messages = parsed.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      errors.push({ row: rowNum, message: messages });
      continue;
    }

    const d = parsed.data;
    const departmentId = d.department_name
      ? (deptMap.get(d.department_name.toLowerCase()) ?? null)
      : null;
    const branchId = d.branch_name
      ? (branchMap.get(d.branch_name.toLowerCase()) ?? null)
      : null;

    if (d.department_name && !departmentId) {
      errors.push({
        row: rowNum,
        message: `Department "${d.department_name}" not found in company`,
      });
      continue;
    }
    if (d.branch_name && !branchId) {
      errors.push({
        row: rowNum,
        message: `Branch "${d.branch_name}" not found in company`,
      });
      continue;
    }

    validRows.push({
      rowIndex: i,
      data: d,
      departmentId,
      branchId,
      employeeNumber: `EMP-${String(nextNum).padStart(4, "0")}`,
    });
    nextNum++;
  }

  if (validRows.length === 0) {
    return ok({ imported: 0, errors }, "No valid rows to import");
  }

  // --- Insert valid rows in a single transaction ---
  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      const d = row.data;
      const hireDate = new Date(d.hire_date);

      const emp = await tx.employee.create({
        data: {
          companyId: auth.companyId,
          employeeNumber: row.employeeNumber,
          firstName: d.first_name,
          middleName: d.middle_name ?? null,
          lastName: d.last_name,
          birthDate: d.birth_date ? new Date(d.birth_date) : null,
          gender: d.gender ?? null,
          civilStatus: d.civil_status ?? null,
          mobileNumber: d.mobile_number ?? null,
          workEmail: d.work_email || null,
          jobTitle: d.job_title ?? null,
          departmentId: row.departmentId,
          branchId: row.branchId,
          employmentType: d.employment_type,
          employmentStatus: d.employment_status,
          hireDate,
          payFrequency: d.pay_frequency,
          salaryType: d.salary_type,
          bankName: d.bank_name ?? null,
          bankAccountNumber: d.bank_account_number ?? null,
          bankAccountName: d.bank_account_name ?? null,
        },
      });

      await tx.employeeSalary.create({
        data: {
          employeeId: emp.id,
          companyId: auth.companyId,
          basicSalary: d.basic_salary.toString(),
          salaryType: d.salary_type,
          effectiveDate: hireDate,
          reason: "CSV bulk import",
          createdByUserId: auth.userId,
        },
      });
    }
  });

  return ok({ imported: validRows.length, errors }, "Import complete");
}
