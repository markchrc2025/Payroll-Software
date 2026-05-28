/**
 * GET /api/ess/payslips/[bookId]
 *
 * Returns the full rendered payslip for the authenticated employee from a
 * specific FINALIZED payroll book.  Returns 404 if the book is not finalized,
 * does not belong to the tenant, or has no sheet for this employee.
 *
 * Response: { data: Payslip }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { renderPayslip } from "@/lib/payslip/render";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { bookId } = await params;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const book = await tx.payrollBook.findFirst({
        where: { id: bookId, tenantId: ctx.tenantId },
        include: { sheets: true },
      });
      if (!book) return "book_not_found" as const;
      if (book.status !== "FINALIZED") return "not_finalized" as const;

      const sheet = book.sheets.find((s) => s.employeeId === ctx.employeeId);
      if (!sheet) return "sheet_not_found" as const;

      const [emp, tenant] = await Promise.all([
        tx.employee.findFirst({
          where: { id: ctx.employeeId, tenantId: ctx.tenantId },
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
        tx.tenant.findUniqueOrThrow({
          where: { id: ctx.tenantId },
          select: { name: true },
        }),
      ]);

      if (!emp) return "emp_not_found" as const;

      return { book, sheet, emp, tenantName: tenant.name };
    });

    if (result === "book_not_found" || result === "emp_not_found") {
      return notFound("PayrollBook");
    }
    if (result === "not_finalized") {
      return err("Payslip only available for finalized runs", 400);
    }
    if (result === "sheet_not_found") {
      return notFound("PayrollSheet");
    }

    const { book, sheet, emp, tenantName } = result;
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
      tenantId: ctx.tenantId,
      tenantName,
    });

    return ok(payslip);
  } catch (e) {
    console.error("[ess/payslips/[bookId]]", e);
    return serverError(e);
  }
}
