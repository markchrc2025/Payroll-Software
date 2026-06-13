"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHead, StatCard, Card, Badge, PlanBadge, CpIcon, STATUS_LABEL, INVOICE_LABEL } from "../components/cp";

type Tier = "STARTER" | "GROWTH" | "PRO";
type SubStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
type InvStatus = "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "VOID";
type Cycle = "MONTHLY" | "ANNUAL";

interface Package {
  id: string; tier: Tier; name: string; description: string | null;
  monthlyPrice: number; annualPrice: number; taxRateBps: number;
  currency: string; isActive: boolean; features: string[];
}
interface SubRow {
  id: string; name: string; subdomain: string | null;
  subscription: {
    id: string; billingCycle: Cycle; status: SubStatus; nextBillingDate: string | null;
    package: { id: string; tier: Tier; name: string; monthlyPrice: number; annualPrice: number; currency: string };
  } | null;
}
interface InvoiceRow {
  id: string; invoiceNumber: string; total: number; currency: string;
  status: InvStatus; issuedAt: string | null; dueAt: string | null; paidAt: string | null;
  tenant: { id: string; name: string };
}
interface Overview {
  mrr: number; activeSubscriptions: number; outstandingTotal: number;
  outstandingCount: number; collectedThisMonth: number; recentInvoices: InvoiceRow[];
}

const TABS = ["Overview", "Subscriptions", "Packages", "Payment history"] as const;
type Tab = (typeof TABS)[number];

/** Amounts are centavos. */
function peso(centavos: number, currency = "PHP") {
  const v = (Number.isFinite(centavos) ? centavos : 0) / 100;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(v);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function InvoiceTable({ rows, showPaid }: { rows: InvoiceRow[]; showPaid?: boolean }) {
  if (rows.length === 0) return <div className="cp-empty">No invoices found.</div>;
  return (
    <table className="cp-table">
      <thead>
        <tr>
          <th>Invoice</th><th>Tenant</th><th className="cp-num">Amount</th><th>Status</th>
          <th>Issued</th>{showPaid && <th>Paid</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((inv) => (
          <tr key={inv.id} className="cp-row">
            <td><b className="cp-mono">{inv.invoiceNumber}</b></td>
            <td>{inv.tenant.name}</td>
            <td className="cp-num">{peso(inv.total, inv.currency)}</td>
            <td><Badge tone={INVOICE_LABEL[inv.status]}>{INVOICE_LABEL[inv.status]}</Badge></td>
            <td className="cp-muted">{fmtDate(inv.issuedAt)}</td>
            {showPaid && <td className="cp-muted">{fmtDate(inv.paidAt)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BillingContent() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <>
      <PageHead
        title="Billing"
        sub="Packages, subscriptions, invoices and payments across all clients"
        actions={<button className="cp-btn cp-btn-primary"><CpIcon name="plus" size={16} /> New invoice</button>}
      />
      <div className="cp-tabs">
        {TABS.map((t) => (
          <button key={t} className={"cp-tab" + (tab === t ? " is-active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab />}
      {tab === "Subscriptions" && <SubscriptionsTab router={router} />}
      {tab === "Packages" && <PackagesTab />}
      {tab === "Payment history" && <PaymentHistoryTab />}
    </>
  );
}

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing/overview");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data ?? json);
    } catch { toast.error("Failed to load billing overview"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="cp-stats cp-stats-4">
        <StatCard label="Monthly recurring revenue" value={data ? peso(data.mrr) : "—"} icon="analytics" tone="orange" />
        <StatCard label="Active subscriptions" value={data ? data.activeSubscriptions : "—"} icon="tenants" tone="blue" />
        <StatCard label="Outstanding" value={data ? peso(data.outstandingTotal) : "—"} icon="billing" tone="red" sub={data ? `${data.outstandingCount} invoices` : undefined} />
        <StatCard label="Collected this month" value={data ? peso(data.collectedThisMonth) : "—"} icon="billing" tone="green" />
      </div>
      <Card title="Recent invoices" action={<button className="cp-link" onClick={load}>Refresh <CpIcon name="refresh" size={14} /></button>} pad={false}>
        {data ? <InvoiceTable rows={data.recentInvoices} /> : <div className="cp-empty">Loading…</div>}
      </Card>
    </>
  );
}

function SubscriptionsTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/billing/subscriptions?limit=50");
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRows(json.data ?? []);
      } catch { toast.error("Failed to load subscriptions"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <Card title="Active subscriptions" pad={false}>
      {loading ? <div className="cp-empty">Loading…</div> : rows.length === 0 ? <div className="cp-empty">No subscriptions yet.</div> : (
        <table className="cp-table">
          <thead><tr><th>Tenant</th><th>Plan</th><th>Cycle</th><th className="cp-num">MRR</th><th>Renews</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const sub = r.subscription;
              const mrr = sub ? (sub.billingCycle === "ANNUAL" ? sub.package.annualPrice / 12 : sub.package.monthlyPrice) : 0;
              return (
                <tr key={r.id} className="cp-row cp-row-click" onClick={() => router.push(`/centralportal/tenants/${r.id}`)}>
                  <td>
                    <div className="cp-co">
                      <span className="cp-co-logo">{r.name.charAt(0).toUpperCase()}</span>
                      <div><b>{r.name}</b>{r.subdomain && <i>{r.subdomain}</i>}</div>
                    </div>
                  </td>
                  <td>{sub ? <PlanBadge tier={sub.package.tier} /> : <span className="cp-muted">Unassigned</span>}</td>
                  <td className="cp-muted">{sub ? (sub.billingCycle === "ANNUAL" ? "Annual" : "Monthly") : "—"}</td>
                  <td className="cp-num">{sub ? peso(mrr, sub.package.currency) : "—"}</td>
                  <td className="cp-muted">{sub ? fmtDate(sub.nextBillingDate) : "—"}</td>
                  <td>{sub ? <Badge tone={STATUS_LABEL[sub.status]}>{STATUS_LABEL[sub.status]}</Badge> : <Badge tone="Cancelled">None</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

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
    } catch { toast.error("Failed to load packages"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function savePackage(p: Package, patch: Partial<Package>) {
    setSaving(p.id);
    try {
      const res = await fetch("/api/admin/billing/packages", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, ...patch }),
      });
      if (!res.ok) throw new Error();
      toast.success("Package updated");
      load();
    } catch { toast.error("Failed to update package"); }
    finally { setSaving(null); }
  }

  if (loading) return <div className="cp-empty">Loading packages…</div>;

  return (
    <div className="cp-pkgs">
      {packages.map((p) => (
        <div key={p.id} className={"cp-pkg" + (p.tier === "PRO" ? " is-pop" : "")}>
          {p.tier === "PRO" && <span className="cp-pkg-pop">Most popular</span>}
          <h4>{p.name}</h4>
          <div className="cp-pkg-price">{peso(p.monthlyPrice, p.currency)}<span>/mo</span></div>
          <p className="cp-pkg-blurb">{p.description ?? `${p.tier.charAt(0)}${p.tier.slice(1).toLowerCase()} plan`}</p>
          {p.features.length > 0 && (
            <ul>{p.features.map((f) => <li key={f}><CpIcon name="audit" size={14} /> {f}</li>)}</ul>
          )}
          <div className="cp-pkg-foot">
            <span className="cp-muted">{p.isActive ? "Active" : "Inactive"}</span>
            <Badge tone={p.tier === "PRO" ? "High" : p.tier === "GROWTH" ? "Normal" : "System"}>{p.tier.charAt(0) + p.tier.slice(1).toLowerCase()}</Badge>
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <PriceField label="Monthly (₱)" centavos={p.monthlyPrice} disabled={saving === p.id} onCommit={(c) => savePackage(p, { monthlyPrice: c })} />
            <PriceField label="Annual (₱)" centavos={p.annualPrice} disabled={saving === p.id} onCommit={(c) => savePackage(p, { annualPrice: c })} />
            <PctField label="Tax (%)" bps={p.taxRateBps} disabled={saving === p.id} onCommit={(b) => savePackage(p, { taxRateBps: b })} />
          </div>
        </div>
      ))}
    </div>
  );
}

function fieldInputStyle(): React.CSSProperties {
  return { width: "100%", height: 36, padding: "0 11px", fontSize: 13, borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", outline: "none", fontFamily: "var(--font)" };
}
function PriceField({ label, centavos, onCommit, disabled }: { label: string; centavos: number; onCommit: (c: number) => void; disabled?: boolean }) {
  const [local, setLocal] = useState((centavos / 100).toFixed(2));
  useEffect(() => setLocal((centavos / 100).toFixed(2)), [centavos]);
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>{label}</span>
      <input type="number" step="0.01" min="0" value={local} disabled={disabled} style={fieldInputStyle()}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { const c = Math.round(Number(local) * 100); if (!Number.isNaN(c) && c !== centavos) onCommit(c); }} />
    </label>
  );
}
function PctField({ label, bps, onCommit, disabled }: { label: string; bps: number; onCommit: (b: number) => void; disabled?: boolean }) {
  const [local, setLocal] = useState((bps / 100).toString());
  useEffect(() => setLocal((bps / 100).toString()), [bps]);
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>{label}</span>
      <input type="number" step="0.01" min="0" max="100" value={local} disabled={disabled} style={fieldInputStyle()}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { const b = Math.round(Number(local) * 100); if (!Number.isNaN(b) && b !== bps) onCommit(b); }} />
    </label>
  );
}

function PaymentHistoryTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        const res = await fetch(`/api/admin/billing/invoices?${params}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setInvoices(json.data ?? []);
      } catch { toast.error("Failed to load invoices"); }
      finally { setLoading(false); }
    })();
  }, [statusFilter]);

  const statuses = ["ALL", "OPEN", "PAID", "OVERDUE", "DRAFT", "VOID"];

  return (
    <Card
      title="Payment history"
      pad={false}
      action={
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ fontFamily: "var(--font)", fontSize: 13, height: 32, borderRadius: 8, border: "1px solid var(--line)", padding: "0 10px", background: "var(--paper)", color: "var(--ink)" }}>
          {statuses.map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : INVOICE_LABEL[s as InvStatus]}</option>)}
        </select>
      }
    >
      {loading ? <div className="cp-empty">Loading…</div> : <InvoiceTable rows={invoices} showPaid />}
    </Card>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="cp-empty">Loading…</div>}>
      <BillingContent />
    </Suspense>
  );
}
