import { requireCentralPage } from "@/lib/central-permission";
import prismaAdmin from "@/lib/prisma-admin";
import Link from "next/link";
import { peso, toPesos } from "@/lib/central/metrics";
import { PageHead, StatCard, Card, CpIcon } from "../components/cp";
import { TicketQueue, type Ticket } from "./TicketQueue";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default async function SupportPage() {
  await requireCentralPage("SUPPORT", "READ");

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);

  const [pastDue, expiringSoon, counts, ticketRows, openCount, agents] = await Promise.all([
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
    prismaAdmin.supportTicket.findMany({
      where: { status: { in: ["OPEN", "PENDING"] } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true, ticketNumber: true, subject: true, priority: true, status: true, createdAt: true,
        tenant: { select: { id: true, name: true } },
        agent: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prismaAdmin.supportTicket.count({ where: { status: "OPEN" } }),
    prismaAdmin.user.findMany({
      where: { tenantId: null, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const statusMap = Object.fromEntries(counts.map((c) => [c.subscriptionStatus, c._count]));
  const outstandingFor = (invs: { total: bigint }[]) => toPesos(invs.reduce((a, i) => a + i.total, 0n));

  const tickets: Ticket[] = ticketRows.map((t) => ({
    id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, priority: t.priority, status: t.status,
    createdAtMs: t.createdAt.getTime(), tenant: t.tenant, agent: t.agent,
  }));
  const agentOpts = agents.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`.trim() }));
  // eslint-disable-next-line react-hooks/purity -- server component, intentional
  const nowMs = Date.now();

  return (
    <>
      <PageHead title="Support" sub="Tickets, accounts and trials that need your attention" />

      <div className="cp-stats cp-stats-4">
        <StatCard label="Open tickets" value={openCount} icon="support" tone="red" />
        <StatCard label="In queue" value={tickets.length} icon="analytics" tone="green" sub="open + pending" />
        <StatCard label="Past due accounts" value={statusMap.PAST_DUE ?? 0} icon="billing" tone="amber" />
        <StatCard label="Trials expiring · 7d" value={expiringSoon.length} icon="tenants" tone="blue" />
      </div>

      <Card title="Ticket queue" pad={false}>
        <TicketQueue tickets={tickets} agents={agentOpts} nowMs={nowMs} />
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
