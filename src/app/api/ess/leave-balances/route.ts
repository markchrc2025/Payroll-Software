/**
 * GET /api/ess/leave-balances
 *
 * Returns the authenticated employee's leave balances for the current year.
 *
 * Query params:
 *   year — defaults to current year
 *
 * Response: { data: LeaveBalance[] }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  try {
    const balances = await withTenant(ctx.tenantId, async (tx) =>
      tx.leaveBalance.findMany({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          year,
        },
        include: { leaveType: { select: { name: true, code: true, isPaid: true, unit: true } } },
        orderBy: { leaveType: { name: "asc" } },
      }),
    );

    const serialized = balances.map((b) => ({
      ...b,
      openingBalance: b.openingBalance.toString(),
      earned: b.earned.toString(),
      used: b.used.toString(),
      forfeited: b.forfeited.toString(),
      convertedToCash: b.convertedToCash.toString(),
    }));

    return ok(serialized);
  } catch (e) {
    console.error("[ess/leave-balances]", e);
    return serverError(e);
  }
}
