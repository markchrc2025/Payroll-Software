/**
 * /api/dtr/[id]/manual
 *   PATCH — write supervisor manual time override to a DTRRecord.
 *
 * Writes to the manual layer, recomputes effective times, and appends an
 * immutable DTRAuditLog entry.
 *
 * Requires TIMESHEETS:APPROVE permission (supervisor or manager acting).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, notFound, ok } from "@/lib/api-response";
import { manualTimeOverrideSchema } from "@/lib/validations/dtr";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = manualTimeOverrideSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { field, value, reasonCode, notes, dtrSubmissionId } = parsed.data;

  // "OTHER" reason requires notes
  if (reasonCode === "OTHER" && !notes?.trim()) {
    return err("Notes are required when reason code is OTHER", 422);
  }

  const result = await withTenant(auth.tenantId, async (tx) => {
    const record = await tx.dTRRecord.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: {
        id: true,
        isLocked: true,
        officialTimeIn: true,
        officialTimeOut: true,
        manualTimeIn: true,
        manualTimeOut: true,
        manualActorRole: true,
      },
    });
    if (!record) return null;
    if (record.isLocked) return "LOCKED";

    // Block if the linked submission is already Manager Approved
    if (dtrSubmissionId) {
      const submission = await tx.dTRSubmission.findFirst({
        where: { id: dtrSubmissionId, tenantId: auth.tenantId },
        select: { status: true },
      });
      if (submission?.status === "MANAGER_APPROVED") return "FINAL_APPROVED";
    }

    // Resolve the acting user's employee record
    const actorEmployee = auth.userId
      ? await tx.employee.findFirst({
          where: { userId: auth.userId, tenantId: auth.tenantId },
          select: { id: true },
        })
      : null;

    const newValue = value ? new Date(value) : null;
    const oldValue =
      field === "manualTimeIn"
        ? record.manualTimeIn?.toISOString() ?? null
        : record.manualTimeOut?.toISOString() ?? null;

    // Build the updated manual layer
    const manualData =
      field === "manualTimeIn"
        ? { manualTimeIn: newValue }
        : { manualTimeOut: newValue };

    // Compute the new effective layer:
    // effectiveTimeIn  = manualTimeIn  (after update) ?? officialTimeIn
    // effectiveTimeOut = manualTimeOut (after update) ?? officialTimeOut
    const newManualTimeIn =
      field === "manualTimeIn" ? newValue : record.manualTimeIn;
    const newManualTimeOut =
      field === "manualTimeOut" ? newValue : record.manualTimeOut;

    const effectiveTimeIn = newManualTimeIn ?? record.officialTimeIn ?? null;
    const effectiveTimeOut = newManualTimeOut ?? record.officialTimeOut ?? null;

    // Update the DTRRecord
    const updated = await tx.dTRRecord.update({
      where: { id },
      data: {
        ...manualData,
        manualReasonCode: reasonCode,
        manualNotes: notes ?? null,
        manualActorRole: "SUPERVISOR",
        manualActorId: actorEmployee?.id ?? null,
        manualUpdatedAt: new Date(),
        effectiveTimeIn,
        effectiveTimeOut,
      },
    });

    // Append immutable audit log entry
    await tx.dTRAuditLog.create({
      data: {
        tenantId: auth.tenantId,
        dtrRecordId: id,
        dtrSubmissionId: dtrSubmissionId ?? null,
        actorRole: "SUPERVISOR",
        actorId: actorEmployee?.id ?? auth.userId ?? "unknown",
        fieldChanged: field,
        oldValue,
        newValue: newValue?.toISOString() ?? null,
        reasonCode,
        notes: notes ?? null,
      },
    });

    return updated;
  });

  if (!result) return notFound();
  if (result === "LOCKED") return err("DTR record is locked by payroll finalize", 409);
  if (result === "FINAL_APPROVED")
    return err("Cannot edit a manager-approved submission", 409);
  return ok(result, "Manual time override saved");
}
