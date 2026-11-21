/**
 * POST /api/expense-claims/[id]/submit: submit a DRAFT expense claim.
 *
 * Unit 0.25 (ruling B6): only the employee the claim belongs to can submit it.
 * No one files for another employee.
 */
import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, forbidden, serverError } from "@/lib/api-response";
import { callerEmployeeId } from "@/lib/approvals/second-party";
import { ClaimListRefusal, checkOnSubmit } from "@/lib/expenses/claim-lists";
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
      if (claim.employeeId !== (await callerEmployeeId(tx, auth))) {
        return forbidden("You can only submit your own expense claims. Employees submit theirs in ESS.");
      }
      if (claim.status !== "DRAFT")
        return err("Only DRAFT claims can be submitted", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        // Wave A2 (PAY-209): receipt rule enforced, limits flagged (decision 6).
        data: { status: "SUBMITTED", limitFlags: await checkOnSubmit(tx, claim) },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    if (e instanceof ClaimListRefusal) return err(e.message, e.status);
    return serverError(e);
  }
}
