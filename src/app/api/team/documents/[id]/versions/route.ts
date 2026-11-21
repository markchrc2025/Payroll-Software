/**
 * POST /api/team/documents/[id]/versions  multipart { file, note? } (SETTINGS:CREATE).
 * Wave F3 (PAY-216): a new version; if it asks for acknowledgement, everyone is asked again.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { addVersion, SharingRefusal, uploadFrom } from "@/lib/team/sharing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "CREATE"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const form = await req.formData();
    const f = await uploadFrom(form);
    const d = await withTenant(auth.tenantId, (tx) => addVersion(tx, auth.tenantId, auth.userId, id, f, (form.get("note") as string | null) || null));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "SharedDocument", entityId: id, changes: { action: "new version", version: d.currentVersion }, ipAddress: getClientIp(req) });
    return ok({ id, version: d.currentVersion }, `Version ${d.currentVersion} shared`);
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
