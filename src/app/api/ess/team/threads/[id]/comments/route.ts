/** POST /api/ess/team/threads/[id]/comments { body }. Wave F2 (PAY-216). */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { addComment, DiscussionRefusal } from "@/lib/team/discussion";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    return ok(await withTenant(ctx.tenantId, (tx) => addComment(tx, ctx.tenantId, id, { kind: "EMPLOYEE", employeeId: ctx.employeeId }, body)), "Posted", 201);
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
