/**
 * /api/dtr/[id]/approve
 *   POST — PENDING → APPROVED
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const record = await tx.dTRRecord.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, approvalStatus: true, isLocked: true },
    });
    if (!record) return null;
    if (record.approvalStatus !== "PENDING") return "NOT_PENDING";

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
  return ok(updated, "DTR record approved");
}
