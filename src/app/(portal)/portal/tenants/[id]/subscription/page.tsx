"use client";

import { use, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  _count: { employees: number };
}

const TIER_RATE: Record<SubscriptionTier, number> = {
  STARTER: 299,
  GROWTH: 249,
  PRO: 199,
};

const TIER_EMPLOYEE_CAP: Record<SubscriptionTier, string> = {
  STARTER: "Up to 50 employees",
  GROWTH: "51 – 500 employees",
  PRO: "500+ employees",
};

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  STARTER: ["HRIS Core", "Time & Attendance", "Basic Payroll", "ESS Mobile"],
  GROWTH: [
    "All Starter features",
    "Applicant Tracking",
    "GPS Geofencing",
    "Compliance Reports",
    "Bank File Export",
  ],
  PRO: [
    "All Growth features",
    "Custom Reports",
    "API Access",
    "Dedicated CSM",
    "99.9% SLA",
  ],
};

const TIER_ORDER: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];

export default function TenantSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setTenant(json.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const monthlyFee =
    tenant != null
      ? tenant._count.employees * TIER_RATE[tenant.subscriptionTier]
      : null;

  const empCap = 500; // Growth plan display cap for progress bar
  const empPct =
    tenant != null ? Math.min((tenant._count.employees / empCap) * 100, 100) : 0;

  return (
    <div>
      <div
        className="text-[11px] rounded-[8px] flex items-center gap-2 px-3 py-2 mb-4"
        style={{ background: "#FFFBEB", border: "0.5px solid #FDE68A", color: "#92400E" }}
      >
        <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <span>
          This is a <strong>portal-side preview</strong> of what this tenant's subscription
          screen shows. Manage the plan on the <a href={`/portal/tenants/${id}/billing`} className="underline">Billing tab</a>.
        </span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-[10px]" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-[10px]" />
            ))}
          </div>
        </div>
      ) : tenant ? (
        <>
          {/* Current plan card */}
          <div
            className="rounded-[10px] p-4 mb-4"
            style={{
              background: "white",
              border: "2px solid #1E3A5F",
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[11px] rounded-full px-2.5 py-0.5 font-medium bg-blue-50 text-blue-700"
                  >
                    {tenant.subscriptionTier.charAt(0) +
                      tenant.subscriptionTier.slice(1).toLowerCase()}{" "}
                    — Current plan
                  </span>
                </div>
                <p className="text-[13px] mt-1" style={{ color: "#6B7280" }}>
                  ₱{TIER_RATE[tenant.subscriptionTier].toLocaleString()} per employee · month
                </p>
              </div>
              <p className="text-[20px] font-semibold" style={{ color: "#111827" }}>
                {monthlyFee != null ? (
                  <>
                    ₱{monthlyFee.toLocaleString()}
                    <span className="text-[12px] font-normal" style={{ color: "#6B7280" }}>
                      /mo
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>

            {/* Employee usage bar */}
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-[11px]" style={{ color: "#6B7280" }}>Employees</span>
                <span className="text-[11px]" style={{ color: "#374151" }}>
                  {tenant._count.employees} / {empCap}
                </span>
              </div>
              <div
                className="h-[6px] rounded-full overflow-hidden"
                style={{ background: "#E5E7EB" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${empPct}%`, background: "#1E3A5F" }}
                />
              </div>
            </div>
          </div>

          {/* Plan comparison cards */}
          <p className="text-[12px] font-medium mb-3" style={{ color: "#111827" }}>
            Available plans
          </p>
          <div className="grid grid-cols-3 gap-3">
            {TIER_ORDER.map((t) => {
              const isCurrent = t === tenant.subscriptionTier;
              return (
                <div
                  key={t}
                  className="rounded-[10px] p-4"
                  style={{
                    background: "white",
                    border: isCurrent ? "2px solid #1E3A5F" : "0.5px solid #E5E7EB",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[13px] font-medium" style={{ color: "#111827" }}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </p>
                    {isCurrent && (
                      <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-blue-50 text-blue-700">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[18px] font-semibold mb-0.5" style={{ color: "#111827" }}>
                    ₱{TIER_RATE[t]}
                    <span className="text-[11px] font-normal" style={{ color: "#6B7280" }}>
                      /emp/mo
                    </span>
                  </p>
                  <p className="text-[10px] mb-3" style={{ color: "#6B7280" }}>
                    {TIER_EMPLOYEE_CAP[t]}
                  </p>
                  {TIER_FEATURES[t].map((f) => (
                    <p
                      key={f}
                      className="text-[10px] mb-1 flex items-center gap-1.5"
                      style={{ color: "#374151" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      {f}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
          Unable to load subscription data.
        </p>
      )}
    </div>
  );
}
