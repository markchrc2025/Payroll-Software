/**
 * POST /api/leave-schedules/[id]/apply: files a shutdown's leave, approved,
 * for the employees it covers (LEAVES:APPROVE). Twice changes nothing.
 * Wave E3 (PAY-215, decision 9).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { applyShutdown, ScheduleRefusal } from "@/lib/leave/schedule";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "APPROVE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const r = await withTenant(auth.tenantId, async (tx) => {
      const s = await tx.leaveSchedule.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
      return s ? applyShutdown(tx, s, auth.userId ?? null) : null;
    });
    if (!r) return notFound("Schedule");
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "LeaveSchedule", entityId: id, changes: { action: "apply", ...r }, ipAddress: getClientIp(req) });
    return ok(r, `Leave filed for ${r.filed} employee(s)`);
  } catch (e) {
    if (e instanceof ScheduleRefusal) return err(e.message, 422);
    throw e;
  }
}
