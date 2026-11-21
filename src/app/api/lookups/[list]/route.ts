/**
 * Wave A: a company list (src/lib/lookups/registry.ts).
 *   GET  ?includeInactive=1  the items (any signed-in user of the company)
 *   POST                    an item (SETTINGS:UPDATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { isListKey, LISTS } from "@/lib/lookups/registry";
import { createItem, listItems, LookupError } from "@/lib/lookups/store";

type Ctx = { params: Promise<{ list: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: reference lists (bank names, categories) every form of the company picks from; no personal data.
  const { list } = await params;
  if (!isListKey(list)) return err("Unknown list", 404);
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";
  const items = await withTenant(auth.tenantId, (tx) => listItems(tx, auth.tenantId, list, includeInactive));
  return ok({ definition: LISTS[list], items });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const { list } = await params;
  if (!isListKey(list)) return err("Unknown list", 404);
  try {
    const body = await req.json().catch(() => null);
    const item = await withTenant(auth.tenantId, (tx) => createItem(tx, auth.tenantId, list, body));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: `LookupItem:${list}`, entityId: item.id, changes: { after: { code: item.code, name: item.name } }, ipAddress: getClientIp(req) });
    return ok(item, undefined, 201);
  } catch (e) {
    if (e instanceof LookupError) return err(e.message, e.status);
    throw e;
  }
}
