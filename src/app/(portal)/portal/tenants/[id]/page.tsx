"use client";

import { use, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  industry: string | null;
  billingEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  trialEndsAt: string | null;
  subscriptionTier: string;
  subscriptionStatus: SubscriptionStatus;
  _count: { employees: number };
}

const TIER_RATE: Record<string, number> = { STARTER: 299, GROWTH: 249, PRO: 199 };

const STATUS_PILL: Record<SubscriptionStatus, { cls: string; label: string }> = {
  ACTIVE:    { cls: "bg-green-50 text-green-700",  label: "Current" },
  TRIALING:  { cls: "bg-amber-50 text-amber-800",  label: "Trial" },
  PAST_DUE:  { cls: "bg-red-50 text-red-700",      label: "Past due" },
  CANCELLED: { cls: "bg-gray-100 text-gray-600",   label: "Cancelled" },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td className="py-[5px] text-[11px]" style={{ color: "#6B7280" }}>{label}</td>
      <td className="py-[5px] text-[11px] text-right" style={{ color: "#374151" }}>{value}</td>
    </tr>
  );
}

export default function TenantOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then((r) => r.json())
      .then((j) => setTenant(j.data))
      .finally(() => setLoading(false));
  }, [id]);

  const monthlyFee = tenant
    ? tenant._count.employees * (TIER_RATE[tenant.subscriptionTier] ?? 0)
    : null;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Contact card */}
      <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <p className="text-[12px] font-semibold mb-3" style={{ color: "#111827" }}>Contact & company</p>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : tenant ? (
          <table className="w-full border-collapse">
            <tbody>
              <Row label="Industry" value={tenant.industry ?? <span style={{ color: "#9CA3AF" }}>—</span>} />
              <Row label="Contact email" value={
                tenant.contactEmail
                  ? <a href={`mailto:${tenant.contactEmail}`} className="hover:underline" style={{ color: "#185FA5" }}>{tenant.contactEmail}</a>
                  : <span style={{ color: "#9CA3AF" }}>—</span>
              } />
              <Row label="Contact phone" value={tenant.contactPhone ?? <span style={{ color: "#9CA3AF" }}>—</span>} />
              <Row label="Billing email" value={
                tenant.billingEmail
                  ? <a href={`mailto:${tenant.billingEmail}`} className="hover:underline" style={{ color: "#185FA5" }}>{tenant.billingEmail}</a>
                  : <span style={{ color: "#9CA3AF" }}>—</span>
              } />
            </tbody>
          </table>
        ) : (
          <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Unable to load contact data.</p>
        )}
      </div>

      {/* Subscription card */}
      <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <p className="text-[12px] font-semibold mb-3" style={{ color: "#111827" }}>Subscription</p>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : tenant ? (
          <table className="w-full border-collapse">
            <tbody>
              <Row
                label="Plan"
                value={
                  <span className={`text-[10px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700`}>
                    {tenant.subscriptionTier.charAt(0) + tenant.subscriptionTier.slice(1).toLowerCase()}
                  </span>
                }
              />
              <Row
                label="Rate"
                value={`₱${(TIER_RATE[tenant.subscriptionTier] ?? 0).toLocaleString()} / employee / mo`}
              />
              <Row
                label="Monthly total"
                value={
                  <span className="font-semibold" style={{ color: "#111827" }}>
                    {monthlyFee != null ? `₱${monthlyFee.toLocaleString()}` : "—"}
                  </span>
                }
              />
              <Row
                label="Trial ends"
                value={
                  tenant.trialEndsAt
                    ? fmtDate(tenant.trialEndsAt)
                    : <span style={{ color: "#9CA3AF" }}>—</span>
                }
              />
              <Row
                label="Payment"
                value={
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[tenant.subscriptionStatus].cls}`}>
                    {STATUS_PILL[tenant.subscriptionStatus].label}
                  </span>
                }
              />
            </tbody>
          </table>
        ) : (
          <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Unable to load subscription data.</p>
        )}
      </div>
    </div>
  );
}
