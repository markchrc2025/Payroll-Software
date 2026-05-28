/**
 * POST /api/profile-update-requests/[id]/reject
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
  const guard = await requirePermission(req, "EMPLOYEES", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const pur = await tx.profileUpdateRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!pur) return { notFound: true as const };
    if (pur.status !== "PENDING")
      return { notPending: true as const, status: pur.status };

    const updated = await tx.profileUpdateRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: auth.userId,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
      },
    });
    return { notFound: false as const, notPending: false as const, row: updated };
  });

  if (result.notFound) return notFound("Profile update request not found");
  if (result.notPending)
    return err(`Cannot reject a ${result.status} request`, 409);
  return ok(result.row, "Profile update request rejected");
}
