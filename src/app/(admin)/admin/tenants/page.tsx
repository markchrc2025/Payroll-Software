"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
}

const TIER_BADGE: Record<SubscriptionTier, string> = {
  STARTER: "secondary",
  GROWTH: "default",
  PRO: "outline",
};

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  ACTIVE: "outline",
  TRIALING: "default",
  PAST_DUE: "bg-yellow-100 text-yellow-800 border-yellow-300",
  CANCELLED: "destructive",
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all organizations on the platform</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New Tenant</Button>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by name or subdomain…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Subdomain</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                  No tenants found.
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/admin/tenants/${t.id}`)}
                >
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-gray-500">{t.subdomain ?? "—"}</TableCell>
                  <TableCell className="text-gray-500">{t.industry ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={TIER_BADGE[t.subscriptionTier] as "default" | "secondary" | "outline" | "destructive"}>
                      {t.subscriptionTier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {STATUS_BADGE[t.subscriptionStatus].startsWith("bg-") ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[t.subscriptionStatus]}`}>
                        {t.subscriptionStatus}
                      </span>
                    ) : (
                      <Badge variant={STATUS_BADGE[t.subscriptionStatus] as "default" | "secondary" | "outline" | "destructive"}>
                        {t.subscriptionStatus}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
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
