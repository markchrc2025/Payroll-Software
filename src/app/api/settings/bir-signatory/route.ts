/**
 * Mark's ruling (22 Nov 2026 00:30): the HR manager who signs BIR 2316
 * (Items 53 and 55) and that person's e-signature
 * (src/lib/payroll/reports/signature.ts).
 *   GET     the signatory (SETTINGS:READ)
 *   PUT     multipart { userId, position, file? } (SETTINGS:UPDATE)
 *   DELETE  no signatory (SETTINGS:UPDATE)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { saveSignatory, signatoryOf, SignatureRefusal } from "@/lib/payroll/reports/signature";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const s = await withTenant(auth.tenantId, (tx) => signatoryOf(tx, auth.tenantId));
  return ok(s ? { userId: s.userId, name: s.name, position: s.position, hasSignature: !!s.signature, updatedAt: s.updatedAt } : null);
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  if (!form) return err("Send the signatory", 422);
  const f = form.get("file");
  const signature = f instanceof File && f.size > 0 ? new Uint8Array(await f.arrayBuffer()) : null;
  try {
    const s = await withTenant(auth.tenantId, (tx) => saveSignatory(tx, auth.tenantId, auth.userId ?? null, {
      userId: String(form.get("userId") ?? ""), position: String(form.get("position") ?? ""), signature,
    }));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "Bir2316Signatory", entityId: s.id, changes: { userId: s.userId, position: s.position, signatureUploaded: !!signature }, ipAddress: getClientIp(req) });
    return ok({ userId: s.userId, position: s.position, hasSignature: !!s.data }, "Saved");
  } catch (e) {
    if (e instanceof SignatureRefusal) return err(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  await withTenant(auth.tenantId, (tx) => tx.bir2316Signatory.deleteMany({ where: { tenantId: auth.tenantId } }));
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "DELETE", entity: "Bir2316Signatory", entityId: auth.tenantId, ipAddress: getClientIp(req) });
  return ok({ removed: true });
}
