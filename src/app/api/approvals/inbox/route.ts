/**
 * GET /api/approvals/inbox?module=LEAVE|EXPENSE
 * Wave C0 (PAY-213): the requests waiting for the signed-in approver
 * (src/lib/approvals/inbox.ts).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { listInbox } from "@/lib/approvals/inbox";
import { isInboxModule } from "@/lib/approvals/inbox-view";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: lists only what the caller may approve: their own approval steps, or the module's approve permission (checked in listInbox).
  const mod = new URL(req.url).searchParams.get("module") ?? "";
  if (!isInboxModule(mod)) return err("Unknown module", 404);
  return ok(await withTenant(auth.tenantId, (tx) => listInbox(tx, auth, mod)));
}
