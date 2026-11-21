/** GET /api/ess/team/documents/[id]/file: the current version, if shared with the employee. Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { employeeDocuments, fileOf, SharingRefusal } from "@/lib/team/sharing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  try {
    const f = await withTenant(ctx.tenantId, async (tx) => {
      if (!(await employeeDocuments(tx, ctx.tenantId, ctx.employeeId)).some((d) => d.id === id)) throw new SharingRefusal("Document not found", 404);
      return fileOf(tx, ctx.tenantId, id);
    });
    return new Response(new Uint8Array(f.bytes), { headers: { "content-type": f.mimeType, "content-disposition": `attachment; filename="${f.fileName.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
