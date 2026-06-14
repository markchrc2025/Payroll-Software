"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { NewMovementDialog } from "@/components/movements/NewMovementDialog";

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
  toLineManagerId: string | null;
  toJobType: string | null;
  toJobStatus: string | null;
  toLeaveWorkflowKey: string | null;
  toShiftScheduleId: string | null;
  toHolidayKey: string | null;
  toTermStart: string | null;
  toNextReviewDate: string | null;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  department?: { name: string } | null;
};
type Department = { id: string; name: string };
type Branch = { id: string; name: string };
type Position = { id: string; title: string };
type JobLevel = { id: string; name: string };
type ShiftSchedule = { id: string; name: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOVEMENT_TYPES = [
  { value: "PLACEMENT_CHANGE",   label: "Change in Placement" },
  { value: "TERMS_CHANGE",       label: "Change in Employment Terms" },
  { value: "COMBINED_CHANGE",    label: "Placement + Terms" },
  { value: "DEPARTMENT_TRANSFER", label: "Department Transfer" },
  { value: "BRANCH_TRANSFER",     label: "Branch Transfer" },
  { value: "PROMOTION",           label: "Promotion" },
  { value: "DEMOTION",            label: "Demotion" },
  { value: "SALARY_ADJUSTMENT",   label: "Salary Adjustment" },
  { value: "TITLE_CHANGE",        label: "Title Change" },
  { value: "STATUS_CHANGE",       label: "Status Change" },
  { value: "REGULARIZATION",      label: "Regularization" },
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
    case "PLACEMENT_CHANGE": {
      const pos = positions.find((p) => p.id === m.toPositionId);
      const dept = departments.find((d) => d.id === m.toDepartmentId);
      return [pos?.title && `→ ${pos.title}`, dept?.name && `(${dept.name})`].filter(Boolean).join(" ") || "—";
    }
    case "TERMS_CHANGE":
      return [m.toJobType, m.toJobStatus].filter(Boolean).join(" / ") || "—";
    case "COMBINED_CHANGE":
      return "Placement + Terms";
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
  const [jobLevels, setJobLevels] = useState<JobLevel[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  // Sheets / dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Movement | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadReferenceData = useCallback(async () => {
    const [empRes, deptRes, brRes, posRes, lvlRes, shiftRes] = await Promise.all([
      fetch("/api/employees?limit=500&status=ACTIVE"),
      fetch("/api/departments?limit=200"),
      fetch("/api/branches?limit=200"),
      fetch("/api/positions?limit=200"),
      fetch("/api/job-levels"),
      fetch("/api/shifts?limit=200&isActive=true"),
    ]);
    const [empJson, deptJson, brJson, posJson, lvlJson, shiftJson] = await Promise.all([
      empRes.json(), deptRes.json(), brRes.json(), posRes.json(), lvlRes.json(), shiftRes.json(),
    ]);
    setEmployees(empJson.data ?? []);
    setDepartments(deptJson.data ?? []);
    setBranches(brJson.data ?? []);
    setPositions(posJson.data ?? []);
    setJobLevels(lvlJson.data ?? []);
    setShiftSchedules(shiftJson.data ?? []);
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
  // Approve / Reject / Cancel
  // ---------------------------------------------------------------------------

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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
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

      {/* Create Dialog (redesigned) */}
      <NewMovementDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        departments={departments}
        branches={branches}
        positions={positions}
        jobLevels={jobLevels}
        shiftSchedules={shiftSchedules}
        onCreated={loadMovements}
        reloadReferenceData={loadReferenceData}
      />

      {/* Reject Sheet */}
      <Sheet open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reject Movement</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{rejectTarget.employee.lastName}, {rejectTarget.employee.firstName} <span className="font-mono text-xs text-muted-foreground">{rejectTarget.employee.employeeNumber}</span></p>
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
