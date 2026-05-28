import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { attachExpenseClaimSchema } from "@/lib/validations/expense-claim";
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

  const parsed = attachExpenseClaimSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation error", 400, parsed.error.flatten());

  const { payrollBookId } = parsed.data;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!claim) return notFound();
      if (claim.status !== "APPROVED")
        return err("Only APPROVED claims can be attached", 409);

      // Verify payroll book belongs to tenant and is a DRAFT
      const book = await tx.payrollBook.findFirst({
        where: { id: payrollBookId, tenantId: auth.tenantId },
      });
      if (!book) return err("Payroll book not found", 404);
      if (book.status !== "DRAFT")
        return err("Can only attach claims to DRAFT payroll books", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: { status: "ATTACHED", payrollBookId },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    return serverError(e);
  }
}
