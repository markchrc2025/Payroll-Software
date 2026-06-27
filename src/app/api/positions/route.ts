/**
 * GET  /api/positions  — List active positions for the tenant
 * POST /api/positions  — Create a new position
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  title:        z.string().min(1).max(150),
  levelId:      z.string().min(1).optional().nullable(),
  description:  z.string().max(500).optional().nullable(),
  departmentId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const url = new URL(req.url);
  const levelId      = url.searchParams.get("levelId")      ?? undefined;
  const departmentId = url.searchParams.get("departmentId") ?? undefined;
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.position.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(levelId      ? { levelId }      : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: [{ title: "asc" }],
      select: {
        id:           true,
        title:        true,
        levelId:      true,
        level:        { select: { id: true, name: true, rank: true } } as const,
        description:  true,
        departmentId: true,
        department:   { select: { id: true, name: true } },
        deletedAt:    true,
        _count: { select: { employees: { where: { deletedAt: null } } } },
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
    const existing = await tx.position.findFirst({
      where: {
        tenantId: auth.tenantId,
        title: { equals: parsed.data.title, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };
    return {
      duplicate: false as const,
      row: await tx.position.create({
        data: { ...parsed.data, tenantId: auth.tenantId },
        select: {
          id: true, title: true, levelId: true,
          level: { select: { id: true, name: true, rank: true } } as const,
          description: true, departmentId: true,
          department: { select: { id: true, name: true } },
        },
      }),
    };
  });

  if (result.duplicate)
    return err(`Position "${parsed.data.title}" already exists`, 409);

  return ok(result.row, "Position created", 201);
}
