"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Asset = {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  condition: string;
  purchaseCostCents: string | null;
  purchaseDate: string | null;
  notes: string | null;
  currentAssignment: {
    employeeId: string;
    employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
  } | null;
};

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSET_CONDITIONS = [
  { value: "EXCELLENT", label: "Excellent" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
  { value: "DAMAGED", label: "Damaged" },
];

const ASSET_STATUSES = [
  { value: "AVAILABLE", label: "Available" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "RETIRED", label: "Retired" },
  { value: "DISPOSED", label: "Disposed" },
];

const EMPTY_FORM = {
  assetCode: "",
  name: "",
  category: "",
  brand: "",
  model: "",
  serialNumber: "",
  purchaseDate: "",
  purchaseCost: "",
  condition: "GOOD",
  notes: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeso(centsStr: string | null) {
  if (!centsStr) return "—";
  const n = Number(centsStr) / 100;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "AVAILABLE") return "default";
  if (s === "ASSIGNED") return "outline";
  if (s === "DISPOSED") return "destructive";
  return "secondary";
}

function conditionBadgeVariant(c: string): "default" | "secondary" | "outline" | "destructive" {
  if (c === "EXCELLENT" || c === "GOOD") return "outline";
  if (c === "DAMAGED") return "destructive";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");

  // Create / Edit sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", condition: "GOOD", notes: "" });

  // Assign / Return sheets
  const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
  const [assignForm, setAssignForm] = useState({ employeeId: "", conditionAtAssign: "GOOD", assignmentNotes: "" });
  const [returnTarget, setReturnTarget] = useState<Asset | null>(null);
  const [returnForm, setReturnForm] = useState({ conditionAtReturn: "GOOD", returnNotes: "" });

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?limit=500&status=ACTIVE");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/assets?${params}`);
    const json = await res.json();
    setAssets(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadAssets(); }, [loadAssets]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.assetCode.trim()) { toast.error("Asset code is required"); return; }
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.category.trim()) { toast.error("Category is required"); return; }

    setSaving(true);
    const body: Record<string, unknown> = {
      assetCode: form.assetCode.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      condition: form.condition,
    };
    if (form.brand) body.brand = form.brand;
    if (form.model) body.model = form.model;
    if (form.serialNumber) body.serialNumber = form.serialNumber;
    if (form.purchaseDate) body.purchaseDate = form.purchaseDate;
    if (form.purchaseCost) body.purchaseCost = parseFloat(form.purchaseCost).toFixed(2);
    if (form.notes) body.notes = form.notes;

    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create asset"); return; }
    toast.success("Asset created");
    setCreateOpen(false);
    loadAssets();
  }

  async function handleEdit() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch(`/api/assets/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name || undefined,
        category: editForm.category || undefined,
        condition: editForm.condition,
        notes: editForm.notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to update asset"); return; }
    toast.success("Asset updated");
    setEditTarget(null);
    loadAssets();
  }

  async function handleDelete(asset: Asset) {
    if (!confirm(`Delete asset "${asset.name}" (${asset.assetCode})?`)) return;
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); toast.error(j.error ?? "Failed to delete"); return; }
    toast.success(`Asset "${asset.assetCode}" deleted`);
    loadAssets();
  }

  async function handleAssign() {
    if (!assignTarget) return;
    if (!assignForm.employeeId) { toast.error("Select an employee"); return; }
    setSaving(true);
    const res = await fetch(`/api/assets/${assignTarget.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: assignForm.employeeId,
        conditionAtAssign: assignForm.conditionAtAssign,
        assignmentNotes: assignForm.assignmentNotes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to assign"); return; }
    toast.success("Asset assigned");
    setAssignTarget(null);
    loadAssets();
  }

  async function handleReturn() {
    if (!returnTarget) return;
    setSaving(true);
    const res = await fetch(`/api/assets/${returnTarget.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conditionAtReturn: returnForm.conditionAtReturn,
        returnNotes: returnForm.returnNotes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to process return"); return; }
    toast.success("Asset returned");
    setReturnTarget(null);
    loadAssets();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const empMap = new Map(employees.map((e) => [e.id, e]));
  function empLabel(id: string) {
    const e = empMap.get(id);
    if (!e) return id;
    return `${e.lastName}, ${e.firstName} (${e.employeeNumber})`;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Assets</h1>
        <p className="text-sm text-muted-foreground">Company asset inventory and employee assignments</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ASSET_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAssets} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Asset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Brand / Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-sm font-medium">{asset.assetCode}</TableCell>
                  <TableCell className="font-medium text-sm">{asset.name}</TableCell>
                  <TableCell className="text-sm">{asset.category}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[asset.brand, asset.model].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(asset.status)}>
                      {ASSET_STATUSES.find((s) => s.value === asset.status)?.label ?? asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={conditionBadgeVariant(asset.condition)}>
                      {ASSET_CONDITIONS.find((c) => c.value === asset.condition)?.label ?? asset.condition}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {asset.currentAssignment
                      ? `${asset.currentAssignment.employee.lastName}, ${asset.currentAssignment.employee.firstName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPeso(asset.purchaseCostCents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditTarget(asset);
                          setEditForm({ name: asset.name, category: asset.category, condition: asset.condition, notes: asset.notes ?? "" });
                        }}
                      >
                        Edit
                      </Button>
                      {asset.status === "AVAILABLE" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-sky-600 hover:text-sky-700"
                            onClick={() => { setAssignTarget(asset); setAssignForm({ employeeId: "", conditionAtAssign: asset.condition, assignmentNotes: "" }); }}
                          >
                            Assign
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(asset)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {asset.status === "ASSIGNED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                          onClick={() => { setReturnTarget(asset); setReturnForm({ conditionAtReturn: asset.condition, returnNotes: "" }); }}
                        >
                          Return
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > 50 && (
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} assets.</p>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Asset</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Asset Code <span className="text-destructive">*</span></Label>
                <Input placeholder="LT-001" value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input placeholder="MacBook Pro 14" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Input placeholder="Laptop" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v ?? form.condition })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input placeholder="Apple" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input placeholder="MBP 14 M3" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Serial Number</Label>
                <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Date</Label>
                <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Cost (₱)</Label>
              <Input type="number" min="0" step="0.01" placeholder="45000.00" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create Asset"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Asset</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {editTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Code:</span> {editTarget.assetCode}</p>
                <p><span className="text-muted-foreground">Serial:</span> {editTarget.serialNumber ?? "—"}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={editForm.condition} onValueChange={(v) => setEditForm({ ...editForm, condition: v ?? editForm.condition })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleEdit} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Assign Sheet */}
      <Sheet open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Assign Asset</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {assignTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p><span className="text-muted-foreground">Asset:</span> {assignTarget.assetCode} — {assignTarget.name}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={assignForm.employeeId} onValueChange={(v) => setAssignForm({ ...assignForm, employeeId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condition at Assignment</Label>
              <Select value={assignForm.conditionAtAssign} onValueChange={(v) => setAssignForm({ ...assignForm, conditionAtAssign: v ?? assignForm.conditionAtAssign })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignment Notes</Label>
              <Textarea rows={2} value={assignForm.assignmentNotes} onChange={(e) => setAssignForm({ ...assignForm, assignmentNotes: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleAssign} disabled={saving}>
                {saving ? "Assigning…" : "Assign"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setAssignTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Return Sheet */}
      <Sheet open={!!returnTarget} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Return Asset</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {returnTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Asset:</span> {returnTarget.assetCode} — {returnTarget.name}</p>
                {returnTarget.currentAssignment && (
                  <p>
                    <span className="text-muted-foreground">Assigned to:</span>{" "}
                    {empLabel(returnTarget.currentAssignment.employeeId)}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Condition at Return</Label>
              <Select value={returnForm.conditionAtReturn} onValueChange={(v) => setReturnForm({ ...returnForm, conditionAtReturn: v ?? returnForm.conditionAtReturn })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Return Notes</Label>
              <Textarea rows={2} value={returnForm.returnNotes} onChange={(e) => setReturnForm({ ...returnForm, returnNotes: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleReturn} disabled={saving}>
                {saving ? "Processing…" : "Confirm Return"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setReturnTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
