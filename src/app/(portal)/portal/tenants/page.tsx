"use client";


export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AddTenantWizard } from "./_wizard";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  tradeName: string | null;
  subdomain: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  _count?: { employees: number };
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

const TIERS: SubscriptionTier[] = ["STARTER", "GROWTH", "PRO"];
const STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"];

export default function PortalTenantsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);

  // Auto-open wizard when ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") setWizardOpen(true);
  }, [searchParams]);

  const fetchTenants = useCallback(async (s: string, p: number, tier: string, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (s) params.set("search", s);
      const res = await fetch(`/api/admin/tenants?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      let rows: Tenant[] = data.data ?? [];
      if (tier !== "ALL") rows = rows.filter((t) => t.subscriptionTier === tier);
      if (status !== "ALL") rows = rows.filter((t) => t.subscriptionStatus === status);
      setTenants(rows);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? rows.length);
    } catch {
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants(search, page, tierFilter, statusFilter);
  }, [page, tierFilter, statusFilter, fetchTenants, search]);

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTenants(v, 1, tierFilter, statusFilter), 350);
  }

  function handleWizardClose() {
    setWizardOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    router.replace(url.pathname);
  }

  function handleTenantCreated(_newId: string) {
    fetchTenants(search, 1, tierFilter, statusFilter);
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="max-w-5xl mx-auto" style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "#111827" }}>
            Tenants{" "}
            {!loading && <span className="text-[12px] font-normal" style={{ color: "#6B7280" }}>{total} total</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTenants(search, page, tierFilter, statusFilter)}
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] border transition-colors hover:bg-gray-50"
            style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: "#1E3A5F" }}
          >
            <Plus size={13} /> Add tenant
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search tenants..."
            className="pl-8 h-8 text-[12px]"
          />
        </div>
        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v ?? "ALL"); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-8 text-[12px]">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-[12px]">All plans</SelectItem>
            {TIERS.map((t) => <SelectItem key={t} value={t} className="text-[12px]">{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "ALL"); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-8 text-[12px]">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-[12px]">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-[12px]">{STATUS_PILL[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-[10px] overflow-hidden" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th className="text-left px-4 py-2.5 text-[10px] font-medium w-[30%]" style={{ color: "#6B7280" }}>Company</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[14%]" style={{ color: "#6B7280" }}>Plan</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[10%]" style={{ color: "#6B7280" }}>Emp.</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[13%]" style={{ color: "#6B7280" }}>Status</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[17%]" style={{ color: "#6B7280" }}>Since</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[16%]" style={{ color: "#6B7280" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                  {[1, 2, 3, 4, 5, 6].map((c) => (
                    <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                  ))}
                </tr>
              ))
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[12px]" style={{ color: "#9CA3AF" }}>
                  No tenants found.
                </td>
              </tr>
            ) : tenants.map((t, idx) => (
              <tr
                key={t.id}
                style={{ borderBottom: idx < tenants.length - 1 ? "0.5px solid #F3F4F6" : "none" }}
              >
                <td className="px-4 py-2.5">
                  <p className="text-[12px] font-medium truncate" style={{ color: "#111827" }}>{t.name}</p>
                  {t.subdomain && <p className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>{t.subdomain}</p>}
                </td>
                <td className="px-2 py-2.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${TIER_PILL[t.subscriptionTier]}`}>
                    {t.subscriptionTier.charAt(0) + t.subscriptionTier.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-[12px]" style={{ color: "#374151" }}>
                  {t._count?.employees ?? "—"}
                </td>
                <td className="px-2 py-2.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[t.subscriptionStatus].cls}`}>
                    {STATUS_PILL[t.subscriptionStatus].label}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-[11px]" style={{ color: "#374151" }}>
                  {fmtDate(t.createdAt)}
                </td>
                <td className="px-2 py-2.5">
                  <Link
                    href={`/portal/tenants/${t.id}`}
                    className="text-[10px] rounded-[6px] px-2.5 py-1 border transition-colors hover:bg-gray-50"
                    style={{ borderColor: "#E5E7EB", color: "#374151" }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[11px]" style={{ color: "#6B7280" }}>Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-[11px] px-3 py-1.5 rounded-[7px] border disabled:opacity-40"
              style={{ borderColor: "#E5E7EB", color: "#374151" }}
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-[11px] px-3 py-1.5 rounded-[7px] border disabled:opacity-40"
              style={{ borderColor: "#E5E7EB", color: "#374151" }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* 4-step Add Tenant Wizard */}
      <AddTenantWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        onCreated={handleTenantCreated}
      />
    </div>
  );
}
