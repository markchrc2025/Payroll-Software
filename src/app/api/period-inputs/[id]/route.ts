/**
 * /api/period-inputs/[id]
 *   GET    — fetch one
 *   PATCH  — partial field update
 *   DELETE — hard delete
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updatePeriodInputSchema } from "@/lib/validations/period-input";
import { serializePeriodInput } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.periodInput.findFirst({ where: { id, tenantId: auth.tenantId } }),
  );
  if (!row) return notFound("PeriodInput");
  return ok(serializePeriodInput(row));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updatePeriodInputSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.periodInput.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    return tx.periodInput.update({ where: { id }, data: parsed.data });
  });

  if (!updated) return notFound("PeriodInput");
  return ok(serializePeriodInput(updated), "PeriodInput updated");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.periodInput.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    return tx.periodInput.delete({ where: { id } });
  });

  if (!deleted) return notFound("PeriodInput");
  return ok(serializePeriodInput(deleted), "PeriodInput deleted");
}
