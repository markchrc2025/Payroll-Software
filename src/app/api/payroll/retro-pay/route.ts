/**
 * PAY-166: a retroactive salary increase.
 *   POST ?preview=1  what each payslip of the period would get (nothing saved)
 *   POST            saves the batch as draft corrections (PAYROLL:UPDATE)
 * Rules in src/lib/payroll/retro-pay.ts.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { CorrectionError } from "@/lib/payroll/corrections";
import { createRetroPay, previewRetroPay, retroPaySchema } from "@/lib/payroll/retro-pay";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;
  const parsed = retroPaySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid retroactive increase", 422, parsed.error.flatten());
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  try {
    if (preview) return ok(await withTenant(auth.tenantId, (tx) => previewRetroPay(tx, auth.tenantId, parsed.data)));
    const r = await withTenant(auth.tenantId, (tx) => createRetroPay(tx, auth.tenantId, auth.userId ?? null, parsed.data));
    await writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId ?? null, action: "CREATE", entity: "PayrollCorrection", entityId: r.batchId, changes: { retroPay: r }, ipAddress: getClientIp(req) });
    return ok(r, undefined, 201);
  } catch (e) {
    if (e instanceof CorrectionError) return err(e.message, e.status);
    throw e;
  }
}
