/**
 * PUT    /api/org-roles/[roleKey] — Assign (upsert) an employee to an org role.
 * DELETE /api/org-roles/[roleKey] — Clear the assignment.
 *
 * Supported roleKeys: "hr_manager", "ceo"
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";
import { SINGLETON_ROLES } from "../route";

const putSchema = z.object({
  employeeId: z.string().cuid("Invalid employee ID"),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roleKey: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { roleKey } = await params;

  if (!(SINGLETON_ROLES as readonly string[]).includes(roleKey))
    return err(`Unknown role key "${roleKey}". Valid: ${SINGLETON_ROLES.join(", ")}`, 400);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const { employeeId } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    });
    if (!emp) return { notFound: true as const };

    const row = await tx.orgRole.upsert({
      where: { tenantId_roleKey: { tenantId: auth.tenantId, roleKey } },
      create: { tenantId: auth.tenantId, roleKey, employeeId },
      update: { employeeId },
      select: { roleKey: true, employeeId: true },
    });
    return { notFound: false as const, row, emp };
  });

  if (result.notFound) return err("Employee not found", 404);
  return ok(result.row, "Role assigned");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roleKey: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { roleKey } = await params;

  if (!(SINGLETON_ROLES as readonly string[]).includes(roleKey))
    return err(`Unknown role key "${roleKey}"`, 400);

  await withTenant(auth.tenantId, (tx) =>
    tx.orgRole.deleteMany({
      where: { tenantId: auth.tenantId, roleKey },
    })
  );

  return ok({ roleKey }, "Role cleared");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleKey: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { roleKey } = await params;

  if (!(SINGLETON_ROLES as readonly string[]).includes(roleKey))
    return err(`Unknown role key "${roleKey}"`, 400);

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.orgRole.findUnique({
      where: { tenantId_roleKey: { tenantId: auth.tenantId, roleKey } },
      select: {
        roleKey: true,
        employeeId: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    })
  );

  return ok(row ?? null);
}
