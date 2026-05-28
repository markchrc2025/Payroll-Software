/**
 * GET  /api/work-locations  — List active work locations for the tenant
 * POST /api/work-locations  — Create a new work location
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(150),
  region: z.string().min(1).max(20),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const url = new URL(req.url);
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.workLocation.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        region: true,
        city: true,
        province: true,
        zipCode: true,
        deletedAt: true,
        _count: { select: { branches: { where: { deletedAt: null } } } },
      },
    })
  );

  return ok(rows);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.workLocation.findFirst({
      where: {
        tenantId: auth.tenantId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };
    return {
      duplicate: false as const,
      row: await tx.workLocation.create({
        data: { ...parsed.data, tenantId: auth.tenantId },
      }),
    };
  });

  if (result.duplicate)
    return err(`Work location "${parsed.data.name}" already exists`, 409);

  return ok(result.row, "Work location created", 201);
}
