/** PAY-197: PATCH /api/offboarding/items/[id] { signatoryUserId } reassigns a pending item (EMPLOYEES:UPDATE). */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { OffboardingError, reassignItem } from "@/lib/offboarding/clearance";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ signatoryUserId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Pick the new signatory", 422);
  try {
    const item = await withTenant(auth.tenantId, (tx) => reassignItem(tx, auth.tenantId, id, parsed.data.signatoryUserId));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "ClearanceItem", entityId: id, changes: { after: parsed.data }, ipAddress: getClientIp(req) });
    return ok(item);
  } catch (e) {
    if (e instanceof OffboardingError) return err(e.message, e.status);
    throw e;
  }
}
