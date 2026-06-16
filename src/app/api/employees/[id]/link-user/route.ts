/**
 * PATCH /api/employees/[id]/link-user
 * Body: { userId: string | null }
 *
 * Link or unlink a User account to this Employee record.
 * - userId: string  → link (validates active, same-tenant, not already linked elsewhere)
 * - userId: null    → unlink
 *
 * Requires EMPLOYEES:UPDATE. Writes to audit log.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const schema = z.object({ userId: z.string().min(1).nullable() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const { userId } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!emp) return { notFound: true as const };

    if (userId !== null) {
      // User must be active and belong to this tenant.
      const user = await tx.user.findFirst({
        where: { id: userId, tenantId: auth.tenantId, deletedAt: null, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (!user) return { error: "User not found or is inactive in this tenant" as const };

      // userId is @unique — cannot link the same account to two employees.
      const conflict = await tx.employee.findFirst({
        where: { userId, tenantId: auth.tenantId, id: { not: id } },
        select: { firstName: true, lastName: true },
      });
      if (conflict) {
        return {
          error: `This user account is already linked to ${conflict.firstName} ${conflict.lastName}` as const,
        };
      }

      await tx.employee.update({ where: { id }, data: { userId } });
      return { user };
    } else {
      await tx.employee.update({ where: { id }, data: { userId: null } });
      return { user: null };
    }
  });

  if ("notFound" in result) return notFound("Employee");
  if ("error" in result && result.error) return err(result.error, 409);

  void writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    changes: { linkedUserId: userId ?? null },
    ipAddress: getClientIp(req),
  });

  return ok(
    "user" in result ? result.user : null,
    userId ? "User account linked successfully" : "User account unlinked",
  );
}
