"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type TermRecord = {
  id: string;
  effectiveDate:    string;
  jobType:          string | null;
  jobStatus:        string | null;
  leaveWorkflowKey: string | null;
  shiftScheduleId:  string | null;
  holidayKey:       string | null;
  termStart:        string | null;
  nextReviewDate:   string | null;
  remark:           string | null;
  shiftSchedule:    { id: string; name: string } | null;
};

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string };
type ShiftSchedule = { id: string; name: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOB_TYPES   = ["Permanent", "Contract", "Probationary", "Casual", "Project-based"];
const JOB_STATUSES = ["Confirmed", "Probation", "Resigned", "Terminated"];
const WORKFLOWS    = ["DEFAULT", "Executive", "Field Staff"];
const HOLIDAYS     = ["DEFAULT", "NCR", "Regional"];

const EMPTY_FORM = {
  effectiveDate:    "",
  jobType:          "",
  jobStatus:        "",
  leaveWorkflowKey: "",
  shiftScheduleId:  "",
  holidayKey:       "",
  termStart:        "",
  nextReviewDate:   "",
  remark:           "",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmploymentTermsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftSchedule[]>([]);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [records,  setRecords]  = useState<TermRecord[]>([]);
  const [loading,  setLoading]  = useState(false);

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<TermRecord | null>(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TermRecord | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadRefData = useCallback(async () => {
    const [empRes, shiftRes] = await Promise.all([
      fetch("/api/employees?limit=500&status=ACTIVE"),
      fetch("/api/shifts?limit=200&isActive=true"),
    ]);
    const [empJson, shiftJson] = await Promise.all([empRes.json(), shiftRes.json()]);
    setEmployees(empJson.data ?? []);
    setShiftSchedules(shiftJson.data ?? []);
  }, []);

  const loadRecords = useCallback(async () => {
    if (!selectedEmployee) { setRecords([]); return; }
    setLoading(true);
    const res  = await fetch(`/api/employees/${selectedEmployee}/employment-terms`);
    const json = await res.json();
    setRecords(json.data ?? []);
    setLoading(false);
  }, [selectedEmployee]);

  useEffect(() => { loadRefData(); }, [loadRefData]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ---------------------------------------------------------------------------
  // Sheet helpers
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, effectiveDate: new Date().toISOString().slice(0, 10) });
    setSheetOpen(true);
  }

  function openEdit(r: TermRecord) {
    setEditTarget(r);
    setForm({
      effectiveDate:    r.effectiveDate.slice(0, 10),
      jobType:          r.jobType          ?? "",
      jobStatus:        r.jobStatus        ?? "",
      leaveWorkflowKey: r.leaveWorkflowKey ?? "",
      shiftScheduleId:  r.shiftScheduleId  ?? "",
      holidayKey:       r.holidayKey       ?? "",
      termStart:        r.termStart ? r.termStart.slice(0, 10) : "",
      nextReviewDate:   r.nextReviewDate ? r.nextReviewDate.slice(0, 10) : "",
      remark:           r.remark    ?? "",
    });
    setSheetOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!selectedEmployee)   { toast.error("No employee selected"); return; }
    if (!form.effectiveDate) { toast.error("Effective date is required"); return; }

    const body = {
      effectiveDate:    form.effectiveDate,
      jobType:          form.jobType          || null,
      jobStatus:        form.jobStatus        || null,
      leaveWorkflowKey: form.leaveWorkflowKey || null,
      shiftScheduleId:  form.shiftScheduleId  || null,
      holidayKey:       form.holidayKey       || null,
      termStart:        form.termStart        || null,
      nextReviewDate:   form.nextReviewDate   || null,
      remark:           form.remark           || null,
    };

    setSaving(true);
    const url = editTarget
      ? `/api/employees/${selectedEmployee}/employment-terms/${editTarget.id}`
      : `/api/employees/${selectedEmployee}/employment-terms`;
    const method = editTarget ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editTarget ? "Employment term updated" : "Employment term added");
    setSheetOpen(false);
    loadRecords();
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function confirmDelete() {
    if (!deleteTarget || !selectedEmployee) return;
    setDeleting(true);
    const res = await fetch(
      `/api/employees/${selectedEmployee}/employment-terms/${deleteTarget.id}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setDeleting(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to delete"); return; }
    toast.success("Employment term deleted");
    setDeleteTarget(null);
    loadRecords();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selectedEmp = employees.find((e) => e.id === selectedEmployee);

  function selectField(
    label: string,
    field: keyof typeof form,
    options: string[],
  ) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select
          value={(form[field] as string) || "none"}
          onValueChange={(v) => setForm({ ...form, [field]: v === "none" ? "" : v })}
        >
          <SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}…`} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Employment Terms</h1>
        <p className="text-sm text-muted-foreground">
          Job type, status, leave workflow, workday, and holiday schedule history per employee
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Select
            value={selectedEmployee || "none"}
            onValueChange={(v) => setSelectedEmployee((v ?? "") === "none" ? "" : (v ?? ""))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employee…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Select employee —</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName} ({e.employeeNumber})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRecords} disabled={loading || !selectedEmployee}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!selectedEmployee}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Terms
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Effective Date</TableHead>
              <TableHead>Job Type</TableHead>
              <TableHead>Job Status</TableHead>
              <TableHead>Leave Workflow</TableHead>
              <TableHead>Shift Schedule</TableHead>
              <TableHead>Holiday</TableHead>
              <TableHead>Term / Next Review</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedEmployee ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Select an employee to view their employment terms history.
                </TableCell>
              </TableRow>
            ) : loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No employment term records for{" "}
                  {selectedEmp ? `${selectedEmp.firstName} ${selectedEmp.lastName}` : "this employee"}.
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">
                    {r.effectiveDate.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-sm">{r.jobType   ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.jobStatus ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.leaveWorkflowKey ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.shiftSchedule?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.holidayKey       ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.termStart
                      ? `${r.termStart.slice(0, 10)}${r.nextReviewDate ? ` → ${r.nextReviewDate.slice(0, 10)}` : " →"}`
                      : (r.nextReviewDate ? r.nextReviewDate.slice(0, 10) : "—")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                      >
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

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editTarget ? "Edit Employment Terms" : "Add Employment Terms"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Effective Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>

            {selectField("Job Type",        "jobType",          JOB_TYPES)}
            {selectField("Job Status",       "jobStatus",        JOB_STATUSES)}
            {selectField("Leave Workflow",   "leaveWorkflowKey", WORKFLOWS)}
            <div className="space-y-1.5">
              <Label>Shift Schedule</Label>
              <Select
                value={form.shiftScheduleId || "none"}
                onValueChange={(v) => setForm({ ...form, shiftScheduleId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select shift schedule…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {shiftSchedules.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectField("Holiday",          "holidayKey",       HOLIDAYS)}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Term Start</Label>
                <Input
                  type="date"
                  value={form.termStart}
                  onChange={(e) => setForm({ ...form, termStart: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Next Review</Label>
                <Input
                  type="date"
                  value={form.nextReviewDate}
                  onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Remark</Label>
              <Input
                placeholder="200 characters max"
                maxLength={200}
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Record"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Delete Employment Term Record</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {deleteTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{deleteTarget.effectiveDate.slice(0, 10)}</p>
                <p className="text-muted-foreground">
                  {deleteTarget.jobType ?? "—"} · {deleteTarget.jobStatus ?? "—"}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The employment term record will be permanently removed.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
