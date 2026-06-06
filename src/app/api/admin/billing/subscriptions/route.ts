import type { NextRequest } from "next/server";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

// GET /api/admin/billing/subscriptions?page=&limit=&search=&status=
// Lists every tenant with its subscription (if any) — the core Subscriptions table.
export async function GET(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

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

    return paginated(tenants, total, page, limit);
  } catch (e) {
    console.error("[billing/subscriptions] GET", e);
    return serverError();
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
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const body = await req.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const d = parsed.data;

    // Validate referenced rows exist.
    const [tenant, pkg] = await Promise.all([
      prismaAdmin.tenant.findUnique({ where: { id: d.tenantId }, select: { id: true } }),
      prismaAdmin.billingPackage.findUnique({ where: { id: d.packageId }, select: { id: true, tier: true } }),
    ]);
    if (!tenant) return err("Tenant not found", 404);
    if (!pkg) return err("Package not found", 404);

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
      include: { package: true },
    });

    // Keep the denormalized tier/status on Tenant in sync with the subscription.
    await prismaAdmin.tenant.update({
      where: { id: d.tenantId },
      data: {
        subscriptionTier: pkg.tier,
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
    return serverError();
  }
}
