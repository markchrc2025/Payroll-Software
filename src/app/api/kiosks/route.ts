/**
 * GET  /api/kiosks  — list kiosks for the authenticated tenant
 * POST /api/kiosks  — create a kiosk
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, paginated } from "@/lib/api-response";

const createSchema = z.object({
  name:          z.string().min(1).max(150),
  branchId:      z.string().cuid().optional().nullable(),
  requiresSelfie: z.boolean().default(true),
  isActive:      z.boolean().default(true),
});

const listSchema = z.object({
  branchId: z.string().cuid().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v !== "false")),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { branchId, isActive, page, limit } = parsed.data;

  const where = {
    tenantId: auth.tenantId,
    deletedAt: null as null,
    ...(branchId !== undefined && { branchId }),
    ...(isActive !== undefined && { isActive }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.kiosk.findMany({
        where,
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.kiosk.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const d = parsed.data;

  const kiosk = await withTenant(auth.tenantId, async (tx) => {
    if (d.branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: d.branchId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) return "BRANCH_NOT_FOUND" as const;
    }
    return tx.kiosk.create({
      data: {
        tenantId:      auth.tenantId,
        name:          d.name,
        branchId:      d.branchId ?? null,
        requiresSelfie: d.requiresSelfie,
        isActive:      d.isActive,
        createdByUserId: auth.userId ?? undefined,
      },
    });
  });

  if (kiosk === "BRANCH_NOT_FOUND") return err("Branch not found", 404);
  return ok(kiosk, "Kiosk created", 201);
}
