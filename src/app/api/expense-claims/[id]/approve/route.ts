import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { approveExpenseClaimSchema } from "@/lib/validations/expense-claim";
import { serializeExpenseClaim } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const parsed = approveExpenseClaimSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation error", 400, parsed.error.flatten());

  const { taxTreatment } = parsed.data;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!claim) return notFound();
      if (claim.status !== "SUBMITTED")
        return err("Only SUBMITTED claims can be approved", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: {
          status: "APPROVED",
          taxTreatment,
          approvedById: auth.userId,
          approvedAt: new Date(),
        },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    return serverError(e);
  }
}
