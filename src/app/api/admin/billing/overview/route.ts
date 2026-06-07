import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";

// GET /api/admin/billing/overview
// KPI snapshot for the Billing Overview tab. All money is centavos (Number out).
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

    // MRR = sum of monthly-equivalent centavos across active subscriptions.
    // Use Number arithmetic for the annual÷12 division to avoid BigInt truncation.
    const mrr = Math.round(
      activeSubs.reduce((sum, s) => {
        const monthly =
          s.billingCycle === "ANNUAL"
            ? Number(s.package.annualPrice) / 12
            : Number(s.package.monthlyPrice);
        return sum + monthly;
      }, 0),
    );

    return ok({
      mrr,
      activeSubscriptions: activeSubs.length,
      outstandingTotal: Number(outstandingAgg._sum.total ?? 0n),
      outstandingCount: outstandingAgg._count,
      collectedThisMonth: Number(collectedAgg._sum.amount ?? 0n),
      recentInvoices: recentInvoices.map((inv) => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.taxAmount),
        total: Number(inv.total),
      })),
    });
  } catch (e) {
    console.error("[billing/overview] GET", e);
    return serverError(e);
  }
}
