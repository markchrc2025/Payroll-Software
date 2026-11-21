/** The 2316 signatory's e-signature image (SETTINGS:READ). Ruling 22 Nov 2026. */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { signatoryOf } from "@/lib/payroll/reports/signature";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;
  const s = await withTenant(auth.tenantId, (tx) => signatoryOf(tx, auth.tenantId));
  if (!s?.signature) return err("No signature yet", 404);
  return new Response(new Uint8Array(s.signature.bytes), { headers: { "content-type": s.signature.mimeType, "cache-control": "private, no-store" } });
}
