/**
 * GET  /api/departments  — List all departments for the tenant
 * POST /api/departments  — Create a new department
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const createDeptSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  description: z.string().max(500).optional().nullable(),
  headId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const departments = await withTenant(auth.tenantId, (tx) => tx.department.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      headId: true,
      head: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  }));

  return ok(departments);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createDeptSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.department.findFirst({
      where: {
        tenantId: auth.tenantId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };
    return {
      duplicate: false as const,
      row: await tx.department.create({
        data: { ...parsed.data, tenantId: auth.tenantId },
      }),
    };
  });
  if (result.duplicate) return err(`Department "${parsed.data.name}" already exists`, 409);

  return ok(result.row, "Department created", 201);
}
