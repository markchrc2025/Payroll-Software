import type { NextRequest } from "next/server";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

// Convert BigInt centavos in a tenant row's nested package to Number for JSON.
function serializeRow(t: {
  subscription: { package: { monthlyPrice: bigint; annualPrice: bigint } & Record<string, unknown> } & Record<string, unknown> | null;
} & Record<string, unknown>) {
  if (!t.subscription) return t;
  const pkg = t.subscription.package;
  return {
    ...t,
    subscription: {
      ...t.subscription,
      package: { ...pkg, monthlyPrice: Number(pkg.monthlyPrice), annualPrice: Number(pkg.annualPrice) },
    },
  };
}

// GET /api/admin/billing/subscriptions?page=&limit=&search=&status=
// Lists every tenant with its subscription (if any) — the core Subscriptions table.
export async function GET(req: NextRequest) {
  const ctx = await requireCentralPermission("BILLING", "READ");
  if (ctx instanceof Response) return ctx;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";

    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const [tenants, total] = await Promise.all([
      prismaAdmin.tenant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          subdomain: true,
          billingEmail: true,
          subscription: {
            select: {
              id: true,
              billingCycle: true,
              status: true,
              currentPeriodStart: true,
              currentPeriodEnd: true,
              nextBillingDate: true,
              cancelAtPeriodEnd: true,
              package: {
                select: { id: true, tier: true, name: true, monthlyPrice: true, annualPrice: true, currency: true },
              },
            },
          },
        },
      }),
      prismaAdmin.tenant.count({ where }),
    ]);

    return paginated(tenants.map(serializeRow), total, page, limit);
  } catch (e) {
    console.error("[billing/subscriptions] GET", e);
    return serverError(e);
  }
}

const assignSchema = z.object({
  tenantId: z.string().min(1),
  packageId: z.string().min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  status: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"]).optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  nextBillingDate: z.string().datetime().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

// POST /api/admin/billing/subscriptions
// Assign or change a tenant's package/cycle. Upserts the single subscription row.
// Does NOT create an invoice — invoicing is a separate manual action.
export async function POST(req: NextRequest) {
  const ctx = await requireCentralPermission("BILLING", "MANAGE");
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const d = parsed.data;

    // Validate referenced rows exist.
    const [tenant, pkg] = await Promise.all([
      prismaAdmin.tenant.findUnique({ where: { id: d.tenantId }, select: { id: true } }),
      prismaAdmin.billingPackage.findUnique({ where: { id: d.packageId }, select: { id: true, tier: true, isPublished: true } }),
    ]);
    if (!tenant) return err("Tenant not found", 404);
    if (!pkg) return err("Package not found", 404);
    if (!pkg.isPublished) return err("That package is unpublished — publish it before assigning.", 400);

    const common = {
      packageId: d.packageId,
      billingCycle: d.billingCycle,
      ...(d.status ? { status: d.status } : {}),
      ...(d.currentPeriodStart ? { currentPeriodStart: new Date(d.currentPeriodStart) } : {}),
      ...(d.currentPeriodEnd ? { currentPeriodEnd: new Date(d.currentPeriodEnd) } : {}),
      ...(d.nextBillingDate ? { nextBillingDate: new Date(d.nextBillingDate) } : {}),
      ...(d.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: d.cancelAtPeriodEnd } : {}),
    };

    const subscription = await prismaAdmin.tenantSubscription.upsert({
      where: { tenantId: d.tenantId },
      create: { tenantId: d.tenantId, ...common },
      update: common,
    });

    // Keep the denormalized tier/status on Tenant in sync. tier is now an
    // optional tag — only overwrite it when the package actually carries one.
    await prismaAdmin.tenant.update({
      where: { id: d.tenantId },
      data: {
        ...(pkg.tier ? { subscriptionTier: pkg.tier } : {}),
        ...(d.status ? { subscriptionStatus: d.status } : {}),
      },
    });

    await writeAuditLog({
      tenantId: d.tenantId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entity: "TenantSubscription",
      entityId: subscription.id,
      changes: d,
      ipAddress: getClientIp(req),
    });

    return ok(subscription, "Subscription saved");
  } catch (e) {
    console.error("[billing/subscriptions] POST", e);
    return serverError(e);
  }
}
