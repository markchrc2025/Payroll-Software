/** GET /api/ess/team/threads/[id]: a thread the employee may see, hidden comments left out. Wave F2 (PAY-216). */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { DiscussionRefusal, getThread } from "@/lib/team/discussion";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  try {
    return ok(await withTenant(ctx.tenantId, (tx) => getThread(tx, ctx.tenantId, id, { kind: "EMPLOYEE", employeeId: ctx.employeeId })));
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
