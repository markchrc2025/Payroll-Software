/**
 * PAY-199: the employee's own e-signature (src/lib/payroll/reports/signature.ts).
 *   GET     the image (404 when none)
 *   PUT     multipart { file }: PNG or JPEG, at most 1 MB
 *   DELETE  remove it
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { writeAuditLog } from "@/lib/audit";
import { saveSignature, signatureOf, SignatureRefusal } from "@/lib/payroll/reports/signature";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const s = await withTenant(ctx.tenantId, (tx) => signatureOf(tx, ctx.tenantId, ctx.employeeId));
  if (!s) return err("No signature yet", 404);
  return new Response(new Uint8Array(s.bytes), { headers: { "content-type": s.mimeType, "cache-control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const f = (await req.formData().catch(() => null))?.get("file");
  if (!(f instanceof File)) return err("Attach your signature", 422);
  const bytes = new Uint8Array(await f.arrayBuffer());
  try {
    const r = await withTenant(ctx.tenantId, (tx) => saveSignature(tx, ctx.tenantId, ctx.employeeId, bytes));
    void writeAuditLog({ tenantId: ctx.tenantId, actorUserId: null, action: "UPDATE", entity: "EmployeeSignature", entityId: ctx.employeeId, changes: { mimeType: r.mimeType } });
    return ok(r, "Saved");
  } catch (e) {
    if (e instanceof SignatureRefusal) return err(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  await withTenant(ctx.tenantId, (tx) => tx.employeeSignature.deleteMany({ where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId } }));
  void writeAuditLog({ tenantId: ctx.tenantId, actorUserId: null, action: "DELETE", entity: "EmployeeSignature", entityId: ctx.employeeId });
  return ok({ removed: true });
}
