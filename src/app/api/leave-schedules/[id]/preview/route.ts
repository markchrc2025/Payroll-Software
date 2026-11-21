/**
 * GET /api/leave-schedules/[id]/preview: the leave a shutdown would file,
 * employee by employee (LEAVES:READ). Wave E3 (PAY-215).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { planShutdown, ScheduleRefusal } from "@/lib/leave/schedule";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const plan = await withTenant(auth.tenantId, async (tx) => {
      const s = await tx.leaveSchedule.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
      return s ? planShutdown(tx, s) : null;
    });
    return plan ? ok(plan) : notFound("Schedule");
  } catch (e) {
    if (e instanceof ScheduleRefusal) return err(e.message, 422);
    throw e;
  }
}
