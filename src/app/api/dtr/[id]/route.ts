/**
 * /api/dtr/[id]
 *   GET   — get a DTR record
 *   PATCH — update (blocked if isLocked)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updateDtrRecordSchema } from "@/lib/validations/dtr";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const record = await withTenant(auth.tenantId, (tx) =>
    tx.dTRRecord.findFirst({
      where: { id, tenantId: auth.tenantId },
    }),
  );
  if (!record) return notFound();
  return ok(record);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateDtrRecordSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.dTRRecord.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, isLocked: true },
    });
    if (!existing) return null;
    if (existing.isLocked) return "LOCKED";

    return tx.dTRRecord.update({
      where: { id },
      data: {
        ...(d.shiftScheduleId !== undefined && {
          shiftScheduleId: d.shiftScheduleId ?? null,
        }),
        ...(d.dayStatus !== undefined && { dayStatus: d.dayStatus }),
        ...(d.workedMinutes !== undefined && {
          workedMinutes: d.workedMinutes,
        }),
        ...(d.lateMinutes !== undefined && { lateMinutes: d.lateMinutes }),
        ...(d.undertimeMinutes !== undefined && {
          undertimeMinutes: d.undertimeMinutes,
        }),
        ...(d.otMinutes !== undefined && { otMinutes: d.otMinutes }),
        ...(d.nsdMinutes !== undefined && { nsdMinutes: d.nsdMinutes }),
        ...(d.hazardMinutes !== undefined && {
          hazardMinutes: d.hazardMinutes,
        }),
        ...(d.holidayType !== undefined && {
          holidayType: d.holidayType ?? null,
        }),
        ...(d.notes !== undefined && { notes: d.notes ?? null }),
      },
    });
  });

  if (!updated) return notFound();
  if (updated === "LOCKED") return err("DTR record is locked", 409);
  return ok(updated);
}
