/** GET /api/team/documents/[id]/tracker: who has and has not acknowledged the current version (SETTINGS:READ). Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { SharingRefusal, tracker } from "@/lib/team/sharing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    return ok(await withTenant(auth.tenantId, (tx) => tracker(tx, auth.tenantId, id)));
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
