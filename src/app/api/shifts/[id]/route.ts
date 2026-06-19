/**
 * /api/shifts/[id]
 *   GET    — get shift schedule
 *   PATCH  — update shift schedule
 *   DELETE — soft-delete shift schedule
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updateShiftScheduleSchema } from "@/lib/validations/dtr";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const shift = await withTenant(auth.tenantId, (tx) =>
    tx.shiftSchedule.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    }),
  );
  if (!shift) return notFound();
  return ok(shift);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateShiftScheduleSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.shiftSchedule.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    // Name uniqueness check
    if (d.name) {
      const conflict = await tx.shiftSchedule.findFirst({
        where: {
          tenantId: auth.tenantId,
          name: d.name,
          deletedAt: null,
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) return "CONFLICT";
    }

    return tx.shiftSchedule.update({
      where: { id },
      data: {
        ...(d.name               !== undefined && { name:               d.name }),
        ...(d.code               !== undefined && { code:               d.code }),
        ...(d.type               !== undefined && { type:               d.type }),
        ...(d.timeIn             !== undefined && { timeIn:             d.timeIn }),
        ...(d.timeOut            !== undefined && { timeOut:            d.timeOut }),
        ...(d.coreTimeIn         !== undefined && { coreTimeIn:         d.coreTimeIn }),
        ...(d.coreTimeOut        !== undefined && { coreTimeOut:        d.coreTimeOut }),
        ...(d.requiredHours      !== undefined && { requiredHours:      d.requiredHours }),
        ...(d.gracePeriodMinutes !== undefined && { gracePeriodMinutes: d.gracePeriodMinutes }),
        ...(d.breakMinutes       !== undefined && { breakMinutes:       d.breakMinutes }),
        ...(d.breakPolicy        !== undefined && { breakPolicy:        d.breakPolicy }),
        ...(d.crossesMidnight    !== undefined && { crossesMidnight:    d.crossesMidnight }),
        ...(d.workDays           !== undefined && { workDays:           d.workDays }),
        ...(d.otThresholdMinutes !== undefined && { otThresholdMinutes: d.otThresholdMinutes }),
        ...(d.otRequiresApproval  !== undefined && { otRequiresApproval:  d.otRequiresApproval }),
        ...(d.otAutoApprove       !== undefined && { otAutoApprove:       d.otAutoApprove }),
        ...(d.otBreakMode         !== undefined && { otBreakMode:         d.otBreakMode }),
        ...(d.otBreakTriggerHours !== undefined && { otBreakTriggerHours: d.otBreakTriggerHours }),
        ...(d.otBreakBlockHours   !== undefined && { otBreakBlockHours:   d.otBreakBlockHours }),
        ...(d.otBreakMinutes      !== undefined && { otBreakMinutes:      d.otBreakMinutes }),
        ...(d.isActive           !== undefined && { isActive:           d.isActive }),
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "CONFLICT") return err("Shift schedule name already exists", 409);
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.shiftSchedule.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    return tx.shiftSchedule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });

  if (!deleted) return notFound();
  return ok({ id: deleted.id }, "Shift schedule deleted");
}
