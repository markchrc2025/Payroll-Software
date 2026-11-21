/** PAY-217 Causeless: GET the note's attachment (INCIDENTS:READ). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { CauselessRefusal, noteFile } from "@/lib/incidents/causeless";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["INCIDENTS", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  try {
    const f = await withTenant(auth.tenantId, (tx) => noteFile(tx, auth.tenantId, id));
    return new Response(new Uint8Array(f.bytes), { headers: { "content-type": f.mimeType, "content-disposition": `attachment; filename="${f.fileName.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CauselessRefusal) return err(e.message, e.status);
    throw e;
  }
}
