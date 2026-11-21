/**
 * GET /api/document-requests/[id]/pdf: the issued letter (DOCUMENTS:READ).
 * Wave C3 (PAY-213).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { documentRequestPdf, DocumentRequestRefusal } from "@/lib/documents/requests";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const { fileName, pdf } = await withTenant(auth.tenantId, (tx) => documentRequestPdf(tx, auth.tenantId, id));
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof DocumentRequestRefusal) return err(e.message, e.status);
    throw e;
  }
}
