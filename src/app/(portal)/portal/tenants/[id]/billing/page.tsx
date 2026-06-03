"use client";

import { use, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  billingEmail: string | null;
  trialEndsAt: string | null;
  _count: { employees: number };
}

const TIER_RATE: Record<SubscriptionTier, number> = {
  STARTER: 299,
  GROWTH: 249,
  PRO: 199,
};

const TIER_LABEL: Record<SubscriptionTier, string> = {
  STARTER: "Starter — ₱299/emp/mo",
  GROWTH: "Growth — ₱249/emp/mo",
  PRO: "Pro — ₱199/emp/mo",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  TRIALING: "Trial",
  PAST_DUE: "Overdue",
  CANCELLED: "Cancelled",
};

const TIERS: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];
const STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td className="py-[5px] text-[11px]" style={{ color: "#6B7280" }}>{label}</td>
      <td className="py-[5px] text-[11px] text-right" style={{ color: "#374151" }}>{value}</td>
    </tr>
  );
}

export default function TenantBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [tier, setTier] = useState<SubscriptionTier>("STARTER");
  const [status, setStatus] = useState<SubscriptionStatus>("TRIALING");
  const [customRate, setCustomRate] = useState("");
  const [trialEndsAt, setTrialEndsAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const t: Tenant = json.data;
      setTenant(t);
      setTier(t.subscriptionTier);
      setStatus(t.subscriptionStatus);
      setTrialEndsAt(
        t.trialEndsAt ? t.trialEndsAt.slice(0, 10) : "",
      );
    } catch {
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate() {
    if (!tenant) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        subscriptionTier: tier,
        subscriptionStatus: status,
      };
      if (trialEndsAt) {
        body.trialEndsAt = new Date(trialEndsAt).toISOString();
      } else {
        body.trialEndsAt = null;
      }
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update");
        return;
      }
      toast.success("Subscription updated");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    if (!confirm("Suspend this tenant? Their users will lose access until reactivated.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tenant suspended");
      load();
    } catch {
      toast.error("Failed to suspend tenant");
    } finally {
      setSaving(false);
    }
  }

  const computedFee =
    tenant
      ? (customRate ? parseFloat(customRate) : TIER_RATE[tier]) * tenant._count.employees
      : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Plan configuration */}
      <div
        className="rounded-[10px] p-4"
        style={{ background: "white", border: "0.5px solid #E5E7EB" }}
      >
        <p className="text-[12px] font-semibold mb-4" style={{ color: "#111827" }}>
          Plan configuration
        </p>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-[8px]" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px]" style={{ color: "#6B7280" }}>Current plan</Label>
              <Select
                value={tier}
                onValueChange={(v) => setTier(v as SubscriptionTier)}
              >
                <SelectTrigger className="text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t} className="text-[12px]">
                      {TIER_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px]" style={{ color: "#6B7280" }}>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as SubscriptionStatus)}
              >
                <SelectTrigger className="text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-[12px]">
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px]" style={{ color: "#6B7280" }}>
                Custom per-employee rate override (₱)
              </Label>
              <div
                className="flex items-center border rounded-[8px] overflow-hidden"
                style={{ borderColor: "#E5E7EB" }}
              >
                <span
                  className="px-2.5 py-2 text-[12px] border-r"
                  style={{ background: "#F9FAFB", color: "#6B7280", borderColor: "#E5E7EB" }}
                >
                  ₱
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder={`${TIER_RATE[tier]} (plan default)`}
                  className="flex-1 px-2.5 py-2 text-[12px] outline-none"
                />
              </div>
              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                Leave blank to use the plan default rate. Use for negotiated pricing.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px]" style={{ color: "#6B7280" }}>Trial end date</Label>
              <input
                type="date"
                value={trialEndsAt}
                onChange={(e) => setTrialEndsAt(e.target.value)}
                className="w-full px-3 py-2 text-[12px] border rounded-[8px] outline-none"
                style={{ borderColor: "#E5E7EB" }}
              />
            </div>

            {/* Computed fee preview */}
            {tenant && (
              <div
                className="rounded-[8px] px-3 py-2.5 text-[11px]"
                style={{ background: "#F8FAFC", border: "0.5px solid #E5E7EB" }}
              >
                <span style={{ color: "#6B7280" }}>Projected monthly total: </span>
                <span className="font-semibold" style={{ color: "#111827" }}>
                  {computedFee != null
                    ? `₱${Math.round(computedFee).toLocaleString()}`
                    : "—"}{" "}
                </span>
                <span style={{ color: "#9CA3AF" }}>
                  ({tenant._count.employees} emp × ₱
                  {customRate || TIER_RATE[tier]}/mo)
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="flex-1 rounded-[8px] py-2 text-[12px] font-medium text-white disabled:opacity-50"
                style={{ background: "#1E3A5F" }}
              >
                {saving ? "Updating…" : "Update plan"}
              </button>
              <button
                onClick={handleSuspend}
                disabled={saving}
                className="rounded-[8px] px-3 py-2 text-[12px] border disabled:opacity-40"
                style={{ borderColor: "#FEE2E2", color: "#991B1B", background: "white" }}
              >
                Suspend
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Billing summary (read-only) */}
      <div
        className="rounded-[10px] p-4"
        style={{ background: "white", border: "0.5px solid #E5E7EB" }}
      >
        <p className="text-[12px] font-semibold mb-3" style={{ color: "#111827" }}>
          Billing summary
        </p>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : tenant ? (
          <>
            <table className="w-full border-collapse mb-4">
              <tbody>
                <Row
                  label="Plan"
                  value={
                    <span
                      className="text-[10px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700"
                    >
                      {tier.charAt(0) + tier.slice(1).toLowerCase()}
                    </span>
                  }
                />
                <Row
                  label="Rate"
                  value={`₱${(customRate ? parseFloat(customRate) : TIER_RATE[tier]).toLocaleString()} / emp / mo`}
                />
                <Row
                  label="Employees"
                  value={tenant._count.employees}
                />
                <Row
                  label="Monthly total"
                  value={
                    <span className="font-semibold" style={{ color: "#111827" }}>
                      {computedFee != null
                        ? `₱${Math.round(computedFee).toLocaleString()}`
                        : "—"}
                    </span>
                  }
                />
                <Row
                  label="Billing email"
                  value={
                    tenant.billingEmail ? (
                      <a
                        href={`mailto:${tenant.billingEmail}`}
                        className="hover:underline"
                        style={{ color: "#185FA5" }}
                      >
                        {tenant.billingEmail}
                      </a>
                    ) : (
                      <span style={{ color: "#9CA3AF" }}>—</span>
                    )
                  }
                />
                <Row
                  label="Status"
                  value={
                    <span
                      className={`text-[10px] rounded-full px-2 py-0.5 ${
                        status === "ACTIVE"
                          ? "bg-green-50 text-green-700"
                          : status === "PAST_DUE"
                          ? "bg-amber-50 text-amber-800"
                          : status === "CANCELLED"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  }
                />
              </tbody>
            </table>

            <div
              className="rounded-[8px] p-3 text-[11px]"
              style={{ background: "#FFFBEB", border: "0.5px solid #FDE68A" }}
            >
              <p className="font-medium mb-1" style={{ color: "#92400E" }}>Invoice history</p>
              <p style={{ color: "#B45309" }}>
                Invoice ledger will be available in a future update. Use this panel to
                manage the tenant's plan and status in the meantime.
              </p>
            </div>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Unable to load billing data.</p>
        )}
      </div>
    </div>
  );
}
