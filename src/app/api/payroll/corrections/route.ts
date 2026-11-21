/**
 * PAY-68: payroll corrections.
 *   GET  ?status=  the company's corrections, newest first (PAYROLL:READ)
 *   POST          a draft correction of a finalized payslip (PAYROLL:UPDATE)
 * Rules in src/lib/payroll/corrections.ts.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { CorrectionError, createCorrection, createCorrectionSchema } from "@/lib/payroll/corrections";
import { serializeCorrection } from "./serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await withTenant(auth.tenantId, (tx) => tx.payrollCorrection.findMany({
    where: { tenantId: auth.tenantId, ...(status && ["DRAFT", "APPROVED", "CANCELLED"].includes(status) ? { status: status as "DRAFT" } : {}) },
    include: {
      employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
      originalSheet: { select: { controlNumber: true, payrollBook: { select: { periodStart: true, periodEnd: true, controlNumber: true } } } },
      targetBook: { select: { id: true, status: true, periodStart: true, periodEnd: true, controlNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  }));
  return ok(rows.map(serializeCorrection));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const parsed = createCorrectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid correction", 422, parsed.error.flatten());
  try {
    const c = await withTenant(auth.tenantId, (tx) => createCorrection(tx, auth.tenantId, auth.userId ?? null, parsed.data));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "PayrollCorrection", entityId: c.id, changes: { after: { originalSheetId: c.originalSheetId, netEffectCents: c.netEffectCents.toString() } }, ipAddress: getClientIp(req) });
    return ok(serializeCorrection(c), undefined, 201);
  } catch (e) {
    if (e instanceof CorrectionError) return err(e.message, e.status, e.problems.length ? { problems: e.problems } : undefined);
    throw e;
  }
}
