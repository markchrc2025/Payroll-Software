/** PAY-217 Causeless: DELETE removes a note from the list (INCIDENTS:UPDATE; kept for the audit trail). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { CauselessRefusal, removeNote } from "@/lib/incidents/causeless";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["INCIDENTS", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    await withTenant(auth.tenantId, (tx) => removeNote(tx, auth.tenantId, id));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "CauselessNote", entityId: id, ipAddress: getClientIp(req) });
    return ok({ id });
  } catch (e) {
    if (e instanceof CauselessRefusal) return err(e.message, e.status);
    throw e;
  }
}
