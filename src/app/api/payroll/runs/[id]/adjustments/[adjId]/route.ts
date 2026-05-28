/**
 * /api/payroll/runs/[id]/adjustments/[adjId]
 *   DELETE — remove an adjustment (book must be DRAFT)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; adjId: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id, adjId } = await params;

  try {
    await withTenant(auth.tenantId, async (tx) => {
      // Verify adjustment belongs to this book + tenant.
      const adj = await tx.payrollAdjustment.findFirst({
        where: { id: adjId, payrollBookId: id, tenantId: auth.tenantId },
        include: { payrollBook: { select: { status: true } } },
      });
      if (!adj) throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      if (adj.payrollBook.status !== "DRAFT") {
        throw Object.assign(new Error("Run is not in DRAFT status"), { code: "CONFLICT" });
      }

      await tx.payrollAdjustment.delete({ where: { id: adjId } });
    });
    return ok({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof Error) {
      const code = (e as { code?: string }).code;
      if (code === "NOT_FOUND") return notFound("PayrollAdjustment");
      if (code === "CONFLICT") return err(e.message, 409);
    }
    return serverError(e);
  }
}
