"use client";

import { use, useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Briefcase,
  Clock,
  MapPin,
  Tablet,
  Smartphone,
  Calculator,
  FileOutput,
  FileText,
  BarChart2,
  Table2,
  Code2,
  Bot,
  Crown,
} from "lucide-react";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface TenantOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  assignedRole: { name: string } | null;
}

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
  ownerUserId: string | null;
  owner: TenantOwner | null;
}

interface AuditEntry {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
}

const KNOWN_FLAGS: { key: string; label: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "ai_enabled",     label: "AI Assistant",            desc: "HR Chat, Compliance Helper, Payslip Q&A",   icon: Bot },
  { key: "ats",            label: "Applicant Tracking",      desc: "ATS Kanban pipeline, hiring workflows",      icon: Briefcase },
  { key: "kiosk",          label: "Kiosk Module",            desc: "Physical kiosk device time punching",        icon: Tablet },
  { key: "expense_claims", label: "Expense Claims",          desc: "Employee expense reimbursement",             icon: FileText },
  { key: "asset_tracking", label: "Asset Tracking",          desc: "Company asset management",                  icon: Code2 },
];

const ALL_FEATURES: { key: string; label: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string }>; core: boolean }[] = [
  { key: "hris",           label: "HRIS Core",               desc: "Employee profiles, 201 files, org chart",    icon: Users,        core: true },
  { key: "ats",            label: "Applicant Tracking",      desc: "ATS Kanban pipeline, hiring",               icon: Briefcase,    core: false },
  { key: "time",           label: "Time & Attendance",       desc: "DTR, shifts, leave management",             icon: Clock,        core: true },
  { key: "gps",            label: "GPS Geofencing",          desc: "Location-based clock-in verification",      icon: MapPin,       core: true },
  { key: "kiosk",          label: "Kiosk Mode",              desc: "Branch tablet clock-in kiosk",              icon: Tablet,       core: false },
  { key: "ess",            label: "ESS Mobile PWA",          desc: "Employee self-service app",                 icon: Smartphone,   core: true },
  { key: "payroll",        label: "Basic Payroll",           desc: "Gross-to-net, statutory deductions",        icon: Calculator,   core: true },
  { key: "bank_export",    label: "Bank File Export",        desc: "BDO, BPI, UnionBank, Metrobank",            icon: FileOutput,   core: true },
  { key: "compliance",     label: "Compliance Reports",      desc: "SSS, PhilHealth, Pag-IBIG, BIR",           icon: FileText,     core: true },
  { key: "analytics",      label: "Advanced Analytics",      desc: "Payroll trend, headcount reports",          icon: BarChart2,    core: true },
  { key: "custom_reports", label: "Custom Reports",          desc: "Build your own report templates",           icon: Table2,       core: false },
  { key: "api_access",     label: "API Access",              desc: "REST API for integrations",                 icon: Code2,        core: false },
  { key: "ai_enabled",     label: "AI Assistant",            desc: "HR Chat, Compliance Helper, Payslip Q&A",  icon: Bot,          core: false },
  { key: "expense_claims", label: "Expense Claims",          desc: "Employee expense reimbursement",            icon: FileText,     core: false },
  { key: "asset_tracking", label: "Asset Tracking",          desc: "Company asset management",                  icon: Code2,        core: false },
];

const TIER_COLOR: Record<string, { bg: string; text: string }> = {
  STARTER: { bg: "bg-gray-100",   text: "text-gray-700" },
  GROWTH:  { bg: "bg-blue-100",   text: "text-blue-700" },
  PRO:     { bg: "bg-violet-100", text: "text-violet-700" },
};

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: "bg-green-50",  text: "text-green-700",  label: "Active" },
  TRIALING:  { bg: "bg-amber-50",  text: "text-amber-800",  label: "Trial" },
  PAST_DUE:  { bg: "bg-amber-50",  text: "text-amber-800",  label: "Overdue" },
  CANCELLED: { bg: "bg-red-50",    text: "text-red-700",    label: "Cancelled" },
};

const TIERS: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];
const STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"];

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Overview form
  const [overview, setOverview] = useState({
    name: "", tradeName: "", subdomain: "", industry: "",
    billingEmail: "", contactEmail: "", contactPhone: "", trialEndsAt: "",
  });
  const [savingOverview, setSavingOverview] = useState(false);

  // Subscription form
  const [tier, setTier] = useState<SubscriptionTier>("STARTER");
  const [status, setStatus] = useState<SubscriptionStatus>("TRIALING");
  const [savingSubscription, setSavingSubscription] = useState(false);

  // Feature flags
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Users tab
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [transferringOwner, setTransferringOwner] = useState<string | null>(null);

  useEffect(() => {
    fetchTenant();
  }, [id]);

  async function fetchTenant() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error();
      const data: Tenant = await res.json();
      setTenant(data);
      setOverview({
        name: data.name ?? "",
        tradeName: data.tradeName ?? "",
        subdomain: data.subdomain ?? "",
        industry: data.industry ?? "",
        billingEmail: data.billingEmail ?? "",
        contactEmail: data.contactEmail ?? "",
        contactPhone: data.contactPhone ?? "",
        trialEndsAt: data.trialEndsAt
          ? new Date(data.trialEndsAt).toISOString().slice(0, 16)
          : "",
      });
      setTier(data.subscriptionTier);
      setStatus(data.subscriptionStatus);
      setFlags(data.featureFlags ?? {});
    } catch {
      toast.error("Failed to load tenant details");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAudit() {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-log?tenantId=${id}&limit=50`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAuditEntries(data.data ?? []);
    } catch {
      toast.error("Failed to load audit log");
    } finally {
      setAuditLoading(false);
    }
  }

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/users`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTenantUsers(data.data ?? []);
    } catch {
      toast.error("Failed to load tenant users");
    } finally {
      setUsersLoading(false);
    }
  }

  async function makeOwner(userId: string) {
    setTransferringOwner(userId);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to transfer ownership"); return; }
      toast.success("Ownership transferred");
      fetchTenant();
    } catch {
      toast.error("Failed to transfer ownership");
    } finally {
      setTransferringOwner(null);
    }
  }

  async function saveOverview(e: React.FormEvent) {
    e.preventDefault();
    setSavingOverview(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: overview.name,
          tradeName: overview.tradeName || null,
          subdomain: overview.subdomain || null,
          industry: overview.industry || null,
          billingEmail: overview.billingEmail || null,
          contactEmail: overview.contactEmail || null,
          contactPhone: overview.contactPhone || null,
          trialEndsAt: overview.trialEndsAt ? new Date(overview.trialEndsAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Save failed");
        return;
      }
      toast.success("Overview saved");
      fetchTenant();
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingOverview(false);
    }
  }

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault();
    setSavingSubscription(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionTier: tier, subscriptionStatus: status }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Save failed");
        return;
      }
      toast.success("Subscription updated");
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function toggleFlag(key: string, current: boolean) {
    setTogglingFlag(key);
    const newValue = !current;
    setFlags((f) => ({ ...f, [key]: newValue }));
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureFlagsPatch: { [key]: newValue } }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Update failed");
        setFlags((f) => ({ ...f, [key]: current }));
        return;
      }
      toast.success(`${key} ${newValue ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Update failed");
      setFlags((f) => ({ ...f, [key]: current }));
    } finally {
      setTogglingFlag(null);
    }
  }

  const [activeTab, setActiveTab] = useState<"overview" | "features" | "billing" | "users" | "audit">("overview");

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!tenant) {
    return <p className="text-gray-500 p-5">Tenant not found.</p>;
  }

  const tierStyle = TIER_COLOR[tenant.subscriptionTier] ?? TIER_COLOR.STARTER;
  const statusBadge = STATUS_COLOR[tenant.subscriptionStatus] ?? STATUS_COLOR.ACTIVE;

  const tenantInitials = tenant.name
    .split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "features", label: "Features" },
    { key: "billing", label: "Billing" },
    { key: "users", label: "Users" },
    { key: "audit", label: "Activity" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tenant header band */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-gray-100">
        <div className="w-10 h-10 rounded-[10px] bg-blue-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-blue-700">{tenantInitials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{tenant.name}</p>
          <p className="text-[11px] text-gray-400 truncate">
            {tenant.subdomain ?? id}
          </p>
        </div>
        <span className={`text-[11px] font-medium rounded-full px-2.5 py-0.5 ${tierStyle.bg} ${tierStyle.text}`}>
          {tenant.subscriptionTier}
        </span>
        <span className={`text-[11px] rounded-full px-2.5 py-0.5 ${statusBadge.bg} ${statusBadge.text}`}>
          {statusBadge.label}
        </span>
        <button
          onClick={() => setActiveTab("billing")}
          className="text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg hover:bg-[#16304f] transition-colors"
        >
          Actions
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-100 bg-white px-5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              if (key === "audit") fetchAudit();
              if (key === "users") fetchUsers();
            }}
            className={`px-3.5 py-2.5 text-xs border-b-2 transition-colors ${
              activeTab === key
                ? "border-[#1E3A5F] text-[#1E3A5F] font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* ── OVERVIEW ──────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-3.5">
            {/* Contact info card */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-900 mb-3">Contact info</p>
              <table className="w-full text-[11px] border-collapse">
                <tbody>
                  {[
                    ["Name",    tenant.name],
                    ["Email",   tenant.contactEmail ?? "—"],
                    ["Phone",   tenant.contactPhone ?? "—"],
                    ["Billing", tenant.billingEmail ?? "—"],
                    ["Industry",tenant.industry ?? "—"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="text-gray-400 py-1.5 pr-3">{k}</td>
                      <td className="text-gray-700 text-right py-1.5 truncate max-w-[140px]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pt-3 mt-2 border-t border-gray-50">
                <p className="text-xs font-medium text-gray-900 mb-2">Edit details</p>
                <form onSubmit={saveOverview} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Name *</Label>
                      <Input className="h-7 text-xs" required value={overview.name} onChange={(e) => setOverview((o) => ({ ...o, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Trade Name</Label>
                      <Input className="h-7 text-xs" value={overview.tradeName} onChange={(e) => setOverview((o) => ({ ...o, tradeName: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Subdomain</Label>
                      <Input className="h-7 text-xs" value={overview.subdomain} onChange={(e) => setOverview((o) => ({ ...o, subdomain: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Industry</Label>
                      <Input className="h-7 text-xs" value={overview.industry} onChange={(e) => setOverview((o) => ({ ...o, industry: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Contact Email</Label>
                      <Input className="h-7 text-xs" type="email" value={overview.contactEmail} onChange={(e) => setOverview((o) => ({ ...o, contactEmail: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Contact Phone</Label>
                      <Input className="h-7 text-xs" value={overview.contactPhone} onChange={(e) => setOverview((o) => ({ ...o, contactPhone: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Billing Email</Label>
                      <Input className="h-7 text-xs" type="email" value={overview.billingEmail} onChange={(e) => setOverview((o) => ({ ...o, billingEmail: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Trial Ends At</Label>
                      <Input className="h-7 text-xs" type="datetime-local" value={overview.trialEndsAt} onChange={(e) => setOverview((o) => ({ ...o, trialEndsAt: e.target.value }))} />
                    </div>
                  </div>
                  <Button type="submit" size="sm" className="text-xs h-7" disabled={savingOverview}>
                    {savingOverview ? "Saving…" : "Save Changes"}
                  </Button>
                </form>
              </div>
            </div>

            {/* Subscription card */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-900 mb-3">Subscription</p>
              <table className="w-full text-[11px] border-collapse">
                <tbody>
                  {[
                    ["Plan",     <span key="plan" className={`text-[10px] rounded-full px-2 py-0.5 ${tierStyle.bg} ${tierStyle.text}`}>{tenant.subscriptionTier}</span>],
                    ["Status",   <span key="st" className={`text-[10px] rounded-full px-2 py-0.5 ${statusBadge.bg} ${statusBadge.text}`}>{statusBadge.label}</span>],
                    ["Trial ends", tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString("en-PH") : "—"],
                    ["Subdomain", tenant.subdomain ?? "—"],
                    ["Created",  new Date(tenant.trialEndsAt ?? Date.now()).toLocaleDateString("en-PH")],
                  ].map(([k, v]) => (
                    <tr key={String(k)}>
                      <td className="text-gray-400 py-1.5 pr-3">{k}</td>
                      <td className="text-gray-700 text-right py-1.5">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FEATURES ──────────────────────────────────── */}
        {activeTab === "features" && (
          <div>
            <div className="grid grid-cols-3 gap-2.5">
              {ALL_FEATURES.map(({ key, label, desc, icon: Icon, core }) => {
                const isOn = core || !!flags[key];
                return (
                  <div
                    key={key}
                    className={`bg-white rounded-xl border p-3 ${isOn ? "border-gray-100" : "border-gray-50 opacity-70"}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Icon size={14} className={isOn ? "text-[#1E3A5F]" : "text-gray-400"} />
                        <p className={`text-[11px] font-medium ${isOn ? "text-gray-900" : "text-gray-500"}`}>{label}</p>
                      </div>
                      {!core ? (
                        <button
                          type="button"
                          disabled={togglingFlag === key}
                          onClick={() => toggleFlag(key, !!flags[key])}
                          className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                            flags[key] ? "bg-[#1E3A5F]" : "bg-gray-300"
                          } ${togglingFlag === key ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          aria-pressed={!!flags[key]}
                          aria-label={`Toggle ${label}`}
                        >
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${flags[key] ? "left-4" : "left-0.5"}`} />
                        </button>
                      ) : (
                        <span className="text-[9px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">core</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">{desc}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={fetchTenant}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                className="bg-[#1E3A5F] text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-[#16304f]"
              >
                Save changes
              </button>
            </div>
          </div>
        )}

        {/* ── BILLING ───────────────────────────────────── */}
        {activeTab === "billing" && (
          <div className="grid grid-cols-2 gap-3.5">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-900 mb-3">Plan configuration</p>
              <form onSubmit={saveSubscription} className="space-y-3">
                <div>
                  <Label className="text-[10px]">Subscription Tier</Label>
                  <Select value={tier} onValueChange={(v) => { const val = v ?? "STARTER"; setTier(val as SubscriptionTier); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Subscription Status</Label>
                  <Select value={status} onValueChange={(v) => { const val = v ?? "TRIALING"; setStatus(val as SubscriptionStatus); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="flex-1 text-xs" disabled={savingSubscription}>
                    {savingSubscription ? "Saving…" : "Update plan"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("CANCELLED");
                    }}
                    className="border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-700 bg-white hover:bg-red-50"
                  >
                    Suspend
                  </button>
                </div>
              </form>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-900 mb-3">Invoice history</p>
              <p className="text-[11px] text-gray-400 py-6 text-center">Invoice management coming soon.</p>
            </div>
          </div>
        )}

        {/* ── USERS ─────────────────────────────────────── */}
        {activeTab === "users" && (
          <div className="space-y-3">
            {/* Current owner banner */}
            {tenant.owner && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                <Crown size={14} className="text-amber-600 shrink-0" />
                <p className="text-[11px] text-amber-800">
                  <strong>Super Admin / Owner:</strong>{" "}
                  {`${tenant.owner.firstName} ${tenant.owner.lastName}`.trim() || tenant.owner.email}
                  {" "}({tenant.owner.email})
                </p>
              </div>
            )}

            {usersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Name</TableHead>
                      <TableHead className="text-[10px]">Email</TableHead>
                      <TableHead className="text-[10px]">Role</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                      <TableHead className="text-[10px]">Last Login</TableHead>
                      <TableHead className="text-[10px]">Owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-400 text-xs py-8">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tenantUsers.map((u) => {
                        const isOwner = u.id === tenant.ownerUserId;
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="text-[11px] font-medium">
                              {u.firstName} {u.lastName}
                            </TableCell>
                            <TableCell className="text-[11px] text-gray-500">{u.email}</TableCell>
                            <TableCell className="text-[11px]">
                              {u.assignedRole?.name ?? <span className="text-gray-300">—</span>}
                            </TableCell>
                            <TableCell>
                              <span className={`text-[10px] rounded-full px-2 py-0.5 ${u.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {u.isActive ? "Active" : "Inactive"}
                              </span>
                            </TableCell>
                            <TableCell className="text-[11px] text-gray-500">
                              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-PH") : "Never"}
                            </TableCell>
                            <TableCell>
                              {isOwner ? (
                                <span className="text-[10px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                                  Owner
                                </span>
                              ) : (
                                <button
                                  disabled={transferringOwner === u.id}
                                  onClick={() => makeOwner(u.id)}
                                  className="text-[10px] text-blue-600 hover:underline disabled:opacity-50"
                                >
                                  {transferringOwner === u.id ? "Transferring…" : "Make Owner"}
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY / AUDIT ──────────────────────────── */}
        {activeTab === "audit" && (
          <div>
            {auditLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Timestamp</TableHead>
                      <TableHead className="text-[10px]">Actor</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                      <TableHead className="text-[10px]">Entity</TableHead>
                      <TableHead className="text-[10px]">Entity ID</TableHead>
                      <TableHead className="text-[10px]">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-400 text-xs py-8">No audit entries.</TableCell>
                      </TableRow>
                    ) : (
                      auditEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-[11px] text-gray-500 whitespace-nowrap">
                            {new Date(e.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">{e.actorUserId ?? "—"}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{e.action}</Badge></TableCell>
                          <TableCell className="text-xs">{e.entity}</TableCell>
                          <TableCell className="font-mono text-[11px] truncate max-w-[120px]">{e.entityId ?? "—"}</TableCell>
                          <TableCell className="text-[11px] text-gray-500">{e.ipAddress ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
