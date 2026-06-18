"use client";

/**
 * /shift-schedules — Shift Schedule CRUD
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Clock } from "lucide-react";
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

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu",
  FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

type ShiftSchedule = {
  id: string;
  name: string;
  code: string | null;
  type: "FIXED" | "FLEXIBLE";
  timeIn: string | null;
  timeOut: string | null;
  requiredHours: number | null;
  gracePeriodMinutes: number;
  breakMinutes: number;
  breakPolicy: "FIXED_DEDUCTION" | "TRACK_ACTUAL";
  crossesMidnight: boolean;
  workDays: string[];
  otThresholdMinutes: number | null;
  isActive: boolean;
};

type FormState = {
  name: string;
  code: string;
  type: "FIXED" | "FLEXIBLE";
  timeIn: string;
  timeOut: string;
  requiredHours: number;
  gracePeriodMinutes: number;
  breakMinutes: number;
  breakPolicy: "FIXED_DEDUCTION" | "TRACK_ACTUAL";
  crossesMidnight: boolean;
  workDays: string[];
  autoOt: boolean;
  otThresholdMinutes: number;
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  type: "FIXED",
  timeIn: "08:00",
  timeOut: "17:00",
  requiredHours: 8,
  gracePeriodMinutes: 0,
  breakMinutes: 60,
  breakPolicy: "FIXED_DEDUCTION",
  crossesMidnight: false,
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
  autoOt: false,
  otThresholdMinutes: 480,
};

export default function ShiftSchedulesPage() {
  const [rows, setRows] = useState<ShiftSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftSchedule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/shifts?limit=200");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: ShiftSchedule) {
    setEditing(row);
    setForm({
      name:               row.name,
      code:               row.code ?? "",
      type:               row.type,
      timeIn:             row.timeIn  ?? "08:00",
      timeOut:            row.timeOut ?? "17:00",
      requiredHours:      row.requiredHours ?? 8,
      gracePeriodMinutes: row.gracePeriodMinutes ?? 0,
      breakMinutes:       row.breakMinutes,
      breakPolicy:        row.breakPolicy ?? "FIXED_DEDUCTION",
      crossesMidnight:    row.crossesMidnight,
      workDays:           Array.isArray(row.workDays) ? row.workDays : [],
      autoOt:             row.otThresholdMinutes !== null,
      otThresholdMinutes: row.otThresholdMinutes ?? 480,
    });
    setSheetOpen(true);
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workDays: f.workDays.includes(day)
        ? f.workDays.filter((d) => d !== day)
        : [...f.workDays, day],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.workDays.length === 0) { toast.error("Select at least one work day"); return; }
    if (form.type === "FIXED" && (!form.timeIn || !form.timeOut)) {
      toast.error("Time In and Time Out are required for Fixed shifts");
      return;
    }
    setSaving(true);

    const body = {
      name:               form.name.trim(),
      code:               form.code.trim() || null,
      type:               form.type,
      timeIn:             form.type === "FIXED" ? form.timeIn  : null,
      timeOut:            form.type === "FIXED" ? form.timeOut : null,
      requiredHours:      form.type === "FLEXIBLE" ? Number(form.requiredHours) : null,
      gracePeriodMinutes: form.type === "FIXED" ? Number(form.gracePeriodMinutes) : 0,
      breakMinutes:       Number(form.breakMinutes),
      breakPolicy:        form.breakPolicy,
      crossesMidnight:    form.type === "FIXED" ? form.crossesMidnight : false,
      workDays:           form.workDays,
      otThresholdMinutes: form.autoOt ? Number(form.otThresholdMinutes) : null,
    };

    const url    = editing ? `/api/shifts/${editing.id}` : "/api/shifts";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Shift updated" : "Shift created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: ShiftSchedule) {
    if (!confirm(`Delete shift "${row.name}"?`)) return;
    const res = await fetch(`/api/shifts/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`"${row.name}" deleted`);
    load();
  }

  const isFlexible = form.type === "FLEXIBLE";

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Shift Schedules
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Named shift templates that define work hours, break rules, and DTR enforcement.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Shift
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Hours</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Work Days</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Break</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">OT</TableHead>
              <TableHead className="w-[80px]" />
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
                <TableCell colSpan={7} className="text-center text-[#6B7A8D] py-10">
                  No shift schedules yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">
                    <div className="flex flex-col gap-0.5">
                      <span>{row.name}</span>
                      {row.code && (
                        <span className="text-[11px] text-[#6B7A8D] font-mono">{row.code}</span>
                      )}
                    </div>
                    {row.crossesMidnight && (
                      <Badge variant="secondary" className="ml-2 text-xs">Night</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.type === "FLEXIBLE" ? "Flexible" : "Fixed"}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-[#4A586B]">
                    {row.type === "FLEXIBLE"
                      ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{row.requiredHours ?? 8}h req'd</span>
                      : <>{row.timeIn} – {row.timeOut}</>
                    }
                    {row.gracePeriodMinutes > 0 && (
                      <div className="text-[11px] text-emerald-600 mt-0.5">{row.gracePeriodMinutes}min grace</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 flex-wrap">
                      {ALL_DAYS.map((d) => (
                        <span
                          key={d}
                          className="text-xs px-1 rounded"
                          style={
                            (Array.isArray(row.workDays) ? row.workDays : []).includes(d)
                              ? { background: "#fdeee6", color: "#E8693A", fontWeight: 600 }
                              : { color: "#C5CDD7" }
                          }
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {row.breakMinutes}m
                    {row.breakPolicy === "TRACK_ACTUAL" && (
                      <span className="ml-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-medium">Tracked</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {row.otThresholdMinutes !== null
                      ? <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-medium">Auto &gt;{Math.round(row.otThresholdMinutes / 60)}h</span>
                      : <span className="text-[#C5CDD7]">Manual</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(row)}
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

      {/* ── Side sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Shift Schedule" : "Add Shift Schedule"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">

            {/* Name + Code */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Day Shift"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  placeholder="DAY-8"
                  maxLength={20}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Shift Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as "FIXED" | "FLEXIBLE" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed — specific time-in and time-out</SelectItem>
                  <SelectItem value="FLEXIBLE">Flexible — employee must complete required hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* FIXED: Time In / Time Out / Grace Period / Crosses Midnight */}
            {!isFlexible && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Time In <span className="text-destructive">*</span></Label>
                    <Input
                      type="time"
                      value={form.timeIn}
                      onChange={(e) => setForm({ ...form, timeIn: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time Out <span className="text-destructive">*</span></Label>
                    <Input
                      type="time"
                      value={form.timeOut}
                      onChange={(e) => setForm({ ...form, timeOut: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Grace Period (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={form.gracePeriodMinutes}
                    onChange={(e) => setForm({ ...form, gracePeriodMinutes: Number(e.target.value) })}
                  />
                  <p className="text-[11.5px] text-[#6B7A8D]">
                    Minutes after expected time-in before tardiness is recorded. 0 = strict.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="crossesMidnight"
                    checked={form.crossesMidnight}
                    onCheckedChange={(v) => setForm({ ...form, crossesMidnight: !!v })}
                  />
                  <Label htmlFor="crossesMidnight" className="font-normal cursor-pointer">
                    Crosses midnight (e.g. 22:00–06:00 night shift)
                  </Label>
                </div>
              </>
            )}

            {/* FLEXIBLE: Required Hours */}
            {isFlexible && (
              <div className="space-y-1.5">
                <Label>Required Hours per Day <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={form.requiredHours}
                  onChange={(e) => setForm({ ...form, requiredHours: Number(e.target.value) })}
                />
                <p className="text-[11.5px] text-[#6B7A8D]">
                  Employee can start at any time but must complete this many hours. Undertime = hours short of target.
                </p>
              </div>
            )}

            {/* Break */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Break (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  max={480}
                  value={form.breakMinutes}
                  onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Break Policy</Label>
                <Select
                  value={form.breakPolicy}
                  onValueChange={(v) => setForm({ ...form, breakPolicy: v as "FIXED_DEDUCTION" | "TRACK_ACTUAL" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_DEDUCTION">Auto-deduct (Fixed)</SelectItem>
                    <SelectItem value="TRACK_ACTUAL">Track actual clock-out/in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11.5px] text-[#6B7A8D] -mt-2">
              {form.breakPolicy === "TRACK_ACTUAL"
                ? "Worked hours = sum of all clock-in/out pairs. Employee must punch out and back in for lunch."
                : `Worked hours = (last clock-out − first clock-in) − ${form.breakMinutes} min. No lunch punch needed.`
              }
            </p>

            {/* Work Days */}
            <div className="space-y-2">
              <Label>Work Days <span className="text-destructive">*</span></Label>
              <div className="flex gap-2 flex-wrap">
                {ALL_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
                    style={form.workDays.includes(d)
                      ? { background: "#E8693A", color: "#fff", borderColor: "#E8693A" }
                      : { background: "#fff", color: "#6B7A8D", borderColor: "#E8EBF1" }}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* OT Auto-detection */}
            <div className="space-y-2 border rounded-lg p-3 bg-[#FAFBFF]">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="autoOt"
                  checked={form.autoOt}
                  onCheckedChange={(v) => setForm({ ...form, autoOt: !!v })}
                />
                <Label htmlFor="autoOt" className="font-medium cursor-pointer">
                  Auto-detect overtime
                </Label>
              </div>
              {form.autoOt && (
                <div className="space-y-1.5 mt-2">
                  <Label className="text-[12px]">OT after (minutes worked)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    step={30}
                    value={form.otThresholdMinutes}
                    onChange={(e) => setForm({ ...form, otThresholdMinutes: Number(e.target.value) })}
                  />
                  <p className="text-[11.5px] text-[#6B7A8D]">
                    When worked minutes exceed this threshold, OT is automatically flagged on the DTR.
                    Flagged OT still requires approval to be paid.
                  </p>
                </div>
              )}
              {!form.autoOt && (
                <p className="text-[11.5px] text-[#6B7A8D]">
                  Overtime requires a manual OT application. No auto-flagging.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Shift"}
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
