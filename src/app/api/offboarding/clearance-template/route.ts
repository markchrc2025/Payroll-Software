/**
 * PAY-197, ruling 2: the company's clearance checklist (items with assigned
 * signatories), copied into each new offboarding case.
 *   GET  the checklist (EMPLOYEES:READ)
 *   POST an item { name, description?, signatoryUserId, sortOrder? } (EMPLOYEES:UPDATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { templateItemSchema } from "@/lib/offboarding/views";



export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const rows = await withTenant(auth.tenantId, (tx) => tx.clearanceTemplateItem.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    include: { signatory: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  }));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "UPDATE"]);
  if (denied) return denied;
  const parsed = templateItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid item", 422);
  const row = await withTenant(auth.tenantId, async (tx) => {
    const user = await tx.user.findFirst({ where: { id: parsed.data.signatoryUserId, tenantId: auth.tenantId }, select: { id: true } });
    if (!user) return null;
    return tx.clearanceTemplateItem.create({ data: { tenantId: auth.tenantId, ...parsed.data, description: parsed.data.description ?? null } });
  });
  if (!row) return err("Signatory not found in this company", 404);
  await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "ClearanceTemplateItem", entityId: row.id, changes: { after: parsed.data }, ipAddress: getClientIp(req) });
  return ok(row, undefined, 201);
}
