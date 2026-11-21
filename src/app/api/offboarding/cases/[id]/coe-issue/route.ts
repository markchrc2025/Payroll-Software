/** PAY-197 part 3: POST marks the certificate of employment issued, so the portal offers it (EMPLOYEES:UPDATE). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const n = await withTenant(auth.tenantId, (tx) => tx.offboardingCase.updateMany({ where: { id, tenantId: auth.tenantId }, data: { coeIssuedAt: new Date() } }));
  if (!n.count) return err("Offboarding case not found", 404);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "OffboardingCase", entityId: id, changes: { coeIssued: true }, ipAddress: getClientIp(req) });
  return ok(null);
}
