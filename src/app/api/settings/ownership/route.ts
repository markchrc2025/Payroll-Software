/**
 * GET  /api/settings/ownership — current owner + list of eligible users
 * POST /api/settings/ownership — transfer ownership to another user
 *
 * Requires SETTINGS:READ (GET) / SETTINGS:UPDATE (POST).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok, err } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const [tenant, users] = await Promise.all([
      tx.tenant.findFirst({
        where: { id: ctx.tenantId, deletedAt: null },
        select: {
          ownerUserId: true,
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      tx.user.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null, isActive: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: { id: true, firstName: true, lastName: true, email: true, assignedRole: { select: { name: true } } },
      }),
    ]);
    return { tenant, users };
  });

  if (!result.tenant) return err("Tenant not found", 404);
  return ok({ owner: result.tenant.owner, ownerUserId: result.tenant.ownerUserId, users: result.users });
}

const transferSchema = z.object({ newOwnerUserId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const { newOwnerUserId } = parsed.data;
  if (newOwnerUserId === ctx.userId) return err("You are already the owner", 400);

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: newOwnerUserId, tenantId: ctx.tenantId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) return { error: "User not found or is inactive" as const };

    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { ownerUserId: newOwnerUserId },
    });
    return { user };
  });

  if ("error" in result && result.error) return err(result.error, 404);

  try {
    await writeAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entity: "Tenant",
      entityId: ctx.tenantId,
      changes: { field: "ownerUserId", newOwnerUserId },
      ipAddress: getClientIp(req),
    });
  } catch { /* non-fatal */ }

  return ok(
    { ownerUserId: result.user.id, owner: result.user },
    "Ownership transferred successfully",
  );
}
