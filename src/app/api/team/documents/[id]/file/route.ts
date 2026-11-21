/** GET /api/team/documents/[id]/file?version= (SETTINGS:READ). Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { fileOf, SharingRefusal } from "@/lib/team/sharing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const { id } = await params;
  const v = Number(new URL(req.url).searchParams.get("version") ?? "");
  try {
    const f = await withTenant(auth.tenantId, (tx) => fileOf(tx, auth.tenantId, id, Number.isInteger(v) && v > 0 ? v : undefined));
    return new Response(new Uint8Array(f.bytes), { headers: { "content-type": f.mimeType, "content-disposition": `attachment; filename="${f.fileName.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
