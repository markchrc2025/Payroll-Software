/**
 * PATCH /api/employees/[id]/kiosk-pin — Set or clear an employee's kiosk PIN.
 *
 * Body:
 *   { "pin": "1234" }   — set a 4-8 digit PIN (bcrypt-hashed before storage)
 *   { "pin": null }     — clear the PIN (employee can no longer use kiosk PIN mode)
 *
 * Requires EMPLOYEES:UPDATE permission.
 */
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const kioskPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "PIN must be 4–8 digits")
    .nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = kioskPinSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { pin } = parsed.data;

  const employee = await withTenant(ctx.tenantId, (tx) =>
    tx.employee.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
  );
  if (!employee) return notFound("Employee");

  const kioskPinHash = pin ? await bcrypt.hash(pin, 10) : null;

  await withTenant(ctx.tenantId, (tx) =>
    tx.employee.update({ where: { id }, data: { kioskPinHash } }),
  );

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    changes: { field: "kioskPinHash", action: pin ? "set" : "cleared" },
    ipAddress: getClientIp(req),
  });

  return ok({ id, kioskPinSet: pin !== null }, pin ? "Kiosk PIN updated" : "Kiosk PIN cleared");
}
