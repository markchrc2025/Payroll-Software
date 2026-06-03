"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  tradeName: string | null;
  subdomain: string | null;
  industry: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  _count?: { employees: number };
}

const TIER_COLOR: Record<SubscriptionTier, { bg: string; text: string }> = {
  STARTER: { bg: "bg-gray-100",   text: "text-gray-700" },
  GROWTH:  { bg: "bg-blue-100",   text: "text-blue-700" },
  PRO:     { bg: "bg-violet-100", text: "text-violet-700" },
};

const STATUS_COLOR: Record<SubscriptionStatus, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: "bg-green-50",  text: "text-green-700",  label: "Active" },
  TRIALING:  { bg: "bg-amber-50",  text: "text-amber-800",  label: "Trial" },
  PAST_DUE:  { bg: "bg-amber-50",  text: "text-amber-800",  label: "Overdue" },
  CANCELLED: { bg: "bg-red-50",    text: "text-red-700",    label: "Cancelled" },
};

const KNOWN_FLAGS = [
  { key: "ai_enabled", label: "AI Assistant" },
  { key: "ats", label: "Recruitment / ATS" },
  { key: "kiosk", label: "Kiosk Module" },
  { key: "expense_claims", label: "Expense Claims" },
  { key: "asset_tracking", label: "Asset Tracking" },
];

const TIERS: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];
const STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"];

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [form, setForm] = useState({
    name: "",
    tradeName: "",
    subdomain: "",
    industry: "",
    subscriptionTier: "STARTER" as SubscriptionTier,
    subscriptionStatus: "TRIALING" as SubscriptionStatus,
    billingEmail: "",
    featureFlags: {} as Record<string, boolean>,
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTenants = useCallback(
    async (s: string, p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: "20" });
        if (s) params.set("search", s);
        const res = await fetch(`/api/admin/tenants?${params}`);
        if (!res.ok) throw new Error("Failed to load tenants");
        const data = await res.json();
        setTenants(data.data ?? []);
        setTotalPages(data.totalPages ?? 1);
      } catch {
        toast.error("Failed to load tenants");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchTenants(search, page);
  }, [page, fetchTenants, search]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTenants(value, 1);
    }, 300);
  }

  function toggleFlag(key: string, checked: boolean) {
    setForm((f) => ({ ...f, featureFlags: { ...f.featureFlags, [key]: checked } }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          tradeName: form.tradeName || null,
          subdomain: form.subdomain || null,
          industry: form.industry || null,
          subscriptionTier: form.subscriptionTier,
          subscriptionStatus: form.subscriptionStatus,
          billingEmail: form.billingEmail || null,
          featureFlags: form.featureFlags,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Failed to create tenant");
        return;
      }
      toast.success("Tenant created");
      setCreateOpen(false);
      setForm({
        name: "", tradeName: "", subdomain: "", industry: "",
        subscriptionTier: "STARTER", subscriptionStatus: "TRIALING",
        billingEmail: "", featureFlags: {},
      });
      fetchTenants(search, page);
    } catch {
      toast.error("Failed to create tenant");
    } finally {
      setSaving(false);
    }
  }

  const visibleTenants = tenants.filter((t) => {
    if (tierFilter !== "ALL" && t.subscriptionTier !== tierFilter) return false;
    if (statusFilter !== "ALL" && t.subscriptionStatus !== statusFilter) return false;
    return true;
  });

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <p className="text-sm font-medium text-gray-900">
          Tenants <span className="text-xs text-gray-400 font-normal ml-1">{loading ? "" : `${tenants.length} total`}</span>
        </p>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 bg-[#1E3A5F] text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#16304f] transition-colors"
        >
          <span className="text-sm leading-none">+</span> Add tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <Input
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 text-xs h-8 border-gray-200"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white outline-none cursor-pointer"
        >
          <option value="ALL">All plans</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white outline-none cursor-pointer"
        >
          <option value="ALL">All status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-2.5 px-3 text-[10px] text-gray-500 font-medium w-[28%]">Company</th>
              <th className="text-left py-2.5 px-2 text-[10px] text-gray-500 font-medium w-[14%]">Plan</th>
              <th className="text-left py-2.5 px-2 text-[10px] text-gray-500 font-medium w-[10%]">Emp.</th>
              <th className="text-left py-2.5 px-2 text-[10px] text-gray-500 font-medium w-[13%]">Status</th>
              <th className="text-left py-2.5 px-2 text-[10px] text-gray-500 font-medium w-[16%]">Industry</th>
              <th className="text-left py-2.5 px-2 text-[10px] text-gray-500 font-medium w-[19%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-2.5 px-3">
                      <Skeleton className="h-3.5 w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 text-xs py-10">
                  No tenants found.
                </td>
              </tr>
            ) : (
              visibleTenants.map((t) => {
                const tier = TIER_COLOR[t.subscriptionTier];
                const status = STATUS_COLOR[t.subscriptionStatus];
                return (
                  <tr
                    key={t.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{t.subdomain ?? t.id.slice(0, 12)}</p>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${tier.bg} ${tier.text}`}>
                        {t.subscriptionTier}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-600">
                      {t._count?.employees ?? "—"}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-[11px] text-gray-500 truncate">
                      {t.industry ?? "—"}
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        onClick={() => router.push(`/admin/tenants/${t.id}`)}
                        className="text-[10px] border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-gray-500 self-center">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={(o: boolean) => { if (!o) setCreateOpen(false); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Tenant</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Trade Name</Label>
              <Input value={form.tradeName} onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Subdomain</Label>
              <Input placeholder="e.g. acme-corp" value={form.subdomain} onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Subscription Tier</Label>
              <Select value={form.subscriptionTier} onValueChange={(v) => { const val = v ?? "STARTER"; setForm((f) => ({ ...f, subscriptionTier: val as SubscriptionTier })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subscription Status</Label>
              <Select value={form.subscriptionStatus} onValueChange={(v) => { const val = v ?? "TRIALING"; setForm((f) => ({ ...f, subscriptionStatus: val as SubscriptionStatus })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Billing Email</Label>
              <Input type="email" value={form.billingEmail} onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Feature Flags</Label>
              {KNOWN_FLAGS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`flag-${key}`}
                    checked={!!form.featureFlags[key]}
                    onCheckedChange={(checked: boolean | "indeterminate") => toggleFlag(key, checked === true)}
                  />
                  <label htmlFor={`flag-${key}`} className="text-sm cursor-pointer">{label}</label>
                </div>
              ))}
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Tenant"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
