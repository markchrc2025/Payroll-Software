"use client";

import { use, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, PlayCircle, Ticket } from "lucide-react";

type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  tradeName: string | null;
  companyCode: string | null;
  subdomain: string | null;
  industry: string | null;
  billingEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tinNumber: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  trialEndsAt: string | null;
  subscriptionTier: string;
  subscriptionStatus: SubscriptionStatus;
  payrollCycle: string | null;
  createdAt: string;
  _count: { employees: number; users: number; payrollBooks: number };
}

const TIER_RATE: Record<string, number> = { STARTER: 700, GROWTH: 950 };
const TIER_LABELS: Record<string, string> = { STARTER: "Starter", GROWTH: "Growth", PRO: "Pro / Enterprise" };

const STATUS_INFO: Record<SubscriptionStatus, { bg: string; color: string; label: string }> = {
  ACTIVE:    { bg: "#ECFDF5", color: "#065F46", label: "Active"    },
  TRIALING:  { bg: "#FFFBEB", color: "#92400E", label: "Trial"     },
  PAST_DUE:  { bg: "#FEF2F2", color: "#991B1B", label: "Past due"  },
  CANCELLED: { bg: "#F3F4F6", color: "#374151", label: "Cancelled" },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-[6px]" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
      <span className="text-[11px] shrink-0 mr-4" style={{ color: "#6B7280" }}>{label}</span>
      <span className="text-[11px] text-right" style={{ color: "#374151" }}>{value}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] px-4 py-3.5"
      style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
      <div className="flex items-center justify-center rounded-[8px] shrink-0"
        style={{ width: 34, height: 34, background: "#EFF6FF" }}>
        <Icon size={16} style={{ color: "#1E3A5F" }} />
      </div>
      <div>
        <p className="text-[18px] font-semibold leading-none" style={{ color: "#111827" }}>{value}</p>
        <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>{label}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function TenantOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        setTenant(j.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  const monthlyFee = tenant ? (TIER_RATE[tenant.subscriptionTier] ?? null) : null;
  const statusInfo = tenant ? STATUS_INFO[tenant.subscriptionStatus] : null;

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
              <Skeleton className="h-7 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : tenant ? (
          <>
            <StatCard icon={Users} label="Active employees" value={tenant._count.employees} />
            <StatCard icon={PlayCircle} label="Payroll runs" value={tenant._count.payrollBooks}
              sub={tenant._count.payrollBooks === 0 ? "No runs yet" : undefined} />
            <StatCard icon={Ticket} label="Open tickets" value={0} sub="Support tickets" />
          </>
        ) : null}
      </div>

      {/* 2-col body */}
      <div className="grid grid-cols-5 gap-4">
        {/* Left: Company info card (3/5) */}
        <div className="col-span-3">
          <div className="rounded-[10px] p-4 mb-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
            <p className="text-[12px] font-medium mb-3" style={{ color: "#111827" }}>Company information</p>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
            ) : tenant ? (
              <>
                <InfoRow label="Legal name" value={tenant.name} />
                {tenant.tradeName && <InfoRow label="Trade name" value={tenant.tradeName} />}
                <InfoRow label="Industry" value={tenant.industry ?? <span style={{ color: "#9CA3AF" }}>—</span>} />
                <InfoRow label="TIN" value={tenant.tinNumber ?? <span style={{ color: "#9CA3AF" }}>—</span>} />
                <InfoRow label="Address" value={[tenant.address, tenant.city, tenant.province, tenant.zipCode].filter(Boolean).join(", ") || <span style={{ color: "#9CA3AF" }}>—</span>} />
                <InfoRow label="Contact email" value={
                  tenant.contactEmail
                    ? <a href={`mailto:${tenant.contactEmail}`} className="hover:underline" style={{ color: "#1E3A5F" }}>{tenant.contactEmail}</a>
                    : <span style={{ color: "#9CA3AF" }}>—</span>
                } />
                <InfoRow label="Contact phone" value={tenant.contactPhone ?? <span style={{ color: "#9CA3AF" }}>—</span>} />
                <InfoRow label="Billing email" value={
                  tenant.billingEmail
                    ? <a href={`mailto:${tenant.billingEmail}`} className="hover:underline" style={{ color: "#1E3A5F" }}>{tenant.billingEmail}</a>
                    : <span style={{ color: "#9CA3AF" }}>—</span>
                } />
                <InfoRow label="Company Code" value={
                  tenant.companyCode
                    ? <span className="font-mono font-medium tracking-widest" style={{ color: "#1E3A5F" }}>{tenant.companyCode}</span>
                    : <span style={{ color: "#9CA3AF" }}>—</span>
                } />
                <InfoRow label="Subdomain" value={
                  tenant.subdomain
                    ? <span>app.sentire.ph/<span style={{ color: "#1E3A5F" }}>{tenant.subdomain}</span></span>
                    : <span style={{ color: "#9CA3AF" }}>—</span>
                } />
                <InfoRow label="Created" value={fmtDate(tenant.createdAt)} />
              </>
            ) : (
              <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Unable to load data.</p>
            )}
          </div>
        </div>

        {/* Right: Subscription + Activity (2/5) */}
        <div className="col-span-2 flex flex-col gap-4">
          {/* Subscription card */}
          <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
            <p className="text-[12px] font-medium mb-3" style={{ color: "#111827" }}>Subscription</p>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
            ) : tenant ? (
              <>
                <InfoRow label="Plan" value={<span className="font-medium">{TIER_LABELS[tenant.subscriptionTier] ?? tenant.subscriptionTier}</span>} />
                <InfoRow label="Monthly fee" value={monthlyFee != null ? `₱${monthlyFee.toLocaleString()} / mo` : "Custom"} />
                <InfoRow label="Status" value={
                  statusInfo ? (
                    <span className="text-[10px] font-medium rounded-full px-2 py-0.5"
                      style={{ background: statusInfo.bg, color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                  ) : "—"
                } />
                <InfoRow label="Trial ends" value={tenant.trialEndsAt ? fmtDate(tenant.trialEndsAt) : <span style={{ color: "#9CA3AF" }}>—</span>} />
                <InfoRow label="Pay cycle" value={tenant.payrollCycle
                  ? tenant.payrollCycle.replace("_", "-").toLowerCase()
                  : <span style={{ color: "#9CA3AF" }}>—</span>} />
              </>
            ) : null}
          </div>

          {/* Recent activity card */}
          <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
            <p className="text-[12px] font-medium mb-3" style={{ color: "#111827" }}>Recent activity</p>
            {!loading && tenant ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#1E3A5F" }} />
                  <p className="text-[11px]" style={{ color: "#6B7280" }}>
                    Tenant created &nbsp;
                    <span style={{ color: "#374151" }}>{fmtDate(tenant.createdAt)}</span>
                  </p>
                </div>
                {tenant._count.employees > 0 && (
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#10B981" }} />
                    <p className="text-[11px]" style={{ color: "#6B7280" }}>
                      <span style={{ color: "#374151" }}>{tenant._count.employees}</span> employee{tenant._count.employees !== 1 ? "s" : ""} onboarded
                    </p>
                  </div>
                )}
                {tenant._count.payrollBooks > 0 && (
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#F59E0B" }} />
                    <p className="text-[11px]" style={{ color: "#6B7280" }}>
                      <span style={{ color: "#374151" }}>{tenant._count.payrollBooks}</span> payroll run{tenant._count.payrollBooks !== 1 ? "s" : ""} processed
                    </p>
                  </div>
                )}
              </div>
            ) : loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
