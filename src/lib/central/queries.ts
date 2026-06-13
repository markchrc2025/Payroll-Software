/**
 * Central Portal server queries — shared tenant-row building and platform
 * aggregates, so the Dashboard, Tenants list and Analytics all agree.
 * Server-only (imports prismaAdmin, which bypasses RLS).
 */

import "server-only";
import prismaAdmin from "@/lib/prisma-admin";
import {
  tenantMrrPesos,
  computeHealthScore,
  toPesos,
  type CentralTenantRow,
} from "./metrics";

const ROW_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  subscriptionTier: true,
  subscriptionStatus: true,
  healthScore: true,
  createdAt: true,
  _count: { select: { employees: true } },
  subscription: {
    select: {
      status: true,
      billingCycle: true,
      package: { select: { name: true, monthlyPrice: true, annualPrice: true } },
    },
  },
} as const;

type RawTenant = {
  id: string;
  name: string;
  subdomain: string | null;
  subscriptionTier: string;
  subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
  healthScore: number | null;
  createdAt: Date;
  _count: { employees: number };
  subscription: {
    status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
    billingCycle: "MONTHLY" | "ANNUAL";
    package: { name: string; monthlyPrice: bigint; annualPrice: bigint } | null;
  } | null;
};

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function toTenantRow(t: RawTenant): CentralTenantRow {
  return {
    id: t.id,
    name: t.name,
    slug: t.subdomain,
    tier: t.subscriptionTier,
    planName: t.subscription?.package?.name ?? titleCase(t.subscriptionTier),
    status: t.subscriptionStatus,
    employees: t._count.employees,
    mrr: tenantMrrPesos(t.subscription),
    health: computeHealthScore({ subscriptionStatus: t.subscriptionStatus, healthScore: t.healthScore }),
    since: t.createdAt.toISOString(),
  };
}

/** Fetch tenant rows (newest first), optional limit + text search. */
export async function getTenantRows(opts: { take?: number; search?: string } = {}): Promise<CentralTenantRow[]> {
  const tenants = await prismaAdmin.tenant.findMany({
    where: {
      deletedAt: null,
      ...(opts.search
        ? { OR: [{ name: { contains: opts.search, mode: "insensitive" } }, { subdomain: { contains: opts.search, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.take,
    select: ROW_SELECT,
  });
  return (tenants as RawTenant[]).map(toTenantRow);
}

export type PlatformStats = {
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  mrr: number; // whole pesos
  employees: number; // across active + past-due tenants
  outstanding: number; // whole pesos of OPEN/OVERDUE invoices
  collectedThisMonth: number; // whole pesos paid this calendar month
};

/** Platform-wide KPIs for the Dashboard / Billing overview. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const rows = await getTenantRows();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [outstandingAgg, collectedAgg, paidEmployees] = await Promise.all([
    prismaAdmin.invoice.aggregate({
      _sum: { total: true },
      where: { status: { in: ["OPEN", "OVERDUE"] }, tenant: { deletedAt: null } },
    }),
    prismaAdmin.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: monthStart }, tenant: { deletedAt: null } },
    }),
    prismaAdmin.employee.count({
      where: { deletedAt: null, tenant: { deletedAt: null, subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] } } },
    }),
  ]);

  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "ACTIVE").length,
    trialing: rows.filter((r) => r.status === "TRIALING").length,
    pastDue: rows.filter((r) => r.status === "PAST_DUE").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
    mrr: rows.reduce((a, r) => a + r.mrr, 0),
    employees: paidEmployees,
    outstanding: toPesos(outstandingAgg._sum.total),
    collectedThisMonth: toPesos(collectedAgg._sum.amount),
  };
}

export type MonthPoint = { label: string; value: number };

/** Trailing-12-month collected revenue (whole pesos), bucketed by payment month. */
export async function getRevenueSeries(): Promise<MonthPoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const payments = await prismaAdmin.payment.findMany({
    where: { paidAt: { gte: start }, tenant: { deletedAt: null } },
    select: { amount: true, paidAt: true },
  });

  const buckets: MonthPoint[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    index.set(key, buckets.length);
    buckets.push({ label: monthNames[d.getMonth()], value: 0 });
  }
  for (const p of payments) {
    const d = new Date(p.paidAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const i = index.get(key);
    if (i !== undefined) buckets[i].value += toPesos(p.amount);
  }
  return buckets;
}
