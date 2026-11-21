/**
 * Wave C3 (PAY-213): Document Workflow templates.
 *   GET   the company's templates (DOCUMENTS:READ), with the merge fields
 *   POST  a template (DOCUMENTS:CREATE); unknown merge fields are refused
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { MERGE_FIELDS, shapeTemplate, STARTER_TEMPLATES, TemplateRefusal } from "@/lib/documents/templates";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "READ"]);
  if (denied) return denied;
  const templates = await withTenant(auth.tenantId, (tx) => tx.documentTemplate.findMany({ where: { tenantId: auth.tenantId, deletedAt: null }, orderBy: { name: "asc" } }));
  return ok({ templates, mergeFields: MERGE_FIELDS, starters: STARTER_TEMPLATES });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "CREATE"]);
  if (denied) return denied;
  try {
    const data = shapeTemplate(await req.json().catch(() => null), false);
    const t = await withTenant(auth.tenantId, (tx) => tx.documentTemplate.create({ data: { ...data, name: data.name!, title: data.title!, body: data.body!, tenantId: auth.tenantId } }));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "CREATE", entity: "DocumentTemplate", entityId: t.id, ipAddress: getClientIp(req) });
    return ok(t, "Template saved", 201);
  } catch (e) {
    if (e instanceof TemplateRefusal) return err(e.message, 422);
    throw e;
  }
}
