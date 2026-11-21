/**
 * PAY-217 G1: POST { bookId } takes back, in the draft run that straddles the
 * effective date, the days before it at the old rate; then recomputes the run.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { recomputeRun } from "@/lib/payroll/persist";
import { SalaryAdjustmentError, splitRun } from "@/lib/salary-adjustment/batch";

const body = z.object({ bookId: z.string().min(1, "Pick the draft run") });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Pick the draft run", 422);
  const { id } = await params;
  try {
    const r = await withTenant(auth.tenantId, (tx) => splitRun(tx, auth.tenantId, id, parsed.data.bookId));
    if (r.adjustments.length) await recomputeRun(auth.tenantId, parsed.data.bookId);
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "SalaryAdjustmentBatch", entityId: id, changes: { split: r }, ipAddress: getClientIp(req) });
    return ok(r);
  } catch (e) {
    if (e instanceof SalaryAdjustmentError) return err(e.message, e.status);
    throw e;
  }
}
