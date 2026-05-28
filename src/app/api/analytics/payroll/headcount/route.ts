/**
 * GET /api/analytics/payroll/headcount
 *
 * Query params:
 *   year    (required)  — e.g. 2026
 *   month   (required)  — 1–12
 *   groupBy (optional)  — "department" | "branch" | "position" (default: "department")
 *
 * Returns active employee headcount by the chosen dimension.
 * "Active" = deletedAt IS NULL AND employmentStatus != TERMINATED.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";

type GroupBy = "department" | "branch" | "position";

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

  // Headcount: employees who were active as of the last day of the queried month
  const asOf = new Date(year, month, 0); // last day of month

  const employees = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findMany({
      where: {
        tenantId: auth.tenantId,
        deletedAt: null,
        employmentStatus: { not: "TERMINATED" },
        hireDate: { lte: asOf },
      },
      select: {
        departmentId: true,
        branchId: true,
        positionId: true,
      },
    })
  );

  const groups: Record<string, { groupId: string; headcount: number }> = {};

  for (const e of employees) {
    const groupId =
      (groupBy === "department"
        ? e.departmentId
        : groupBy === "branch"
        ? e.branchId
        : e.positionId) ?? "unassigned";

    if (!groups[groupId]) {
      groups[groupId] = { groupId, headcount: 0 };
    }
    groups[groupId].headcount += 1;
  }

  return ok({
    year,
    month,
    groupBy,
    totalHeadcount: employees.length,
    groups: Object.values(groups).sort((a, b) => b.headcount - a.headcount),
  });
}
