/**
 * GET /api/analytics/dtr/summary
 *
 * Query params:
 *   periodStart (required)  — YYYY-MM-DD
 *   periodEnd   (required)  — YYYY-MM-DD
 *   groupBy     (optional)  — "department" | "branch" | "position" (default: "department")
 *
 * Returns: late minutes, undertime minutes, absent count, OT minutes, NSD
 * minutes, present count — grouped by chosen dimension.
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
  const psStr = url.searchParams.get("periodStart");
  const peStr = url.searchParams.get("periodEnd");
  const groupBy = (url.searchParams.get("groupBy") ?? "department") as GroupBy;

  if (!psStr || !peStr) return err("periodStart and periodEnd query params are required", 400);
  const periodStart = new Date(psStr);
  const periodEnd   = new Date(peStr + "T23:59:59.999Z");
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime()))
    return err("Invalid periodStart or periodEnd", 400);
  if (!["department", "branch", "position"].includes(groupBy))
    return err("groupBy must be department | branch | position", 400);

  const records = await withTenant(auth.tenantId, (tx) =>
    tx.dTRRecord.findMany({
      where: {
        tenantId: auth.tenantId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        dayStatus: true,
        lateMinutes: true,
        undertimeMinutes: true,
        otMinutes: true,
        nsdMinutes: true,
        workedMinutes: true,
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

  const groups: Record<
    string,
    {
      groupId: string;
      lateMinutes: number;
      undertimeMinutes: number;
      otMinutes: number;
      nsdMinutes: number;
      absentCount: number;
      presentCount: number;
      totalRecords: number;
    }
  > = {};

  for (const r of records) {
    const groupId =
      (groupBy === "department"
        ? r.employee.departmentId
        : groupBy === "branch"
        ? r.employee.branchId
        : r.employee.positionId) ?? "unassigned";

    if (!groups[groupId]) {
      groups[groupId] = {
        groupId,
        lateMinutes: 0,
        undertimeMinutes: 0,
        otMinutes: 0,
        nsdMinutes: 0,
        absentCount: 0,
        presentCount: 0,
        totalRecords: 0,
      };
    }
    const g = groups[groupId];
    g.lateMinutes      += r.lateMinutes;
    g.undertimeMinutes += r.undertimeMinutes;
    g.otMinutes        += r.otMinutes;
    g.nsdMinutes       += r.nsdMinutes;
    g.totalRecords     += 1;
    if (r.dayStatus === "ABSENT" || r.dayStatus === "UNPAID_LEAVE") {
      g.absentCount += 1;
    } else if (r.dayStatus === "PRESENT" || r.dayStatus === "PAID_LEAVE") {
      g.presentCount += 1;
    }
  }

  const totalLateMinutes = records.reduce((s, r) => s + r.lateMinutes, 0);
  const totalOtMinutes   = records.reduce((s, r) => s + r.otMinutes, 0);
  const totalAbsent      = records.filter((r) =>
    r.dayStatus === "ABSENT" || r.dayStatus === "UNPAID_LEAVE"
  ).length;

  return ok({
    periodStart: psStr,
    periodEnd: peStr,
    groupBy,
    totals: {
      totalRecords: records.length,
      lateMinutes: totalLateMinutes,
      otMinutes: totalOtMinutes,
      absentCount: totalAbsent,
    },
    groups: Object.values(groups).sort((a, b) => b.totalRecords - a.totalRecords),
  });
}
