/**
 * GET /api/expense-claims/[id]/receipt (PAY-190)
 *
 * A 5-minute link to view a claim's receipt, on the same rule as the claims
 * list: the owner or a PAYROLL:READ role sees any claim, anyone else only
 * their own.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { callerEmployeeId, maySeeAllRecords } from "@/lib/approvals/second-party";
import { receiptViewUrl } from "@/lib/expense-receipts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const claim = await withTenant(auth.tenantId, async (tx) => {
    const own = (await maySeeAllRecords(tx, auth, "EXPENSE")) ? null : ((await callerEmployeeId(tx, auth)) ?? "__none__");
    return tx.expenseClaim.findFirst({
      where: { id, tenantId: auth.tenantId, ...(own ? { employeeId: own } : {}) },
      select: { receiptKey: true },
    });
  });
  if (!claim) return notFound("Expense claim");
  if (!claim.receiptKey) return notFound("Receipt");
  const url = await receiptViewUrl(claim.receiptKey);
  if (!url) return err("File storage is not configured on the server. Contact your administrator.", 503);
  return ok({ url });
}
