"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StatutoryRule {
  id: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  legalBasis: string;
  createdAt: string;
}

interface StatutoryCategory {
  key: string;
  label: string;
  apiPath: string;
  payloadHint: string;
}

const CATEGORIES: StatutoryCategory[] = [
  {
    key: "sss",
    label: "SSS",
    apiPath: "/api/admin/statutory/sss",
    payloadHint: `{
  "brackets": [
    { "rangeFrom": 0, "rangeTo": 3249.99, "employeeShare": 135, "employerShare": 275 }
  ]
}`,
  },
  {
    key: "philhealth",
    label: "PhilHealth",
    apiPath: "/api/admin/statutory/philhealth",
    payloadHint: `{
  "rate": 0.05,
  "minMonthlyPremium": 500,
  "maxMonthlyPremium": 3500
}`,
  },
  {
    key: "pagibig",
    label: "Pag-IBIG",
    apiPath: "/api/admin/statutory/pagibig",
    payloadHint: `{
  "employeeRate": 0.02,
  "employerRate": 0.02,
  "maxBasisAmount": 5000
}`,
  },
  {
    key: "bir",
    label: "BIR",
    apiPath: "/api/admin/statutory/bir",
    payloadHint: `{
  "brackets": [
    { "taxableIncomeFrom": 0, "taxableIncomeTo": 250000, "rate": 0, "fixedTax": 0 }
  ]
}`,
  },
  {
    key: "deminimis",
    label: "De Minimis",
    apiPath: "/api/admin/statutory/deminimis",
    payloadHint: `{
  "ceilings": [
    { "benefit": "rice_subsidy", "monthlyLimit": 2000, "annualLimit": 24000 }
  ]
}`,
  },
  {
    key: "minwage",
    label: "Min Wage",
    apiPath: "/api/admin/statutory/minwage",
    payloadHint: `{
  "region": "NCR",
  "dailyMinimumWage": 610,
  "costOfLiving": 50
}`,
  },
];

interface TabPanelProps {
  category: StatutoryCategory;
}

function StatutoryTabPanel({ category }: TabPanelProps) {
  const [rules, setRules] = useState<StatutoryRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    effectiveFrom: "",
    effectiveTo: "",
    legalBasis: "",
    version: "",
    payload: category.payloadHint,
  });

  const [editRule, setEditRule] = useState<StatutoryRule | null>(null);
  const [editForm, setEditForm] = useState({ effectiveTo: "", legalBasis: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(category.apiPath);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRules(data.data ?? []);
    } catch {
      toast.error(`Failed to load ${category.label} rules`);
    } finally {
      setLoading(false);
    }
  }, [category.apiPath, category.label]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  function handleAddClick(e: React.FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  async function confirmCreate() {
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(form.payload);
      } catch {
        toast.error("Invalid JSON in payload");
        return;
      }
      const res = await fetch(category.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveFrom: new Date(form.effectiveFrom).toISOString(),
          effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
          legalBasis: form.legalBasis,
          version: form.version,
          payload,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Failed to create rule");
        return;
      }
      toast.success(`${category.label} rule created`);
      setConfirmOpen(false);
      setAddOpen(false);
      setForm({ effectiveFrom: "", effectiveTo: "", legalBasis: "", version: "", payload: category.payloadHint });
      fetchRules();
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(rule: StatutoryRule) {
    setEditRule(rule);
    setEditForm({
      effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo).toISOString().slice(0, 16) : "",
      legalBasis: rule.legalBasis,
    });
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRule) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${category.apiPath}/${editRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveTo: editForm.effectiveTo ? new Date(editForm.effectiveTo).toISOString() : null,
          legalBasis: editForm.legalBasis || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Failed to update rule");
        return;
      }
      toast.success("Rule updated");
      setEditOpen(false);
      fetchRules();
    } catch {
      toast.error("Failed to update rule");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Rule</Button>
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Effective From</TableHead>
              <TableHead>Effective To</TableHead>
              <TableHead>Legal Basis</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">No rules found.</TableCell>
              </TableRow>
            ) : (
              rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.version}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(r.effectiveFrom).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString() : (
                      <span className="text-green-600 font-medium">Current</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.legalBasis}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Rule Sheet */}
      <Sheet open={addOpen} onOpenChange={(o: boolean) => { if (!o) setAddOpen(false); }}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add {category.label} Rule</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleAddClick} className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Effective From <span className="text-red-500">*</span></Label>
              <Input
                type="datetime-local"
                required
                value={form.effectiveFrom}
                onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Effective To (optional)</Label>
              <Input
                type="datetime-local"
                value={form.effectiveTo}
                onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Legal Basis <span className="text-red-500">*</span></Label>
              <Input
                required
                placeholder="e.g. Republic Act 11199"
                value={form.legalBasis}
                onChange={(e) => setForm((f) => ({ ...f, legalBasis: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Version <span className="text-red-500">*</span></Label>
              <Input
                required
                placeholder="e.g. 2026-01"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Payload (JSON)</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={form.payload}
                onChange={(e) => setForm((f) => ({ ...f, payload: e.target.value }))}
              />
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Review &amp; Add</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Rule Sheet */}
      <Sheet open={editOpen} onOpenChange={(o: boolean) => { if (!o) setEditOpen(false); }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Rule — {editRule?.version}</SheetTitle>
          </SheetHeader>
          <form onSubmit={saveEdit} className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Legal Basis</Label>
              <Input
                value={editForm.legalBasis}
                onChange={(e) => setEditForm((f) => ({ ...f, legalBasis: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Effective To (optional — leave blank to keep as current)</Label>
              <Input
                type="datetime-local"
                value={editForm.effectiveTo}
                onChange={(e) => setEditForm((f) => ({ ...f, effectiveTo: e.target.value }))}
              />
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o: boolean) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm — Add {category.label} Rule</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will add a new{" "}
            <strong>{category.label}</strong> statutory rule effective{" "}
            <strong>
              {form.effectiveFrom ? new Date(form.effectiveFrom).toLocaleDateString() : "—"}
            </strong>
            . This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmCreate} disabled={saving}>
              {saving ? "Creating…" : "Confirm &amp; Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StatutoryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Statutory Rules</h1>
      <p className="text-sm text-gray-500 mb-6">Manage global statutory contribution and tax tables.</p>

      <Tabs defaultValue="sss">
        <TabsList className="mb-6 flex-wrap h-auto">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>{c.label}</TabsTrigger>
          ))}
        </TabsList>
        {CATEGORIES.map((c) => (
          <TabsContent key={c.key} value={c.key}>
            <StatutoryTabPanel category={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
