/** PAY-217 G1: reject a pending salary adjustment (EMPLOYEES:APPROVE). */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { rejectBatch, SalaryAdjustmentError } from "@/lib/salary-adjustment/batch";

const body = z.object({ reason: z.string().trim().min(3).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "APPROVE"]);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Give a reason", 422);
  const { id } = await params;
  try {
    await withTenant(auth.tenantId, (tx) => rejectBatch(tx, auth.tenantId, auth.userId ?? null, id, parsed.data.reason));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "REJECT", entity: "SalaryAdjustmentBatch", entityId: id, changes: { reason: parsed.data.reason }, ipAddress: getClientIp(req) });
    return ok({ id, status: "REJECTED" });
  } catch (e) {
    if (e instanceof SalaryAdjustmentError) return err(e.message, e.status);
    throw e;
  }
}
