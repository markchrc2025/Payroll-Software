"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Building2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const TIER_COLOR: Record<string, string> = {
  PRO: "#10B981", GROWTH: "#3B82F6", STARTER: "#6B7280",
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#10B981", TRIALING: "#F59E0B", PAST_DUE: "#EF4444", CANCELLED: "#6B7280",
};

type Tenant = {
  id: string;
  name: string;
  tradeName: string | null;
  subdomain: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  createdAt: string;
  _count: { employees: number; users: number };
};

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function TenantsPage() {
  const [search, setSearch]   = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const debouncedSearch       = useDebounce(search, 300);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res  = await fetch(`/api/admin/tenants?${params}`);
      const data = await res.json();
      setTenants(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tenants</h1>
          <p className="text-sm text-white/40 mt-0.5">{total} registered organisations</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchTenants}
            className="text-white/40 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            asChild
            className="text-white hover:opacity-90"
            style={{ background: "#2D6BE4" }}
          >
            <Link href="/centralportal/tenants/new">
              <Plus className="w-4 h-4 mr-2" />
              Onboard Tenant
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          placeholder="Search tenants…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500/50"
        />
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#0F2340", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {["Company", "Plan", "Status", "Employees", "Users", "Trial Ends", "Created", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-xs text-white/30 uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div
                          className="h-3 rounded animate-pulse"
                          style={{ background: "rgba(255,255,255,0.06)", width: "60%" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : tenants.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-sm text-white/30">No tenants found</p>
                  </td>
                </tr>
              )
              : tenants.map((t, i) => (
                  <tr
                    key={t.id}
                    className="hover:bg-white/[0.02] transition-colors"
                    style={{
                      borderBottom:
                        i < tenants.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/centralportal/tenants/${t.id}`}
                        className="font-medium text-white hover:text-blue-400 text-sm"
                      >
                        {t.name}
                      </Link>
                      {t.subdomain && (
                        <p className="text-xs text-white/30 mt-0.5">{t.subdomain}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: `${TIER_COLOR[t.subscriptionTier] ?? "#6B7280"}25`,
                          color: TIER_COLOR[t.subscriptionTier] ?? "#6B7280",
                        }}
                      >
                        {t.subscriptionTier}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          background: `${STATUS_COLOR[t.subscriptionStatus] ?? "#6B7280"}25`,
                          color: STATUS_COLOR[t.subscriptionStatus] ?? "#6B7280",
                        }}
                      >
                        {t.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/60">{t._count.employees}</td>
                    <td className="px-5 py-3.5 text-sm text-white/60">{t._count.users}</td>
                    <td className="px-5 py-3.5 text-sm text-white/40">
                      {t.trialEndsAt
                        ? new Date(t.trialEndsAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/40">
                      {new Date(t.createdAt).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/centralportal/tenants/${t.id}`}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-5 py-3 border-t"
            style={{ borderColor: "rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs text-white/30">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/50 hover:text-white text-xs"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/50 hover:text-white text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
