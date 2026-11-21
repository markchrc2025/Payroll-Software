/** PAY-197 part 2: POST a certificate of employment request (the employee's own case only). */
import type { NextRequest } from "next/server";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { getPortalSession } from "@/lib/offboarding/portal";

export async function POST(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  await withTenant(ctx.tenantId, (tx) => tx.offboardingCase.update({ where: { id: ctx.caseId }, data: { coeRequestedAt: new Date() } }));
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: null, action: "UPDATE", entity: "OffboardingCase", entityId: ctx.caseId, changes: { coeRequested: true, by: "offboarding portal" }, ipAddress: null });
  return ok(null);
}
