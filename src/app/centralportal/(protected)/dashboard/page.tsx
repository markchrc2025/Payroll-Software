import { redirect } from "next/navigation";
import Link from "next/link";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { peso, toPesos } from "@/lib/central/metrics";
import { getPlatformStats, getRevenueSeries, getTenantRows } from "@/lib/central/queries";
import { PageHead, StatCard, Card, CpIcon, BarChart } from "../components/cp";
import { TenantTable } from "../components/TenantTable";

export const dynamic = "force-dynamic";

function fmtPeso(centavos: bigint) {
  return peso(toPesos(centavos));
}
function daysUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

export default async function DashboardPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);

  const [stats, revenue, recent, overdue, trials] = await Promise.all([
    getPlatformStats(),
    getRevenueSeries(),
    getTenantRows({ take: 5 }),
    prismaAdmin.invoice.findMany({
      where: { status: "OVERDUE", tenant: { deletedAt: null } },
      orderBy: { dueAt: "asc" },
      take: 3,
      select: { id: true, invoiceNumber: true, total: true, tenant: { select: { name: true } } },
    }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null, subscriptionStatus: "TRIALING", trialEndsAt: { gte: now, lte: in7 } },
      orderBy: { trialEndsAt: "asc" },
      take: 3,
      select: { id: true, name: true, trialEndsAt: true },
    }),
  ]);

  const trialsExpiringSoon = trials.length;
  const hasAttention = overdue.length > 0 || trials.length > 0;

  return (
    <>
      <PageHead
        title="Dashboard"
        sub="Platform overview across all tenants and subscriptions"
        actions={
          <Link href="/centralportal/tenants/new" className="cp-btn cp-btn-primary">
            <CpIcon name="plus" size={16} /> Onboard tenant
          </Link>
        }
      />

      <div className="cp-stats cp-stats-5">
        <StatCard label="MRR" value={peso(stats.mrr)} icon="analytics" tone="orange" sub="recurring" />
        <StatCard label="Active tenants" value={stats.active} icon="tenants" tone="green" />
        <StatCard label="Employees paid" value={stats.employees.toLocaleString("en-PH")} icon="dashboard" tone="blue" sub="this cycle" />
        <StatCard
          label="Trialing"
          value={stats.trialing}
          icon="support"
          tone="amber"
          sub={trialsExpiringSoon ? `${trialsExpiringSoon} expiring soon` : undefined}
        />
        <StatCard label="Past due" value={stats.pastDue} icon="billing" tone="red" sub={`${peso(stats.outstanding)} outstanding`} />
      </div>

      <div className="cp-grid-2">
        <Card title="Recurring revenue" action={<span className="cp-muted">Last 12 months</span>}>
          <BarChart data={revenue.map((m) => ({ label: m.label, value: m.value, tip: peso(m.value) }))} />
        </Card>

        <Card title="Needs attention">
          {hasAttention ? (
            <ul className="cp-attn">
              {overdue.map((inv) => (
                <li key={inv.id}>
                  <span className="cp-attn-ic" data-t="red"><CpIcon name="billing" size={15} /></span>
                  <div>
                    <b>{inv.tenant.name}</b>
                    <i>Invoice {inv.invoiceNumber} overdue · {fmtPeso(inv.total)}</i>
                  </div>
                  <Link href="/centralportal/billing" className="cp-btn cp-btn-ghost">Review</Link>
                </li>
              ))}
              {trials.map((t) => (
                <li key={t.id}>
                  <span className="cp-attn-ic" data-t="amber"><CpIcon name="tenants" size={15} /></span>
                  <div>
                    <b>{t.name}</b>
                    <i>Trial ends in {t.trialEndsAt ? daysUntil(t.trialEndsAt) : 0} days</i>
                  </div>
                  <Link href={`/centralportal/tenants/${t.id}`} className="cp-btn cp-btn-ghost">Nudge</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cp-empty">Nothing needs attention — all accounts are current.</div>
          )}
        </Card>
      </div>

      <Card
        title="Recent tenants"
        action={<Link href="/centralportal/tenants" className="cp-link">View all <CpIcon name="chevR" size={14} /></Link>}
      >
        {recent.length ? <TenantTable rows={recent} compact /> : <div className="cp-empty">No tenants yet.</div>}
      </Card>
    </>
  );
}
