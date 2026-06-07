"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  RefreshCw,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Tier = "STARTER" | "GROWTH" | "PRO";
type SubStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
type InvStatus = "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "VOID";
type Cycle = "MONTHLY" | "ANNUAL";

interface Package {
  id: string;
  tier: Tier;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number;
  taxRateBps: number;
  currency: string;
  isActive: boolean;
  features: string[];
}

interface SubRow {
  id: string;
  name: string;
  subdomain: string | null;
  billingEmail: string | null;
  subscription: {
    id: string;
    billingCycle: Cycle;
    status: SubStatus;
    nextBillingDate: string | null;
    package: { id: string; tier: Tier; name: string; monthlyPrice: number; annualPrice: number; currency: string };
  } | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  total: string;
  currency: string;
  status: InvStatus;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  tenant: { id: string; name: string };
}

interface Overview {
  mrr: number;
  activeSubscriptions: number;
  outstandingTotal: number;
  outstandingCount: number;
  collectedThisMonth: number;
  recentInvoices: InvoiceRow[];
}

const STATUS_PILL: Record<SubStatus, { cls: string; label: string }> = {
  ACTIVE: { cls: "bg-green-50 text-green-700", label: "Active" },
  TRIALING: { cls: "bg-amber-50 text-amber-800", label: "Trial" },
  PAST_DUE: { cls: "bg-amber-50 text-amber-800", label: "Overdue" },
  CANCELLED: { cls: "bg-red-50 text-red-700", label: "Cancelled" },
};

const INV_PILL: Record<InvStatus, { cls: string; label: string }> = {
  DRAFT: { cls: "bg-gray-100 text-gray-600", label: "Draft" },
  OPEN: { cls: "bg-blue-50 text-blue-700", label: "Open" },
  PAID: { cls: "bg-green-50 text-green-700", label: "Paid" },
  OVERDUE: { cls: "bg-red-50 text-red-700", label: "Overdue" },
  VOID: { cls: "bg-gray-100 text-gray-400", label: "Void" },
};

const TABS = ["Overview", "Subscriptions", "Packages", "Payment history"] as const;
type Tab = (typeof TABS)[number];

// Amounts are centavos (integer). Divide by 100 to display pesos.
function peso(centavos: number, currency = "PHP") {
  const v = (Number.isFinite(centavos) ? centavos : 0) / 100;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(v);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function BillingContent() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="max-w-6xl mx-auto px-6 pt-10 pb-8" style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <Receipt size={22} style={{ color: "#1E3A5F" }} />
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#111827" }}>
            Billing
          </h1>
        </div>
      </div>
      <p className="text-[13px] mb-6" style={{ color: "#6B7280" }}>
        Manage packages, tenant subscriptions, invoices, and payments across all clients
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "#E5E7EB" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-[13px] font-medium -mb-px border-b-2 transition-colors"
            style={
              tab === t
                ? { color: "#1E3A5F", borderColor: "#1E3A5F" }
                : { color: "#6B7280", borderColor: "transparent" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab />}
      {tab === "Subscriptions" && <SubscriptionsTab router={router} />}
      {tab === "Packages" && <PackagesTab />}
      {tab === "Payment history" && <PaymentHistoryTab />}
    </div>
  );
}

/* ----------------------------- Overview tab ----------------------------- */
function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing/overview");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data ?? json);
    } catch {
      toast.error("Failed to load billing overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = [
    { label: "Monthly recurring revenue", value: data ? peso(data.mrr) : "—", icon: TrendingUp, tint: "#1E3A5F" },
    { label: "Active subscriptions", value: data ? String(data.activeSubscriptions) : "—", icon: Users, tint: "#2563EB" },
    { label: "Outstanding", value: data ? peso(data.outstandingTotal) : "—", icon: AlertCircle, tint: "#D97706", sub: data ? `${data.outstandingCount} invoices` : "" },
    { label: "Collected this month", value: data ? peso(data.collectedThisMonth) : "—", icon: CheckCircle2, tint: "#16A34A" },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-[12px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} style={{ color: c.tint }} />
                <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{c.label}</span>
              </div>
              {loading ? (
                <Skeleton className="h-7 w-24 rounded" />
              ) : (
                <p className="text-[22px] font-bold" style={{ color: "#111827" }}>{c.value}</p>
              )}
              {c.sub && !loading && <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{c.sub}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold" style={{ color: "#111827" }}>Recent invoices</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#6B7280" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="rounded-[10px] overflow-hidden" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th className="text-left px-5 py-3 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Invoice</th>
              <th className="text-left px-3 py-3 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Tenant</th>
              <th className="text-left px-3 py-3 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Amount</th>
              <th className="text-left px-3 py-3 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Status</th>
              <th className="text-left px-3 py-3 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Issued</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                  {[1, 2, 3, 4, 5].map((c) => <td key={c} className="px-5 py-3"><Skeleton className="h-4 w-full rounded" /></td>)}
                </tr>
              ))
            ) : !data || data.recentInvoices.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-[13px]" style={{ color: "#9CA3AF" }}>No invoices yet.</td></tr>
            ) : (
              data.recentInvoices.map((inv, idx) => (
                <tr key={inv.id} style={{ borderBottom: idx < data.recentInvoices.length - 1 ? "0.5px solid #F3F4F6" : "none" }}>
                  <td className="px-5 py-3 text-[13px] font-medium" style={{ color: "#111827" }}>{inv.invoiceNumber}</td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "#374151" }}>{inv.tenant.name}</td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "#374151" }}>{peso(inv.total, inv.currency)}</td>
                  <td className="px-3 py-3"><span className={`text-[11px] rounded-full px-2.5 py-1 ${INV_PILL[inv.status].cls}`}>{INV_PILL[inv.status].label}</span></td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "#374151" }}>{fmtDate(inv.issuedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Subscriptions tab -------------------------- */
function SubscriptionsTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing/subscriptions?limit=50");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-[10px] overflow-hidden" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
            <th className="text-left px-5 py-3.5 text-[12px] font-semibold w-[28%]" style={{ color: "#6B7280" }}>Tenant</th>
            <th className="text-left px-3 py-3.5 text-[12px] font-semibold w-[18%]" style={{ color: "#6B7280" }}>Package</th>
            <th className="text-left px-3 py-3.5 text-[12px] font-semibold w-[12%]" style={{ color: "#6B7280" }}>Cycle</th>
            <th className="text-left px-3 py-3.5 text-[12px] font-semibold w-[14%]" style={{ color: "#6B7280" }}>Amount</th>
            <th className="text-left px-3 py-3.5 text-[12px] font-semibold w-[12%]" style={{ color: "#6B7280" }}>Status</th>
            <th className="text-left px-3 py-3.5 text-[12px] font-semibold w-[12%]" style={{ color: "#6B7280" }}>Next bill</th>
            <th className="w-[4%]" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                {[1, 2, 3, 4, 5, 6, 7].map((c) => <td key={c} className="px-5 py-4"><Skeleton className="h-4 w-full rounded" /></td>)}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-12 text-[13px]" style={{ color: "#9CA3AF" }}>No tenants found.</td></tr>
          ) : (
            rows.map((r, idx) => {
              const sub = r.subscription;
              const amount = sub
                ? peso(sub.billingCycle === "ANNUAL" ? sub.package.annualPrice : sub.package.monthlyPrice, sub.package.currency)
                : "—";
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/centralportal/tenants/${r.id}`)}
                  className="group cursor-pointer transition-colors hover:bg-[#F9FAFB]"
                  style={{ borderBottom: idx < rows.length - 1 ? "0.5px solid #F3F4F6" : "none" }}
                >
                  <td className="px-5 py-4">
                    <p className="text-[14px] font-medium truncate" style={{ color: "#111827" }}>{r.name}</p>
                    {r.subdomain && <p className="text-[12px] truncate mt-0.5" style={{ color: "#9CA3AF" }}>{r.subdomain}</p>}
                  </td>
                  <td className="px-3 py-4 text-[13px]" style={{ color: "#374151" }}>{sub ? sub.package.name : <span style={{ color: "#9CA3AF" }}>Unassigned</span>}</td>
                  <td className="px-3 py-4 text-[13px]" style={{ color: "#374151" }}>{sub ? (sub.billingCycle === "ANNUAL" ? "Annual" : "Monthly") : "—"}</td>
                  <td className="px-3 py-4 text-[13px]" style={{ color: "#374151" }}>{amount}</td>
                  <td className="px-3 py-4">
                    {sub ? <span className={`text-[11px] rounded-full px-2.5 py-1 ${STATUS_PILL[sub.status].cls}`}>{STATUS_PILL[sub.status].label}</span> : <span className="text-[11px] rounded-full px-2.5 py-1 bg-gray-100 text-gray-500">None</span>}
                  </td>
                  <td className="px-3 py-4 text-[12px]" style={{ color: "#374151" }}>{sub ? fmtDate(sub.nextBillingDate) : "—"}</td>
                  <td className="px-3 py-4 text-right"><ChevronRight size={16} className="inline-block text-gray-300 transition-colors group-hover:text-gray-500" /></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Packages tab ----------------------------- */
function PackagesTab() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing/packages");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPackages(json.data ?? json);
    } catch {
      toast.error("Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePackage(p: Package, patch: Partial<Package>) {
    setSaving(p.id);
    try {
      const res = await fetch("/api/admin/billing/packages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, ...patch }),
      });
      if (!res.ok) throw new Error();
      toast.success("Package updated");
      load();
    } catch {
      toast.error("Failed to update package");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="rounded-[12px] p-5" style={{ background: "white", border: "0.5px solid #E5E7EB" }}><Skeleton className="h-40 w-full rounded" /></div>)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {packages.map((p) => (
        <div key={p.id} className="rounded-[12px] p-5" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[16px] font-bold" style={{ color: "#111827" }}>{p.name}</h3>
            <span className={`text-[10px] rounded-full px-2 py-0.5 ${p.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{p.isActive ? "Active" : "Inactive"}</span>
          </div>
          <p className="text-[11px] uppercase tracking-wide mb-4" style={{ color: "#9CA3AF" }}>{p.tier}</p>

          <label className="block text-[11px] font-medium mb-1" style={{ color: "#6B7280" }}>Monthly price ({p.currency})</label>
          <PesoInput centavos={p.monthlyPrice} disabled={saving === p.id} onCommit={(c) => savePackage(p, { monthlyPrice: c })} />

          <label className="block text-[11px] font-medium mb-1 mt-3" style={{ color: "#6B7280" }}>Annual price ({p.currency})</label>
          <PesoInput centavos={p.annualPrice} disabled={saving === p.id} onCommit={(c) => savePackage(p, { annualPrice: c })} />

          <label className="block text-[11px] font-medium mb-1 mt-3" style={{ color: "#6B7280" }}>Tax rate (%)</label>
          <PercentInput bps={p.taxRateBps} disabled={saving === p.id} onCommit={(b) => savePackage(p, { taxRateBps: b })} />
        </div>
      ))}
    </div>
  );
}

// Edits in pesos, commits centavos (integer).
function PesoInput({ centavos, onCommit, disabled }: { centavos: number; onCommit: (c: number) => void; disabled?: boolean }) {
  const toPeso = (c: number) => (c / 100).toFixed(2);
  const [local, setLocal] = useState(toPeso(centavos));
  useEffect(() => setLocal(toPeso(centavos)), [centavos]);
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const c = Math.round(Number(local) * 100);
        if (!Number.isNaN(c) && c !== centavos) onCommit(c);
      }}
      className="w-full h-9 px-3 text-[13px] rounded-[8px] border outline-none focus:ring-1"
      style={{ borderColor: "#E5E7EB", color: "#111827" }}
    />
  );
}

// Edits in percent, commits basis points (integer; 12 -> 1200).
function PercentInput({ bps, onCommit, disabled }: { bps: number; onCommit: (b: number) => void; disabled?: boolean }) {
  const toPct = (b: number) => (b / 100).toString();
  const [local, setLocal] = useState(toPct(bps));
  useEffect(() => setLocal(toPct(bps)), [bps]);
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      max="100"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const b = Math.round(Number(local) * 100);
        if (!Number.isNaN(b) && b !== bps) onCommit(b);
      }}
      className="w-full h-9 px-3 text-[13px] rounded-[8px] border outline-none focus:ring-1"
      style={{ borderColor: "#E5E7EB", color: "#111827" }}
    />
  );
}

/* -------------------------- Payment history tab ------------------------- */
function PaymentHistoryTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/admin/billing/invoices?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setInvoices(json.data ?? []);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter);
  }, [load, statusFilter]);

  const statuses = ["ALL", "OPEN", "PAID", "OVERDUE", "DRAFT", "VOID"];

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 text-[12px] rounded-[8px] border transition-colors"
            style={statusFilter === s ? { background: "#1E3A5F", color: "white", borderColor: "#1E3A5F" } : { borderColor: "#E5E7EB", color: "#6B7280" }}
          >
            {s === "ALL" ? "All" : INV_PILL[s as InvStatus].label}
          </button>
        ))}
      </div>

      <div className="rounded-[10px] overflow-hidden" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Invoice</th>
              <th className="text-left px-3 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Tenant</th>
              <th className="text-left px-3 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Amount</th>
              <th className="text-left px-3 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Status</th>
              <th className="text-left px-3 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Issued</th>
              <th className="text-left px-3 py-3.5 text-[12px] font-semibold" style={{ color: "#6B7280" }}>Paid</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                  {[1, 2, 3, 4, 5, 6].map((c) => <td key={c} className="px-5 py-4"><Skeleton className="h-4 w-full rounded" /></td>)}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: "#9CA3AF" }}>No invoices found.</td></tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr key={inv.id} style={{ borderBottom: idx < invoices.length - 1 ? "0.5px solid #F3F4F6" : "none" }}>
                  <td className="px-5 py-4 text-[13px] font-medium" style={{ color: "#111827" }}>{inv.invoiceNumber}</td>
                  <td className="px-3 py-4 text-[13px]" style={{ color: "#374151" }}>{inv.tenant.name}</td>
                  <td className="px-3 py-4 text-[13px]" style={{ color: "#374151" }}>{peso(inv.total, inv.currency)}</td>
                  <td className="px-3 py-4"><span className={`text-[11px] rounded-full px-2.5 py-1 ${INV_PILL[inv.status].cls}`}>{INV_PILL[inv.status].label}</span></td>
                  <td className="px-3 py-4 text-[12px]" style={{ color: "#374151" }}>{fmtDate(inv.issuedAt)}</td>
                  <td className="px-3 py-4 text-[12px]" style={{ color: "#374151" }}>{fmtDate(inv.paidAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="text-gray-500 text-sm">Loading…</div></div>}>
      <BillingContent />
    </Suspense>
  );
}
