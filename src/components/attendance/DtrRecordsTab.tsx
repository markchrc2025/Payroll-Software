"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  Eye,
  History,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  RotateCcw,
  Plus,
  Clock,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDebounce } from "@/lib/hooks/useDebounce";

// =============================================================================
// Types
// =============================================================================

type EmployeeSnap = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department?: { name: string } | null;
};

type DtrSubmissionRow = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  submittedAt: string;
  status: "SUBMITTED" | "SUPERVISOR_APPROVED" | "MANAGER_APPROVED" | "RETURNED";
  supervisorId: string | null;
  managerId: string | null;
  returnedReason: string | null;
  returnedByRole: string | null;
  returnedAt: string | null;
  employee: EmployeeSnap;
};

type DtrRecordRow = {
  id: string;
  date: string;
  dayStatus: string;
  officialTimeIn: string | null;
  officialTimeOut: string | null;
  manualTimeIn: string | null;
  manualTimeOut: string | null;
  manualReasonCode: string | null;
  manualActorRole: string | null;
  effectiveTimeIn: string | null;
  effectiveTimeOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  otMinutes: number;
  undertimeMinutes: number;
  nsdMinutes: number;
  isLocked: boolean;
};

type AuditLogRow = {
  id: string;
  actorRole: string;
  actorId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reasonCode: string;
  notes: string | null;
  createdAt: string;
  dtrRecordId: string;
};

type SubmissionDetail = DtrSubmissionRow & {
  dtrRecords: DtrRecordRow[];
  auditLogs: AuditLogRow[];
  supervisor: { id: string; firstName: string; lastName: string } | null;
  manager: { id: string; firstName: string; lastName: string } | null;
};

type ListResponse = {
  data: DtrSubmissionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// =============================================================================
// Constants
// =============================================================================

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  SUPERVISOR_APPROVED: "Supervisor Approved",
  MANAGER_APPROVED: "Manager Approved",
  RETURNED: "Returned",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  SUBMITTED: "secondary",
  SUPERVISOR_APPROVED: "outline",
  MANAGER_APPROVED: "default",
  RETURNED: "destructive",
};

const DAY_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  PAID_LEAVE: "Paid Leave",
  UNPAID_LEAVE: "Unpaid Leave",
  HOLIDAY: "Holiday",
  REST_DAY: "Rest Day",
};

const REASON_LABELS: Record<string, string> = {
  FORGOT_CLOCK_IN: "Forgot Clock-In",
  FORGOT_CLOCK_OUT: "Forgot Clock-Out",
  GPS_FAILURE: "GPS Failure",
  KIOSK_OFFLINE: "Kiosk Offline",
  SYSTEM_ERROR: "System Error",
  SCHEDULE_CHANGE: "Schedule Change",
  OTHER: "Other",
};

const REASON_CODES = [
  "FORGOT_CLOCK_IN",
  "FORGOT_CLOCK_OUT",
  "GPS_FAILURE",
  "KIOSK_OFFLINE",
  "SYSTEM_ERROR",
  "SCHEDULE_CHANGE",
  "OTHER",
] as const;

// =============================================================================
// Helpers
// =============================================================================

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPeriod(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sStr = s.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const eStr = e.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${sStr} – ${eStr}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtMinutes(min: number): string {
  if (min === 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeInputToIso(date: string, hhmm: string): string {
  return new Date(`${date.slice(0, 10)}T${hhmm}:00+08:00`).toISOString();
}

function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });
}

// =============================================================================
// ManualTimeDialog
// =============================================================================

type ManualTimeDialogProps = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  field: "manualTimeIn" | "manualTimeOut";
  date: string;
  currentValue: string | null;
  submissionId: string;
  submissionStatus: DtrSubmissionRow["status"];
  onSaved: () => void;
};

function ManualTimeDialog({
  open,
  onClose,
  recordId,
  field,
  date,
  currentValue,
  submissionId,
  submissionStatus,
  onSaved,
}: ManualTimeDialogProps) {
  const [timeVal, setTimeVal] = useState(isoToTimeInput(currentValue));
  const [reasonCode, setReasonCode] = useState<string>("FORGOT_CLOCK_OUT");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeVal(isoToTimeInput(currentValue));
      setReasonCode(
        field === "manualTimeIn" ? "FORGOT_CLOCK_IN" : "FORGOT_CLOCK_OUT",
      );
      setNotes("");
    }
  }, [open, currentValue, field]);

  async function handleSave() {
    if (!timeVal) {
      toast.error("Please enter a time value.");
      return;
    }
    if (reasonCode === "OTHER" && !notes.trim()) {
      toast.error("Notes are required when reason is 'Other'.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/dtr/${recordId}/manual`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          value: timeInputToIso(date, timeVal),
          reasonCode,
          notes: notes.trim() || null,
          dtrSubmissionId: submissionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to save manual time");
        return;
      }
      toast.success("Manual time saved");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fieldLabel =
    field === "manualTimeIn" ? "Manual Time In" : "Manual Time Out";
  const canEdit =
    submissionStatus === "SUBMITTED" || submissionStatus === "SUPERVISOR_APPROVED";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {fieldLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Date:{" "}
            <span className="font-medium text-foreground">{fmtDate(date)}</span>
          </p>
          <div className="space-y-1.5">
            <Label>{fieldLabel}</Label>
            <Input
              type="time"
              value={timeVal}
              onChange={(e) => setTimeVal(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => v && setReasonCode(v)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {REASON_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Notes{" "}
              {reasonCode === "OTHER" && (
                <span className="text-destructive">*</span>
              )}
            </Label>
            <Textarea
              placeholder="Describe the reason for this correction…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={!canEdit}
            />
          </div>
          {!canEdit && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              This submission is {STATUS_LABELS[submissionStatus]}. Manual edits
              are no longer allowed.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !canEdit}>
            {saving ? "Saving…" : "Save Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ReturnDialog
// =============================================================================

function ReturnDialog({
  open,
  onClose,
  submissionId,
  status,
  onReturned,
}: {
  open: boolean;
  onClose: () => void;
  submissionId: string;
  status: DtrSubmissionRow["status"];
  onReturned: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  async function handleReturn() {
    if (!reason.trim()) {
      toast.error("A return reason is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/dtr/submissions/${submissionId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to return submission");
        return;
      }
      toast.success("Submission returned");
      onReturned();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const target = status === "SUBMITTED" ? "employee" : "supervisor";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return to {target}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Provide a reason. The {target} will need to re-submit.
          </p>
          <div className="space-y-1.5">
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Explain what needs to be corrected…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleReturn} disabled={saving}>
            {saving ? "Returning…" : "Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// CreateSubmissionDialog
// =============================================================================

function CreateSubmissionDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId("");
      setPeriodStart("");
      setPeriodEnd("");
    }
  }, [open]);

  async function handleCreate() {
    if (!employeeId.trim() || !periodStart || !periodEnd) {
      toast.error("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dtr/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employeeId.trim(),
          periodStart,
          periodEnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to create submission");
        return;
      }
      toast.success("DTR submission created");
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create DTR Submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Employee ID</Label>
            <Input
              placeholder="cm…"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving}
            className="bg-[#2D6BE4] hover:bg-[#2561CC] text-white"
          >
            {saving ? "Creating…" : "Create Submission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ManualCell — single table cell with inline edit button
// =============================================================================

function ManualCell({
  value,
  canEdit,
  onEdit,
}: {
  value: string | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <TableCell className="text-xs">
      <span className={value ? "font-medium" : "text-muted-foreground"}>
        {fmtTime(value)}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="ml-1.5 inline-flex text-[#2D6BE4] hover:text-[#2561CC] opacity-50 hover:opacity-100 transition-opacity"
          title="Edit manual time"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </TableCell>
  );
}

// =============================================================================
// SubmissionDetailSheet
// =============================================================================

function SubmissionDetailSheet({
  submissionId,
  onClose,
  onRefresh,
}: {
  submissionId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [editState, setEditState] = useState<{
    open: boolean;
    recordId: string;
    field: "manualTimeIn" | "manualTimeOut";
    date: string;
    currentValue: string | null;
  } | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dtr/submissions/${submissionId}`);
      const json = await res.json();
      if (res.ok) setDetail(json.data);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (submissionId) {
      setDetail(null);
      setAuditOpen(false);
      fetchDetail();
    }
  }, [submissionId, fetchDetail]);

  async function handleAction(
    action: "approve-supervisor" | "approve-manager",
  ) {
    if (!submissionId) return;
    setActionLoading(action);
    try {
      const res = await fetch(
        `/api/dtr/submissions/${submissionId}/${action}`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Action failed");
        return;
      }
      toast.success(json.message ?? "Done");
      fetchDetail();
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  }

  const status = detail?.status;
  const canApproveSupervisor = status === "SUBMITTED";
  const canApproveManager = status === "SUPERVISOR_APPROVED";
  const canReturn =
    status === "SUBMITTED" || status === "SUPERVISOR_APPROVED";
  const finalApproved = status === "MANAGER_APPROVED";

  const daysPresent =
    detail?.dtrRecords.filter((r) => r.dayStatus === "PRESENT").length ?? 0;
  const totalDays = detail?.dtrRecords.length ?? 0;
  const totalWorked =
    detail?.dtrRecords.reduce((a, r) => a + r.workedMinutes, 0) ?? 0;
  const totalLate =
    detail?.dtrRecords.reduce((a, r) => a + r.lateMinutes, 0) ?? 0;
  const totalOt =
    detail?.dtrRecords.reduce((a, r) => a + r.otMinutes, 0) ?? 0;

  return (
    <>
      <Sheet open={!!submissionId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          className="w-full sm:max-w-5xl overflow-y-auto flex flex-col gap-0 p-0"
          side="right"
        >
          {loading || !detail ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-[#E8EBF1]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="text-lg font-semibold">
                      {detail.employee.firstName} {detail.employee.lastName}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        #{detail.employee.employeeNumber}
                      </span>
                    </SheetTitle>
                    <SheetDescription className="mt-0.5">
                      {fmtPeriod(detail.periodStart, detail.periodEnd)}
                    </SheetDescription>
                  </div>
                  <Badge
                    variant={STATUS_VARIANT[detail.status] ?? "outline"}
                    className="mt-1 shrink-0"
                  >
                    {STATUS_LABELS[detail.status]}
                  </Badge>
                </div>

                {/* Summary strip */}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Days Present:{" "}
                    <strong className="text-foreground">
                      {daysPresent} / {totalDays}
                    </strong>
                  </span>
                  <span>
                    Hours Worked:{" "}
                    <strong className="text-foreground">
                      {(totalWorked / 60).toFixed(1)}h
                    </strong>
                  </span>
                  <span>
                    Tardiness:{" "}
                    <strong className="text-destructive">
                      {fmtMinutes(totalLate)}
                    </strong>
                  </span>
                  <span>
                    OT:{" "}
                    <strong className="text-foreground">
                      {fmtMinutes(totalOt)}
                    </strong>
                  </span>
                  <span>
                    Submitted:{" "}
                    <strong className="text-foreground">
                      {fmtDate(detail.submittedAt)}
                    </strong>
                  </span>
                </div>

                {/* Returned note */}
                {detail.status === "RETURNED" && detail.returnedReason && (
                  <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <strong>
                      Returned by {detail.returnedByRole}:
                    </strong>{" "}
                    {detail.returnedReason}
                  </div>
                )}
              </SheetHeader>

              {/* Daily Breakdown */}
              <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
                <h3 className="text-sm font-semibold text-[#111827]">
                  Daily Breakdown
                </h3>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#F5F6FA]">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-muted-foreground">
                          Official In
                        </TableHead>
                        <TableHead className="text-xs text-muted-foreground">
                          Official Out
                        </TableHead>
                        <TableHead className="text-xs">Manual In</TableHead>
                        <TableHead className="text-xs">Manual Out</TableHead>
                        <TableHead className="text-xs font-semibold">
                          Effective In
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Effective Out
                        </TableHead>
                        <TableHead className="text-xs">Worked</TableHead>
                        <TableHead className="text-xs text-destructive">
                          Late
                        </TableHead>
                        <TableHead className="text-xs text-blue-600">OT</TableHead>
                        <TableHead className="text-xs text-amber-600">UT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.dtrRecords.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={12}
                            className="text-center text-muted-foreground py-8 text-sm"
                          >
                            No DTR records found for this period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.dtrRecords.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs font-medium whitespace-nowrap">
                              {fmtDate(r.date)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {DAY_STATUS_LABELS[r.dayStatus] ?? r.dayStatus}
                              </Badge>
                            </TableCell>
                            {/* Official — locked/greyed */}
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtTime(r.officialTimeIn)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtTime(r.officialTimeOut)}
                            </TableCell>
                            {/* Manual — editable */}
                            <ManualCell
                              value={r.manualTimeIn}
                              canEdit={!finalApproved && !r.isLocked}
                              onEdit={() =>
                                setEditState({
                                  open: true,
                                  recordId: r.id,
                                  field: "manualTimeIn",
                                  date: r.date,
                                  currentValue: r.manualTimeIn,
                                })
                              }
                            />
                            <ManualCell
                              value={r.manualTimeOut}
                              canEdit={!finalApproved && !r.isLocked}
                              onEdit={() =>
                                setEditState({
                                  open: true,
                                  recordId: r.id,
                                  field: "manualTimeOut",
                                  date: r.date,
                                  currentValue: r.manualTimeOut,
                                })
                              }
                            />
                            {/* Effective — bold */}
                            <TableCell className="text-xs font-semibold">
                              {fmtTime(r.effectiveTimeIn)}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">
                              {fmtTime(r.effectiveTimeOut)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtMinutes(r.workedMinutes)}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">
                              {fmtMinutes(r.lateMinutes)}
                            </TableCell>
                            <TableCell className="text-xs text-blue-600">
                              {r.otMinutes > 0 ? fmtMinutes(r.otMinutes) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-amber-600">
                              {r.undertimeMinutes > 0 ? fmtMinutes(r.undertimeMinutes) : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Audit Log */}
                {detail.auditLogs.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-sm font-semibold text-[#111827] hover:text-[#2D6BE4] transition-colors"
                      onClick={() => setAuditOpen((v) => !v)}
                    >
                      <History className="h-4 w-4" />
                      Audit Log ({detail.auditLogs.length} edit
                      {detail.auditLogs.length !== 1 ? "s" : ""})
                      {auditOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {auditOpen && (
                      <div className="mt-2 rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[#F5F6FA]">
                              <TableHead className="text-xs">Actor</TableHead>
                              <TableHead className="text-xs">Field</TableHead>
                              <TableHead className="text-xs">Old</TableHead>
                              <TableHead className="text-xs">New</TableHead>
                              <TableHead className="text-xs">Reason</TableHead>
                              <TableHead className="text-xs">Notes</TableHead>
                              <TableHead className="text-xs">When</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.auditLogs.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="text-xs">
                                  <Badge
                                    variant={
                                      log.actorRole === "SUPERVISOR"
                                        ? "outline"
                                        : "secondary"
                                    }
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {log.actorRole}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">
                                  {log.fieldChanged === "manualTimeIn"
                                    ? "Time In"
                                    : "Time Out"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {fmtTime(log.oldValue)}
                                </TableCell>
                                <TableCell className="text-xs font-medium">
                                  {fmtTime(log.newValue)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {REASON_LABELS[log.reasonCode] ?? log.reasonCode}
                                </TableCell>
                                <TableCell className="text-xs max-w-[140px] truncate">
                                  {log.notes ?? "—"}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                  {fmtDate(log.createdAt)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Bar */}
              {(canApproveSupervisor || canApproveManager || canReturn) && (
                <>
                  <Separator />
                  <div className="px-6 py-4 flex flex-wrap gap-2 justify-end bg-[#FAFBFC]">
                    {canReturn && (
                      <Button
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => setReturnDialogOpen(true)}
                        disabled={!!actionLoading}
                      >
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        Return
                      </Button>
                    )}
                    {canApproveSupervisor && (
                      <Button
                        variant="outline"
                        onClick={() => handleAction("approve-supervisor")}
                        disabled={actionLoading === "approve-supervisor"}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
                        {actionLoading === "approve-supervisor"
                          ? "Approving…"
                          : "Supervisor Approve"}
                      </Button>
                    )}
                    {canApproveManager && (
                      <Button
                        onClick={() => handleAction("approve-manager")}
                        disabled={actionLoading === "approve-manager"}
                        className="bg-[#2D6BE4] hover:bg-[#2561CC] text-white"
                      >
                        <ShieldCheck className="h-4 w-4 mr-1.5" />
                        {actionLoading === "approve-manager"
                          ? "Finalizing…"
                          : "Manager Approve"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Manual time edit dialog */}
      {editState && detail && (
        <ManualTimeDialog
          open={editState.open}
          onClose={() => setEditState(null)}
          recordId={editState.recordId}
          field={editState.field}
          date={editState.date}
          currentValue={editState.currentValue}
          submissionId={detail.id}
          submissionStatus={detail.status}
          onSaved={fetchDetail}
        />
      )}

      {/* Return dialog */}
      {detail && (
        <ReturnDialog
          open={returnDialogOpen}
          onClose={() => setReturnDialogOpen(false)}
          submissionId={detail.id}
          status={detail.status}
          onReturned={() => {
            fetchDetail();
            onRefresh();
          }}
        />
      )}
    </>
  );
}

// =============================================================================
// DtrRecordsTab — main list
// =============================================================================

export function DtrRecordsTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(employeeSearch, 400);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      ...(statusFilter !== "all" && { status: statusFilter }),
      ...(periodStart && { periodStart }),
      ...(periodEnd && { periodEnd }),
    });
    const res = await fetch(`/api/dtr/submissions?${params}`);
    const json = await res.json();

    // Client-side employee name filter (search doesn't go to the server)
    if (debouncedSearch && json.data) {
      const q = debouncedSearch.toLowerCase();
      json.data = json.data.filter((r: DtrSubmissionRow) => {
        const name =
          `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase();
        return (
          name.includes(q) ||
          r.employee.employeeNumber.toLowerCase().includes(q)
        );
      });
    }

    setData(json);
    setIsLoading(false);
  }, [page, statusFilter, periodStart, periodEnd, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, periodStart, periodEnd, debouncedSearch]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search employee…"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[185px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="SUPERVISOR_APPROVED">
              Supervisor Approved
            </SelectItem>
            <SelectItem value="MANAGER_APPROVED">Manager Approved</SelectItem>
            <SelectItem value="RETURNED">Returned</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-[145px]"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          title="Period start"
        />
        <Input
          type="date"
          className="w-[145px]"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          title="Period end"
        />

        <Button
          variant="outline"
          size="icon"
          onClick={fetchData}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          className="ml-auto bg-[#2D6BE4] hover:bg-[#2561CC] text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Submission
        </Button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.total} submission{data.total !== 1 ? "s" : ""}
        </p>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Cutoff Period</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[64px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-10"
                >
                  No DTR submissions found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-[#F5F6FA] transition-colors"
                  onClick={() => setSelectedId(row.id)}
                >
                  <TableCell className="font-medium text-sm">
                    {row.employee.firstName} {row.employee.lastName}
                    <span className="block text-xs text-muted-foreground">
                      #{row.employee.employeeNumber}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtPeriod(row.periodStart, row.periodEnd)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(row.submittedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.employee.department?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[row.status] ?? "outline"}
                      className="text-xs"
                    >
                      {STATUS_LABELS[row.status]}
                    </Badge>
                    {row.status === "RETURNED" && row.returnedByRole && (
                      <span className="block text-[10px] text-destructive mt-0.5">
                        by {row.returnedByRole}
                      </span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="View Details"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page <= 1}
                  className={
                    page <= 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPage((p) => Math.min(data.totalPages, p + 1))
                  }
                  aria-disabled={page >= data.totalPages}
                  className={
                    page >= data.totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Detail Sheet */}
      <SubmissionDetailSheet
        submissionId={selectedId}
        onClose={() => setSelectedId(null)}
        onRefresh={fetchData}
      />

      {/* Create Dialog */}
      <CreateSubmissionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchData}
      />
    </div>
  );
}
