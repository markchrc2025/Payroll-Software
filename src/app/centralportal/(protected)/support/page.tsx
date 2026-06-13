import { requireCentralPage } from "@/lib/central-permission";
import prismaAdmin from "@/lib/prisma-admin";
import Link from "next/link";
import { peso, toPesos } from "@/lib/central/metrics";
import { PageHead, StatCard, Card, CpIcon } from "../components/cp";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default async function SupportPage() {
  await requireCentralPage("SUPPORT", "READ");

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);

  const [pastDue, expiringSoon, counts] = await Promise.all([
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null, subscriptionStatus: "PAST_DUE" },
      select: {
        id: true, name: true, billingEmail: true,
        invoices: { where: { status: { in: ["OPEN", "OVERDUE"] } }, select: { total: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null, subscriptionStatus: "TRIALING", trialEndsAt: { gte: now, lte: in7 } },
      select: { id: true, name: true, trialEndsAt: true },
      orderBy: { trialEndsAt: "asc" },
      take: 10,
    }),
    prismaAdmin.tenant.groupBy({ by: ["subscriptionStatus"], where: { deletedAt: null }, _count: true }),
  ]);

  const statusMap = Object.fromEntries(counts.map((c) => [c.subscriptionStatus, c._count]));
  const outstandingFor = (invs: { total: bigint }[]) => toPesos(invs.reduce((a, i) => a + i.total, 0n));

  return (
    <>
      <PageHead title="Support" sub="Tickets, accounts and trials that need your attention" />

      <div className="cp-stats cp-stats-4">
        <StatCard label="Open tickets" value="—" icon="support" tone="red" sub="from next release" />
        <StatCard label="Avg first response" value="—" icon="analytics" tone="green" sub="from next release" />
        <StatCard label="Past due accounts" value={statusMap.PAST_DUE ?? 0} icon="billing" tone="amber" />
        <StatCard label="Trials expiring · 7d" value={expiringSoon.length} icon="tenants" tone="blue" />
      </div>

      <Card title="Ticket queue" action={<span className="cp-muted">Coming soon</span>}>
        <div className="cp-empty">
          Support ticketing arrives in the next release. Until then, the accounts that need a nudge are below.
        </div>
      </Card>

      <div className="cp-grid-2">
        <Card title={`Past due accounts (${pastDue.length})`}>
          {pastDue.length === 0 ? (
            <div className="cp-empty">All clear — no overdue accounts.</div>
          ) : (
            <ul className="cp-attn">
              {pastDue.map((t) => (
                <li key={t.id}>
                  <span className="cp-attn-ic" data-t="red"><CpIcon name="tenants" size={15} /></span>
                  <div>
                    <b>{t.name}</b>
                    <i>{peso(outstandingFor(t.invoices))} outstanding{t.billingEmail ? ` · ${t.billingEmail}` : ""}</i>
                  </div>
                  <Link href={`/centralportal/tenants/${t.id}`} className="cp-btn cp-btn-ghost">Contact</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Trials expiring soon (${expiringSoon.length})`}>
          {expiringSoon.length === 0 ? (
            <div className="cp-empty">No trials expiring in the next 7 days.</div>
          ) : (
            <ul className="cp-attn">
              {expiringSoon.map((t) => (
                <li key={t.id}>
                  <span className="cp-attn-ic" data-t="amber"><CpIcon name="tenants" size={15} /></span>
                  <div>
                    <b>{t.name}</b>
                    <i>Ends {fmtDate(t.trialEndsAt)}</i>
                  </div>
                  <Link href={`/centralportal/tenants/${t.id}`} className="cp-btn cp-btn-ghost">Nudge</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
