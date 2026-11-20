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
import { forbidUnless } from "@/lib/authz/route-permission";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"], ["SETTINGS", "READ"]);
  if (denied) return denied;
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
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updatePayComponentSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.payComponent.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    // PAY-149: a seeded component keeps its kind; only a deduction can be a
    // loss or damage deduction.
    const kind = parsed.data.kind ?? existing.kind;
    if (existing.isSystem && parsed.data.kind && parsed.data.kind !== existing.kind) return "SYSTEM_KIND" as const;
    if ((parsed.data.isLossOrDamage ?? existing.isLossOrDamage) && kind !== "DEDUCTION") return "LOSS_KIND" as const;
    return tx.payComponent.update({
      where: { id },
      data: parsed.data,
    });
  });

  if (updated === "SYSTEM_KIND") return err("This component is built in. Its kind cannot be changed.", 409);
  if (updated === "LOSS_KIND") return err("Only a deduction can be a loss or damage deduction.", 422);
  if (!updated) return notFound("PayComponent");
  return ok(serializePayComponent(updated), "PayComponent updated");
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
    const existing = await tx.payComponent.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) return null;
    if (existing.isSystem) return "SYSTEM" as const; // PAY-149
    return tx.payComponent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });

  if (deleted === "SYSTEM") return err("This component is built in and cannot be deleted. Make it inactive instead.", 409);
  if (!deleted) return notFound("PayComponent");
  return ok(serializePayComponent(deleted), "PayComponent deleted");
}
