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
import type { ComputePeriodInputSnapshot } from "@/lib/payroll/types";
import { centavosToJson } from "@/lib/money";

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

      // Calendar-year boundaries for YTD
      const periodYear = book.periodEnd.getFullYear();
      const yearStart = new Date(`${periodYear}-01-01T00:00:00.000Z`);

      const [emp, tenant, ytdSheets, leaveBalances] = await Promise.all([
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
        // All finalized sheets in the same calendar year up to and including this period
        tx.payrollSheet.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            payrollBook: {
              status: "FINALIZED",
              periodEnd: { gte: yearStart, lte: book.periodEnd },
            },
          },
          select: {
            grossCompensationCents: true,
            withholdingTaxCents: true,
            basePayCents: true,
            nontaxable13MonthAndBenefitsCents: true,
          },
        }),
        // Leave balances for current year (SL / VL)
        tx.leaveBalance.findMany({
          where: {
            employeeId: ctx.employeeId,
            year: periodYear,
          },
          select: {
            earned: true,
            used: true,
            forfeited: true,
            openingBalance: true,
            leaveType: { select: { code: true, name: true } },
          },
        }),
      ]);

      if (!emp) return "emp_not_found" as const;

      return { book, sheet, emp, tenantName: tenant.name, ytdSheets, leaveBalances };
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

    const { book, sheet, emp, tenantName, ytdSheets, leaveBalances } = result;

    // YTD aggregates
    let ytdGross = BigInt(0);
    let ytdWtax = BigInt(0);
    let ytdBasic = BigInt(0);
    let ytd13Month = BigInt(0);
    for (const s of ytdSheets) {
      ytdGross += s.grossCompensationCents;
      ytdWtax += s.withholdingTaxCents;
      ytdBasic += s.basePayCents;
      ytd13Month += s.nontaxable13MonthAndBenefitsCents;
    }

    // Accrued 13th month = ytdBasic / 12 (DOLE formula, regardless of how much has been released)
    const accrued13thMonth = ytdBasic / BigInt(12);

    // Tardiness from periodInputSnapshot
    const snap = sheet.periodInputSnapshot as unknown as ComputePeriodInputSnapshot | null;
    const tardinessMinutes = snap?.lateUndertimeMinutes ?? 0;

    // Leave balance rows (SL and VL)
    const leaveRows = leaveBalances.map((b) => ({
      code: b.leaveType.code,
      name: b.leaveType.name,
      available: (
        parseFloat(String(b.earned)) -
        parseFloat(String(b.used)) -
        parseFloat(String(b.forfeited))
      ).toFixed(2),
    }));

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

    return ok({
      ...payslip,
      ytd: {
        grossCents: centavosToJson(ytdGross),
        wtaxCents: centavosToJson(ytdWtax),
        basicCents: centavosToJson(ytdBasic),
        released13thMonthCents: centavosToJson(ytd13Month),
        accrued13thMonthCents: centavosToJson(accrued13thMonth),
      },
      tardinessMinutes,
      leaveBalances: leaveRows,
    });
  } catch (e) {
    console.error("[ess/payslips/[bookId]]", e);
    return serverError(e);
  }
}
