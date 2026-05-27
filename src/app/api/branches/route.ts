/**
 * GET  /api/branches  — List all branches for the tenant
 * POST /api/branches  — Create a new branch
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const createBranchSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
  isHeadOffice: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const branches = await withTenant(auth.tenantId, (tx) => tx.branch.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    orderBy: [{ isHeadOffice: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      province: true,
      isHeadOffice: true,
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  }));

  return ok(branches);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const branch = await withTenant(auth.tenantId, async (tx) => {
    // Check for duplicate name within tenant
    const existing = await tx.branch.findFirst({
      where: {
        tenantId: auth.tenantId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };

    return {
      duplicate: false as const,
      row: await tx.branch.create({
        data: {
          ...parsed.data,
          tenantId: auth.tenantId,
        },
      }),
    };
  });
  if (branch.duplicate) return err(`Branch "${parsed.data.name}" already exists`, 409);

  return ok(branch.row, "Branch created", 201);
}
