/**
 * PAY-166: POST /api/payroll/retro-pay/[batchId]/approve { bookId }.
 * Approves the whole batch (someone other than its author) and lands it in
 * the draft run, which is then recomputed.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { recomputeRun } from "@/lib/payroll/persist";
import { CorrectionError } from "@/lib/payroll/corrections";
import { approveRetroPay } from "@/lib/payroll/retro-pay";

const bodySchema = z.object({ bookId: z.string().min(1, "Pick the draft run it lands in") });

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "APPROVE"]);
  if (denied) return denied;
  const { batchId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid body", 422);
  try {
    const approved = await withTenant(auth.tenantId, (tx) => approveRetroPay(tx, auth.tenantId, auth.userId ?? null, batchId, parsed.data.bookId));
    await recomputeRun(auth.tenantId, parsed.data.bookId);
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "APPROVE", entity: "PayrollCorrection", entityId: batchId, changes: { approved: approved.map((c) => c.controlNumber) }, ipAddress: getClientIp(req) });
    return ok({ approved: approved.length, controlNumbers: approved.map((c) => c.controlNumber) });
  } catch (e) {
    if (e instanceof CorrectionError) return err(e.message, e.status, e.problems.length ? { problems: e.problems } : undefined);
    throw e;
  }
}
