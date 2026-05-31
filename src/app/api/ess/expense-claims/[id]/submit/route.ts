/**
 * POST /api/ess/expense-claims/[id]/submit
 *
 * Employee submits their own DRAFT expense claim for Finance review.
 * DRAFT → SUBMITTED. Only the owning employee can submit their own claim.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, err, notFound, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { centavosToJson } from "@/lib/money";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: ctx.tenantId, employeeId: ctx.employeeId },
      });
      if (!claim) return { notFound: true as const };
      if (claim.status !== "DRAFT")
        return { notDraft: true as const, status: claim.status };

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: { status: "SUBMITTED" },
      });
      return { notFound: false as const, notDraft: false as const, row: updated };
    });

    if (result.notFound) return notFound("Expense claim not found");
    if (result.notDraft)
      return err(`Only DRAFT claims can be submitted (current: ${result.status})`, 409);

    return ok(
      { ...result.row, amountCents: centavosToJson(result.row.amountCents) },
      "Claim submitted for review",
    );
  } catch (e) {
    console.error("[ess/expense-claims/submit]", e);
    return serverError(e);
  }
}
