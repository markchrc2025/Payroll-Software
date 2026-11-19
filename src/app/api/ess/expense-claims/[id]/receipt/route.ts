/**
 * GET /api/ess/expense-claims/[id]/receipt (PAY-190)
 *
 * The employee's own claim only: a 5-minute link to view its receipt.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { receiptViewUrl } from "@/lib/expense-receipts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const claim = await withTenant(ctx.tenantId, (tx) =>
    tx.expenseClaim.findFirst({ where: { id, tenantId: ctx.tenantId, employeeId: ctx.employeeId }, select: { receiptKey: true } }),
  );
  if (!claim) return notFound("Expense claim");
  if (!claim.receiptKey) return notFound("Receipt");
  const url = await receiptViewUrl(claim.receiptKey);
  if (!url) return err("File storage is not configured on the server. Contact your administrator.", 503);
  return ok({ url });
}
