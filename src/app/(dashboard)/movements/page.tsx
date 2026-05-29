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

type Movement = {
  id: string;
  employeeId: string;
  movementType: string;
  effectiveDate: string;
  approvalStatus: string;
  reason: string | null;
  notes: string | null;
  toDepartmentId: string | null;
  toBranchId: string | null;
  toPositionId: string | null;
  toJobTitle: string | null;
  toBasicSalaryCents: string | null;
  toStatus: string | null;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string };
type Department = { id: string; name: string };
type Branch = { id: string; name: string };
type Position = { id: string; title: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOVEMENT_TYPES = [
  { value: "DEPARTMENT_TRANSFER", label: "Department Transfer" },
  { value: "BRANCH_TRANSFER", label: "Branch Transfer" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "DEMOTION", label: "Demotion" },
  { value: "SALARY_ADJUSTMENT", label: "Salary Adjustment" },
  { value: "TITLE_CHANGE", label: "Title Change" },
  { value: "STATUS_CHANGE", label: "Status Change" },
  { value: "REGULARIZATION", label: "Regularization" },
];

const EMPLOYMENT_STATUSES = [
  { value: "PROBATIONARY", label: "Probationary" },
  { value: "REGULAR", label: "Regular" },
  { value: "CONTRACTUAL", label: "Contractual" },
  { value: "PROJECT_BASED", label: "Project Based" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const APPROVAL_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "FOR_REVIEW", label: "For Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function approvalBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "PENDING") return "secondary";
  if (s === "FOR_REVIEW") return "secondary";
  if (s === "APPROVED") return "outline";
  if (s === "REJECTED" || s === "CANCELLED") return "destructive";
  return "secondary";
}

function movementTypeLabel(t: string) {
  return MOVEMENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

function approvalStatusLabel(s: string) {
  return APPROVAL_STATUSES.find((x) => x.value === s)?.label ?? s;
}

function formatPeso(centsStr: string | null) {
  if (!centsStr) return null;
  const n = Number(centsStr) / 100;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function changeSummary(m: Movement, departments: Department[], branches: Branch[], positions: Position[]) {
  switch (m.movementType) {
    case "DEPARTMENT_TRANSFER": {
      const dept = departments.find((d) => d.id === m.toDepartmentId);
      return dept ? `→ ${dept.name}` : "→ (dept)";
    }
    case "BRANCH_TRANSFER": {
      const br = branches.find((b) => b.id === m.toBranchId);
      return br ? `→ ${br.name}` : "→ (branch)";
    }
    case "PROMOTION":
    case "DEMOTION": {
      const pos = positions.find((p) => p.id === m.toPositionId);
      const title = pos?.title ?? m.toJobTitle;
      const sal = formatPeso(m.toBasicSalaryCents);
      return [title && `→ ${title}`, sal && `(${sal})`].filter(Boolean).join(" ");
    }
    case "SALARY_ADJUSTMENT":
      return formatPeso(m.toBasicSalaryCents) ?? "—";
    case "TITLE_CHANGE":
      return m.toJobTitle ? `→ "${m.toJobTitle}"` : "—";
    case "STATUS_CHANGE":
    case "REGULARIZATION":
      return m.toStatus ?? "—";
    default:
      return "—";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  // Sheets
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Movement | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Create form
  const [form, setForm] = useState({
    employeeId: "",
    movementType: "DEPARTMENT_TRANSFER",
    effectiveDate: "",
    reason: "",
    notes: "",
    // dynamic fields
    toDepartmentId: "",
    toBranchId: "",
    toPositionId: "",
    toJobTitle: "",
    toBasicSalary: "",
    toStatus: "REGULAR",
  });
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadReferenceData = useCallback(async () => {
    const [empRes, deptRes, brRes, posRes] = await Promise.all([
      fetch("/api/employees?limit=500&status=ACTIVE"),
      fetch("/api/departments?limit=200"),
      fetch("/api/branches?limit=200"),
      fetch("/api/positions?limit=200"),
    ]);
    const [empJson, deptJson, brJson, posJson] = await Promise.all([
      empRes.json(), deptRes.json(), brRes.json(), posRes.json(),
    ]);
    setEmployees(empJson.data ?? []);
    setDepartments(deptJson.data ?? []);
    setBranches(brJson.data ?? []);
    setPositions(posJson.data ?? []);
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterType) params.set("movementType", filterType);
    const res = await fetch(`/api/movements?${params}`);
    const json = await res.json();
    setMovements(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus, filterType]);

  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);
  useEffect(() => { loadMovements(); }, [loadMovements]);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  function buildCreateBody() {
    const body: Record<string, unknown> = {
      movementType: form.movementType,
      effectiveDate: form.effectiveDate,
      reason: form.reason || null,
      notes: form.notes || null,
    };
    switch (form.movementType) {
      case "DEPARTMENT_TRANSFER":
        body.toDepartmentId = form.toDepartmentId;
        break;
      case "BRANCH_TRANSFER":
        body.toBranchId = form.toBranchId;
        break;
      case "PROMOTION":
      case "DEMOTION":
        if (form.toPositionId) body.toPositionId = form.toPositionId;
        if (form.toJobTitle) body.toJobTitle = form.toJobTitle;
        if (form.toBasicSalary) body.toBasicSalary = parseFloat(form.toBasicSalary).toFixed(2);
        break;
      case "SALARY_ADJUSTMENT":
        body.toBasicSalary = parseFloat(form.toBasicSalary).toFixed(2);
        break;
      case "TITLE_CHANGE":
        body.toJobTitle = form.toJobTitle;
        break;
      case "STATUS_CHANGE":
      case "REGULARIZATION":
        body.toStatus = form.toStatus;
        break;
    }
    return body;
  }

  async function handleCreate() {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    if (!form.effectiveDate) { toast.error("Effective date is required"); return; }

    setSaving(true);
    const body = buildCreateBody();
    const res = await fetch(`/api/employees/${form.employeeId}/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create movement"); return; }
    toast.success("Movement request created");
    setCreateOpen(false);
    loadMovements();
  }

  async function handleApprove(m: Movement) {
    const res = await fetch(`/api/movements/${m.id}/approve`, { method: "POST" });
    const json = await res.json();
    if (res.status === 403) {
      toast.error(json.error ?? "You cannot approve your own request");
      return;
    }
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("Movement approved");
    loadMovements();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/movements/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Movement rejected");
    setRejectTarget(null);
    setRejectReason("");
    loadMovements();
  }

  async function handleCancel(m: Movement) {
    if (!confirm("Cancel this movement request?")) return;
    const res = await fetch(`/api/movements/${m.id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to cancel"); return; }
    toast.success("Movement cancelled");
    loadMovements();
  }

  // ---------------------------------------------------------------------------
  // Render — dynamic fields based on movementType
  // ---------------------------------------------------------------------------

  function renderDynamicFields() {
    switch (form.movementType) {
      case "DEPARTMENT_TRANSFER":
        return (
          <div className="space-y-1.5">
            <Label>To Department <span className="text-destructive">*</span></Label>
            <Select value={form.toDepartmentId} onValueChange={(v) => setForm({ ...form, toDepartmentId: v ?? "" })}>
              <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case "BRANCH_TRANSFER":
        return (
          <div className="space-y-1.5">
            <Label>To Branch <span className="text-destructive">*</span></Label>
            <Select value={form.toBranchId} onValueChange={(v) => setForm({ ...form, toBranchId: v ?? "" })}>
              <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case "PROMOTION":
      case "DEMOTION":
        return (
          <>
            <div className="space-y-1.5">
              <Label>To Position</Label>
              <Select value={form.toPositionId} onValueChange={(v) => setForm({ ...form, toPositionId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Select position…" /></SelectTrigger>
                <SelectContent>
                  {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New Job Title</Label>
              <Input placeholder="e.g. Senior Engineer" value={form.toJobTitle} onChange={(e) => setForm({ ...form, toJobTitle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>New Basic Salary (₱)</Label>
              <Input type="number" step="0.01" min="0" placeholder="55000.00" value={form.toBasicSalary} onChange={(e) => setForm({ ...form, toBasicSalary: e.target.value })} />
            </div>
          </>
        );
      case "SALARY_ADJUSTMENT":
        return (
          <div className="space-y-1.5">
            <Label>New Basic Salary (₱) <span className="text-destructive">*</span></Label>
            <Input type="number" step="0.01" min="0" placeholder="55000.00" value={form.toBasicSalary} onChange={(e) => setForm({ ...form, toBasicSalary: e.target.value })} />
          </div>
        );
      case "TITLE_CHANGE":
        return (
          <div className="space-y-1.5">
            <Label>New Job Title <span className="text-destructive">*</span></Label>
            <Input value={form.toJobTitle} onChange={(e) => setForm({ ...form, toJobTitle: e.target.value })} />
          </div>
        );
      case "STATUS_CHANGE":
      case "REGULARIZATION":
        return (
          <div className="space-y-1.5">
            <Label>New Status <span className="text-destructive">*</span></Label>
            <Select value={form.toStatus} onValueChange={(v) => setForm({ ...form, toStatus: v ?? form.toStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Employee Movements</h1>
        <p className="text-sm text-muted-foreground">Transfers, promotions, salary adjustments, and status changes</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {APPROVAL_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterType(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All movement types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {MOVEMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadMovements} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => { setForm({ employeeId: "", movementType: "DEPARTMENT_TRANSFER", effectiveDate: "", reason: "", notes: "", toDepartmentId: "", toBranchId: "", toPositionId: "", toJobTitle: "", toBasicSalary: "", toStatus: "REGULAR" }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Movement
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
              <TableHead>Effective Date</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No movements found.
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm font-medium">
                    {m.employee.lastName}, {m.employee.firstName}
                    <span className="block text-xs text-muted-foreground">{m.employee.employeeNumber}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {movementTypeLabel(m.movementType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{m.effectiveDate.slice(0, 10)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {changeSummary(m, departments, branches, positions)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={approvalBadgeVariant(m.approvalStatus)}>
                      {approvalStatusLabel(m.approvalStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(m.approvalStatus === "PENDING" || m.approvalStatus === "FOR_REVIEW") && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                            onClick={() => handleApprove(m)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => { setRejectTarget(m); setRejectReason(""); }}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => handleCancel(m)}
                          >
                            Cancel
                          </Button>
                        </>
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
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} movements.</p>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Movement Request</SheetTitle>
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
            <div className="space-y-1.5">
              <Label>Movement Type</Label>
              <Select value={form.movementType} onValueChange={(v) => setForm({ ...form, movementType: v ?? form.movementType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>

            {/* Dynamic fields */}
            {renderDynamicFields()}

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Submit Request"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject Sheet */}
      <Sheet open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reject Movement</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{rejectTarget.employee.lastName}, {rejectTarget.employee.firstName}</p>
                <p className="text-muted-foreground">{movementTypeLabel(rejectTarget.movementType)} · {rejectTarget.effectiveDate.slice(0, 10)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={saving}>
                {saving ? "Rejecting…" : "Reject Movement"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
