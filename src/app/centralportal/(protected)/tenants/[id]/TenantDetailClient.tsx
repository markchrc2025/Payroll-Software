"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Users, CreditCard, ToggleLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIER_COLOR: Record<string, string> = { PRO: "#10B981", GROWTH: "#3B82F6", STARTER: "#6B7280" };
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#10B981", TRIALING: "#F59E0B", PAST_DUE: "#EF4444", CANCELLED: "#6B7280",
};

type Tenant = {
  id: string; name: string; tradeName: string | null; companyCode: string | null;
  subdomain: string | null; industry: string | null; subscriptionTier: string;
  subscriptionStatus: string; trialEndsAt: string | null; billingEmail: string | null;
  featureFlags: Record<string, boolean>; payrollCycle: string | null;
  contactEmail: string | null; contactPhone: string | null; tinNumber: string | null;
  address: string | null; city: string | null; province: string | null; zipCode: string | null;
  createdAt: string; updatedAt: string;
  _count: { employees: number; users: number; payrollBooks: number };
};

type User = {
  id: string; firstName: string; lastName: string; email: string;
  systemRole: string; isActive: boolean; lastLoginAt: string | null; createdAt: string;
};

const TABS = [
  { id: "overview",     label: "Overview",      icon: Building2   },
  { id: "subscription", label: "Subscription",  icon: CreditCard  },
  { id: "flags",        label: "Feature Flags", icon: ToggleLeft  },
  { id: "users",        label: "Users",         icon: Users       },
] as const;
type TabId = typeof TABS[number]["id"];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-sm text-white text-right max-w-[65%]">{value || "—"}</span>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3 mt-6 first:mt-0">
      {children}
    </p>
  );
}

export default function TenantDetailClient({ tenant: initial, users }: { tenant: Tenant; users: User[] }) {
  const router = useRouter();
  const [tenant, setTenant] = useState(initial);
  const [tab, setTab] = useState<TabId>("overview");
  const [saving, setSaving] = useState(false);

  // Subscription edit state
  const [editTier,   setEditTier]   = useState(tenant.subscriptionTier);
  const [editStatus, setEditStatus] = useState(tenant.subscriptionStatus);
  const [editTrial,  setEditTrial]  = useState(tenant.trialEndsAt?.slice(0, 10) ?? "");
  const [editBilling, setEditBilling] = useState(tenant.billingEmail ?? "");

  async function patchTenant(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setTenant((t) => ({ ...t, ...json.data }));
      toast.success("Tenant updated");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFlag(key: string, current: boolean) {
    await patchTenant({ featureFlagsPatch: { [key]: !current } });
    setTenant((t) => ({ ...t, featureFlags: { ...t.featureFlags, [key]: !current } }));
  }

  const SELECT_CLS = "w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none";
  const SELECT_STYLE = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" };
  const INPUT_CLS = "w-full rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none";
  const INPUT_STYLE = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{tenant.name}</h1>
          {tenant.tradeName && <p className="text-sm text-white/40 mt-0.5">{tenant.tradeName}</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: `${TIER_COLOR[tenant.subscriptionTier] ?? "#6B7280"}25`, color: TIER_COLOR[tenant.subscriptionTier] ?? "#6B7280" }}>
              {tenant.subscriptionTier}
            </span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${STATUS_COLOR[tenant.subscriptionStatus] ?? "#6B7280"}25`, color: STATUS_COLOR[tenant.subscriptionStatus] ?? "#6B7280" }}>
              {tenant.subscriptionStatus}
            </span>
            {tenant.companyCode && (
              <span className="text-xs font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded">{tenant.companyCode}</span>
            )}
          </div>
        </div>
        {/* Stats */}
        <div className="flex gap-4">
          {[
            { label: "Employees",    value: tenant._count.employees },
            { label: "Users",        value: tenant._count.users },
            { label: "Payroll Runs", value: tenant._count.payrollBooks },
          ].map(({ label, value }) => (
            <div key={label} className="text-center px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", width: "fit-content" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={tab === id
              ? { background: "#2D6BE4", color: "white" }
              : { color: "rgba(255,255,255,0.5)" }
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl p-6" style={{ background: "#0F2340", border: "1px solid rgba(255,255,255,0.07)" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-8">
            <div>
              <SectionHead>Company Details</SectionHead>
              <InfoRow label="Legal Name"    value={tenant.name} />
              <InfoRow label="Trade Name"    value={tenant.tradeName} />
              <InfoRow label="TIN"           value={tenant.tinNumber} />
              <InfoRow label="Industry"      value={tenant.industry} />
              <InfoRow label="Company Code"  value={tenant.companyCode} />
              <InfoRow label="Subdomain"     value={tenant.subdomain ? `app.sentire.ph/${tenant.subdomain}` : null} />
              <InfoRow label="Payroll Cycle" value={tenant.payrollCycle?.replace("_", "-") ?? null} />
            </div>
            <div>
              <SectionHead>Contact & Address</SectionHead>
              <InfoRow label="Contact Email" value={tenant.contactEmail} />
              <InfoRow label="Contact Phone" value={tenant.contactPhone} />
              <InfoRow label="Billing Email" value={tenant.billingEmail} />
              <InfoRow label="Address"       value={tenant.address} />
              <InfoRow label="City"          value={tenant.city} />
              <InfoRow label="Province"      value={tenant.province} />
              <InfoRow label="ZIP Code"      value={tenant.zipCode} />
              <SectionHead>System</SectionHead>
              <InfoRow label="Created" value={new Date(tenant.createdAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} />
              <InfoRow label="Updated" value={new Date(tenant.updatedAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} />
            </div>
          </div>
        )}

        {/* SUBSCRIPTION */}
        {tab === "subscription" && (
          <div className="max-w-md space-y-4">
            <SectionHead>Change Plan</SectionHead>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Subscription Tier</label>
              <select className={SELECT_CLS} style={SELECT_STYLE} value={editTier} onChange={(e) => setEditTier(e.target.value)}>
                {["STARTER","GROWTH","PRO"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Account Status</label>
              <select className={SELECT_CLS} style={SELECT_STYLE} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                {["ACTIVE","TRIALING","PAST_DUE","CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Trial End Date</label>
              <input type="date" className={INPUT_CLS} style={INPUT_STYLE} value={editTrial} onChange={(e) => setEditTrial(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Billing Email</label>
              <input type="email" className={INPUT_CLS} style={INPUT_STYLE} placeholder="billing@company.com" value={editBilling} onChange={(e) => setEditBilling(e.target.value)} />
            </div>
            <Button
              onClick={() => patchTenant({ subscriptionTier: editTier, subscriptionStatus: editStatus, billingEmail: editBilling || null, trialEndsAt: editTrial ? new Date(editTrial).toISOString() : null })}
              disabled={saving}
              className="text-white hover:opacity-90 w-full"
              style={{ background: "#2D6BE4" }}
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </div>
        )}

        {/* FEATURE FLAGS */}
        {tab === "flags" && (
          <div className="max-w-md">
            <SectionHead>Feature Flags</SectionHead>
            {Object.keys(tenant.featureFlags).length === 0 ? (
              <p className="text-sm text-white/30 py-4">No feature flags configured for this tenant.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(tenant.featureFlags).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div>
                      <p className="text-sm font-mono text-white">{key}</p>
                    </div>
                    <button
                      onClick={() => toggleFlag(key, val)}
                      disabled={saving}
                      className="relative w-10 h-5 rounded-full transition-colors disabled:opacity-50"
                      style={{ background: val ? "#2D6BE4" : "rgba(255,255,255,0.15)" }}
                    >
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: val ? "calc(100% - 18px)" : "2px" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div>
            <SectionHead>Tenant Users ({users.length})</SectionHead>
            {users.length === 0 ? (
              <p className="text-sm text-white/30 py-4">No users in this tenant yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Name", "Email", "Role", "Status", "Last Login"].map((h) => (
                      <th key={h} className="text-left pb-3 text-xs text-white/30 uppercase tracking-wider font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td className="py-3 text-sm font-medium text-white">{u.firstName} {u.lastName}</td>
                      <td className="py-3 text-sm text-white/60">{u.email}</td>
                      <td className="py-3">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                          {u.systemRole}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="text-xs" style={{ color: u.isActive ? "#10B981" : "#6B7280" }}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-white/40">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
