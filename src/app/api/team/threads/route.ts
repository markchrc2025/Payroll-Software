/**
 * Wave F2 (PAY-216): Team Discussion for HR (src/lib/team/discussion.ts).
 *   GET   every thread, hidden ones marked (SETTINGS:READ)
 *   POST  a thread for an audience (SETTINGS:CREATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { createThread, DiscussionRefusal, hrViewer, listThreads } from "@/lib/team/discussion";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  return ok(await withTenant(auth.tenantId, async (tx) => listThreads(tx, auth.tenantId, await hrViewer(tx, auth.userId))));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "CREATE"]);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  try {
    return ok(await withTenant(auth.tenantId, async (tx) => createThread(tx, auth.tenantId, await hrViewer(tx, auth.userId), body)), "Posted", 201);
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
