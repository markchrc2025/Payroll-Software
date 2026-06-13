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

type ExpenseClaim = {
  id: string;
  employeeId: string;
  category: string;
  description: string;
  amountCents: string;
  claimDate: string;
  status: string;
  taxTreatment: string | null;
  employee?: { id: string; firstName: string; lastName: string } | null;
};

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
};

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORIES = [
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "MEALS", label: "Meals" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "MEDICAL", label: "Medical" },
  { value: "TRAINING", label: "Training" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "OTHER", label: "Other" },
];

const TAX_TREATMENTS = [
  { value: "NONTAXABLE_REIMBURSEMENT", label: "Non-taxable Reimbursement" },
  { value: "DE_MINIMIS", label: "De Minimis" },
  { value: "TAXABLE", label: "Taxable" },
];

const EXPENSE_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ATTACHED", label: "Attached" },
  { value: "PAID", label: "Paid" },
];

const EMPTY_FORM = {
  employeeId: "",
  category: "OTHER",
  description: "",
  amount: "",
  claimDate: new Date().toISOString().split("T")[0],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeso(centsStr: string) {
  const n = Number(centsStr) / 100;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "SUBMITTED") return "default";
  if (s === "APPROVED" || s === "ATTACHED" || s === "PAID") return "outline";
  if (s === "REJECTED") return "destructive";
  return "secondary"; // DRAFT
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExpenseClaimsPage() {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");

  // Sheets
  const [createOpen, setCreateOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<ExpenseClaim | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExpenseClaim | null>(null);
  const [attachTarget, setAttachTarget] = useState<ExpenseClaim | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [approveTax, setApproveTax] = useState("NONTAXABLE_REIMBURSEMENT");
  const [rejectReason, setRejectReason] = useState("");
  const [attachPayrollId, setAttachPayrollId] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?limit=500&status=ACTIVE");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }, []);

  const loadPayrollRuns = useCallback(async () => {
    const res = await fetch("/api/payroll/runs?status=DRAFT&limit=20");
    const json = await res.json();
    setPayrollRuns(json.data ?? []);
  }, []);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/expense-claims?${params}`);
    const json = await res.json();
    setClaims(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadClaims(); }, [loadClaims]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error("Enter a valid amount"); return; }
    if (!form.claimDate) { toast.error("Claim date is required"); return; }

    setSaving(true);
    const res = await fetch("/api/expense-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: form.employeeId,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount).toFixed(2),
        claimDate: form.claimDate,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create claim"); return; }
    toast.success("Expense claim created");
    setCreateOpen(false);
    loadClaims();
  }

  async function handleSubmit(claim: ExpenseClaim) {
    const res = await fetch(`/api/expense-claims/${claim.id}/submit`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to submit"); return; }
    toast.success("Claim submitted");
    loadClaims();
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setSaving(true);
    const res = await fetch(`/api/expense-claims/${approveTarget.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxTreatment: approveTax }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("Claim approved");
    setApproveTarget(null);
    loadClaims();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/expense-claims/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Claim rejected");
    setRejectTarget(null);
    setRejectReason("");
    loadClaims();
  }

  async function handleAttach() {
    if (!attachTarget) return;
    if (!attachPayrollId) { toast.error("Select a payroll run"); return; }
    setSaving(true);
    const res = await fetch(`/api/expense-claims/${attachTarget.id}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payrollBookId: attachPayrollId }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to attach"); return; }
    toast.success("Claim attached to payroll run");
    setAttachTarget(null);
    setAttachPayrollId("");
    loadClaims();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const empMap = new Map(employees.map((e) => [e.id, e]));
  function empLabel(id: string) {
    const e = empMap.get(id);
    if (!e) return id;
    return `${e.lastName}, ${e.firstName}`;
  }

  function claimEmpLabel(claim: ExpenseClaim) {
    if (claim.employee) return `${claim.employee.lastName}, ${claim.employee.firstName}`;
    return empLabel(claim.employeeId);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Expense Claims</h1>
        <p className="text-sm text-muted-foreground">Track and approve employee expense reimbursements</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXPENSE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadClaims} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Claim
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]" />
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
            ) : claims.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No expense claims found.
                </TableCell>
              </TableRow>
            ) : (
              claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-medium text-sm">
                    {claimEmpLabel(claim)}
                    <span className="block text-xs text-muted-foreground font-mono">
                      {empMap.get(claim.employeeId)?.employeeNumber ?? ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(claim.claimDate).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {EXPENSE_CATEGORIES.find((c) => c.value === claim.category)?.label ?? claim.category}
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={claim.description}>
                    {claim.description.length > 60 ? claim.description.slice(0, 60) + "…" : claim.description}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPeso(claim.amountCents)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {claim.taxTreatment
                      ? TAX_TREATMENTS.find((t) => t.value === claim.taxTreatment)?.label ?? claim.taxTreatment
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(claim.status)}>
                      {EXPENSE_STATUSES.find((s) => s.value === claim.status)?.label ?? claim.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {claim.status === "DRAFT" && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleSubmit(claim)}>
                          Submit
                        </Button>
                      )}
                      {claim.status === "SUBMITTED" && (
                        <>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setApproveTax("NONTAXABLE_REIMBURSEMENT"); setApproveTarget(claim); }}>
                            Approve
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => { setRejectReason(""); setRejectTarget(claim); }}>
                            Reject
                          </Button>
                        </>
                      )}
                      {claim.status === "APPROVED" && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { loadPayrollRuns(); setAttachPayrollId(""); setAttachTarget(claim); }}>
                          Attach
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
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} claims.</p>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Expense Claim</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? "" })}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Claim Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.claimDate} onChange={(e) => setForm({ ...form, claimDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount (₱) <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" step="0.01" placeholder="1500.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? form.category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea rows={3} placeholder="Describe the expense…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create Claim"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Approve Sheet */}
      <Sheet open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Approve Expense Claim</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {approveTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> {claimEmpLabel(approveTarget)} <span className="font-mono text-xs text-muted-foreground">{empMap.get(approveTarget.employeeId)?.employeeNumber ?? ""}</span></p>
                <p><span className="text-muted-foreground">Amount:</span> {formatPeso(approveTarget.amountCents)}</p>
                <p><span className="text-muted-foreground">Description:</span> {approveTarget.description}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tax Treatment <span className="text-destructive">*</span></Label>
              <Select value={approveTax} onValueChange={(v) => setApproveTax(v ?? approveTax)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_TREATMENTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleApprove} disabled={saving}>
                {saving ? "Approving…" : "Approve"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setApproveTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject Sheet */}
      <Sheet open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reject Expense Claim</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p><span className="text-muted-foreground">Amount:</span> {formatPeso(rejectTarget.amountCents)}</p>
                <p><span className="text-muted-foreground">Description:</span> {rejectTarget.description}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea rows={3} placeholder="Explain why this claim is being rejected…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={saving}>
                {saving ? "Rejecting…" : "Reject Claim"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Attach Sheet */}
      <Sheet open={!!attachTarget} onOpenChange={(o) => !o && setAttachTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Attach to Payroll Run</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {attachTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p><span className="text-muted-foreground">Amount:</span> {formatPeso(attachTarget.amountCents)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Payroll Run (Draft) <span className="text-destructive">*</span></Label>
              <Select value={attachPayrollId} onValueChange={(v) => setAttachPayrollId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select payroll run…" /></SelectTrigger>
                <SelectContent>
                  {payrollRuns.length === 0 ? (
                    <SelectItem value="none" disabled>No draft runs available</SelectItem>
                  ) : (
                    payrollRuns.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {new Date(r.periodStart).toLocaleDateString("en-PH")} –{" "}
                        {new Date(r.periodEnd).toLocaleDateString("en-PH")}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleAttach} disabled={saving || !attachPayrollId || attachPayrollId === "none"}>
                {saving ? "Attaching…" : "Attach"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setAttachTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
