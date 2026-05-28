/**
 * GET /api/branches/[id]/geofence  — Get geofence for a branch
 * PUT /api/branches/[id]/geofence  — Upsert geofence for a branch
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { z } from "zod";

const upsertSchema = z.object({
  name: z.string().min(1).max(150),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(5000).default(50),
  isActive: z.boolean().default(true),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const branch = await withTenant(auth.tenantId, (tx) =>
    tx.branch.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    })
  );
  if (!branch) return notFound("Branch not found");

  const geofence = await withTenant(auth.tenantId, (tx) =>
    tx.geofence.findFirst({
      where: { branchId: id, tenantId: auth.tenantId, deletedAt: null },
    })
  );

  if (!geofence) return notFound("No geofence configured for this branch");
  return ok(geofence);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!branch) return { notFound: true as const };

    const existing = await tx.geofence.findFirst({
      where: { branchId: id, tenantId: auth.tenantId, deletedAt: null },
    });

    const data = {
      name: parsed.data.name,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      radiusMeters: parsed.data.radiusMeters,
      isActive: parsed.data.isActive,
    };

    if (existing) {
      return {
        notFound: false as const,
        row: await tx.geofence.update({ where: { id: existing.id }, data }),
        created: false,
      };
    }

    return {
      notFound: false as const,
      row: await tx.geofence.create({
        data: { ...data, branchId: id, tenantId: auth.tenantId },
      }),
      created: true,
    };
  });

  if (result.notFound) return notFound("Branch not found");
  return ok(result.row, result.created ? "Geofence created" : "Geofence updated", result.created ? 201 : 200);
}
