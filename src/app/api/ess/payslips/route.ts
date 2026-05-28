/**
 * GET /api/ess/payslips
 *
 * List the authenticated employee's payslips from FINALIZED payroll runs,
 * ordered by periodEnd descending.
 *
 * Query params:
 *   page  — 1-based (default: 1)
 *   limit — max 50 (default: 12)
 *
 * Response: PaginatedResponse<PayslipSummary>
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { paginated, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { centavosToJson } from "@/lib/money";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "12")));
  const skip = (page - 1) * limit;

  try {
    const [sheets, total] = await withTenant(ctx.tenantId, async (tx) => {
      return Promise.all([
        tx.payrollSheet.findMany({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            payrollBook: { status: "FINALIZED" },
          },
          select: {
            id: true,
            netPayCents: true,
            grossCompensationCents: true,
            withholdingTaxCents: true,
            payrollBook: {
              select: {
                id: true,
                periodStart: true,
                periodEnd: true,
                cycle: true,
                runType: true,
                finalizedAt: true,
              },
            },
          },
          orderBy: { payrollBook: { periodEnd: "desc" } },
          skip,
          take: limit,
        }),
        tx.payrollSheet.count({
          where: {
            tenantId: ctx.tenantId,
            employeeId: ctx.employeeId,
            payrollBook: { status: "FINALIZED" },
          },
        }),
      ]);
    });

    const summaries = sheets.map((s) => ({
      bookId: s.payrollBook.id,
      periodStart: s.payrollBook.periodStart,
      periodEnd: s.payrollBook.periodEnd,
      cycle: s.payrollBook.cycle,
      runType: s.payrollBook.runType,
      finalizedAt: s.payrollBook.finalizedAt,
      netPayCents: centavosToJson(s.netPayCents),
      grossCompensationCents: centavosToJson(s.grossCompensationCents),
      withholdingTaxCents: centavosToJson(s.withholdingTaxCents),
    }));

    return paginated(summaries, total, page, limit);
  } catch (e) {
    console.error("[ess/payslips]", e);
    return serverError(e);
  }
}
