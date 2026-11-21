/**
 * PAY-217 G1: GET the salary adjustments; POST ?preview=1 shows old pay, new
 * pay and the difference (nothing saved); POST saves the batch for approval.
 * Rules in src/lib/salary-adjustment/batch.ts.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { createBatch, preview, SalaryAdjustmentError, serializeBatch } from "@/lib/salary-adjustment/batch";
import { createSchema, ruleFromBody } from "@/lib/salary-adjustment/schema";

const include = { lines: { include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } } } } as const;

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;
  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.salaryAdjustmentBatch.findMany({ where: { tenantId: auth.tenantId }, orderBy: { createdAt: "desc" }, take: 100, include }));
  return ok(rows.map(serializeBatch));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid salary adjustment", 422, parsed.error.flatten());
  const v = parsed.data;
  const rule = ruleFromBody(v);
  const effectiveDate = new Date(`${v.effectiveDate}T00:00:00.000Z`);
  try {
    if (new URL(req.url).searchParams.get("preview") === "1") {
      return ok(await withTenant(auth.tenantId, (tx) => preview(tx, auth.tenantId, rule, v.employeeIds, effectiveDate)));
    }
    const b = await withTenant(auth.tenantId, async (tx) => {
      const c = await createBatch(tx, auth.tenantId, auth.userId ?? null, { ...rule, name: v.name, reason: v.reason, effectiveDate, employeeIds: v.employeeIds });
      return tx.salaryAdjustmentBatch.findUniqueOrThrow({ where: { id: c.id }, include });
    });
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "SalaryAdjustmentBatch", entityId: b.id, changes: { rule: v.rule, lines: b.lines.length, effectiveDate: v.effectiveDate }, ipAddress: getClientIp(req) });
    return ok(serializeBatch(b), undefined, 201);
  } catch (e) {
    if (e instanceof SalaryAdjustmentError) return err(e.message, e.status);
    throw e;
  }
}
