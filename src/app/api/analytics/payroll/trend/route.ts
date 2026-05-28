/**
 * GET /api/analytics/payroll/trend
 *
 * Query params:
 *   year    (required)  — e.g. 2026
 *   groupBy (optional)  — "department" | "branch" | "position" (default: none — total only)
 *
 * Returns month-by-month net pay totals for sparkline charts.
 * Only FINALIZED books are included.
 * Monetary values returned as strings (BigInt serialization).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "REPORTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");

  if (!yearStr) return err("year query param is required", 400);
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) return err("Invalid year", 400);

  const periodStart = new Date(year, 0, 1);   // Jan 1
  const periodEnd   = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31

  const books = await withTenant(auth.tenantId, (tx) =>
    tx.payrollBook.findMany({
      where: {
        tenantId: auth.tenantId,
        status: "FINALIZED",
        periodStart: { gte: periodStart },
        periodEnd:   { lte: periodEnd },
      },
      select: {
        periodEnd: true,
        sheets: {
          select: {
            netPayCents: true,
            grossCompensationCents: true,
            withholdingTaxCents: true,
          },
        },
      },
    })
  );

  // Accumulate by calendar month (1–12)
  const byMonth: Record<
    number,
    { netCents: bigint; grossCents: bigint; whtCents: bigint; headcount: number }
  > = {};

  for (let m = 1; m <= 12; m++) {
    byMonth[m] = { netCents: 0n, grossCents: 0n, whtCents: 0n, headcount: 0 };
  }

  for (const book of books) {
    const m = book.periodEnd.getMonth() + 1; // 1-based
    for (const s of book.sheets) {
      byMonth[m].netCents   += s.netPayCents;
      byMonth[m].grossCents += s.grossCompensationCents;
      byMonth[m].whtCents   += s.withholdingTaxCents;
      byMonth[m].headcount  += 1;
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      month: m,
      headcount: byMonth[m].headcount,
      netCents:   byMonth[m].netCents.toString(),
      grossCents: byMonth[m].grossCents.toString(),
      whtCents:   byMonth[m].whtCents.toString(),
    };
  });

  return ok({ year, months });
}
