/**
 * Wave C3 (PAY-213): one Document Workflow template.
 *   PATCH   edit (DOCUMENTS:CREATE); a letter already issued keeps its text
 *   DELETE  remove (DOCUMENTS:DELETE); requests already filed keep it
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { shapeTemplate, TemplateRefusal } from "@/lib/documents/templates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "CREATE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    const t = await withTenant(auth.tenantId, async (tx) => {
      const cur = await tx.documentTemplate.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
      if (!cur) return null;
      return tx.documentTemplate.update({ where: { id }, data: shapeTemplate(body, true, cur) });
    });
    if (!t) return notFound("Template");
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "DocumentTemplate", entityId: id, ipAddress: getClientIp(req) });
    return ok(t, "Template saved");
  } catch (e) {
    if (e instanceof TemplateRefusal) return err(e.message, 422);
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "DELETE"]);
  if (denied) return denied;
  const { id } = await params;
  const t = await withTenant(auth.tenantId, async (tx) => {
    const cur = await tx.documentTemplate.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null } });
    return cur ? tx.documentTemplate.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }) : null;
  });
  if (!t) return notFound("Template");
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "DocumentTemplate", entityId: id, ipAddress: getClientIp(req) });
  return ok({ id }, "Template removed");
}
