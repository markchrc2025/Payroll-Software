/**
 * GET  /api/admin/tenants — list all tenants
 * POST /api/admin/tenants — create a new tenant
 *
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { writeCentralAudit, logSubscriptionEvent } from "@/lib/central/audit";
import { tenantMrrPesos, computeHealthScore } from "@/lib/central/metrics";
import { z } from "zod";

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  tradeName: z.string().max(200).optional().nullable(),
  companyCode: z.string().min(2).max(20).regex(/^[A-Z0-9]+$/, "Company Code must be uppercase letters and numbers only").optional().nullable(),
  subdomain: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  subscriptionTier: z.enum(["STARTER", "GROWTH", "PRO"]).default("STARTER"),
  subscriptionStatus: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"]).default("TRIALING"),
  billingEmail: z.string().email().optional().nullable(),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
  // Wizard — company detail fields
  tinNumber: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  payrollCycle: z.enum(["DAILY", "WEEKLY", "BI_WEEKLY", "SEMI_MONTHLY", "MONTHLY"]).optional(),
  // Wizard — optional primary admin account to create
  adminFirstName: z.string().min(1).max(100).optional().nullable(),
  adminLastName: z.string().min(1).max(100).optional().nullable(),
  adminEmail: z.string().email().optional().nullable(),
  adminPassword: z.string().min(8).optional().nullable(),
  adminPhone: z.string().max(30).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const ctx = await requireCentralPermission("TENANTS", "READ");
  if (ctx instanceof Response) return ctx;

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
        healthScore: true,
        region: true,
        featureFlags: true,
        createdAt: true,
        _count: { select: { employees: true, users: true } },
        subscription: {
          select: {
            status: true,
            billingCycle: true,
            package: { select: { monthlyPrice: true, annualPrice: true } },
          },
        },
      },
    }),
  ]);

  // Enrich each tenant with derived MRR (whole pesos) and account-health score.
  const enriched = tenants.map((t) => ({
    ...t,
    mrr: tenantMrrPesos(t.subscription),
    health: computeHealthScore({ subscriptionStatus: t.subscriptionStatus, healthScore: t.healthScore }),
  }));

  return paginated(enriched, total, page, limit);
}

export async function POST(req: NextRequest) {
  const ctx = await requireCentralPermission("TENANTS", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const {
      adminFirstName, adminLastName, adminEmail, adminPassword, adminPhone,
      tinNumber, address, city, province, zipCode, contactEmail, contactPhone,
      trialEndsAt, payrollCycle, companyCode,
      ...tenantData
    } = parsed.data;

    const tenant = await prismaAdmin.tenant.create({
      data: {
        name: tenantData.name,
        tradeName: tenantData.tradeName ?? null,
        companyCode: companyCode ?? null,
        subdomain: tenantData.subdomain ?? null,
        industry: tenantData.industry ?? null,
        subscriptionTier: tenantData.subscriptionTier,
        subscriptionStatus: tenantData.subscriptionStatus,
        billingEmail: tenantData.billingEmail ?? null,
        featureFlags: tenantData.featureFlags as unknown as Prisma.InputJsonValue,
        tinNumber: tinNumber ?? null,
        address: address ?? null,
        city: city ?? null,
        province: province ?? null,
        zipCode: zipCode ?? null,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
        ...(trialEndsAt ? { trialEndsAt: new Date(trialEndsAt) } : {}),
        ...(payrollCycle ? { payrollCycle } : {}),
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

    // Optionally provision the primary admin user + an Administrator role
    let adminUser: { id: string; email: string } | null = null;
    if (adminEmail && adminPassword && adminFirstName && adminLastName) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);

      // 1. Create an "Administrator" role with all permissions for this tenant.
      const allPermissions = await prismaAdmin.permission.findMany({ select: { id: true } });
      const adminRole = await prismaAdmin.role.create({
        data: {
          tenantId: tenant.id,
          name: "Administrator",
          description: "Full access to all modules",
          isSystem: true,
          permissions: {
            create: allPermissions.map((p) => ({ permissionId: p.id })),
          },
        },
        select: { id: true },
      });

      // 2. Create the admin user and assign the role immediately.
      adminUser = await prismaAdmin.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          passwordHash,
          firstName: adminFirstName,
          lastName: adminLastName,
          systemRole: "TENANT_USER",
          isActive: true,
          roleId: adminRole.id,
        },
        select: { id: true, email: true },
      }).catch(() => null); // don't fail tenant creation if user creation fails
    }

    await writeAuditLog({
      tenantId: tenant.id,
      actorUserId: ctx.userId,
      action: "CREATE",
      entity: "Tenant",
      entityId: tenant.id,
      changes: { name: tenant.name, subscriptionTier: tenant.subscriptionTier },
      ipAddress: getClientIp(req),
    });

    // Seed the subscription timeline + platform audit feed for the new account.
    await logSubscriptionEvent({
      tenantId: tenant.id,
      type: tenant.subscriptionStatus === "TRIALING" ? "TRIAL_STARTED" : "SUBSCRIBED",
      detail: `${tenant.subscriptionTier} plan`,
      actorUserId: ctx.userId,
    });
    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: "onboarded tenant",
      target: tenant.name,
      kind: "TENANT",
      tenantId: tenant.id,
      ipAddress: getClientIp(req),
    });

    return ok({ ...tenant, adminUser }, "Tenant created", 201);
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return err("Subdomain or Company Code already in use", 409);
    }
    return serverError(e);
  }
}
