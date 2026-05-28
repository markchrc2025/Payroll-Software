/**
 * GET  /api/admin/tenants — list all tenants
 * POST /api/admin/tenants — create a new tenant
 *
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, forbidden, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  tradeName: z.string().max(200).optional().nullable(),
  subdomain: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  subscriptionTier: z.enum(["STARTER", "GROWTH", "PRO"]).default("STARTER"),
  subscriptionStatus: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"]).default("TRIALING"),
  billingEmail: z.string().email().optional().nullable(),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
});

export async function GET(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const search = url.searchParams.get("search")?.trim() ?? "";
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { tradeName: { contains: search, mode: "insensitive" as const } },
          { subdomain: { contains: search, mode: "insensitive" as const } },
        ],
        deletedAt: null,
      }
    : { deletedAt: null };

  const [total, tenants] = await Promise.all([
    prismaAdmin.tenant.count({ where }),
    prismaAdmin.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        tradeName: true,
        subdomain: true,
        industry: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        featureFlags: true,
        createdAt: true,
        _count: { select: { employees: true, users: true } },
      },
    }),
  ]);

  return paginated(tenants, total, page, limit);
}

export async function POST(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const tenant = await prismaAdmin.tenant.create({
      data: {
        name: parsed.data.name,
        tradeName: parsed.data.tradeName ?? null,
        subdomain: parsed.data.subdomain ?? null,
        industry: parsed.data.industry ?? null,
        subscriptionTier: parsed.data.subscriptionTier,
        subscriptionStatus: parsed.data.subscriptionStatus,
        billingEmail: parsed.data.billingEmail ?? null,
        featureFlags: parsed.data.featureFlags as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        tradeName: true,
        subdomain: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        featureFlags: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      tenantId: tenant.id,
      actorUserId: ctx.userId,
      action: "CREATE",
      entity: "Tenant",
      entityId: tenant.id,
      changes: { name: tenant.name, subscriptionTier: tenant.subscriptionTier },
      ipAddress: getClientIp(req),
    });

    return ok(tenant, "Tenant created", 201);
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return err("Subdomain already in use", 409);
    }
    return serverError(e);
  }
}
