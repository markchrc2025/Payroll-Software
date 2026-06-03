"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Building2, Users, Coins, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Summary {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  totalEmployees: number;
  mrr: number;
  tierDistribution: Record<SubscriptionTier, number>;
}

interface TenantRow {
  id: string;
  name: string;
  subdomain: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  billingEmail: string | null;
  _count: { employees: number };
}

const TIER_RATE: Record<SubscriptionTier, number> = {
  STARTER: 299,
  GROWTH: 249,
  PRO: 199,
};

const TIER_PILL: Record<SubscriptionTier, string> = {
  STARTER: "bg-gray-100 text-gray-700",
  GROWTH: "bg-blue-50 text-blue-700",
  PRO: "bg-violet-100 text-violet-700",
};

const STATUS_PILL: Record<SubscriptionStatus, { cls: string; label: string }> = {
  ACTIVE: { cls: "bg-green-50 text-green-700", label: "Active" },
  TRIALING: { cls: "bg-amber-50 text-amber-800", label: "Trial" },
  PAST_DUE: { cls: "bg-red-50 text-red-700", label: "Overdue" },
  CANCELLED: { cls: "bg-gray-100 text-gray-500", label: "Cancelled" },
};

const TIER_ORDER: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];

function fmtPeso(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${Math.round(n / 1000)}K`;
  return `₱${n.toLocaleString()}`;
}

export default function ProviderBillingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, tenRes] = await Promise.all([
        fetch("/api/portal/summary"),
        fetch("/api/admin/tenants?limit=100"),
      ]);
      const sumJson = await sumRes.json();
      const tenJson = await tenRes.json();
      setSummary(sumJson.data ?? null);
      setTenants(tenJson.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sort by MRR contribution descending
  const sorted = [...tenants].sort(
    (a, b) =>
      b._count.employees * TIER_RATE[b.subscriptionTier] -
      a._count.employees * TIER_RATE[a.subscriptionTier],
  );

  // Tier breakdown bars
  const totalForBar = summary
    ? Object.values(summary.tierDistribution).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "#111827" }}>
            Provider Billing
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
            Portfolio-level revenue and subscription overview
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] border transition-colors hover:bg-gray-50"
          style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          {
            label: "Monthly Revenue",
            icon: Coins,
            value: loading ? null : summary ? fmtPeso(summary.mrr) : "—",
            sub: loading ? null : "Estimated MRR",
          },
          {
            label: "Paying tenants",
            icon: Building2,
            value: loading ? null : summary ? summary.activeTenants : "—",
            sub: loading ? null : summary
              ? `${summary.trialTenants} on trial`
              : "—",
          },
          {
            label: "Total employees",
            icon: Users,
            value: loading ? null : summary
              ? summary.totalEmployees.toLocaleString()
              : "—",
            sub: loading ? null : "Billable headcount",
          },
          {
            label: "Avg. revenue / tenant",
            icon: TrendingUp,
            value: loading
              ? null
              : summary && summary.activeTenants > 0
              ? fmtPeso(Math.round(summary.mrr / summary.activeTenants))
              : "—",
            sub: loading ? null : "Active tenants only",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] p-4"
            style={{ background: "white", border: "0.5px solid #E5E7EB" }}
          >
            <p
              className="flex items-center gap-1.5 text-[11px] mb-1.5"
              style={{ color: "#6B7280" }}
            >
              <s.icon size={13} /> {s.label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-20 mb-1" />
            ) : (
              <p
                className="text-[22px] font-semibold leading-none mb-1"
                style={{ color: "#111827" }}
              >
                {s.value}
              </p>
            )}
            {loading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              <p className="text-[10px]" style={{ color: "#6B7280" }}>
                {s.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {/* Plan distribution */}
        <div
          className="rounded-[10px] p-4"
          style={{ background: "white", border: "0.5px solid #E5E7EB" }}
        >
          <p className="text-[12px] font-semibold mb-4" style={{ color: "#111827" }}>
            Plan distribution
          </p>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {TIER_ORDER.map((t) => {
                const count = summary?.tierDistribution[t] ?? 0;
                const pct = totalForBar > 0 ? (count / totalForBar) * 100 : 0;
                const tierMrr = tenants
                  .filter((ten) => ten.subscriptionTier === t)
                  .reduce(
                    (sum, ten) =>
                      sum + ten._count.employees * TIER_RATE[t],
                    0,
                  );
                return (
                  <div key={t}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px]" style={{ color: "#374151" }}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </span>
                      <span className="text-[11px]" style={{ color: "#6B7280" }}>
                        {count} tenant{count !== 1 ? "s" : ""} · {fmtPeso(tierMrr)}
                      </span>
                    </div>
                    <div
                      className="h-[6px] rounded-full overflow-hidden"
                      style={{ background: "#E5E7EB" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            t === "PRO"
                              ? "#6D28D9"
                              : t === "GROWTH"
                              ? "#2563EB"
                              : "#6B7280",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div
          className="rounded-[10px] p-4 col-span-2"
          style={{ background: "white", border: "0.5px solid #E5E7EB" }}
        >
          <p className="text-[12px] font-semibold mb-3" style={{ color: "#111827" }}>
            Status breakdown
          </p>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-[8px]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"] as SubscriptionStatus[]).map(
                (s) => {
                  const count = tenants.filter(
                    (t) => t.subscriptionStatus === s,
                  ).length;
                  return (
                    <div
                      key={s}
                      className="rounded-[8px] p-3"
                      style={{ background: "#F8FAFC", border: "0.5px solid #E5E7EB" }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[s].cls}`}
                        >
                          {STATUS_PILL[s].label}
                        </span>
                      </div>
                      <p
                        className="text-[22px] font-semibold"
                        style={{ color: "#111827" }}
                      >
                        {count}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-tenant revenue table */}
      <div
        className="rounded-[10px] overflow-hidden"
        style={{ background: "white", border: "0.5px solid #E5E7EB" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "0.5px solid #E5E7EB" }}
        >
          <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>
            Revenue by tenant
          </p>
          <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
            Sorted by monthly contribution
          </p>
        </div>
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th
                className="text-left px-4 py-2.5 text-[10px] font-medium w-[30%]"
                style={{ color: "#6B7280" }}
              >
                Company
              </th>
              <th
                className="text-left px-3 py-2.5 text-[10px] font-medium w-[14%]"
                style={{ color: "#6B7280" }}
              >
                Plan
              </th>
              <th
                className="text-left px-3 py-2.5 text-[10px] font-medium w-[12%]"
                style={{ color: "#6B7280" }}
              >
                Emp.
              </th>
              <th
                className="text-left px-3 py-2.5 text-[10px] font-medium w-[13%]"
                style={{ color: "#6B7280" }}
              >
                Status
              </th>
              <th
                className="text-left px-3 py-2.5 text-[10px] font-medium w-[18%]"
                style={{ color: "#6B7280" }}
              >
                Monthly fee
              </th>
              <th
                className="text-left px-3 py-2.5 text-[10px] font-medium w-[13%]"
                style={{ color: "#6B7280" }}
              >
                Billing email
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                    {[1, 2, 3, 4, 5, 6].map((c) => (
                      <td key={c} className="px-4 py-3">
                        <Skeleton className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.length === 0
              ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-10 text-[12px]"
                    style={{ color: "#9CA3AF" }}
                  >
                    No tenants found.
                  </td>
                </tr>
              )
              : sorted.map((t, idx) => {
                  const fee = t._count.employees * TIER_RATE[t.subscriptionTier];
                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom:
                          idx < sorted.length - 1
                            ? "0.5px solid #F3F4F6"
                            : "none",
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <p
                          className="text-[12px] font-medium truncate"
                          style={{ color: "#111827" }}
                        >
                          {t.name}
                        </p>
                        {t.subdomain && (
                          <p
                            className="text-[10px] truncate"
                            style={{ color: "#9CA3AF" }}
                          >
                            {t.subdomain}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-[10px] rounded-full px-2 py-0.5 ${TIER_PILL[t.subscriptionTier]}`}
                        >
                          {t.subscriptionTier.charAt(0) +
                            t.subscriptionTier.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-[12px]"
                        style={{ color: "#374151" }}
                      >
                        {t._count.employees}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[t.subscriptionStatus].cls}`}
                        >
                          {STATUS_PILL[t.subscriptionStatus].label}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-[12px] font-medium"
                        style={{ color: "#111827" }}
                      >
                        {t.subscriptionStatus === "ACTIVE" || t.subscriptionStatus === "TRIALING"
                          ? `₱${fee.toLocaleString()}`
                          : <span style={{ color: "#9CA3AF" }}>—</span>}
                      </td>
                      <td
                        className="px-3 py-2.5 text-[10px] truncate"
                        style={{ color: "#6B7280" }}
                      >
                        {t.billingEmail ?? (
                          <span style={{ color: "#D1D5DB" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
