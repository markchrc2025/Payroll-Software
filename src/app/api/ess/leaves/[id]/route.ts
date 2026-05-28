/**
 * DELETE /api/ess/leaves/[id]
 *
 * Cancel an own PENDING leave request.  Only PENDING transactions that belong
 * to the authenticated employee can be cancelled; approved or processed
 * transactions must be cancelled by HR.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { serializeLeaveTransaction } from "@/lib/payroll/serialize";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const txn = await tx.leaveTransaction.findFirst({
        where: {
          id,
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          type: "USAGE",
        },
      });
      if (!txn) return "not_found" as const;
      if (txn.approvalStatus !== "PENDING") return "not_pending" as const;

      return tx.leaveTransaction.update({
        where: { id },
        data: { approvalStatus: "CANCELLED" },
      });
    });

    if (result === "not_found") return notFound("LeaveTransaction");
    if (result === "not_pending") {
      return err("Only PENDING leave requests can be cancelled", 409);
    }

    return ok(serializeLeaveTransaction(result), "Leave request cancelled");
  } catch (e) {
    console.error("[ess/leaves/[id] DELETE]", e);
    return serverError(e);
  }
}
