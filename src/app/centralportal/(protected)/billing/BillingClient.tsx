"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHead, StatCard, Card, Badge, PlanPill, CpIcon, STATUS_LABEL, INVOICE_LABEL } from "../components/cp";

type Tier = "STARTER" | "GROWTH" | "PRO";
type SubStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
type InvStatus = "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "VOID";
type Cycle = "MONTHLY" | "ANNUAL";

interface Package {
  id: string; tier: Tier | null; name: string; description: string | null;
  monthlyPrice: number; annualPrice: number; taxRateBps: number;
  currency: string; isActive: boolean; isPublished: boolean; sortOrder: number; features: string[];
}
interface SubRow {
  id: string; name: string; subdomain: string | null;
  subscription: {
    id: string; billingCycle: Cycle; status: SubStatus; nextBillingDate: string | null;
    package: { id: string; tier: Tier | null; name: string; monthlyPrice: number; annualPrice: number; currency: string };
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
                  <td>{sub ? <PlanPill label={sub.package.name} tier={sub.package.tier} /> : <span className="cp-muted">Unassigned</span>}</td>
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
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Package | null>(null);
  const [creating, setCreating] = useState(false);

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

  async function togglePublish(p: Package) {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/admin/billing/packages/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !p.isPublished }),
      });
      if (!res.ok) throw new Error();
      toast.success(p.isPublished ? "Package unpublished" : "Package published");
      load();
    } catch { toast.error("Failed to update package"); }
    finally { setBusy(null); }
  }

  async function remove(p: Package) {
    if (!confirm(`Delete the "${p.name}" package?`)) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/admin/billing/packages/${p.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete package");
      toast.success("Package deleted");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to delete package"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="cp-empty">Loading packages…</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="cp-btn cp-btn-primary" onClick={() => setCreating(true)}>
          <CpIcon name="plus" size={16} /> New package
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="cp-empty">No packages yet — create your first one.</div>
      ) : (
        <div className="cp-pkgs">
          {packages.map((p) => (
            <div key={p.id} className={"cp-pkg" + (p.tier === "PRO" ? " is-pop" : "")} style={p.isPublished ? undefined : { opacity: 0.7 }}>
              {p.tier === "PRO" && <span className="cp-pkg-pop">Most popular</span>}
              <h4>{p.name}</h4>
              <div className="cp-pkg-price">{peso(p.monthlyPrice, p.currency)}<span>/mo</span></div>
              <p className="cp-pkg-blurb">{p.description || "—"}</p>
              {p.features.length > 0 && (
                <ul>{p.features.map((f) => <li key={f}><CpIcon name="audit" size={14} /> {f}</li>)}</ul>
              )}
              <div className="cp-pkg-foot">
                <Badge tone={p.isPublished ? "Active" : "Draft"}>{p.isPublished ? "Published" : "Draft"}</Badge>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="cp-btn cp-btn-ghost" disabled={busy === p.id} onClick={() => togglePublish(p)}>
                    {p.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button className="cp-btn cp-btn-ghost" onClick={() => setEditing(p)}>Edit</button>
                  <button className="cp-btn cp-btn-ghost" disabled={busy === p.id} style={{ color: "#b23b34" }} onClick={() => remove(p)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PackageModal
          pkg={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", fontSize: 13.5, borderRadius: 9,
  border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", outline: "none", fontFamily: "var(--body)",
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 12, display: "block", marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

function PackageModal({ pkg, onClose, onSaved }: { pkg: Package | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(pkg?.name ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [tier, setTier] = useState<string>(pkg?.tier ?? "");
  const [monthly, setMonthly] = useState(((pkg?.monthlyPrice ?? 0) / 100).toFixed(2));
  const [annual, setAnnual] = useState(((pkg?.annualPrice ?? 0) / 100).toFixed(2));
  const [tax, setTax] = useState(((pkg?.taxRateBps ?? 0) / 100).toString());
  const [features, setFeatures] = useState((pkg?.features ?? []).join("\n"));
  const [published, setPublished] = useState(pkg?.isPublished ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      tier: tier || null,
      monthlyPrice: Math.round(Number(monthly) * 100) || 0,
      annualPrice: Math.round(Number(annual) * 100) || 0,
      taxRateBps: Math.round(Number(tax) * 100) || 0,
      isPublished: published,
      features: features.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    try {
      const res = await fetch(
        pkg ? `/api/admin/billing/packages/${pkg.id}` : "/api/admin/billing/packages",
        { method: pkg ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error();
      toast.success(pkg ? "Package updated" : "Package created");
      onSaved();
    } catch { toast.error("Failed to save package"); }
    finally { setSaving(false); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(33,26,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, width: 440, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
        <h3 style={{ fontFamily: "var(--font)", fontWeight: 600, fontSize: 17, margin: "0 0 16px" }}>{pkg ? "Edit package" : "New package"}</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pro Plus" /></Field>
          <Field label="Description"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short blurb" /></Field>
          <Field label="Tier tag (badge colour)">
            <select style={{ ...inputStyle, fontFamily: "var(--font)" }} value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="">None</option>
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="PRO">Pro</option>
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Monthly (₱)"><input type="number" step="0.01" min="0" style={inputStyle} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
            <Field label="Annual (₱)"><input type="number" step="0.01" min="0" style={inputStyle} value={annual} onChange={(e) => setAnnual(e.target.value)} /></Field>
          </div>
          <Field label="Tax (%)"><input type="number" step="0.01" min="0" max="100" style={inputStyle} value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
          <Field label="Features (one per line)">
            <textarea style={{ ...inputStyle, height: 84, padding: "8px 11px", resize: "vertical" }} value={features} onChange={(e) => setFeatures(e.target.value)} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5 }}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Published (assignable to tenants)
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="cp-btn cp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="cp-btn cp-btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save package"}</button>
        </div>
      </div>
    </div>
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
