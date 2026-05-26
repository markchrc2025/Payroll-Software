/**
 * GET /api/employees/export
 *
 * Downloads all (or filtered) employees as a CSV file.
 * Supports the same filters as the list endpoint:
 *   departmentId, branchId, status, employmentType
 */

import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { unauthorized, serverError } from "@/lib/api-response";
import { toCsvString, csvDownloadResponse } from "@/lib/utils/csv";
import { listEmployeesSchema } from "@/lib/validations/employee";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const { departmentId, branchId, status, employmentType } =
    listEmployeesSchema.parse({ ...qp, page: 1, limit: 200 });

  const where: Prisma.EmployeeWhereInput = {
    companyId: auth.companyId,
    deletedAt: null,
    ...(departmentId && { departmentId }),
    ...(branchId && { branchId }),
    ...(status && { employmentStatus: status }),
    ...(employmentType && { employmentType }),
  };

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      department: { select: { name: true } },
      branch: { select: { name: true } },
      salaryHistory: {
        where: { endDate: null },
        orderBy: { effectiveDate: "desc" },
        take: 1,
        select: { basicSalary: true },
      },
    },
  });

  const rows = employees.map((e) => ({
    employee_number: e.employeeNumber,
    first_name: e.firstName,
    middle_name: e.middleName ?? "",
    last_name: e.lastName,
    suffix: e.suffix ?? "",
    birth_date: e.birthDate ? e.birthDate.toISOString().slice(0, 10) : "",
    gender: e.gender ?? "",
    civil_status: e.civilStatus ?? "",
    mobile_number: e.mobileNumber ?? "",
    work_email: e.workEmail ?? "",
    personal_email: e.personalEmail ?? "",
    address_line1: e.addressLine1 ?? "",
    city: e.city ?? "",
    province: e.province ?? "",
    zip_code: e.zipCode ?? "",
    region: e.region ?? "",
    department_name: e.department?.name ?? "",
    branch_name: e.branch?.name ?? "",
    job_title: e.jobTitle ?? "",
    job_level: e.jobLevel ?? "",
    employment_type: e.employmentType,
    employment_status: e.employmentStatus,
    hire_date: e.hireDate.toISOString().slice(0, 10),
    regularization_date: e.regularizationDate
      ? e.regularizationDate.toISOString().slice(0, 10)
      : "",
    pay_frequency: e.payFrequency,
    salary_type: e.salaryType,
    basic_salary: e.salaryHistory[0]?.basicSalary?.toString() ?? "",
    bank_name: e.bankName ?? "",
    bank_account_number: e.bankAccountNumber ?? "",
    bank_account_name: e.bankAccountName ?? "",
  }));

  const csv = toCsvString(rows);
  const filename = `employees_${new Date().toISOString().slice(0, 10)}.csv`;

  return csvDownloadResponse(csv, filename);
}
