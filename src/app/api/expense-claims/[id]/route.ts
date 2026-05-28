import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { updateExpenseClaimSchema } from "@/lib/validations/expense-claim";
import { toCentavos } from "@/lib/money";
import { serializeExpenseClaim } from "@/lib/payroll/serialize";

export async function GET(
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
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!claim) return notFound();
      return ok(serializeExpenseClaim(claim));
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(
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

  const parsed = updateExpenseClaimSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation error", 400, parsed.error.flatten());

  const d = parsed.data;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!claim) return notFound();
      if (claim.status !== "DRAFT")
        return err("Only DRAFT claims can be edited", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: {
          ...(d.category ? { category: d.category } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
          ...(d.amount ? { amountCents: toCentavos(d.amount) } : {}),
          ...(d.receiptKey !== undefined ? { receiptKey: d.receiptKey } : {}),
          ...(d.claimDate ? { claimDate: new Date(d.claimDate) } : {}),
        },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    return serverError(e);
  }
}
