/**
 * /api/dtr/submissions/[id]/return
 *   POST — return a submission back to the previous actor with a reason.
 *
 * If status = SUBMITTED         → returned by supervisor (back to employee)
 * If status = SUPERVISOR_APPROVED → returned by manager (back to supervisor)
 *
 * Requires TIMESHEETS:APPROVE permission.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";
import { returnDtrSubmissionSchema } from "@/lib/validations/dtr";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = returnDtrSubmissionSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { reason } = parsed.data;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!submission) return null;

    // Only returnable from these two statuses
    if (
      submission.status !== "SUBMITTED" &&
      submission.status !== "SUPERVISOR_APPROVED"
    ) {
      return "WRONG_STATUS";
    }

    const returnedByRole =
      submission.status === "SUBMITTED" ? "SUPERVISOR" : "MANAGER";

    return tx.dTRSubmission.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedReason: reason,
        returnedAt: new Date(),
        returnedByRole,
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "WRONG_STATUS")
    return err("Submission cannot be returned from its current status", 409);
  return ok(updated, "Submission returned");
}
