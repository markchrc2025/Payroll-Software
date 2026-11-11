import { mayApproveFor } from "@/lib/approvals/second-party";
import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, unauthorized, notFound, serverError, forbidden } from "@/lib/api-response";
import { rejectExpenseClaimSchema } from "@/lib/validations/expense-claim";
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

  const parsed = rejectExpenseClaimSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation error", 400, parsed.error.flatten());

  const { reason } = parsed.data;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const claim = await tx.expenseClaim.findFirst({
        where: { id, tenantId: auth.tenantId },
      });
      if (!claim) return notFound();
      // Unit 0.22 Am 1 (B5): this route checked nothing; any signed-in user
      // could reject any claim, their own included. Now: never one's own; the
      // owner or a role granted PAYROLL:APPROVE.
      const who = await mayApproveFor(tx, auth, claim.employeeId, "EXPENSE");
      if (who === "self") return forbidden("You cannot reject your own expense claim");
      if (who === "forbidden") return forbidden("You do not have permission to reject expense claims");
      if (claim.status !== "SUBMITTED")
        return err("Only SUBMITTED claims can be rejected", 409);

      const updated = await tx.expenseClaim.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
        },
      });

      return ok(serializeExpenseClaim(updated));
    });
  } catch (e) {
    return serverError(e);
  }
}
