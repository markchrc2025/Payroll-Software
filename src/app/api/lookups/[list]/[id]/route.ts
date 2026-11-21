/** Wave A: change (PATCH) or delete (DELETE, built-in items refused) a list item (SETTINGS:UPDATE). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { isListKey } from "@/lib/lookups/registry";
import { deleteItem, LookupError, updateItem } from "@/lib/lookups/store";

type Ctx = { params: Promise<{ list: string; id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const { list, id } = await params;
  if (!isListKey(list)) return err("Unknown list", 404);
  try {
    const body = await req.json().catch(() => null);
    const item = await withTenant(auth.tenantId, (tx) => updateItem(tx, auth.tenantId, list, id, body));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: `LookupItem:${list}`, entityId: id, changes: { after: body }, ipAddress: getClientIp(req) });
    return ok(item);
  } catch (e) {
    if (e instanceof LookupError) return err(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const { list, id } = await params;
  if (!isListKey(list)) return err("Unknown list", 404);
  try {
    await withTenant(auth.tenantId, (tx) => deleteItem(tx, auth.tenantId, list, id));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "DELETE", entity: `LookupItem:${list}`, entityId: id, changes: null, ipAddress: getClientIp(req) });
    return ok(null);
  } catch (e) {
    if (e instanceof LookupError) return err(e.message, e.status);
    throw e;
  }
}
