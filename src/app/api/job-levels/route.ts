/**
 * GET  /api/job-levels  — List all job levels for the tenant
 * POST /api/job-levels  — Create a new job level
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  rank: z.coerce.number().int().min(0).max(9999).optional(),
  description: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const levels = await withTenant(auth.tenantId, (tx) => tx.jobLevel.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    orderBy: [{ rank: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      rank: true,
      description: true,
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  }));

  return ok(levels);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.jobLevel.findFirst({
      where: {
        tenantId: auth.tenantId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };
    return {
      duplicate: false as const,
      row: await tx.jobLevel.create({
        data: {
          tenantId: auth.tenantId,
          name: parsed.data.name,
          rank: parsed.data.rank ?? 0,
          description: parsed.data.description ?? null,
        },
      }),
    };
  });
  if (result.duplicate) return err(`Level "${parsed.data.name}" already exists`, 409);

  return ok(result.row, "Level created", 201);
}
