/** POST /api/team/threads/[id]/comments { body } (SETTINGS:CREATE). Wave F2 (PAY-216). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { addComment, DiscussionRefusal, hrViewer } from "@/lib/team/discussion";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "CREATE"]);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    return ok(await withTenant(auth.tenantId, async (tx) => addComment(tx, auth.tenantId, id, await hrViewer(tx, auth.userId), body)), "Posted", 201);
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
