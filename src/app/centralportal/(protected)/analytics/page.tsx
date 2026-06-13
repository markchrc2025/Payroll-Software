import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { peso } from "@/lib/central/metrics";
import { getPlatformStats, getRevenueSeries } from "@/lib/central/queries";
import { PageHead, StatCard, Card, BarChart, Donut } from "../components/cp";

export const dynamic = "force-dynamic";

const TIER_COLOR: Record<string, string> = { PRO: "#e8693a", GROWTH: "#3e63a0", STARTER: "#c7913d" };
// Palette for packages without a tier tag (cycled).
const MIX_PALETTE = ["#e8693a", "#3e63a0", "#c7913d", "#4f9373", "#a0627d", "#5e7fb1", "#9a6a12"];

export default async function AnalyticsPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const [stats, revenue, pkgs, subEvents] = await Promise.all([
    getPlatformStats(),
    getRevenueSeries(),
    prismaAdmin.billingPackage.findMany({
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
      select: { name: true, tier: true, _count: { select: { subscriptions: true } } },
    }),
    prismaAdmin.subscriptionEvent.findMany({
      where: { type: { in: ["TRIAL_STARTED", "SUBSCRIBED"] } },
      select: { tenantId: true, type: true },
    }),
  ]);

  const paying = stats.active + stats.pastDue;
  const arpt = paying > 0 ? Math.round(stats.mrr / paying) : 0;
  const churn = stats.total > 0 ? Math.round((stats.cancelled / stats.total) * 1000) / 10 : 0;

  // Trial → paid: of tenants that started a trial, how many later subscribed.
  const trialed = new Set<string>();
  const subscribed = new Set<string>();
  for (const e of subEvents) {
    if (e.type === "TRIAL_STARTED") trialed.add(e.tenantId);
    else subscribed.add(e.tenantId);
  }
  const converted = [...trialed].filter((t) => subscribed.has(t)).length;
  const trialToPaid = trialed.size > 0 ? `${Math.round((converted / trialed.size) * 100)}%` : "—";

  const planMix = pkgs
    .filter((p) => p._count.subscriptions > 0)
    .map((p, i) => ({
      label: p.name,
      value: p._count.subscriptions,
      color: (p.tier && TIER_COLOR[p.tier]) || MIX_PALETTE[i % MIX_PALETTE.length],
    }));

  return (
    <>
      <PageHead title="Analytics" sub="Growth, retention and revenue trends across the platform" />

      <div className="cp-stats cp-stats-4">
        <StatCard label="Net revenue retention" value="—" icon="analytics" tone="green" sub="needs MRR history" />
        <StatCard label="Churn" value={`${churn}%`} icon="tenants" tone="amber" sub="cancelled share" />
        <StatCard label="Avg revenue / tenant" value={peso(arpt)} icon="billing" tone="orange" sub={`${paying} paying`} />
        <StatCard label="Trial → paid" value={trialToPaid} icon="support" tone="blue" sub={trialed.size > 0 ? `${trialed.size} trials` : "no trials yet"} />
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
