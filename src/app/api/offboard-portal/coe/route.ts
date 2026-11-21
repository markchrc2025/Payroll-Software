/** PAY-197 part 3: the employee's own certificate of employment, once HR has issued it. */
import type { NextRequest } from "next/server";
import { err, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getPortalSession } from "@/lib/offboarding/portal";
import { formFileName, loadFormFacts, renderCoePdf } from "@/lib/offboarding/forms";

export async function GET(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  try {
    const f = await withTenant(ctx.tenantId, async (tx) => {
      const c = await tx.offboardingCase.findFirstOrThrow({ where: { id: ctx.caseId, tenantId: ctx.tenantId }, select: { coeIssuedAt: true } });
      if (!c.coeIssuedAt) return null;
      return loadFormFacts(tx, ctx.tenantId, ctx.caseId, c.coeIssuedAt);
    });
    if (!f) return err("HR has not issued your certificate of employment yet.", 404);
    const pdf = await renderCoePdf(f);
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${formFileName("COE", f)}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
