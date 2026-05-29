"use client";

import { use, useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubscriptionTier = "STARTER" | "GROWTH" | "PRO";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

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

const KNOWN_FLAGS: { key: string; label: string; desc: string }[] = [
  { key: "ai_enabled", label: "AI Assistant", desc: "HR Chat, Compliance Helper, Payslip Q&A" },
  { key: "ats", label: "Recruitment / ATS", desc: "Applicant tracking and job postings" },
  { key: "kiosk", label: "Kiosk Module", desc: "Physical kiosk device time punching" },
  { key: "expense_claims", label: "Expense Claims", desc: "Employee expense reimbursement" },
  { key: "asset_tracking", label: "Asset Tracking", desc: "Company asset management" },
];

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

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!tenant) {
    return <p className="text-gray-500">Tenant not found.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{tenant.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Tenant ID: {id}</p>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="audit" onClick={fetchAudit}>Audit Log</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ─────────────────────────────── */}
        <TabsContent value="overview">
          <form onSubmit={saveOverview} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input required value={overview.name} onChange={(e) => setOverview((o) => ({ ...o, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Trade Name</Label>
                <Input value={overview.tradeName} onChange={(e) => setOverview((o) => ({ ...o, tradeName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Subdomain</Label>
                <Input value={overview.subdomain} onChange={(e) => setOverview((o) => ({ ...o, subdomain: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Input value={overview.industry} onChange={(e) => setOverview((o) => ({ ...o, industry: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Billing Email</Label>
                <Input type="email" value={overview.billingEmail} onChange={(e) => setOverview((o) => ({ ...o, billingEmail: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Contact Email</Label>
                <Input type="email" value={overview.contactEmail} onChange={(e) => setOverview((o) => ({ ...o, contactEmail: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Contact Phone</Label>
                <Input value={overview.contactPhone} onChange={(e) => setOverview((o) => ({ ...o, contactPhone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Trial Ends At</Label>
                <Input
                  type="datetime-local"
                  value={overview.trialEndsAt}
                  onChange={(e) => setOverview((o) => ({ ...o, trialEndsAt: e.target.value }))}
                />
              </div>
            </div>
            <Button type="submit" disabled={savingOverview}>
              {savingOverview ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </TabsContent>

        {/* ── SUBSCRIPTION TAB ──────────────────────────── */}
        <TabsContent value="subscription">
          <form onSubmit={saveSubscription} className="space-y-4 max-w-sm">
            <div className="space-y-1">
              <Label>Subscription Tier</Label>
              <Select value={tier} onValueChange={(v) => { const val = v ?? "STARTER"; setTier(val as SubscriptionTier); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subscription Status</Label>
              <Select value={status} onValueChange={(v) => { const val = v ?? "TRIALING"; setStatus(val as SubscriptionStatus); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={savingSubscription}>
              {savingSubscription ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </TabsContent>

        {/* ── FEATURE FLAGS TAB ─────────────────────────── */}
        <TabsContent value="flags">
          <div className="max-w-lg space-y-1">
            {KNOWN_FLAGS.map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
                <button
                  type="button"
                  disabled={togglingFlag === key}
                  onClick={() => toggleFlag(key, !!flags[key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                    ${flags[key] ? "bg-sky-500" : "bg-gray-300"}
                    ${togglingFlag === key ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                  aria-pressed={!!flags[key]}
                  aria-label={`Toggle ${label}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                      ${flags[key] ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <p className="text-xs text-gray-500">
            Unknown flags from DB are preserved and not shown here.
          </p>
        </TabsContent>

        {/* ── AUDIT LOG TAB ─────────────────────────────── */}
        <TabsContent value="audit">
          {auditLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-400 py-8">No audit entries.</TableCell>
                    </TableRow>
                  ) : (
                    auditEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.actorUserId ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{e.action}</Badge></TableCell>
                        <TableCell className="text-sm">{e.entity}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">{e.entityId ?? "—"}</TableCell>
                        <TableCell className="text-xs text-gray-500">{e.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
