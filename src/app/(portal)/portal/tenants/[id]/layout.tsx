"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Shield, Ban, RefreshCw, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

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
  tinNumber: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  createdAt: string;
  _count: { employees: number; users: number; payrollBooks: number };
}

const TIER_BADGE: Record<SubscriptionTier, { bg: string; color: string; label: string }> = {
  STARTER: { bg: "#F3F4F6", color: "#374151",  label: "Starter plan" },
  GROWTH:  { bg: "#EFF6FF", color: "#1D4ED8",  label: "Growth plan"  },
  PRO:     { bg: "#F5F3FF", color: "#6D28D9",  label: "Pro plan"     },
};

const STATUS_BADGE: Record<SubscriptionStatus, { bg: string; color: string; label: string }> = {
  ACTIVE:    { bg: "#ECFDF5", color: "#065F46", label: "Active"     },
  TRIALING:  { bg: "#FFFBEB", color: "#92400E", label: "Trial"      },
  PAST_DUE:  { bg: "#FFFBEB", color: "#92400E", label: "Past due"   },
  CANCELLED: { bg: "#FEF2F2", color: "#991B1B", label: "Cancelled"  },
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export default function TenantDetailLayout({ params, children }: Props) {
  const { id } = use(params);
  const pathname = usePathname();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);

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

  async function handleSuspend() {
    if (!tenant) return;
    const isSuspended = tenant.subscriptionStatus === "CANCELLED";
    const action = isSuspended ? "Reactivate" : "Suspend";
    if (!window.confirm(`${action} tenant "${tenant.name}"?`)) return;
    setSuspending(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: isSuspended ? "ACTIVE" : "CANCELLED" }),
      });
      if (!res.ok) { toast.error("Failed to update tenant"); return; }
      toast.success(`Tenant ${isSuspended ? "reactivated" : "suspended"}`);
      load();
    } finally {
      setSuspending(false);
    }
  }

  const TABS = [
    { label: "Overview",       href: `/portal/tenants/${id}` },
    { label: "Payroll setup",  href: `/portal/tenants/${id}/payroll` },
    { label: "HR modules",     href: `/portal/tenants/${id}/features` },
    { label: "Compliance",     href: `/portal/tenants/${id}/compliance` },
    { label: "Notifications",  href: `/portal/tenants/${id}/notifications` },
    { label: "Access & roles", href: `/portal/tenants/${id}/access` },
  ];

  function isTabActive(href: string) {
    return pathname === href;
  }

  const isSuspended = tenant?.subscriptionStatus === "CANCELLED";

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Breadcrumb topbar */}
      <div
        className="flex items-center gap-1.5 px-1 mb-4 text-[11px]"
        style={{ color: "#6B7280" }}
      >
        <Link href="/portal/tenants" className="hover:underline" style={{ color: "#6B7280" }}>
          Tenants
        </Link>
        <ChevronRight size={11} style={{ color: "#9CA3AF" }} />
        <span style={{ color: "#111827" }}>
          {loading ? "Loading…" : (tenant?.name ?? id)}
        </span>
      </div>

      {/* Tenant header card */}
      <div
        className="flex items-center gap-4 px-5 py-4 mb-4 rounded-[10px]"
        style={{ background: "white", border: "0.5px solid #E5E7EB" }}
      >
        {loading ? (
          <>
            <Skeleton className="w-10 h-10 rounded-[10px] shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </>
        ) : tenant ? (
          <>
            {/* Avatar */}
            <div
              className="flex items-center justify-center rounded-[10px] text-[15px] font-semibold shrink-0 text-white"
              style={{ width: 40, height: 40, background: "#1E3A5F" }}
            >
              {initials(tenant.name)}
            </div>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium truncate" style={{ color: "#111827" }}>{tenant.name}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: "#6B7280" }}>
                {tenant.tinNumber && <>{tenant.tinNumber} &nbsp;·&nbsp;</>}
                {tenant.province && <>{tenant.province} &nbsp;·&nbsp;</>}
                {tenant.subdomain
                  ? <>app.sentire.ph/<span style={{ color: "#1E3A5F" }}>{tenant.subdomain}</span></>
                  : tenant.id}
              </p>
            </div>

            {/* Status + Plan badges */}
            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const b = STATUS_BADGE[tenant.subscriptionStatus];
                return (
                  <span
                    className="text-[10px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: b.bg, color: b.color }}
                  >
                    {b.label}
                  </span>
                );
              })()}
              {(() => {
                const b = TIER_BADGE[tenant.subscriptionTier];
                return (
                  <span
                    className="text-[10px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: b.bg, color: b.color }}
                  >
                    {b.label}
                  </span>
                );
              })()}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 ml-1">
              {tenant.contactEmail && (
                <a
                  href={`mailto:${tenant.contactEmail}`}
                  className="flex items-center gap-1.5 text-[11px] font-medium rounded-[7px] px-3 py-1.5 border transition-colors hover:bg-gray-50"
                  style={{ borderColor: "#E5E7EB", color: "#374151", background: "white" }}
                >
                  <Mail size={12} /> Email admin
                </a>
              )}
              <button
                className="flex items-center gap-1.5 text-[11px] font-medium rounded-[7px] px-3 py-1.5 text-white transition-opacity hover:opacity-90"
                style={{ background: "#1E3A5F" }}
                onClick={() => toast.info("Impersonation not yet implemented")}
              >
                <Shield size={12} /> Impersonate
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspending}
                className="flex items-center gap-1.5 text-[11px] font-medium rounded-[7px] px-3 py-1.5 border transition-colors hover:bg-red-50 disabled:opacity-60"
                style={{ borderColor: "#FECACA", color: isSuspended ? "#065F46" : "#991B1B", background: isSuspended ? "#ECFDF5" : "white" }}
              >
                <Ban size={12} /> {isSuspended ? "Reactivate" : "Suspend"}
              </button>
              <button
                onClick={load}
                className="flex items-center gap-1 text-[10px] rounded-[6px] px-2.5 py-1.5 border transition-colors hover:bg-gray-50"
                style={{ borderColor: "#E5E7EB", color: "#9CA3AF" }}
                title="Refresh"
              >
                <RefreshCw size={11} />
              </button>
            </div>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "#6B7280" }}>Tenant not found.</p>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex mb-5" style={{ borderBottom: "0.5px solid #E5E7EB" }}>
        {TABS.map((tab) => {
          const active = isTabActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-4 py-2.5 text-[12px] transition-colors whitespace-nowrap"
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

      {/* Tab content — pass tenant down via context or just render */}
      {children}
    </div>
  );
}
