/**
 * /api/loans/[id]
 *   GET   — fetch one
 *   PATCH — update referenceNumber/installment/balance/status/closedDate/notes
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { toCentavos } from "@/lib/money";
import { updateLoanSchema } from "@/lib/validations/pay-component";
import { serializeLoan } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.loan.findFirst({ where: { id, tenantId: auth.tenantId } }),
  );
  if (!row) return notFound("Loan");
  return ok(serializeLoan(row));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateLoanSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const data: Prisma.LoanUpdateInput = {
    ...(d.referenceNumber !== undefined && {
      referenceNumber: d.referenceNumber,
    }),
    ...(d.installment !== undefined && {
      installmentCents: toCentavos(d.installment),
    }),
    ...(d.balance !== undefined && { balanceCents: toCentavos(d.balance) }),
    ...(d.status !== undefined && { status: d.status }),
    ...(d.closedDate !== undefined && { closedDate: d.closedDate }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.loan.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    return tx.loan.update({ where: { id }, data });
  });

  if (!updated) return notFound("Loan");
  return ok(serializeLoan(updated), "Loan updated");
}
