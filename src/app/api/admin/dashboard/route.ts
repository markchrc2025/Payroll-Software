/**
 * GET /api/admin/dashboard — aggregated stats for the Super Admin dashboard.
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, unauthorized } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

// Per-employee monthly rates for MRR estimate
const TIER_RATE: Record<string, number> = {
  STARTER: 299,
  GROWTH: 249,
  PRO: 199,
};

export async function GET() {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [allTenants, newThisMonth] = await Promise.all([
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        subdomain: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        featureFlags: true,
        _count: { select: { employees: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prismaAdmin.tenant.count({
      where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const totalTenants = allTenants.length;
  const totalEmployees = allTenants.reduce((s, t) => s + t._count.employees, 0);

  // Estimated MRR: sum (employees * rate) for ACTIVE tenants
  const mrr = allTenants
    .filter((t) => t.subscriptionStatus === "ACTIVE")
    .reduce((s, t) => s + t._count.employees * (TIER_RATE[t.subscriptionTier] ?? 0), 0);

  // Requires attention: PAST_DUE, trials expiring within 3 days, or suspended
  const attention = allTenants
    .filter((t) => {
      if (t.subscriptionStatus === "PAST_DUE") return true;
      if (t.subscriptionStatus === "CANCELLED") return true;
      if (
        t.subscriptionStatus === "TRIALING" &&
        t.trialEndsAt &&
        new Date(t.trialEndsAt) <= threeDaysFromNow
      )
        return true;
      return false;
    })
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      name: t.name,
      subdomain: t.subdomain,
      status: t.subscriptionStatus,
      trialEndsAt: t.trialEndsAt,
    }));

  // Recent signups (last 5)
  const recentSignups = allTenants.slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    subdomain: t.subdomain,
    subscriptionTier: t.subscriptionTier,
    subscriptionStatus: t.subscriptionStatus,
    employeeCount: t._count.employees,
    createdAt: t.createdAt,
  }));

  const healthPct =
    totalTenants > 0
      ? Math.round(((totalTenants - attention.length) / totalTenants) * 100)
      : 100;

  return ok({
    totalTenants,
    newThisMonth,
    totalEmployees,
    mrr,
    attentionCount: attention.length,
    healthPct,
    attention,
    recentSignups,
  });
}
