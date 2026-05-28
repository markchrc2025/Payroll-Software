import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { serializeExpenseClaim } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!claim) return notFound();
      if (claim.status !== "DRAFT")
        return err("Only DRAFT claims can be submitted", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: { status: "SUBMITTED" },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    return serverError(e);
  }
}
