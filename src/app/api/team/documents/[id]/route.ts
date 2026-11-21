/** DELETE /api/team/documents/[id]: stop sharing it (SETTINGS:DELETE). Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "DELETE"]);
  if (denied) return denied;
  const { id } = await params;
  const n = await withTenant(auth.tenantId, (tx) => tx.sharedDocument.updateMany({ where: { id, tenantId: auth.tenantId, deletedAt: null }, data: { deletedAt: new Date() } }));
  if (!n.count) return err("Document not found", 404);
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "SharedDocument", entityId: id, ipAddress: getClientIp(req) });
  return ok({ id }, "No longer shared");
}
