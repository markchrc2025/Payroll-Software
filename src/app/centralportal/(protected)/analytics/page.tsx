import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { peso } from "@/lib/central/metrics";
import { getPlatformStats, getRevenueSeries } from "@/lib/central/queries";
import { PageHead, StatCard, Card, BarChart, Donut } from "../components/cp";

export const dynamic = "force-dynamic";

const TIER_COLOR: Record<string, string> = { PRO: "#e8693a", GROWTH: "#3e63a0", STARTER: "#c7913d" };
const TIER_LABEL: Record<string, string> = { PRO: "Pro", GROWTH: "Growth", STARTER: "Starter" };

export default async function AnalyticsPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const [stats, revenue, byTier] = await Promise.all([
    getPlatformStats(),
    getRevenueSeries(),
    prismaAdmin.tenant.groupBy({
      by: ["subscriptionTier"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const paying = stats.active + stats.pastDue;
  const arpt = paying > 0 ? Math.round(stats.mrr / paying) : 0;
  const churn = stats.total > 0 ? Math.round((stats.cancelled / stats.total) * 1000) / 10 : 0;

  const planMix = (["PRO", "GROWTH", "STARTER"] as const).map((tier) => ({
    label: TIER_LABEL[tier],
    value: byTier.find((g) => g.subscriptionTier === tier)?._count._all ?? 0,
    color: TIER_COLOR[tier],
  }));

  return (
    <>
      <PageHead title="Analytics" sub="Growth, retention and revenue trends across the platform" />

      <div className="cp-stats cp-stats-4">
        <StatCard label="Net revenue retention" value="—" icon="analytics" tone="green" sub="from next release" />
        <StatCard label="Churn" value={`${churn}%`} icon="tenants" tone="amber" sub="cancelled share" />
        <StatCard label="Avg revenue / tenant" value={peso(arpt)} icon="billing" tone="orange" sub={`${paying} paying`} />
        <StatCard label="Trial → paid" value="—" icon="support" tone="blue" sub="from next release" />
      </div>

      <div className="cp-grid-2">
        <Card title="MRR growth" action={<span className="cp-muted">Collected · 12 months</span>}>
          <BarChart data={revenue.map((m) => ({ label: m.label, value: m.value, tip: peso(m.value) }))} />
        </Card>

        <Card title="Plan mix">
          <div className="cp-donut-wrap">
            <Donut data={planMix} centerLabel="tenants" />
            <ul className="cp-legend">
              {planMix.map((p) => (
                <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.value}</b></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
