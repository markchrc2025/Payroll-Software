/**
 * POST /api/ot-applications/[id]/reject
 *
 * PENDING → REJECTED. rejectionReason is required.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required").max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const ota = await tx.oTApplication.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!ota) return { notFound: true as const };
    if (ota.status !== "PENDING" && ota.status !== "APPROVED")
      return { notRejectable: true as const, status: ota.status };

    const prevApproved = ota.status === "APPROVED";
    const updated = await tx.oTApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: auth.userId,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
      },
    });

    // If was previously APPROVED, reverse the DTR otMinutes sync
    if (prevApproved) {
      await tx.dTRRecord.updateMany({
        where: {
          tenantId: auth.tenantId,
          employeeId: ota.employeeId,
          date: ota.date,
        },
        data: { otMinutes: 0 },
      });
    }

    return { notFound: false as const, notRejectable: false as const, row: updated };
  });

  if (result.notFound) return notFound("OT application not found");
  if (result.notRejectable)
    return err(`Cannot reject a ${result.status} application`, 409);
  return ok(result.row, "OT application rejected");
}
