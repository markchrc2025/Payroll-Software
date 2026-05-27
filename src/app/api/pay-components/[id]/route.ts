/**
 * /api/pay-components/[id]
 *   GET    — fetch one
 *   PATCH  — partial update
 *   DELETE — soft delete (sets deletedAt)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { updatePayComponentSchema } from "@/lib/validations/pay-component";
import { serializePayComponent } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.payComponent.findFirst({ where: { id, tenantId: auth.tenantId } }),
  );
  if (!row) return notFound("PayComponent");
  return ok(serializePayComponent(row));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updatePayComponentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.payComponent.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    return tx.payComponent.update({
      where: { id },
      data: parsed.data,
    });
  });

  if (!updated) return notFound("PayComponent");
  return ok(serializePayComponent(updated), "PayComponent updated");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const deleted = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.payComponent.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    return tx.payComponent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });

  if (!deleted) return notFound("PayComponent");
  return ok(serializePayComponent(deleted), "PayComponent deleted");
}
