/** PAY-197: change or remove a checklist item (EMPLOYEES:UPDATE). Cases already open keep their copy. */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { templateItemSchema } from "@/lib/offboarding/views";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const parsed = templateItemSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid item", 422);
  const row = await withTenant(auth.tenantId, async (tx) => {
    const found = await tx.clearanceTemplateItem.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    if (!found) return null;
    return tx.clearanceTemplateItem.update({ where: { id }, data: parsed.data });
  });
  if (!row) return err("Checklist item not found", 404);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "ClearanceTemplateItem", entityId: id, changes: { after: parsed.data }, ipAddress: getClientIp(req) });
  return ok(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const n = await withTenant(auth.tenantId, (tx) => tx.clearanceTemplateItem.updateMany({ where: { id, tenantId: auth.tenantId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } }));
  if (!n.count) return err("Checklist item not found", 404);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "DELETE", entity: "ClearanceTemplateItem", entityId: id, changes: null, ipAddress: getClientIp(req) });
  return ok(null);
}
