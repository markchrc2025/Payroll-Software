/**
 * /api/dtr/[id]/approve
 *   POST — PENDING → APPROVED
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { isSelfAction } from "@/lib/authz/self-approval";
import { err, forbidden, notFound, ok } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const record = await tx.dTRRecord.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, approvalStatus: true, isLocked: true, employeeId: true },
    });
    if (!record) return null;
    if (record.approvalStatus !== "PENDING") return "NOT_PENDING";
    if (await isSelfAction(tx, auth.tenantId, auth.userId, record.employeeId))
      return "SELF";

    return tx.dTRRecord.update({
      where: { id },
      data: {
        approvalStatus: "APPROVED",
        approvedById: auth.userId ?? null,
        approvedAt: new Date(),
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "NOT_PENDING")
    return err("DTR record is not in PENDING status", 409);
  if (updated === "SELF")
    return forbidden("You cannot approve your own DTR record");
  return ok(updated, "DTR record approved");
}
