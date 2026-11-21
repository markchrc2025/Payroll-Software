/**
 * GET /api/ess/team-calendar?from&to: who in the employee's department is
 * away, per day (approved leave only; names, never the leave type).
 * Wave E3 (PAY-215).
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { planner } from "@/lib/leave/schedule";

const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const from = day(sp.get("from")), to = day(sp.get("to"));
  if (!from || !to || to < from || to.getTime() - from.getTime() > 61 * 86_400_000) return err("Give from and to dates, at most 62 days apart", 422);
  const days = await withTenant(ctx.tenantId, async (tx) => {
    const me = await tx.employee.findFirst({ where: { id: ctx.employeeId, tenantId: ctx.tenantId }, select: { departmentId: true } });
    if (!me?.departmentId) return [];
    const [dept] = await planner(tx, ctx.tenantId, from, to, me.departmentId);
    return (dept?.days ?? []).map((d) => ({ date: d.date, away: d.off.filter((o) => o.status === "APPROVED" && o.employeeId !== ctx.employeeId).map((o) => o.name) }));
  });
  return ok(days);
}
