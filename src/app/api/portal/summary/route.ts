/**
 * GET /api/portal/summary
 * Returns aggregate metrics for the Central Portal dashboard.
 * Requires SUPER_ADMIN. Uses prismaAdmin (BYPASSRLS).
 */
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, unauthorized } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

export async function GET() {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [tenants, recentSignups, recentPayrollRuns] = await Promise.all([
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        subdomain: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    }),
    prismaAdmin.payrollBook.findMany({
      where: { finalizedAt: { gte: thirtyDaysAgo } },
      distinct: ["tenantId"],
      select: { tenantId: true },
    }),
  ]);

  const activeRunTenantIds = new Set(recentPayrollRuns.map((r) => r.tenantId));

  // Tier rates (₱/emp/mo)
  const TIER_RATE: Record<string, number> = { STARTER: 299, GROWTH: 249, PRO: 199 };

  let totalEmployees = 0;
  let mrr = 0;
  const tierDist: Record<string, number> = { STARTER: 0, GROWTH: 0, PRO: 0 };

  const needsAttention: {
    id: string;
    name: string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    reason: string;
    tag: string;
  }[] = [];

  const now = Date.now();

  for (const t of tenants) {
    const empCount = t._count.employees;
    totalEmployees += empCount;
    tierDist[t.subscriptionTier] = (tierDist[t.subscriptionTier] ?? 0) + 1;
    mrr += empCount * (TIER_RATE[t.subscriptionTier] ?? 0);

    // Needs attention: never ran payroll
    if (!activeRunTenantIds.has(t.id)) {
      needsAttention.push({
        id: t.id,
        name: t.name,
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
        reason: "No payroll run in 30+ days",
        tag: t.subscriptionStatus === "TRIALING" ? "Trial" : "Inactive",
      });
    }
    // Trial expiring in ≤ 5 days
    if (
      t.subscriptionStatus === "TRIALING" &&
      t.trialEndsAt &&
      t.trialEndsAt.getTime() - now <= 5 * 24 * 60 * 60 * 1000 &&
      t.trialEndsAt.getTime() > now
    ) {
      needsAttention.push({
        id: t.id,
        name: t.name,
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: t.trialEndsAt.toISOString(),
        reason: "Trial expires soon",
        tag: "Expiring",
      });
    }
    // Past due
    if (t.subscriptionStatus === "PAST_DUE") {
      needsAttention.push({
        id: t.id,
        name: t.name,
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: null,
        reason: "Invoice overdue",
        tag: "Overdue",
      });
    }
  }

  // Deduplicate needsAttention by id — one entry per tenant
  const seen = new Set<string>();
  const deduped = needsAttention.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return ok({
    totalTenants: tenants.length,
    activeTenants: tenants.filter((t) => t.subscriptionStatus === "ACTIVE").length,
    trialTenants: tenants.filter((t) => t.subscriptionStatus === "TRIALING").length,
    totalEmployees,
    healthScore:
      tenants.length > 0
        ? Math.round((activeRunTenantIds.size / tenants.length) * 100)
        : 100,
    mrr,
    tierDistribution: tierDist,
    needsAttention: deduped.slice(0, 5),
    recentSignups: recentSignups.map((t) => ({
      id: t.id,
      name: t.name,
      subdomain: t.subdomain,
      subscriptionTier: t.subscriptionTier,
      subscriptionStatus: t.subscriptionStatus,
      employeeCount: t._count.employees,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
