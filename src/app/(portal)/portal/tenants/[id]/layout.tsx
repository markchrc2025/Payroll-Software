"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  tradeName: string | null;
  subdomain: string | null;
  industry: string | null;
  billingEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  trialEndsAt: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  featureFlags: Record<string, boolean>;
  payrollCycle: string | null;
  createdAt: string;
  _count: { employees: number; users: number; payrollBooks: number };
}

const TIER_PILL: Record<SubscriptionTier, string> = {
  STARTER: "bg-gray-100 text-gray-700",
  GROWTH:  "bg-blue-50 text-blue-700",
  PRO:     "bg-violet-100 text-violet-700",
};

const STATUS_PILL: Record<SubscriptionStatus, { cls: string; label: string }> = {
  ACTIVE:    { cls: "bg-green-50 text-green-700",  label: "Active" },
  TRIALING:  { cls: "bg-amber-50 text-amber-800",  label: "Trial" },
  PAST_DUE:  { cls: "bg-amber-50 text-amber-800",  label: "Overdue" },
  CANCELLED: { cls: "bg-red-50 text-red-700",      label: "Cancelled" },
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const TIER_RATE: Record<string, number> = { STARTER: 299, GROWTH: 249, PRO: 199 };

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export default function TenantDetailLayout({ params, children }: Props) {
  const { id } = use(params);
  const pathname = usePathname();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error("Not found");
      const json = await res.json();
      setTenant(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const TABS = [
    { label: "Overview",  href: `/portal/tenants/${id}` },
    { label: "Features",  href: `/portal/tenants/${id}/features` },
    { label: "Billing",   href: `/portal/tenants/${id}/billing` },
    { label: "Subscription", href: `/portal/tenants/${id}/subscription` },
  ];

  function isTabActive(href: string) {
    if (href === `/portal/tenants/${id}`) return pathname === href;
    return pathname === href;
  }

  const monthlyFee = tenant
    ? tenant._count.employees * (TIER_RATE[tenant.subscriptionTier] ?? 0)
    : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/portal/tenants"
          className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-70"
          style={{ color: "#6B7280" }}
        >
          <ArrowLeft size={12} /> All tenants
        </Link>
      </div>

      {/* Tenant header */}
      <div
        className="flex items-center gap-3 px-5 py-4 mb-4 rounded-[10px]"
        style={{ background: "white", border: "0.5px solid #E5E7EB" }}
      >
        {loading ? (
          <>
            <Skeleton className="w-[38px] h-[38px] rounded-[10px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </>
        ) : tenant ? (
          <>
            <div
              className="flex items-center justify-center rounded-[10px] text-[14px] font-semibold shrink-0 text-blue-700 bg-blue-100"
              style={{ width: 38, height: 38 }}
            >
              {initials(tenant.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold truncate" style={{ color: "#111827" }}>{tenant.name}</p>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>
                {tenant.subdomain ?? tenant.id}
                {tenant.createdAt && <> &nbsp;·&nbsp; Since {fmtDate(tenant.createdAt)}</>}
              </p>
            </div>
            <span className={`text-[11px] rounded-full px-2.5 py-1 font-medium ${TIER_PILL[tenant.subscriptionTier]}`}>
              {tenant.subscriptionTier.charAt(0) + tenant.subscriptionTier.slice(1).toLowerCase()}
            </span>
            <span className={`text-[11px] rounded-full px-2.5 py-1 ${STATUS_PILL[tenant.subscriptionStatus].cls}`}>
              {STATUS_PILL[tenant.subscriptionStatus].label}
            </span>
            <button
              onClick={load}
              className="ml-2 flex items-center gap-1 text-[10px] rounded-[6px] px-2.5 py-1.5 border transition-colors hover:bg-gray-50"
              style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "#6B7280" }}>Tenant not found.</p>
        )}
      </div>

      {/* Stat row */}
      {!loading && tenant && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Employees",    value: tenant._count.employees },
            { label: "Payroll runs", value: tenant._count.payrollBooks },
            { label: "Monthly fee",  value: monthlyFee ? `₱${monthlyFee.toLocaleString()}` : "—" },
            { label: "Users",        value: tenant._count.users },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[8px] p-3"
              style={{ background: "#F8FAFC", border: "0.5px solid #E5E7EB" }}
            >
              <p className="text-[10px] mb-1" style={{ color: "#6B7280" }}>{s.label}</p>
              <p className="text-[18px] font-semibold" style={{ color: "#111827" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex mb-4"
        style={{ borderBottom: "0.5px solid #E5E7EB" }}
      >
        {TABS.map((tab) => {
          const active = isTabActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-4 py-2 text-[12px] transition-colors"
              style={{
                color: active ? "#1E3A5F" : "#6B7280",
                fontWeight: active ? 500 : 400,
                borderBottom: active ? "2px solid #1E3A5F" : "2px solid transparent",
                marginBottom: "-0.5px",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      {children}
    </div>
  );
}
