/**
 * POST /api/loans/[id]/cancel — cancel an ACTIVE loan.
 * Sets status=CANCELLED, closedDate=now. Idempotent for already-terminal loans
 * (returns 409).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeLoan } from "@/lib/payroll/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const loan = await tx.loan.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!loan) return { error: "missing" as const };
    if (loan.status !== "ACTIVE" && loan.status !== "ON_HOLD") {
      return { error: "terminal" as const, status: loan.status };
    }
    const updated = await tx.loan.update({
      where: { id },
      data: { status: "CANCELLED", closedDate: new Date() },
    });
    return { ok: updated };
  });

  if ("error" in result) {
    if (result.error === "missing") return notFound("Loan");
    return err(`Loan already in terminal status ${result.status}`, 409);
  }
  return ok(serializeLoan(result.ok), "Loan cancelled");
}
