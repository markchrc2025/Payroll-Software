/**
 * GET /api/analytics/payroll/summary
 *
 * Query params:
 *   year    (required)  — e.g. 2026
 *   month   (required)  — 1–12
 *   groupBy (optional)  — "department" | "branch" | "position" (default: "department")
 *
 * Returns total gross, net, WHT, SSS-EE, PhilHealth-EE, Pag-IBIG-EE centavos
 * grouped by the chosen dimension, for all FINALIZED books in the period.
 * All monetary values are returned as strings (BigInt serialization).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";

type GroupBy = "department" | "branch" | "position";

function bigIntStr(n: bigint): string {
  return n.toString();
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "REPORTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  const groupBy = (url.searchParams.get("groupBy") ?? "department") as GroupBy;

  if (!yearStr || !monthStr) return err("year and month query params are required", 400);
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12)
    return err("Invalid year or month", 400);
  if (!["department", "branch", "position"].includes(groupBy))
    return err("groupBy must be department | branch | position", 400);

  // Period window: first day of month → last day of month
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const sheets = await withTenant(auth.tenantId, (tx) =>
    tx.payrollSheet.findMany({
      where: {
        tenantId: auth.tenantId,
        payrollBook: {
          periodStart: { gte: periodStart },
          periodEnd:   { lte: periodEnd },
          status: "FINALIZED",
        },
      },
      select: {
        grossCompensationCents: true,
        netPayCents: true,
        withholdingTaxCents: true,
        sssEeCents: true,
        philhealthEeCents: true,
        pagibigEeCents: true,
        employee: {
          select: {
            departmentId: true,
            branchId: true,
            positionId: true,
          },
        },
      },
    })
  );

  // Group and sum
  const groups: Record<
    string,
    {
      groupId: string;
      grossCents: bigint;
      netCents: bigint;
      whtCents: bigint;
      sssEeCents: bigint;
      philhealthEeCents: bigint;
      pagibigEeCents: bigint;
      headcount: number;
    }
  > = {};

  for (const s of sheets) {
    const groupId =
      (groupBy === "department"
        ? s.employee.departmentId
        : groupBy === "branch"
        ? s.employee.branchId
        : s.employee.positionId) ?? "unassigned";

    if (!groups[groupId]) {
      groups[groupId] = {
        groupId,
        grossCents: 0n,
        netCents: 0n,
        whtCents: 0n,
        sssEeCents: 0n,
        philhealthEeCents: 0n,
        pagibigEeCents: 0n,
        headcount: 0,
      };
    }
    const g = groups[groupId];
    g.grossCents += s.grossCompensationCents;
    g.netCents += s.netPayCents;
    g.whtCents += s.withholdingTaxCents;
    g.sssEeCents += s.sssEeCents;
    g.philhealthEeCents += s.philhealthEeCents;
    g.pagibigEeCents += s.pagibigEeCents;
    g.headcount += 1;
  }

  const result = Object.values(groups).map((g) => ({
    groupId: g.groupId,
    groupBy,
    headcount: g.headcount,
    grossCents: bigIntStr(g.grossCents),
    netCents: bigIntStr(g.netCents),
    whtCents: bigIntStr(g.whtCents),
    sssEeCents: bigIntStr(g.sssEeCents),
    philhealthEeCents: bigIntStr(g.philhealthEeCents),
    pagibigEeCents: bigIntStr(g.pagibigEeCents),
  }));

  return ok({
    year,
    month,
    groupBy,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    groups: result,
    totals: {
      headcount: sheets.length,
      grossCents: bigIntStr(result.reduce((s, r) => s + BigInt(r.grossCents), 0n)),
      netCents: bigIntStr(result.reduce((s, r) => s + BigInt(r.netCents), 0n)),
      whtCents: bigIntStr(result.reduce((s, r) => s + BigInt(r.whtCents), 0n)),
    },
  });
}
