import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";

// GET /api/admin/billing/overview
// KPI snapshot for the Billing Overview tab.
export async function GET() {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeSubs, outstandingAgg, collectedAgg, recentInvoices] = await Promise.all([
      prismaAdmin.tenantSubscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        select: { billingCycle: true, package: { select: { monthlyPrice: true, annualPrice: true } } },
      }),
      prismaAdmin.invoice.aggregate({
        where: { status: { in: ["OPEN", "OVERDUE"] } },
        _sum: { total: true },
        _count: true,
      }),
      prismaAdmin.payment.aggregate({
        where: { paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prismaAdmin.invoice.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { tenant: { select: { name: true } } },
      }),
    ]);

    // MRR = sum of monthly-equivalent price across active subscriptions.
    const mrr = activeSubs.reduce((sum, s) => {
      const monthly =
        s.billingCycle === "ANNUAL"
          ? Number(s.package.annualPrice) / 12
          : Number(s.package.monthlyPrice);
      return sum + monthly;
    }, 0);

    return ok({
      mrr: +mrr.toFixed(2),
      activeSubscriptions: activeSubs.length,
      outstandingTotal: Number(outstandingAgg._sum.total ?? 0),
      outstandingCount: outstandingAgg._count,
      collectedThisMonth: Number(collectedAgg._sum.amount ?? 0),
      recentInvoices,
    });
  } catch (e) {
    console.error("[billing/overview] GET", e);
    return serverError();
  }
}
