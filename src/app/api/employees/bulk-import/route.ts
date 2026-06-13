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
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { toCentavos } from "@/lib/money";
import { ok, err, unauthorized } from "@/lib/api-response";
import { csvEmployeeRowSchema } from "@/lib/validations/employee";
import { parseCsvString } from "@/lib/utils/csv";
import { claimEmployeeIdBulk, formatEmployeeId } from "@/lib/claim-employee-id";

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

  // --- Pre-load dept & branch lookup maps ---
  const { departments, branches } = await withTenant(auth.tenantId, async (tx) => {
    const [departments, branches] = await Promise.all([
      tx.department.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
      tx.branch.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    return { departments, branches };
  });

  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const branchMap = new Map(branches.map((b) => [b.name.toLowerCase(), b.id]));

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
      const messages = parsed.error.issues
        .map((e) => `${(e.path as (string | number | symbol)[]).filter(p => typeof p !== 'symbol').join(".")}: ${e.message}`)
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
        message: `Department "${d.department_name}" not found in tenant`,
      });
      continue;
    }
    if (d.branch_name && !branchId) {
      errors.push({
        row: rowNum,
        message: `Branch "${d.branch_name}" not found in tenant`,
      });
      continue;
    }

    validRows.push({
      rowIndex: i,
      data: d,
      departmentId,
      branchId,
      employeeNumber: "", // filled atomically in the insert transaction below
    });
  }

  if (validRows.length === 0) {
    return ok({ imported: 0, errors }, "No valid rows to import");
  }

  // --- Insert valid rows in a single transaction, claiming IDs atomically ---
  await withTenant(auth.tenantId, async (tx) => {
    // Claim N consecutive sequence numbers in one FOR UPDATE + UPDATE.
    const { cfg, firstSeq, year } = await claimEmployeeIdBulk(tx, auth.tenantId, validRows.length);
    validRows.forEach((row, i) => {
      row.employeeNumber = formatEmployeeId(cfg, firstSeq + i, year);
    });

    for (const row of validRows) {
      const d = row.data;
      const hireDate = new Date(d.hire_date);

      const emp = await tx.employee.create({
        data: {
          tenantId: auth.tenantId,
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
          tenantId: auth.tenantId,
          basicSalaryCents: toCentavos(d.basic_salary),
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
