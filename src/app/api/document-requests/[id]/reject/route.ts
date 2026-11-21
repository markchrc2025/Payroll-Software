/**
 * POST /api/document-requests/[id]/reject   { reason }
 * Wave C3 (PAY-213): decide a document request (src/lib/documents/requests.tsx).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { decideDocumentRequest, DocumentRequestRefusal } from "@/lib/documents/requests";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: decideDocumentRequest allows only the assigned step approver or DOCUMENTS:APPROVE, never one's own, and PAYROLL:READ for a letter that shows pay.
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { reason?: string; note?: string } | null;
  try {
    const r = await withTenant(auth.tenantId, (tx) => decideDocumentRequest(tx, auth, id, "REJECT", body?.reason ?? body?.note ?? null));
    void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "UPDATE", entity: "DocumentRequest", entityId: id, changes: { action: "reject", status: r.status }, ipAddress: getClientIp(req) });
    return ok({ id: r.id, status: r.status }, r.status === "APPROVED" ? "Approved: the document is issued" : r.status === "REJECTED" ? "Rejected" : "Approved: waiting on the next approver");
  } catch (e) {
    if (e instanceof DocumentRequestRefusal) return err(e.message, e.status);
    throw e;
  }
}
