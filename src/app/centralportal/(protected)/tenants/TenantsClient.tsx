"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHead, CpIcon } from "../components/cp";
import { TenantTable, type TenantRow } from "../components/TenantTable";
import { AddTenantWizard } from "./_wizard";

type ApiTenant = {
  id: string;
  name: string;
  subdomain: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: string;
  mrr: number;
  health: number;
  planName: string;
  _count?: { employees: number };
};

const STATUS_OPTS = [
  { v: "ALL", l: "All statuses" }, { v: "ACTIVE", l: "Active" }, { v: "TRIALING", l: "Trialing" },
  { v: "PAST_DUE", l: "Past due" }, { v: "CANCELLED", l: "Cancelled" },
];

function PortalTenantsContent() {
  const router = useRouter();
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [planOpts, setPlanOpts] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Plan filter options come from the live package catalog.
  useEffect(() => {
    fetch("/api/admin/billing/packages")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setPlanOpts([...new Set((d.data as { name: string }[]).map((p) => p.name))]); })
      .catch(() => {});
  }, []);

  const fetchTenants = useCallback(async (s: string, p: number, plan: string, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (s) params.set("search", s);
      const res = await fetch(`/api/admin/tenants?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      let list: ApiTenant[] = data.data ?? [];
      if (plan !== "ALL") list = list.filter((t) => t.planName === plan);
      if (status !== "ALL") list = list.filter((t) => t.subscriptionStatus === status);
      setRows(list.map((t): TenantRow => ({
        id: t.id,
        name: t.name,
        slug: t.subdomain,
        tier: t.subscriptionTier,
        planName: t.planName,
        status: t.subscriptionStatus,
        employees: t._count?.employees ?? 0,
        mrr: t.mrr ?? 0,
        health: t.health ?? 0,
        since: t.createdAt,
      })));
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? list.length);
    } catch {
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants(search, page, planFilter, statusFilter);
  }, [page, planFilter, statusFilter, fetchTenants, search]);

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTenants(v, 1, planFilter, statusFilter), 350);
  }

  function handleWizardClose() {
    setWizardOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    router.replace(url.pathname);
  }

  return (
    <>
      <PageHead
        title="Tenants"
        sub={`${total} ${total === 1 ? "company" : "companies"} on the platform`}
        actions={
          <>
            <button className="cp-btn cp-btn-ghost" onClick={() => fetchTenants(search, page, planFilter, statusFilter)}>
              <CpIcon name="refresh" size={15} /> Refresh
            </button>
            <button className="cp-btn cp-btn-primary" onClick={() => setWizardOpen(true)}>
              <CpIcon name="plus" size={16} /> Add tenant
            </button>
          </>
        }
      />

      <section className="cp-card">
        <div className="cp-filters">
          <label className="cp-field">
            <CpIcon name="search" size={16} />
            <input placeholder="Search tenants…" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
          </label>
          <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}>
            <option value="ALL">All plans</option>
            {planOpts.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="cp-empty">Loading tenants…</div>
        ) : (
          <TenantTable rows={rows} />
        )}
      </section>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="cp-muted">Page {page} of {totalPages}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cp-btn cp-btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="cp-btn cp-btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      <AddTenantWizard open={wizardOpen} onClose={handleWizardClose} onCreated={() => fetchTenants(search, 1, planFilter, statusFilter)} />
    </>
  );
}

export default function PortalTenantsPage() {
  return (
    <Suspense fallback={<div className="cp-empty">Loading…</div>}>
      <PortalTenantsContent />
    </Suspense>
  );
}
