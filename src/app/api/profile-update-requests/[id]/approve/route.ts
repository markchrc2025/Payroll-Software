/**
 * POST /api/profile-update-requests/[id]/approve
 *
 * PENDING → APPROVED.
 * Commits the requested field change atomically to the Employee row.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const pur = await tx.profileUpdateRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!pur) return { notFound: true as const };
    if (pur.status !== "PENDING")
      return { notPending: true as const, status: pur.status };

    // Apply field change to Employee
    await tx.employee.update({
      where: { id: pur.employeeId },
      data: { [pur.field]: pur.newValue },
    });

    const updated = await tx.profileUpdateRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: auth.userId,
        approvedAt: new Date(),
      },
    });
    return { notFound: false as const, notPending: false as const, row: updated };
  });

  if (result.notFound) return notFound("Profile update request not found");
  if (result.notPending)
    return err(`Cannot approve a ${result.status} request`, 409);
  return ok(result.row, "Profile update request approved");
}
