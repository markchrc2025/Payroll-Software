"use client";

/**
 * /leave — Leave Management Page
 *
 * Tabs:
 *  1. Leave Types    — catalog CRUD (API: /api/leave-types)
 *  2. Leave Requests — approve / reject pending requests (API: /api/leave-transactions)
 *  3. Leave Balances — per-employee balance viewer + opening-balance editor
 *                      (API: /api/employees + /api/employees/[id]/leave-balances)
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Check,
  X,
  Search,
  CalendarDays,
  BookOpen,
  Wallet,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return n % 1 === 0 ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// 1. Leave Types Tab
// ---------------------------------------------------------------------------

type LeaveType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  isConvertibleToCash: boolean;
  unit: string;
  accrualFrequency: string;
  accrualAmount: string;
  maxAccruableBalance: string | null;
  carryOverLimit: string | null;
  requiresRegularization: boolean;
  isActive: boolean;
};

const ACCRUAL_FREQ_OPTIONS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "UPON_REGULARIZATION", label: "Upon Regularization" },
  { value: "LUMP_SUM", label: "Lump Sum" },
];

const LEAVE_UNIT_OPTIONS = [
  { value: "DAYS", label: "Days" },
  { value: "HOURS", label: "Hours" },
];

const EMPTY_LT_FORM = {
  code: "",
  name: "",
  description: "",
  isPaid: true,
  isConvertibleToCash: false,
  unit: "DAYS",
  accrualFrequency: "MONTHLY",
  accrualAmount: "1.25",
  maxAccruableBalance: "",
  carryOverLimit: "",
  requiresRegularization: false,
  isActive: true,
};

function LeaveTypesTab() {
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState(EMPTY_LT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leave-types?limit=200&includeDeleted=false");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_LT_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: LeaveType) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      isPaid: row.isPaid,
      isConvertibleToCash: row.isConvertibleToCash,
      unit: row.unit,
      accrualFrequency: row.accrualFrequency,
      accrualAmount: row.accrualAmount,
      maxAccruableBalance: row.maxAccruableBalance ?? "",
      carryOverLimit: row.carryOverLimit ?? "",
      requiresRegularization: row.requiresRegularization,
      isActive: row.isActive,
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    if (!form.accrualAmount || isNaN(parseFloat(form.accrualAmount))) {
      toast.error("Accrual amount must be a number");
      return;
    }
    setSaving(true);
    const body = {
      code: form.code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      name: form.name,
      description: form.description || null,
      isPaid: form.isPaid,
      isConvertibleToCash: form.isConvertibleToCash,
      unit: form.unit,
      accrualFrequency: form.accrualFrequency,
      accrualAmount: parseFloat(form.accrualAmount),
      maxAccruableBalance: form.maxAccruableBalance ? parseFloat(form.maxAccruableBalance) : null,
      carryOverLimit: form.carryOverLimit ? parseFloat(form.carryOverLimit) : null,
      requiresRegularization: form.requiresRegularization,
      isActive: form.isActive,
    };
    const url = editing ? `/api/leave-types/${editing.id}` : "/api/leave-types";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Leave type updated" : "Leave type created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: LeaveType) {
    if (!confirm(`Archive leave type "${row.name}"?`)) return;
    const res = await fetch(`/api/leave-types/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to archive"); return; }
    toast.success(`"${row.name}" archived`);
    load();
  }

  const freqLabel = (v: string) => ACCRUAL_FREQ_OPTIONS.find(x => x.value === v)?.label ?? v;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define leave types employees can accrue and use.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Leave Type
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Accrual</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No leave types yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={!row.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{row.unit}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmt(parseFloat(row.accrualAmount))} {row.unit.toLowerCase()}/{freqLabel(row.accrualFrequency).toLowerCase()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isPaid ? "default" : "secondary"} className="text-xs">
                      {row.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "outline"} className="text-xs">
                      {row.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(row)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Leave Type" : "Add Leave Type"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="VACATION_LEAVE"
                  value={form.code}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Vacation Leave"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v ?? form.unit })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_UNIT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accrual Frequency</Label>
                <Select value={form.accrualFrequency} onValueChange={(v) => setForm({ ...form, accrualFrequency: v ?? form.accrualFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCRUAL_FREQ_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Accrual Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  placeholder="1.25"
                  value={form.accrualAmount}
                  onChange={(e) => setForm({ ...form, accrualAmount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Balance</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="No limit"
                  value={form.maxAccruableBalance}
                  onChange={(e) => setForm({ ...form, maxAccruableBalance: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Carry-Over Limit</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="No limit"
                  value={form.carryOverLimit}
                  onChange={(e) => setForm({ ...form, carryOverLimit: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</p>
              {(
                [
                  { key: "isPaid" as const, label: "Paid leave (counts as paid working days)" },
                  { key: "isConvertibleToCash" as const, label: "Convertible to cash on separation" },
                  { key: "requiresRegularization" as const, label: "Requires regularization before use" },
                  { key: "isActive" as const, label: "Active (available for filing)" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`lt-${key}`}
                    checked={form[key]}
                    onCheckedChange={(v) => setForm({ ...form, [key]: !!v })}
                  />
                  <Label htmlFor={`lt-${key}`} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Leave Type"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Leave Requests Tab
// ---------------------------------------------------------------------------

type LeaveTransaction = {
  id: string;
  employeeId: string;
  type: string;
  amount: string;
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
  approvalStatus: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  leaveType?: { code: string; name: string; unit: string } | null;
  employee?: { firstName: string; lastName: string; employeeNumber: string } | null;
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
  FOR_REVIEW: "secondary",
};

function LeaveRequestsTab() {
  const [rows, setRows] = useState<LeaveTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [rejectSheet, setRejectSheet] = useState<LeaveTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);

  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year), limit: "200", type: "USAGE" });
    if (statusFilter !== "ALL") params.set("approvalStatus", statusFilter);
    // Fetch across all employees: use the top-level leave-transactions [id] route isn't a list,
    // so we fetch employee list then their transactions — instead use ess endpoint workaround
    // by querying employees page with search and then fetching per-employee.
    // The simplest approach: fetch employees (limit 200) then their transactions.
    // But for a manager dashboard, we need a cross-employee view.
    // The API doesn't have a top-level list endpoint, so we use a two-step approach:
    // 1. GET /api/employees?limit=200 -> list employee IDs
    // 2. GET /api/employees/[id]/leave-transactions for each (too many calls)
    // Better: use /api/leave-transactions [id] approve/reject are per-transaction.
    // There's no top-level list route. Let's fetch employees and their transactions in one pass.
    const empRes = await fetch("/api/employees?limit=200&status=ACTIVE");
    const empJson = await empRes.json();
    const employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[] =
      empJson.data ?? [];

    const allTxns: LeaveTransaction[] = [];
    await Promise.all(
      employees.map(async (emp) => {
        const txRes = await fetch(
          `/api/employees/${emp.id}/leave-transactions?${params.toString()}`
        );
        if (!txRes.ok) return;
        const txJson = await txRes.json();
        (txJson.data ?? []).forEach((t: LeaveTransaction) => {
          allTxns.push({ ...t, employee: emp });
        });
      })
    );

    // Sort newest first
    allTxns.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setRows(allTxns);
    setLoading(false);
  }, [statusFilter, year]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(txn: LeaveTransaction) {
    setActioning(txn.id);
    const res = await fetch(`/api/leave-transactions/${txn.id}/approve`, { method: "POST" });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("Leave request approved");
    load();
  }

  async function handleRejectConfirm() {
    if (!rejectSheet) return;
    setActioning(rejectSheet.id);
    const res = await fetch(`/api/leave-transactions/${rejectSheet.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: rejectReason || null }),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Leave request rejected");
    setRejectSheet(null);
    setRejectReason("");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Review and action employee leave requests for {year}.
        </p>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? statusFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Filed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No {statusFilter !== "ALL" ? statusFilter.toLowerCase() : ""} leave requests for {year}.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.employee?.firstName} {row.employee?.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.employee?.employeeNumber}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.leaveType?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.leaveType?.code}</div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {fmt(parseFloat(row.amount))} {row.leaveType?.unit?.toLowerCase() ?? "days"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(row.startDate)}
                    {row.endDate && row.endDate !== row.startDate && (
                      <> – {fmtDate(row.endDate)}</>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[row.approvalStatus] ?? "outline"} className="text-xs">
                      {row.approvalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.approvalStatus === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700"
                          title="Approve"
                          disabled={actioning === row.id}
                          onClick={() => handleApprove(row)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Reject"
                          disabled={actioning === row.id}
                          onClick={() => { setRejectSheet(row); setRejectReason(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reject confirmation sheet */}
      <Sheet open={!!rejectSheet} onOpenChange={(o) => { if (!o) setRejectSheet(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Reject Leave Request</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectSheet && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-1">
                <div><span className="font-medium">Employee: </span>{rejectSheet.employee?.firstName} {rejectSheet.employee?.lastName}</div>
                <div><span className="font-medium">Leave Type: </span>{rejectSheet.leaveType?.name}</div>
                <div><span className="font-medium">Duration: </span>{fmt(parseFloat(rejectSheet.amount))} {rejectSheet.leaveType?.unit?.toLowerCase() ?? "days"}</div>
                {rejectSheet.reason && <div><span className="font-medium">Reason: </span>{rejectSheet.reason}</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason (optional)</Label>
              <Input
                placeholder="e.g. Understaffed on requested dates"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleRejectConfirm} disabled={!!actioning}>
                {actioning ? "Rejecting…" : "Confirm Reject"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectSheet(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Leave Balances Tab
// ---------------------------------------------------------------------------

type EmployeeBasic = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};

type LeaveBalance = {
  id: string;
  leaveTypeId: string;
  year: number;
  openingBalance: string;
  earned: string;
  used: string;
  forfeited: string;
  convertedToCash: string;
  leaveType?: { id: string; code: string; name: string; unit: string } | null;
};

function LeaveBalancesTab() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<EmployeeBasic[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeBasic | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balLoading, setBalLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  // Upsert sheet state
  const [upsertSheet, setUpsertSheet] = useState(false);
  const [upsertForm, setUpsertForm] = useState({ leaveTypeId: "", openingBalance: "0" });
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [upserting, setUpserting] = useState(false);

  const searchEmployees = useCallback(async () => {
    if (!search.trim()) { setEmployees([]); return; }
    setEmpLoading(true);
    const res = await fetch(`/api/employees?search=${encodeURIComponent(search)}&limit=20&status=ACTIVE`);
    const json = await res.json();
    setEmployees(json.data ?? []);
    setEmpLoading(false);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(searchEmployees, 300);
    return () => clearTimeout(t);
  }, [searchEmployees]);

  const loadBalances = useCallback(async () => {
    if (!selectedEmp) return;
    setBalLoading(true);
    const res = await fetch(`/api/employees/${selectedEmp.id}/leave-balances?year=${year}`);
    const json = await res.json();
    setBalances(json.data ?? []);
    setBalLoading(false);
  }, [selectedEmp, year]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  async function openUpsert() {
    // Load leave types for the dropdown
    const res = await fetch("/api/leave-types?limit=200&isActive=true");
    const json = await res.json();
    setLeaveTypes(json.data ?? []);
    setUpsertForm({ leaveTypeId: "", openingBalance: "0" });
    setUpsertSheet(true);
  }

  async function handleUpsert() {
    if (!selectedEmp || !upsertForm.leaveTypeId) {
      toast.error("Select a leave type");
      return;
    }
    const ob = parseFloat(upsertForm.openingBalance);
    if (isNaN(ob) || ob < 0) { toast.error("Opening balance must be ≥ 0"); return; }
    setUpserting(true);
    const res = await fetch(`/api/employees/${selectedEmp.id}/leave-balances`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveTypeId: upsertForm.leaveTypeId,
        year,
        openingBalance: ob,
      }),
    });
    const json = await res.json();
    setUpserting(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success("Balance updated");
    setUpsertSheet(false);
    loadBalances();
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  function available(bal: LeaveBalance) {
    const v =
      parseFloat(bal.openingBalance) +
      parseFloat(bal.earned) -
      parseFloat(bal.used) -
      parseFloat(bal.forfeited) -
      parseFloat(bal.convertedToCash);
    return v;
  }

  return (
    <div className="space-y-4">
      {/* Employee search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee by name or ID…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedEmp(null);
              setBalances([]);
            }}
          />
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? year))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employee search results */}
      {!selectedEmp && search.trim() && (
        <div className="rounded-md border divide-y">
          {empLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : employees.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No employees found.</div>
          ) : (
            employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-muted transition-colors"
                onClick={() => {
                  setSelectedEmp(emp);
                  setSearch(`${emp.firstName} ${emp.lastName}`);
                  setEmployees([]);
                }}
              >
                <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                <div className="text-xs text-muted-foreground">{emp.employeeNumber}</div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Balance table */}
      {selectedEmp && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selectedEmp.firstName} {selectedEmp.lastName}</p>
              <p className="text-xs text-muted-foreground">{selectedEmp.employeeNumber} · {year} balances</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadBalances} disabled={balLoading}>
                <RefreshCw className={`h-4 w-4 ${balLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={openUpsert}>
                <Plus className="h-4 w-4 mr-1.5" /> Set Balance
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Forfeited</TableHead>
                  <TableHead className="text-right font-semibold">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : balances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No leave balances set for {year}. Use &quot;Set Balance&quot; to initialise.
                    </TableCell>
                  </TableRow>
                ) : (
                  balances.map((bal) => {
                    const avail = available(bal);
                    return (
                      <TableRow key={bal.id}>
                        <TableCell>
                          <div className="font-medium">{bal.leaveType?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{bal.leaveType?.code}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(parseFloat(bal.openingBalance))}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(parseFloat(bal.earned))}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(parseFloat(bal.used))}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(parseFloat(bal.forfeited))}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${avail < 0 ? "text-destructive" : ""}`}>
                          {fmt(avail)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Upsert opening balance sheet */}
      <Sheet open={upsertSheet} onOpenChange={setUpsertSheet}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Set Opening Balance</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="rounded-md bg-muted px-4 py-3 text-sm">
              <span className="font-medium">{selectedEmp?.firstName} {selectedEmp?.lastName}</span>
              {" · "}{year}
            </div>
            <div className="space-y-1.5">
              <Label>Leave Type <span className="text-destructive">*</span></Label>
              <Select
                value={upsertForm.leaveTypeId}
                onValueChange={(v) => setUpsertForm({ ...upsertForm, leaveTypeId: v ?? "" })}
              >
                <SelectTrigger><SelectValue placeholder="Select leave type…" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name} ({lt.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance (days/hours) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={upsertForm.openingBalance}
                onChange={(e) => setUpsertForm({ ...upsertForm, openingBalance: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                This is the balance at the start of {year}. Earned/used are updated by transactions.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleUpsert} disabled={upserting}>
                {upserting ? "Saving…" : "Save Balance"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setUpsertSheet(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Pending My Approval Tab
// ---------------------------------------------------------------------------

const ROLE_KEY_LABELS: Record<string, string> = {
  supervisor:   "Supervisor",
  line_manager: "Line Manager",
  dept_head:    "Department Head",
  hr_manager:   "HR Manager",
  ceo:          "CEO / Owner",
};

type LeaveApprovalStep = {
  id: string;
  stepIndex: number;
  roleKey: string;
  approverEmployeeId: string;
  status: string;
  actedAt: string | null;
  note: string | null;
};

type PendingApprovalRow = {
  id: string;
  employeeId: string;
  amount: string;
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
  approvalStatus: string;
  currentStepIndex: number;
  createdAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    department: { name: string } | null;
  } | null;
  leaveType: { id: string; name: string; code: string; unit: string } | null;
  leaveApprovals: LeaveApprovalStep[];
};

function PendingApprovalsTab() {
  const [rows, setRows] = useState<PendingApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [approveSheet, setApproveSheet] = useState<PendingApprovalRow | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [rejectSheet, setRejectSheet] = useState<PendingApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leave-approvals/pending");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApproveConfirm() {
    if (!approveSheet) return;
    setActioning(approveSheet.id);
    const res = await fetch(`/api/leave-transactions/${approveSheet.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: approveNote || undefined }),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("Leave request approved");
    setApproveSheet(null);
    setApproveNote("");
    load();
  }

  async function handleRejectConfirm() {
    if (!rejectSheet) return;
    setActioning(rejectSheet.id);
    const res = await fetch(`/api/leave-transactions/${rejectSheet.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: rejectReason || null }),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Leave request rejected");
    setRejectSheet(null);
    setRejectReason("");
    load();
  }

  function StepBadges({ row }: { row: PendingApprovalRow }) {
    const total = row.leaveApprovals.length;
    if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const current = row.leaveApprovals.find((s) => s.stepIndex === row.currentStepIndex);
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          {row.leaveApprovals.map((step) => (
            <div
              key={step.id}
              className={`h-2 w-2 rounded-full ${
                step.status === "APPROVED" ? "bg-green-500" :
                step.status === "REJECTED" ? "bg-destructive" :
                step.status === "SKIPPED"  ? "bg-muted-foreground/30" :
                step.stepIndex === row.currentStepIndex ? "bg-yellow-500" :
                "bg-muted"
              }`}
              title={`Step ${step.stepIndex + 1}: ${ROLE_KEY_LABELS[step.roleKey] ?? step.roleKey} — ${step.status}`}
            />
          ))}
        </div>
        {current && (
          <p className="text-xs text-muted-foreground">
            Step {row.currentStepIndex + 1}/{total} · {ROLE_KEY_LABELS[current.roleKey] ?? current.roleKey}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Leave requests assigned to you for approval at the current workflow step.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Approval Chain</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  No leave requests pending your approval.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.employee?.firstName} {row.employee?.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.employee?.employeeNumber}
                      {row.employee?.department && ` · ${row.employee.department.name}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.leaveType?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.leaveType?.code}</div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {fmt(parseFloat(row.amount))} {(row.leaveType?.unit ?? "DAYS").toLowerCase()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(row.startDate)}
                    {row.endDate && row.endDate !== row.startDate && (
                      <> – {fmtDate(row.endDate)}</>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                    {row.reason ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StepBadges row={row} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:text-green-700"
                        title="Approve"
                        disabled={actioning === row.id}
                        onClick={() => { setApproveSheet(row); setApproveNote(""); }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Reject"
                        disabled={actioning === row.id}
                        onClick={() => { setRejectSheet(row); setRejectReason(""); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Approve confirmation sheet */}
      <Sheet open={!!approveSheet} onOpenChange={(o) => { if (!o) setApproveSheet(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Approve Leave Request</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {approveSheet && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-1.5">
                <div><span className="font-medium">Employee: </span>{approveSheet.employee?.firstName} {approveSheet.employee?.lastName}</div>
                <div><span className="font-medium">Leave Type: </span>{approveSheet.leaveType?.name}</div>
                <div><span className="font-medium">Duration: </span>{fmt(parseFloat(approveSheet.amount))} {(approveSheet.leaveType?.unit ?? "DAYS").toLowerCase()}</div>
                <div><span className="font-medium">Dates: </span>{fmtDate(approveSheet.startDate)}{approveSheet.endDate && approveSheet.endDate !== approveSheet.startDate ? ` – ${fmtDate(approveSheet.endDate)}` : ""}</div>
                {approveSheet.reason && <div><span className="font-medium">Reason: </span>{approveSheet.reason}</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g. Approved — enjoy your leave"
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleApproveConfirm} disabled={!!actioning}>
                {actioning ? "Approving…" : "Confirm Approve"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setApproveSheet(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject confirmation sheet */}
      <Sheet open={!!rejectSheet} onOpenChange={(o) => { if (!o) setRejectSheet(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Reject Leave Request</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectSheet && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-1.5">
                <div><span className="font-medium">Employee: </span>{rejectSheet.employee?.firstName} {rejectSheet.employee?.lastName}</div>
                <div><span className="font-medium">Leave Type: </span>{rejectSheet.leaveType?.name}</div>
                <div><span className="font-medium">Duration: </span>{fmt(parseFloat(rejectSheet.amount))} {(rejectSheet.leaveType?.unit ?? "DAYS").toLowerCase()}</div>
                {rejectSheet.reason && <div><span className="font-medium">Reason: </span>{rejectSheet.reason}</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason (optional)</Label>
              <Input
                placeholder="e.g. Understaffed on requested dates"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleRejectConfirm} disabled={!!actioning}>
                {actioning ? "Rejecting…" : "Confirm Reject"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectSheet(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Shell
// ---------------------------------------------------------------------------

export default function LeavePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <p className="text-sm text-muted-foreground">Configure leave types, approve requests, and manage employee balances</p>
      </div>

      <Tabs defaultValue="leave-types">
        <TabsList>
          <TabsTrigger value="leave-types" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Leave Types
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> Requests
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-1.5">
            <Wallet className="h-4 w-4" /> Balances
          </TabsTrigger>
          <TabsTrigger value="my-approvals" className="gap-1.5">
            <Inbox className="h-4 w-4" /> My Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave-types" className="mt-4">
          <LeaveTypesTab />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <LeaveRequestsTab />
        </TabsContent>
        <TabsContent value="balances" className="mt-4">
          <LeaveBalancesTab />
        </TabsContent>
        <TabsContent value="my-approvals" className="mt-4">
          <PendingApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
