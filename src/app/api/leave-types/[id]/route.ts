/**
 * /api/leave-types/[id]
 *   GET    — fetch one leave type
 *   PATCH  — partial update
 *   DELETE — soft delete (sets deletedAt)
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updateLeaveTypeSchema } from "@/lib/validations/leave";
import { serializeLeaveType } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.leaveType.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    }),
  );
  if (!row) return notFound("LeaveType");
  return ok(serializeLeaveType(row));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateLeaveTypeSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.leaveType.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) return null;
    return tx.leaveType.update({
      where: { id },
      data: parsed.data,
    });
  });

  if (!updated) return notFound("LeaveType");
  return ok(serializeLeaveType(updated), "LeaveType updated");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.leaveType.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    if (existing.deletedAt) return "already_deleted" as const;
    return tx.leaveType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });

  if (!deleted) return notFound("LeaveType");
  if (deleted === "already_deleted") return err("LeaveType is already deleted", 409);
  return ok(serializeLeaveType(deleted), "LeaveType deleted");
}
