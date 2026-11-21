/**
 * POST /api/team/hide { kind: THREAD | COMMENT, id, reason } (SETTINGS:UPDATE).
 * Wave F2 (PAY-216): HR hides a post from employees; the hide is audited.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { z } from "zod";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { DiscussionRefusal, hidePost } from "@/lib/team/discussion";

const schema = z.object({ kind: z.enum(["THREAD", "COMMENT"]), id: z.string().min(1), reason: z.string().max(500) });

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Say what to hide and why", 422);
  try {
    await withTenant(auth.tenantId, (tx) => hidePost(tx, auth.tenantId, auth.userId, p.data.kind, p.data.id, p.data.reason));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: p.data.kind === "THREAD" ? "DiscussionThread" : "DiscussionComment", entityId: p.data.id, changes: { action: "hide", reason: p.data.reason }, ipAddress: getClientIp(req) });
    return ok({ id: p.data.id }, "Hidden from employees");
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
