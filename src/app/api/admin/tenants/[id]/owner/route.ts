/**
 * PATCH /api/admin/tenants/[id]/owner
 *
 * Central Portal action: designate (or transfer) the tenant's Super Admin / owner.
 * Body: { userId: string }  — must be an active, non-deleted user in this tenant.
 *
 * Requires TENANTS:MANAGE. Uses prismaAdmin (BYPASSRLS).
 * Writes to the platform SECURITY audit feed.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";

const schema = z.object({ userId: z.string().min(1) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireCentralPermission("TENANTS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;

  const tenant = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, ownerUserId: true },
  });
  if (!tenant) return notFound("Tenant");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const user = await prismaAdmin.user.findFirst({
    where: { id: parsed.data.userId, tenantId: id, deletedAt: null, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!user) return err("User not found or is inactive in this tenant", 404);

  try {
    await prismaAdmin.tenant.update({
      where: { id },
      data: { ownerUserId: user.id },
    });

    const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: `transferred tenant ownership to ${fullName}`,
      target: tenant.name,
      kind: "SECURITY",
      tenantId: id,
      ipAddress: getClientIp(req),
    });

    return ok(
      { ownerUserId: user.id, owner: { firstName: user.firstName, lastName: user.lastName, email: user.email } },
      "Ownership transferred",
    );
  } catch (e) {
    return serverError(e);
  }
}
