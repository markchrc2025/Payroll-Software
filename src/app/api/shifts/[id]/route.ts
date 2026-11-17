/**
 * /api/shifts/[id]
 *   GET    — get shift schedule
 *   PATCH  — update shift schedule
 *   DELETE — soft-delete shift schedule
 */
import { mealBreakProblem } from "@/lib/attendance/meal-break";
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updateShiftScheduleSchema } from "@/lib/validations/dtr";
import { forbidUnless } from "@/lib/authz/route-permission";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: company reference data for dropdowns and screens, no employee records; changes to it are permission-checked (unit 0.25)
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
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateShiftScheduleSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.shiftSchedule.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true, breakMinutes: true, breakPolicy: true },
    });
    if (!existing) return null;

    // PAY-146: the break as it will be saved (this change over what is stored).
    const breakProblem = mealBreakProblem(
      d.breakMinutes ?? existing.breakMinutes,
      d.breakPolicy ?? existing.breakPolicy,
    );
    if (breakProblem) return { breakProblem };

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
  if ("breakProblem" in updated) return err(updated.breakProblem, 422, { fieldErrors: { breakMinutes: [updated.breakProblem] } });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["SETTINGS", "DELETE"]);
  if (denied) return denied;
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
