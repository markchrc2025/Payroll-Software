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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Loan = {
  id: string;
  employeeId: string;
  loanType: string;
  referenceNumber: string | null;
  principalCents: string;
  installmentCents: string;
  balanceCents: string;
  status: string;
  startDate: string;
  closedDate: string | null;
  notes: string | null;
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

const LOAN_TYPES = [
  { value: "SSS", label: "SSS" },
  { value: "PAGIBIG", label: "Pag-IBIG" },
  { value: "CASH_ADVANCE", label: "Cash Advance" },
  { value: "COMPANY", label: "Company" },
];

const LOAN_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ON_HOLD", label: "On Hold" },
];

const EMPTY_FORM = {
  employeeId: "",
  loanType: "COMPANY",
  principal: "",
  installment: "",
  startDate: "",
  referenceNumber: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeso(centsStr: string) {
  const n = Number(centsStr) / 100;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loanTypeBadgeVariant(t: string): "default" | "secondary" | "outline" | "destructive" {
  if (t === "SSS") return "default";
  if (t === "PAGIBIG") return "outline";
  if (t === "CASH_ADVANCE") return "secondary";
  return "secondary";
}

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "ACTIVE") return "default";
  if (s === "PAID") return "outline";
  if (s === "CANCELLED") return "destructive";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  // Create / Edit sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ referenceNumber: "", installment: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<Loan | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?limit=500&status=ACTIVE");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }, []);

  const loadLoans = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterType) params.set("loanType", filterType);
    const res = await fetch(`/api/loans?${params}`);
    const json = await res.json();
    setLoans(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus, filterType]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadLoans(); }, [loadLoans]);

  // ---------------------------------------------------------------------------
  // Sheet helpers
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setSheetOpen(true);
  }

  function openEdit(loan: Loan) {
    setEditing(loan);
    setEditForm({
      referenceNumber: loan.referenceNumber ?? "",
      installment: (Number(loan.installmentCents) / 100).toFixed(2),
      notes: loan.notes ?? "",
    });
    setSheetOpen(true);
  }

  async function handleCreate() {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    if (!form.principal || isNaN(parseFloat(form.principal))) { toast.error("Enter a valid principal amount"); return; }
    if (!form.installment || isNaN(parseFloat(form.installment))) { toast.error("Enter a valid installment amount"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }

    setSaving(true);
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: form.employeeId,
        loanType: form.loanType,
        principal: parseFloat(form.principal).toFixed(2),
        installment: parseFloat(form.installment).toFixed(2),
        startDate: form.startDate,
        referenceNumber: form.referenceNumber || null,
        notes: form.notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create loan"); return; }
    toast.success("Loan created");
    setSheetOpen(false);
    loadLoans();
  }

  async function handleEdit() {
    if (!editing) return;
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (editForm.referenceNumber !== (editing.referenceNumber ?? ""))
      body.referenceNumber = editForm.referenceNumber || null;
    if (editForm.installment)
      body.installment = parseFloat(editForm.installment).toFixed(2);
    if (editForm.notes !== (editing.notes ?? ""))
      body.notes = editForm.notes || null;

    const res = await fetch(`/api/loans/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to update loan"); return; }
    toast.success("Loan updated");
    setSheetOpen(false);
    loadLoans();
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const res = await fetch(`/api/loans/${cancelTarget.id}/cancel`, { method: "POST" });
    const json = await res.json();
    setCancelling(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to cancel loan"); return; }
    toast.success("Loan cancelled");
    setCancelTarget(null);
    loadLoans();
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
        <h1 className="text-2xl font-bold">Loans</h1>
        <p className="text-sm text-muted-foreground">Employee loan records and amortization tracking</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LOAN_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterType(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {LOAN_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadLoans} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Loan
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Installment</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : loans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No loans found.
                </TableCell>
              </TableRow>
            ) : (
              loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium text-sm">{empLabel(loan.employeeId)}</TableCell>
                  <TableCell>
                    <Badge variant={loanTypeBadgeVariant(loan.loanType)}>
                      {LOAN_TYPES.find((t) => t.value === loan.loanType)?.label ?? loan.loanType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPeso(loan.principalCents)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPeso(loan.installmentCents)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPeso(loan.balanceCents)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(loan.status)}>
                      {LOAN_STATUSES.find((s) => s.value === loan.status)?.label ?? loan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(loan.startDate).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(loan)}>
                        Edit
                      </Button>
                      {loan.status === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => setCancelTarget(loan)}
                        >
                          Cancel
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
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} loans.</p>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Loan" : "Add Loan"}</SheetTitle>
          </SheetHeader>

          {editing ? (
            /* ---- Edit form ---- */
            <div className="mt-6 space-y-5">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> {empLabel(editing.employeeId)}</p>
                <p><span className="text-muted-foreground">Type:</span> {LOAN_TYPES.find((t) => t.value === editing.loanType)?.label}</p>
                <p><span className="text-muted-foreground">Principal:</span> {formatPeso(editing.principalCents)}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input value={editForm.referenceNumber} onChange={(e) => setEditForm({ ...editForm, referenceNumber: e.target.value })} placeholder="e.g. SSS-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Installment Amount (₱)</Label>
                <Input type="number" min="0" step="0.01" value={editForm.installment} onChange={(e) => setEditForm({ ...editForm, installment: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={handleEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            /* ---- Create form ---- */
            <div className="mt-6 space-y-5">
              <div className="space-y-1.5">
                <Label>Employee <span className="text-destructive">*</span></Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee…" />
                  </SelectTrigger>
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
                <Label>Loan Type <span className="text-destructive">*</span></Label>
                <Select value={form.loanType} onValueChange={(v) => setForm({ ...form, loanType: v ?? form.loanType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Principal (₱) <span className="text-destructive">*</span></Label>
                  <Input type="number" min="0" step="0.01" placeholder="10000.00" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Installment (₱) <span className="text-destructive">*</span></Label>
                  <Input type="number" min="0" step="0.01" placeholder="500.00" value={form.installment} onChange={(e) => setForm({ ...form, installment: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input placeholder="e.g. SSS-2026-001" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating…" : "Create Loan"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Loan</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this{" "}
              {LOAN_TYPES.find((t) => t.value === cancelTarget?.loanType)?.label} loan
              {cancelTarget ? ` (balance: ${formatPeso(cancelTarget.balanceCents)})` : ""}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
