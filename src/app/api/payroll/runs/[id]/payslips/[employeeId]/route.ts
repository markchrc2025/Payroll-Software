/**
 * GET /api/payroll/runs/[id]/payslips/[employeeId]
 *
 * Returns the payslip for a single employee within a payroll run. On a
 * FINALIZED run it is the payslip; on a DRAFT run it is a preview of the
 * computation (PAY-168, `preview: true`), which can still change. A CANCELLED
 * run has none. The PDF stays finalized-only.
 * Requires an authenticated tenant user (admin-scoped — ESS self-service
 * is out of scope for D4).
 *
 * Response: { data: Payslip } (with ytd, tardinessMinutes and leaveBalances, as in ESS)
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import {
  err,
  notFound,
  ok,
  serverError,
} from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";
import { renderPayslip } from "@/lib/payslip/render";
import { loadPayslipExtras } from "@/lib/payslip/extras";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; employeeId: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id, employeeId } = await params;

  try {
    const book = await getRun(auth.tenantId, id);

    if (book.status !== "FINALIZED" && book.status !== "DRAFT") {
      return err("A cancelled run has no payslips", 400);
    }
    const preview = book.status === "DRAFT"; // PAY-168

    const sheet = book.sheets.find((s) => s.employeeId === employeeId);
    if (!sheet) return notFound("PayrollSheet");

    const { emp, tenantName, extras } = await withTenant(auth.tenantId, async (tx) => {
      const [employee, tenant] = await Promise.all([
        tx.employee.findFirst({
          where: { id: employeeId, tenantId: auth.tenantId },
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
      // YTD, tardiness and leave balances, as on the employee's own payslip
      const extras = employee
        ? await loadPayslipExtras(tx, {
            tenantId: auth.tenantId,
            employeeId,
            periodEnd: book.periodEnd,
            periodInputSnapshot: sheet.periodInputSnapshot,
          })
        : null;
      return { emp: employee, tenantName: tenant.name, extras };
    });

    if (!emp) return notFound("Employee");

    const payslip = renderPayslip({
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
      preview,
    });

    // Same shape as the employee's own payslip (GET /api/ess/payslips/[bookId]).
    return ok({ ...payslip, ...extras });
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    return serverError(e);
  }
}
