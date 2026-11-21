/**
 * PAY-68: POST /api/payroll/corrections/[id]/land { bookId }.
 * Rules in src/lib/payroll/corrections.ts.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { recomputeRun } from "@/lib/payroll/persist";
import { CorrectionError, relandCorrection } from "@/lib/payroll/corrections";
import { serializeCorrection } from "../../serialize";

const bodySchema = z.object({ bookId: z.string().min(1, "Pick the draft run the correction lands in") });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid body", 422);
  try {
    const before = await withTenant(auth.tenantId, (tx) => tx.payrollCorrection.findFirst({ where: { id, tenantId: auth.tenantId }, select: { targetBookId: true } }));
    const c = await withTenant(auth.tenantId, (tx) => relandCorrection(tx, auth.tenantId, id, parsed.data.bookId));
    // The draft run it landed in (or left) is recomputed so its payslips show it.
    const book = c.targetBookId ?? before?.targetBookId ?? null;
    if (book) await recomputeRun(auth.tenantId, book);
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "UPDATE", entity: "PayrollCorrection", entityId: id, changes: { after: { status: c.status, controlNumber: c.controlNumber, targetBookId: c.targetBookId } }, ipAddress: getClientIp(req) });
    return ok(serializeCorrection(c));
  } catch (e) {
    if (e instanceof CorrectionError) return err(e.message, e.status, e.problems.length ? { problems: e.problems } : undefined);
    throw e;
  }
}
