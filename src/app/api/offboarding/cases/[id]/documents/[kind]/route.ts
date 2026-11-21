/**
 * PAY-197 part 3: GET /api/offboarding/cases/[id]/documents/coe|quitclaim,
 * the final pay forms as PDFs (EMPLOYEES:READ).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { formFileName, FormNotReadyError, loadFormFacts, quitclaimText, renderCoePdf, renderQuitclaimPdf } from "@/lib/offboarding/forms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const { id, kind } = await params;
  if (kind !== "coe" && kind !== "quitclaim") return err("Unknown document", 404);
  try {
    const f = await withTenant(auth.tenantId, (tx) => loadFormFacts(tx, auth.tenantId, id));
    if (kind === "quitclaim") quitclaimText(f);
    const pdf = kind === "coe" ? await renderCoePdf(f) : await renderQuitclaimPdf(f);
    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${formFileName(kind === "coe" ? "COE" : "Quitclaim", f)}"`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof FormNotReadyError) return err(e.message, 409);
    return serverError(e);
  }
}
