/**
 * POST /api/expense-claims/[id]/return   { reason }
 * Wave C1 (PAY-213): the approver sends a SUBMITTED claim back to the
 * employee as a draft with a note (for a missing receipt or a wrong
 * category), instead of rejecting it. The employee edits and submits again.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, forbidden, notFound, ok, unauthorized } from "@/lib/api-response";
import { mayApproveFor } from "@/lib/approvals/second-party";
import { serializeExpenseClaim } from "@/lib/payroll/serialize";
import { getClientIp, writeAuditLog } from "@/lib/audit";

const schema = z.object({ reason: z.string().trim().min(1, "Say what the employee should fix").max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 422);
  const result = await withTenant(auth.tenantId, async (tx) => {
    const claim = await tx.expenseClaim.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!claim) return "not_found" as const;
    const who = await mayApproveFor(tx, auth, claim.employeeId, "EXPENSE");
    if (who === "self") return "self" as const;
    if (who === "forbidden") return "forbidden" as const;
    if (claim.status !== "SUBMITTED") return "not_submitted" as const;
    return tx.expenseClaim.update({ where: { id }, data: { status: "DRAFT", rejectionReason: parsed.data.reason, limitFlags: [] } });
  });
  if (result === "not_found") return notFound("Expense claim");
  if (result === "self") return forbidden("You cannot act on your own expense claim");
  if (result === "forbidden") return forbidden("You do not have permission to approve expense claims");
  if (result === "not_submitted") return err("Only SUBMITTED claims can be sent back", 409);
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "ExpenseClaim", entityId: id, changes: { action: "return", reason: parsed.data.reason }, ipAddress: getClientIp(req) });
  return ok(serializeExpenseClaim(result), "Sent back to the employee");
}
