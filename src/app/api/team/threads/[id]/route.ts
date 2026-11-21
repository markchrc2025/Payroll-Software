/** GET /api/team/threads/[id]: a thread with every comment (SETTINGS:READ). Wave F2 (PAY-216). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { DiscussionRefusal, getThread, hrViewer } from "@/lib/team/discussion";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    return ok(await withTenant(auth.tenantId, async (tx) => getThread(tx, auth.tenantId, id, await hrViewer(tx, auth.userId))));
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
