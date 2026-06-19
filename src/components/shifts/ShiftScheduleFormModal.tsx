"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Clock,
  Pencil,
  CalendarDays,
  Coffee,
  Zap,
  Users,
  Moon,
  Trash2,
  X,
  Sliders,
  Infinity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UiType   = "Fixed" | "Flexible" | "Open";
type UiPolicy = "Auto-deduct (Fixed)" | "Floating" | "Punch in / out" | "Paid break";

interface FormState {
  name:        string;
  code:        string;
  type:        UiType;
  // Fixed
  timeIn:      string;
  timeOut:     string;
  grace:       string;
  cross:       boolean;
  // Flexible
  coreIn:      string;
  coreOut:     string;
  // Flexible + Open
  reqHours:    string;
  // Break
  breakMin:    string;
  breakPolicy: UiPolicy;
  // Work days
  days:        Record<string, boolean>;
  // OT
  autoOT:      boolean;
}

export interface ApiShiftSchedule {
  id:                  string;
  name:                string;
  code:                string | null;
  type:                string;
  timeIn:              string | null;
  timeOut:             string | null;
  coreTimeIn:          string | null;
  coreTimeOut:         string | null;
  requiredHours:       number | null;
  gracePeriodMinutes:  number;
  breakMinutes:        number;
  breakPolicy:         string;
  crossesMidnight:     boolean;
  workDays:            string[];
  otThresholdMinutes:  number | null;
  isActive:            boolean;
  _count?:             { employees?: number };
}

export interface ShiftScheduleFormModalProps {
  mode:          "add" | "edit";
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onSaved:       () => void;
  initialData?:  ApiShiftSchedule;
  assignedCount?: number;
}

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

const API_TYPE: Record<UiType, string>  = { Fixed: "FIXED", Flexible: "FLEXIBLE", Open: "OPEN" };
const UI_TYPE: Record<string, UiType>   = { FIXED: "Fixed", FLEXIBLE: "Flexible", OPEN: "Open" };

const API_POLICY: Record<UiPolicy, string> = {
  "Auto-deduct (Fixed)": "FIXED_DEDUCTION",
  "Floating":            "FLOATING",
  "Punch in / out":      "PUNCH_IN_OUT",
  "Paid break":          "PAID_BREAK",
};
const UI_POLICY: Record<string, UiPolicy> = {
  FIXED_DEDUCTION: "Auto-deduct (Fixed)",
  FLOATING:        "Floating",
  TRACK_ACTUAL:    "Punch in / out",
  PUNCH_IN_OUT:    "Punch in / out",
  PAID_BREAK:      "Paid break",
};

const API_DAY: Record<string, string> = {
  Mon: "MON", Tue: "TUE", Wed: "WED", Thu: "THU",
  Fri: "FRI", Sat: "SAT", Sun: "SUN",
};
const UI_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function emptyDays(): Record<string, boolean> {
  return { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false, Sun: false };
}

const DEFAULT_FORM: FormState = {
  name:        "",
  code:        "",
  type:        "Fixed",
  timeIn:      "08:00",
  timeOut:     "17:00",
  grace:       "0",
  cross:       false,
  coreIn:      "09:00",
  coreOut:     "15:00",
  reqHours:    "8",
  breakMin:    "60",
  breakPolicy: "Auto-deduct (Fixed)",
  days:        emptyDays(),
  autoOT:      false,
};

function hydrate(row: ApiShiftSchedule): FormState {
  const days = emptyDays();
  for (const key of UI_DAYS) {
    days[key] = Array.isArray(row.workDays) && row.workDays.includes(API_DAY[key]);
  }
  return {
    name:        row.name,
    code:        row.code ?? "",
    type:        UI_TYPE[row.type] ?? "Fixed",
    timeIn:      row.timeIn  ?? "08:00",
    timeOut:     row.timeOut ?? "17:00",
    grace:       String(row.gracePeriodMinutes ?? 0),
    cross:       row.crossesMidnight,
    coreIn:      row.coreTimeIn  ?? "09:00",
    coreOut:     row.coreTimeOut ?? "15:00",
    reqHours:    String(row.requiredHours ?? 8),
    breakMin:    String(row.breakMinutes),
    breakPolicy: UI_POLICY[row.breakPolicy] ?? "Auto-deduct (Fixed)",
    days,
    autoOT:      row.otThresholdMinutes !== null,
  };
}

// ---------------------------------------------------------------------------
// Live summary computation
// ---------------------------------------------------------------------------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function computeSummary(f: FormState): { paidHours: string; rangeText: string; dayText: string } {
  const brk = parseInt(f.breakMin, 10) || 0;

  let span = 0;
  if (f.type === "Fixed") {
    span = toMin(f.timeOut) - toMin(f.timeIn);
    if (f.cross || span <= 0) span += 1440;
  } else {
    const rh = parseFloat(f.reqHours);
    span = (isNaN(rh) ? 0 : rh * 60) + brk;
  }

  const paid = span - brk;
  const paidHours = paid <= 0 || isNaN(paid) ? "—" : (paid / 60).toFixed(1);

  let rangeText: string;
  if (f.type === "Fixed") {
    rangeText = `${f.timeIn} → ${f.timeOut}${f.cross ? " +1" : ""}`;
  } else if (f.type === "Open") {
    rangeText = "Open hours";
  } else {
    rangeText = f.coreIn && f.coreOut ? `Core ${f.coreIn}–${f.coreOut}` : "Flexible";
  }

  const selected = UI_DAYS.filter((d) => f.days[d]);
  let dayText: string;
  if (selected.length === 0) {
    dayText = "No days selected";
  } else if (selected.length === 7) {
    dayText = "Every day";
  } else if (
    selected.length >= 3 &&
    selected.every((d, i) =>
      UI_DAYS.indexOf(d) === (UI_DAYS.indexOf(selected[0]!) + i)
    )
  ) {
    dayText = `${selected[0]}–${selected[selected.length - 1]}`;
  } else {
    dayText = selected.join(", ");
  }

  return { paidHours, rangeText, dayText };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "Name is required";
  if (f.type === "Fixed") {
    if (!f.timeIn)  e.timeIn  = "Required";
    if (!f.timeOut) e.timeOut = "Required";
  }
  if (!Object.values(f.days).some(Boolean)) e.days = "Select at least one work day";
  return e;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionDivider({ icon, label }: { icon: ReactNode; label: ReactNode }) {
  return (
    <div className="flex items-center gap-[11px] my-[22px] first:mt-[2px]">
      <span
        style={{ fontFamily: "Instrument Sans, sans-serif" }}
        className="flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.07em] text-[#C2552F] whitespace-nowrap"
      >
        <span className="text-[#E8693A] flex items-center">{icon}</span>
        {label}
      </span>
      <div className="flex-1 h-px bg-[#ECE6DD]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ShiftScheduleFormModal({
  mode,
  open,
  onOpenChange,
  onSaved,
  initialData,
  assignedCount = 0,
}: ShiftScheduleFormModalProps) {
  const [form, setForm]         = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Scroll-edge tracking
  const scrollRef   = useRef<HTMLDivElement>(null);
  const [atTop,    setAtTop]    = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const measureEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 1);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(mode === "edit" && initialData ? hydrate(initialData) : DEFAULT_FORM);
    setErrors({});
    setSaving(false);
  }, [open, mode, initialData]);

  useEffect(() => {
    measureEdge();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureEdge);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEdge, form]);

  // Derived
  const summary = computeSummary(form);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function toggleDay(d: string) {
    setForm((f) => ({ ...f, days: { ...f.days, [d]: !f.days[d] } }));
    if (errors.days) setErrors((e) => { const n = { ...e }; delete n.days; return n; });
  }

  function setPreset(preset: "weekdays" | "all" | "clear") {
    const next = { ...form.days };
    for (const d of UI_DAYS) {
      next[d] = preset === "all" ? true : preset === "weekdays" ? !["Sat", "Sun"].includes(d) : false;
    }
    setForm((f) => ({ ...f, days: next }));
    if (errors.days) setErrors((e) => { const n = { ...e }; delete n.days; return n; });
  }

  async function handleSave() {
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);

    const workDays = UI_DAYS
      .filter((d) => form.days[d])
      .map((d) => API_DAY[d]);

    const body = {
      name:               form.name.trim(),
      code:               form.code.trim() || null,
      type:               API_TYPE[form.type],
      timeIn:             form.type === "Fixed" ? form.timeIn  : null,
      timeOut:            form.type === "Fixed" ? form.timeOut : null,
      coreTimeIn:         form.type === "Flexible" ? form.coreIn  : null,
      coreTimeOut:        form.type === "Flexible" ? form.coreOut : null,
      requiredHours:      form.type !== "Fixed" ? parseFloat(form.reqHours) || null : null,
      gracePeriodMinutes: form.type === "Fixed" ? parseInt(form.grace, 10) || 0 : 0,
      breakMinutes:       parseInt(form.breakMin, 10) || 0,
      breakPolicy:        API_POLICY[form.breakPolicy],
      crossesMidnight:    form.type === "Fixed" ? form.cross : false,
      workDays,
      otThresholdMinutes: form.autoOT ? 480 : null,
    };

    const url    = mode === "edit" && initialData ? `/api/shifts/${initialData.id}` : "/api/shifts";
    const method = mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (res.status === 409) {
      setErrors((e) => ({ ...e, name: "Name already exists" }));
      return;
    }
    if (!res.ok) {
      setErrors((e) => ({ ...e, _form: json?.error ?? "Failed to save" }));
      return;
    }

    onSaved();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!initialData) return;
    const res = await fetch(`/api/shifts/${initialData.id}`, { method: "DELETE" });
    if (!res.ok) {
      setErrors((e) => ({ ...e, _form: "Failed to delete" }));
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(false);
    onSaved();
    onOpenChange(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const POLICY_OPTIONS: UiPolicy[] = [
    "Auto-deduct (Fixed)",
    "Floating",
    "Punch in / out",
    "Paid break",
  ];

  const breakNote = form.breakPolicy === "Paid break"
    ? "Break time is paid — nothing is deducted from worked hours."
    : form.breakPolicy === "Punch in / out"
    ? "Employee must punch out and back in for break. System sums paired IN-OUT intervals."
    : form.breakPolicy === "Floating"
    ? `Worked hours = (last clock-out − first clock-in) − ${form.breakMin} min. Employee can take the break at any time.`
    : `Worked hours = (last clock-out − first clock-in) − ${form.breakMin} min. No lunch punch needed.`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex flex-col gap-0 p-0 overflow-hidden rounded-[18px] w-[620px] max-w-[calc(100%-2rem)] max-h-[min(760px,calc(100vh-56px))] sm:max-w-[620px]"
        >
          <style>{`
            [data-shift-modal] {
              scrollbar-gutter: stable;
              scrollbar-width: thin;
              scrollbar-color: #d9cfc2 transparent;
            }
            [data-shift-modal]::-webkit-scrollbar { width: 12px; }
            [data-shift-modal]::-webkit-scrollbar-track { background: transparent; }
            [data-shift-modal]::-webkit-scrollbar-thumb {
              background: #d9cfc2;
              border-radius: 99px;
              border: 4px solid transparent;
              background-clip: padding-box;
            }
            [data-shift-modal]::-webkit-scrollbar-thumb:hover { background: #c3b29c; }
          `}</style>

          {/* ── HEADER ── */}
          <div
            className={cn(
              "flex-none flex items-start justify-between px-6 py-5 border-b border-transparent transition-colors duration-150",
              !atTop && "border-b-[#ECE6DD] shadow-[0_6px_14px_-12px_rgba(33,26,21,0.4)]"
            )}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="flex-none flex items-center justify-center rounded-[11px]"
                style={{ width: 38, height: 38, background: "#fdeee6", color: "#E8693A" }}
              >
                {mode === "edit"
                  ? <Pencil className="size-[17px]" />
                  : <Clock  className="size-[17px]" />
                }
              </div>
              <div>
                <DialogTitle
                  className="text-[17px] font-semibold leading-tight text-[#2A2420]"
                  style={{ fontFamily: "Instrument Sans, sans-serif" }}
                >
                  {mode === "edit" ? "Edit Shift Schedule" : "Add Shift Schedule"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[12px] text-[#6B6259]">
                  {mode === "edit"
                    ? "Update the schedule settings below."
                    : "Configure a named shift template for DTR enforcement."}
                </DialogDescription>
              </div>
            </div>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="flex-none size-[34px] rounded-[9px] border-[#ECE6DD]"
                />
              }
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogClose>
          </div>

          {/* ── SCROLL REGION ── */}
          <div
            ref={scrollRef}
            data-shift-modal
            onScroll={measureEdge}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ padding: "18px 24px 22px" }}
          >

            {/* Edit banner */}
            {mode === "edit" && (
              <div
                className="flex items-center gap-3 rounded-[11px] border px-4 py-3 mb-2"
                style={{ background: "#F6F2EC", borderColor: "#ECE6DD" }}
              >
                <div
                  className="flex items-center justify-center rounded-[8px] size-8"
                  style={{ background: "#e9eff7" }}
                >
                  <Users className="size-4" style={{ color: "#3e63a0" }} />
                </div>
                <span className="text-[12.5px] text-[#6B6259]">
                  <b className="text-[#2A2420]">{assignedCount}</b>{" "}
                  {assignedCount === 1 ? "employee" : "employees"} assigned to this shift
                </span>
              </div>
            )}

            {/* ── Section: Schedule ── */}
            <SectionDivider icon={<CalendarDays className="size-3.5" />} label="Schedule" />

            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 150px" }}>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">
                  Name <span style={{ color: "#E8693A" }}>*</span>
                </Label>
                <Input
                  placeholder="Day Shift"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && (
                  <p className="text-[11.5px] text-destructive">{errors.name}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">Code</Label>
                <Input
                  placeholder="DAY-8"
                  maxLength={20}
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                />
              </div>
            </div>

            {/* ── Section: Shift type ── */}
            <SectionDivider icon={<Clock className="size-3.5" />} label="Shift type" />

            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {(["Fixed", "Flexible", "Open"] as UiType[]).map((t) => {
                const selected = form.type === t;
                const icon =
                  t === "Fixed"    ? <Clock    className="size-4" /> :
                  t === "Flexible" ? <Sliders  className="size-4" /> :
                                     <Infinity className="size-4" />;
                const desc =
                  t === "Fixed"    ? "Set start & end time" :
                  t === "Flexible" ? "Core window, total hours" :
                                     "No fixed schedule";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("type", t)}
                    className={cn(
                      "flex flex-col gap-2 rounded-[12px] p-3 text-left border-[1.5px] transition-all",
                      selected
                        ? "border-[#E8693A] bg-[#fdeee6] shadow-[0_0_0_3px_rgba(232,105,58,.1)]"
                        : "border-[#ECE6DD] bg-white hover:border-[#d0c9c0]"
                    )}
                  >
                    <div
                      className="flex items-center justify-center rounded-[8px] size-8"
                      style={{
                        background: selected ? "#E8693A" : "#F6F2EC",
                        color:      selected ? "#fff"    : "#6B6259",
                      }}
                    >
                      {icon}
                    </div>
                    <div>
                      <div
                        className="text-[13px] font-semibold leading-tight"
                        style={{ color: selected ? "#C2552F" : "#2A2420" }}
                      >
                        {t}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "#9b9085" }}>
                        {desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Section: Hours ── */}
            <SectionDivider icon={<Clock className="size-3.5" />} label="Hours" />

            {form.type === "Fixed" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px] font-medium text-[#2A2420]">
                      Time in <span style={{ color: "#E8693A" }}>*</span>
                    </Label>
                    <div className="relative">
                      <Clock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: 15, height: 15, color: "#9b9085" }}
                      />
                      <Input
                        type="time"
                        value={form.timeIn}
                        onChange={(e) => set("timeIn", e.target.value)}
                        className={cn("pl-8", errors.timeIn && "border-destructive")}
                      />
                    </div>
                    {errors.timeIn && (
                      <p className="text-[11.5px] text-destructive">{errors.timeIn}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px] font-medium text-[#2A2420]">
                      Time out <span style={{ color: "#E8693A" }}>*</span>
                    </Label>
                    <div className="relative">
                      <Clock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: 15, height: 15, color: "#9b9085" }}
                      />
                      <Input
                        type="time"
                        value={form.timeOut}
                        onChange={(e) => set("timeOut", e.target.value)}
                        className={cn("pl-8", errors.timeOut && "border-destructive")}
                      />
                    </div>
                    {errors.timeOut && (
                      <p className="text-[11.5px] text-destructive">{errors.timeOut}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-3">
                  <Label className="text-[12.5px] font-medium text-[#2A2420]">Grace period</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={form.grace}
                      onChange={(e) => set("grace", e.target.value)}
                      className="pr-[72px]"
                    />
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                      style={{ color: "#9b9085" }}
                    >
                      minutes
                    </span>
                  </div>
                  <p className="text-[11.5px]" style={{ color: "#9b9085" }}>
                    Minutes after expected time-in before tardiness is recorded. 0 = strict.
                  </p>
                </div>

                <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.cross}
                    onChange={(e) => set("cross", e.target.checked)}
                    className="rounded border-[#ECE6DD] accent-[#E8693A]"
                  />
                  <Moon className="size-3.5" style={{ color: "#6B6259" }} />
                  <span className="text-[12.5px]" style={{ color: "#2A2420" }}>
                    Crosses midnight (e.g. 22:00–06:00 night shift)
                  </span>
                </label>
              </>
            )}

            {form.type === "Flexible" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px] font-medium text-[#2A2420]">Core time in</Label>
                    <div className="relative">
                      <Clock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: 15, height: 15, color: "#9b9085" }}
                      />
                      <Input
                        type="time"
                        value={form.coreIn}
                        onChange={(e) => set("coreIn", e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px] font-medium text-[#2A2420]">Core time out</Label>
                    <div className="relative">
                      <Clock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: 15, height: 15, color: "#9b9085" }}
                      />
                      <Input
                        type="time"
                        value={form.coreOut}
                        onChange={(e) => set("coreOut", e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-3">
                  <Label className="text-[12.5px] font-medium text-[#2A2420]">Required hours</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      value={form.reqHours}
                      onChange={(e) => set("reqHours", e.target.value)}
                      className="pr-[48px]"
                    />
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                      style={{ color: "#9b9085" }}
                    >
                      hours
                    </span>
                  </div>
                  <p className="text-[11.5px]" style={{ color: "#9b9085" }}>
                    Employee can clock in any time but must be present during the core window and complete the required hours.
                  </p>
                </div>
              </>
            )}

            {form.type === "Open" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">Required hours</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.reqHours}
                    onChange={(e) => set("reqHours", e.target.value)}
                    className="pr-[48px]"
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                    style={{ color: "#9b9085" }}
                  >
                    hours
                  </span>
                </div>
                <p className="text-[11.5px]" style={{ color: "#9b9085" }}>
                  No fixed schedule — employee works any hours. Undertime computed against this target.
                </p>
              </div>
            )}

            {/* ── Section: Break ── */}
            <SectionDivider icon={<Coffee className="size-3.5" />} label="Break" />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">Break duration</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={480}
                    value={form.breakMin}
                    onChange={(e) => set("breakMin", e.target.value)}
                    className="pr-[72px]"
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                    style={{ color: "#9b9085" }}
                  >
                    minutes
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">Break policy</Label>
                <select
                  value={form.breakPolicy}
                  onChange={(e) => set("breakPolicy", e.target.value as UiPolicy)}
                  className="h-8 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                >
                  {POLICY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Break info note */}
            <div
              className="flex gap-2.5 mt-3 rounded-[9px] px-3.5 py-2.5"
              style={{
                background: "#fbf7e9",
                borderLeft: "3px solid #E8693A",
              }}
            >
              <span
                className="flex-none flex items-center justify-center rounded-full text-[11px] font-bold size-4 mt-0.5"
                style={{ background: "#d9c98a", color: "#6b5800" }}
              >
                i
              </span>
              <p className="text-[12px]" style={{ color: "#5a4800" }}>{breakNote}</p>
            </div>

            {/* ── Section: Work days ── */}
            <SectionDivider
              icon={<CalendarDays className="size-3.5" />}
              label={<>Work days <span style={{ color: "#E8693A" }}>*</span></>}
            />

            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[12px]" style={{ color: "#9b9085" }}>
                {Object.values(form.days).filter(Boolean).length} day
                {Object.values(form.days).filter(Boolean).length !== 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-1.5">
                {(["weekdays", "all", "clear"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className="text-[11.5px] font-medium px-2.5 py-1 rounded-[7px] border transition-colors hover:border-[#E8693A] hover:text-[#E8693A]"
                    style={{ borderColor: "#ECE6DD", color: "#6B6259" }}
                  >
                    {p === "weekdays" ? "Weekdays" : p === "all" ? "All" : "Clear"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-1.5">
              {UI_DAYS.map((d) => {
                const isWeekend = d === "Sat" || d === "Sun";
                const active    = form.days[d];
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className="flex-1 flex items-center justify-center rounded-[10px] text-[13px] font-semibold transition-all border-[1.5px]"
                    style={{
                      height: 42,
                      background: active
                        ? "#E8693A"
                        : isWeekend ? "#F6F2EC" : "#fff",
                      color:      active ? "#fff" : isWeekend ? "#9b9085" : "#2A2420",
                      borderColor: active ? "#E8693A" : "#ECE6DD",
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {errors.days && (
              <p className="text-[11.5px] text-destructive mt-1.5">{errors.days}</p>
            )}

            {/* ── Section: Overtime ── */}
            <SectionDivider icon={<Zap className="size-3.5" />} label="Overtime" />

            <button
              type="button"
              onClick={() => set("autoOT", !form.autoOT)}
              className={cn(
                "w-full flex items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-3 text-left transition-all",
                form.autoOT
                  ? "border-[#E8693A] bg-[#fdeee6]"
                  : "border-[#ECE6DD] bg-white hover:border-[#d0c9c0]"
              )}
            >
              <div
                className="flex-none flex items-center justify-center rounded-[8px] size-9"
                style={{
                  background: form.autoOT ? "#E8693A" : "#F6F2EC",
                  color:      form.autoOT ? "#fff"    : "#6B6259",
                }}
              >
                <Zap className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-semibold"
                  style={{ color: form.autoOT ? "#C2552F" : "#2A2420" }}
                >
                  Auto-detect overtime
                </div>
                <div className="text-[11.5px]" style={{ color: "#9b9085" }}>
                  {form.autoOT
                    ? "OT flagged when worked hours exceed 8h — requires approval to pay."
                    : "Overtime requires a manual OT application."}
                </div>
              </div>
              {/* Pill toggle */}
              <div
                className="flex-none relative transition-colors rounded-full"
                style={{
                  width: 44, height: 25,
                  background: form.autoOT ? "#E8693A" : "#d0c9c0",
                }}
              >
                <div
                  className="absolute top-[3px] rounded-full bg-white transition-all"
                  style={{
                    width: 19, height: 19,
                    left: form.autoOT ? "calc(100% - 22px)" : "3px",
                  }}
                />
              </div>
            </button>

            {/* Form-level error */}
            {errors._form && (
              <p className="text-[12px] text-destructive mt-3">{errors._form}</p>
            )}

          </div>{/* end scroll region */}

          {/* ── FOOTER ── */}
          <div
            className={cn(
              "flex-none flex items-center justify-between px-6 py-4 border-t border-transparent transition-colors duration-150",
              !atBottom && "border-t-[#ECE6DD] shadow-[0_-6px_14px_-12px_rgba(33,26,21,0.4)]"
            )}
            style={{ background: "#fcfaf7" }}
          >
            {/* Left: live summary */}
            <div
              className="flex items-center gap-[10px]"
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              <span className="text-[16px] font-bold" style={{ color: "#2A2420" }}>
                {summary.paidHours}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: "#9b9085" }}>h paid</span>
              <div className="w-px h-[22px]" style={{ background: "#ECE6DD" }} />
              <div className="flex flex-col">
                <b className="text-[12px] font-semibold" style={{ color: "#2A2420" }}>
                  {summary.rangeText}
                </b>
                <span className="text-[11px]" style={{ color: "#9b9085" }}>
                  {summary.dayText}
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2.5">
              {mode === "edit" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="border-[#ECE6DD]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="gap-1.5 bg-[#E8693A] hover:bg-[#C2552F] text-white border-transparent"
              >
                {saving
                  ? "Saving…"
                  : mode === "edit" ? "Save changes" : "Create shift"}
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{initialData?.name}</b> will be deactivated. Existing DTR records are preserved.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
