import { requireCentralPage } from "@/lib/central-permission";
import prismaAdmin from "@/lib/prisma-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CpIcon } from "../../components/cp";
import TenantDetailClient from "./TenantDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function TenantDetailPage({ params }: Props) {
  await requireCentralPage("TENANTS", "READ");

  const { id } = await params;

  const [tenant, users, subEvents, ticketRows, activityRows] = await Promise.all([
    prismaAdmin.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, tradeName: true, companyCode: true,
        subdomain: true, industry: true, subscriptionTier: true,
        subscriptionStatus: true, trialEndsAt: true, billingEmail: true,
        featureFlags: true, payrollCycle: true, payDay1: true, payDay2: true,
        thirteenthMonthBasis: true, statutoryCutoffRule: true, workingDaysDenominator: true,
        contactEmail: true, contactPhone: true, tinNumber: true,
        address: true, city: true, province: true, zipCode: true,
        createdAt: true, updatedAt: true,
        _count: { select: { employees: true, users: true, payrollBooks: true } },
      },
    }),
    prismaAdmin.user.findMany({
      where: { tenantId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
    }),
    prismaAdmin.subscriptionEvent.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, detail: true, createdAt: true },
    }),
    prismaAdmin.supportTicket.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, ticketNumber: true, subject: true, priority: true, status: true, createdAt: true,
        agent: { select: { firstName: true, lastName: true } },
      },
    }),
    prismaAdmin.centralAuditEvent.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, actorName: true, action: true, target: true, kind: true, createdAt: true },
    }),
  ]);

  if (!tenant) notFound();

  const fmtWhen = (d: Date) =>
    d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  const SUB_LABEL: Record<string, string> = {
    TRIAL_STARTED: "Started trial", SUBSCRIBED: "Subscribed", UPGRADED: "Upgraded",
    DOWNGRADED: "Downgraded", RENEWED: "Renewed", PAYMENT_FAILED: "Payment failed",
    CANCELLED: "Cancelled", REACTIVATED: "Reactivated",
  };
  const SUB_TONE: Record<string, string> = {
    TRIAL_STARTED: "blue", SUBSCRIBED: "orange", UPGRADED: "orange", DOWNGRADED: "orange",
    RENEWED: "orange", PAYMENT_FAILED: "red", CANCELLED: "red", REACTIVATED: "blue",
  };

  // Subscription history: real logged events (newest first) + a genesis entry
  // synthesized from the tenant's real onboarding date.
  const subHistory = [
    ...subEvents.map((e) => ({
      id: e.id,
      label: SUB_LABEL[e.type] ?? e.type,
      detail: e.detail ?? "",
      when: fmtWhen(e.createdAt),
      tone: SUB_TONE[e.type] ?? "slate",
    })),
    {
      id: "genesis",
      label: tenant.subscriptionStatus === "TRIALING" ? "Started trial" : "Subscribed",
      detail: `${tenant.subscriptionTier} plan`,
      when: fmtWhen(tenant.createdAt),
      tone: "blue",
    },
  ];

  const tickets = ticketRows.map((t) => ({
    id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, priority: t.priority, status: t.status,
    when: fmtWhen(t.createdAt),
    agent: t.agent ? `${t.agent.firstName} ${t.agent.lastName}`.trim() : null,
  }));

  const activity = activityRows.map((a) => ({
    id: a.id, who: a.actorName, action: a.action, target: a.target,
    when: a.createdAt.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    tone: a.kind.toLowerCase(),
  }));

  // Serialize Dates to strings and narrow JSON for the client component
  const tenantData = {
    ...tenant,
    trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    featureFlags: (tenant.featureFlags ?? {}) as unknown as Record<string, boolean>,
  };
  const usersData = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <>
      <div className="cp-crumb">
        <Link href="/centralportal/tenants">Tenants</Link>
        <CpIcon name="chevR" size={14} />
        <span>{tenant.name}</span>
      </div>
      <TenantDetailClient
        tenant={tenantData}
        users={usersData}
        subHistory={subHistory}
        tickets={tickets}
        activity={activity}
      />
    </>
  );
}
