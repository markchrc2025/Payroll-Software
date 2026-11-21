/**
 * GET /api/ess/document-requests/[id]/pdf: the employee's own issued letter.
 * Wave C3 (PAY-213).
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, notFound, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { documentRequestPdf, DocumentRequestRefusal } from "@/lib/documents/requests";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  try {
    const out = await withTenant(ctx.tenantId, async (tx) => {
      const mine = await tx.documentRequest.count({ where: { id, tenantId: ctx.tenantId, employeeId: ctx.employeeId } });
      return mine ? documentRequestPdf(tx, ctx.tenantId, id) : null;
    });
    if (!out) return notFound("Document request");
    return new Response(new Uint8Array(out.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${out.fileName}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof DocumentRequestRefusal) return err(e.message, e.status);
    throw e;
  }
}
