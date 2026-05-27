/**
 * GET /api/payroll/runs/[id]/payslips
 *
 * Returns payslips for all employees in a FINALIZED payroll run.
 * Requires an authenticated tenant user (admin-scoped — ESS self-service
 * is out of scope for D4).
 *
 * Response: { data: Payslip[] }
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";
import { renderPayslip } from "@/lib/payslip/render";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const book = await getRun(auth.tenantId, id);

    if (book.status !== "FINALIZED") {
      return err("Payslips are only available for FINALIZED runs", 400);
    }

    // Load employee details + tenant name in one transaction.
    const employeeIds = book.sheets.map((s) => s.employeeId);
    const { employees, tenantName } = await withTenant(auth.tenantId, async (tx) => {
      const [emps, tenant] = await Promise.all([
        tx.employee.findMany({
          where: { id: { in: employeeIds } },
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            suffix: true,
            taxClassification: true,
            department: { select: { name: true } },
            branch: { select: { name: true } },
            position: { select: { title: true } },
          },
        }),
        tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { name: true } }),
      ]);
      return { employees: emps, tenantName: tenant.name };
    });

    const empMap = new Map(employees.map((e) => [e.id, e]));

    const payslips = book.sheets.flatMap((sheet) => {
      const emp = empMap.get(sheet.employeeId);
      if (!emp) return []; // orphaned sheet — skip
      return [
        renderPayslip({
          sheet,
          employee: {
            id: emp.id,
            employeeNumber: emp.employeeNumber,
            firstName: emp.firstName,
            middleName: emp.middleName,
            lastName: emp.lastName,
            suffix: emp.suffix,
            taxClassification: emp.taxClassification,
            department: emp.department?.name ?? null,
            branch: emp.branch?.name ?? null,
            position: emp.position?.title ?? null,
          },
          periodStart: book.periodStart,
          periodEnd: book.periodEnd,
          cycle: book.cycle,
          runType: book.runType,
          tenantId: auth.tenantId,
          tenantName,
        }),
      ];
    });

    return ok({ data: payslips });
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    return serverError(e);
  }
}
