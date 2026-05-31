/**
 * /api/dtr/submissions/[id]/approve-supervisor
 *   POST — SUBMITTED → SUPERVISOR_APPROVED
 *
 * The acting user's employee record is recorded as the supervisor.
 * Requires TIMESHEETS:APPROVE permission.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!submission) return null;
    if (submission.status !== "SUBMITTED") return "WRONG_STATUS";

    // Resolve the acting user's employee record (may be null for pure-admin users)
    const actorEmployee = auth.userId
      ? await tx.employee.findFirst({
          where: { userId: auth.userId, tenantId: auth.tenantId },
          select: { id: true },
        })
      : null;

    return tx.dTRSubmission.update({
      where: { id },
      data: {
        status: "SUPERVISOR_APPROVED",
        supervisorId: actorEmployee?.id ?? null,
        supervisorActedAt: new Date(),
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "WRONG_STATUS")
    return err("Submission must be in SUBMITTED status to approve as supervisor", 409);
  return ok(updated, "Submission approved by supervisor");
}
