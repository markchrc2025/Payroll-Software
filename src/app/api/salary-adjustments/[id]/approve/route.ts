/**
 * PAY-217 G1: approve a salary adjustment (EMPLOYEES:APPROVE, not the person
 * who made it): one SALARY_ADJUSTMENT movement per line, and a back-pay batch
 * for payslips already finalized on or after the effective date.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { SalaryConfigError } from "@/lib/payroll/rates";
import { approveBatch, SalaryAdjustmentError } from "@/lib/salary-adjustment/batch";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "APPROVE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const r = await withTenant(auth.tenantId, (tx) => approveBatch(tx, auth.tenantId, auth.userId ?? null, id));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "APPROVE", entity: "SalaryAdjustmentBatch", entityId: id, changes: r, ipAddress: getClientIp(req) });
    return ok(r);
  } catch (e) {
    if (e instanceof SalaryAdjustmentError) return err(e.message, e.status);
    if (e instanceof SalaryConfigError) return err(e.message, 422);
    throw e;
  }
}
