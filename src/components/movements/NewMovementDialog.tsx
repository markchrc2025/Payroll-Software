"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Info, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeCombo, type ComboEmployee } from "@/components/movements/EmployeeCombo";
import {
  QuickCreateDialog,
  type QuickCreateEntity,
  type CreatedRecord,
} from "@/components/movements/QuickCreateDialog";

type Department = { id: string; name: string };
type Branch = { id: string; name: string };
type Position = { id: string; title: string; departmentId: string | null };
type ShiftSchedule = { id: string; name: string };
type JobTypeRef = { id: string; name: string };
type JobStatusRef = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: ComboEmployee[];
  departments: Department[];
  branches: Branch[];
  positions: Position[];
  shiftSchedules: ShiftSchedule[];
  jobTypes: JobTypeRef[];
  jobStatuses: JobStatusRef[];
  onCreated: () => void;
  reloadReferenceData: () => void;
};

const MOVEMENT_SCOPES = [
  { value: "PLACEMENT_CHANGE", label: "Change in Placement" },
  { value: "TERMS_CHANGE", label: "Change in Employment Terms" },
  { value: "COMBINED_CHANGE", label: "Both (Placement + Employment Terms)" },
];

const EMPTY_FORM = {
  employeeId: "",
  scope: "PLACEMENT_CHANGE",
  effectiveDate: "",
  reason: "",
  notes: "",
  // Placement fields
  toDepartmentId: "",
  toBranchId: "",
  toPositionId: "",
  toLineManagerId: "",
  // Terms fields
  toJobTypeId: "",
  toJobStatusId: "",
  toLeaveWorkflowKey: "",
  toShiftScheduleId: "",
  toHolidayKey: "",
  toTermStart: "",
  toNextReviewDate: "",
};

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 pt-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="flex items-center gap-1 text-xs font-semibold text-foreground">
      {children}
      {required && <span className="text-primary">*</span>}
    </label>
  );
}

export function NewMovementDialog({
  open,
  onOpenChange,
  employees,
  departments: departmentsProp,
  branches: branchesProp,
  positions: positionsProp,
  shiftSchedules,
  jobTypes,
  jobStatuses,
  onCreated,
  reloadReferenceData,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [quickCreate, setQuickCreate] = useState<QuickCreateEntity | null>(null);

  // Working copies of reference lists so a quick-create can append + auto-select
  // immediately, without waiting for the background reload.
  const [departments, setDepartments] = useState(departmentsProp);
  const [branches, setBranches] = useState(branchesProp);
  const [positions, setPositions] = useState(positionsProp);

  useEffect(() => setDepartments(departmentsProp), [departmentsProp]);
  useEffect(() => setBranches(branchesProp), [branchesProp]);
  useEffect(() => setPositions(positionsProp), [positionsProp]);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const isPlacement = form.scope === "PLACEMENT_CHANGE" || form.scope === "COMBINED_CHANGE";
  const isTerms = form.scope === "TERMS_CHANGE" || form.scope === "COMBINED_CHANGE";

  const canSubmit = Boolean(form.employeeId && form.scope && form.effectiveDate);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleCreated(entity: QuickCreateEntity, record: CreatedRecord) {
    if (entity === "position") {
      setPositions((p) => [{ id: record.id, title: record.title ?? "Untitled", departmentId: form.toDepartmentId || null }, ...p]);
      set("toPositionId", record.id);
    } else if (entity === "department") {
      setDepartments((d) => [{ id: record.id, name: record.name ?? "Untitled" }, ...d]);
      set("toDepartmentId", record.id);
    } else {
      setBranches((b) => [{ id: record.id, name: record.name ?? "Untitled" }, ...b]);
      set("toBranchId", record.id);
    }
    reloadReferenceData(); // keep the page's canonical lists fresh
  }

  function buildCreateBody() {
    const body: Record<string, unknown> = {
      movementType: form.scope,
      effectiveDate: form.effectiveDate,
      reason: form.reason || null,
      notes: form.notes || null,
    };
    if (isPlacement) {
      if (form.toDepartmentId) body.toDepartmentId = form.toDepartmentId;
      if (form.toPositionId) body.toPositionId = form.toPositionId;
      if (form.toLineManagerId) body.toLineManagerId = form.toLineManagerId;
      if (form.toBranchId) body.toBranchId = form.toBranchId;
    }
    if (isTerms) {
      if (form.toJobTypeId) body.toJobTypeId = form.toJobTypeId;
      if (form.toJobStatusId) body.toJobStatusId = form.toJobStatusId;
      if (form.toLeaveWorkflowKey) body.toLeaveWorkflowKey = form.toLeaveWorkflowKey;
      if (form.toShiftScheduleId) body.toShiftScheduleId = form.toShiftScheduleId;
      if (form.toHolidayKey) body.toHolidayKey = form.toHolidayKey;
      if (form.toTermStart) body.toTermStart = form.toTermStart;
      if (form.toNextReviewDate) body.toNextReviewDate = form.toNextReviewDate;
    }
    return body;
  }

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error("Employee, scope, and effective date are required");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/employees/${form.employeeId}/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCreateBody()),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(json.error ?? "Failed to create movement");
      return;
    }
    toast.success("Movement request created");
    onOpenChange(false);
    onCreated();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100vh-56px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 flex-none items-center justify-center rounded-[11px] bg-accent text-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7" />
                </svg>
              </div>
              <div>
                <DialogTitle className="text-[19px] leading-tight">New Movement Request</DialogTitle>
                <DialogDescription className="mt-0.5 text-[12.5px]">
                  Transfer, promotion, salary or status change.
                </DialogDescription>
              </div>
            </div>
            <DialogClose
              render={<Button variant="outline" size="icon-sm" className="size-[34px] rounded-[9px]" />}
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogClose>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-3.5 overflow-y-auto px-6 py-5 sm:grid-cols-3">
            {/* Core */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Employee</FieldLabel>
              <EmployeeCombo
                employees={employees}
                value={form.employeeId}
                onChange={(id) => set("employeeId", id)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Scope of Change</FieldLabel>
              <Select value={form.scope} onValueChange={(v) => set("scope", v ?? form.scope)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Effective Date</FieldLabel>
              <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
            </div>

            {/* Placement */}
            {isPlacement && (
              <>
                <SectionDivider label="Placement Details" />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Department</FieldLabel>
                  <SelectWithAdd
                    value={form.toDepartmentId}
                    onValueChange={(v) => {
                      set("toDepartmentId", v);
                      // clear position if it belongs to a different department
                      const pos = positions.find((p) => p.id === form.toPositionId);
                      if (pos && pos.departmentId && pos.departmentId !== v) {
                        set("toPositionId", "");
                      }
                    }}
                    placeholder="Select department…"
                    options={departments.map((d) => ({ id: d.id, label: d.name }))}
                    onAdd={() => setQuickCreate("department")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>To Position</FieldLabel>
                  <SelectWithAdd
                    value={form.toPositionId}
                    onValueChange={(v) => set("toPositionId", v)}
                    placeholder={form.toDepartmentId ? "Select position…" : "Select department first"}
                    options={
                      form.toDepartmentId
                        ? positions.filter((p) => p.departmentId === form.toDepartmentId).map((p) => ({ id: p.id, label: p.title }))
                        : []
                    }
                    onAdd={() => setQuickCreate("position")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Line Manager</FieldLabel>
                  <EmployeeCombo
                    employees={employees}
                    value={form.toLineManagerId}
                    onChange={(id) => set("toLineManagerId", id)}
                    placeholder="Select line manager…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Branch</FieldLabel>
                  <SelectWithAdd
                    value={form.toBranchId}
                    onValueChange={(v) => set("toBranchId", v)}
                    placeholder="Select branch…"
                    options={branches.map((b) => ({ id: b.id, label: b.name }))}
                    onAdd={() => setQuickCreate("branch")}
                  />
                </div>
              </>
            )}

            {/* Employment Terms */}
            {isTerms && (
              <>
                <SectionDivider label="Employment Terms" />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Job Type</FieldLabel>
                  <Select value={form.toJobTypeId} onValueChange={(v) => set("toJobTypeId", v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select job type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map((jt) => (
                        <SelectItem key={jt.id} value={jt.id}>{jt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Job Status</FieldLabel>
                  <Select value={form.toJobStatusId} onValueChange={(v) => set("toJobStatusId", v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select job status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobStatuses.map((js) => (
                        <SelectItem key={js.id} value={js.id}>{js.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Leave Workflow Key</FieldLabel>
                  <Input placeholder="e.g. standard" value={form.toLeaveWorkflowKey} onChange={(e) => set("toLeaveWorkflowKey", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Shift Schedule</FieldLabel>
                  <Select value={form.toShiftScheduleId} onValueChange={(v) => set("toShiftScheduleId", v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select shift schedule…" />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftSchedules.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Holiday Key</FieldLabel>
                  <Input placeholder="e.g. ph-standard" value={form.toHolidayKey} onChange={(e) => set("toHolidayKey", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Term Start</FieldLabel>
                  <Input type="date" value={form.toTermStart} onChange={(e) => set("toTermStart", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Next Review</FieldLabel>
                  <Input type="date" value={form.toNextReviewDate} onChange={(e) => set("toNextReviewDate", e.target.value)} />
                </div>
              </>
            )}

            {/* Justification */}
            <SectionDivider label="Justification" />
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Reason</FieldLabel>
              <Textarea rows={2} placeholder="Why is this movement being requested?" value={form.reason} onChange={(e) => set("reason", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Notes</FieldLabel>
              <Textarea rows={2} placeholder="Optional internal notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 border-t bg-muted/50 px-6 py-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5" />
              <span>
                <span className="text-primary">*</span> Required fields
              </span>
            </div>
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
                <Check className="size-4" />
                {saving ? "Submitting…" : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {quickCreate && (
        <QuickCreateDialog
          entity={quickCreate}
          open={quickCreate !== null}
          onOpenChange={(o) => !o && setQuickCreate(null)}
          onCreated={(record) => handleCreated(quickCreate, record)}
        />
      )}
    </>
  );
}

function SelectWithAdd({
  value,
  onValueChange,
  placeholder,
  options,
  onAdd,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  options: { id: string; label: string }[];
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
        <SelectTrigger className="w-full min-w-0 flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onAdd}
        title="Create new"
        aria-label="Create new"
        className="flex size-8 flex-none items-center justify-center rounded-lg border border-dashed border-input bg-muted/40 text-primary transition-colors hover:border-primary hover:bg-accent"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
