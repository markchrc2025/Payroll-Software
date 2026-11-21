/**
 * DELETE /api/leave-schedules/[id] (LEAVES:UPDATE). Wave E3 (PAY-215).
 * Leave a shutdown already filed stays; cancel it as any leave.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const row = await withTenant(auth.tenantId, async (tx) => {
    const cur = await tx.leaveSchedule.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    return cur ? tx.leaveSchedule.update({ where: { id }, data: { deletedAt: new Date() } }) : null;
  });
  if (!row) return notFound("Schedule");
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "LeaveSchedule", entityId: id, ipAddress: getClientIp(req) });
  return ok({ id }, "Removed");
}
