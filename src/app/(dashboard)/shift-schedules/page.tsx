"use client";

/**
 * /shift-schedules — Shift Schedule CRUD
 * Moved from /settings tab.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
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
  type: string;
  timeIn: string;
  timeOut: string;
  breakMinutes: number;
  breakPolicy: "FIXED_DEDUCTION" | "TRACK_ACTUAL";
  crossesMidnight: boolean;
  workDays: string[];
  isActive: boolean;
};

const EMPTY_FORM = {
  name: "",
  type: "FIXED",
  timeIn: "08:00",
  timeOut: "17:00",
  breakMinutes: 60,
  breakPolicy: "FIXED_DEDUCTION" as "FIXED_DEDUCTION" | "TRACK_ACTUAL",
  crossesMidnight: false,
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
};

export default function ShiftSchedulesPage() {
  const [rows, setRows] = useState<ShiftSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftSchedule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
      name: row.name,
      type: row.type,
      timeIn: row.timeIn,
      timeOut: row.timeOut,
      breakMinutes: row.breakMinutes,
      breakPolicy: row.breakPolicy ?? "FIXED_DEDUCTION",
      crossesMidnight: row.crossesMidnight,
      workDays: Array.isArray(row.workDays) ? row.workDays : [],
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
    setSaving(true);
    const body = { ...form, breakMinutes: Number(form.breakMinutes) };
    const url = editing ? `/api/shifts/${editing.id}` : "/api/shifts";
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

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Shift Schedules
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Named shift templates used for DTR processing and OT calculation.
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
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[#6B7A8D] py-10">
                  No shift schedules yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">
                    {row.name}
                    {row.crossesMidnight && (
                      <Badge variant="secondary" className="ml-2 text-xs">Night</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-[#4A586B]">
                    {row.timeIn} – {row.timeOut}
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
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Shift Schedule" : "Add Shift Schedule"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Day Shift"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? form.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed</SelectItem>
                    <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Break (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.breakMinutes}
                  onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Break Policy</Label>
              <Select
                value={form.breakPolicy}
                onValueChange={(v) => setForm({ ...form, breakPolicy: v as "FIXED_DEDUCTION" | "TRACK_ACTUAL" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED_DEDUCTION">Fixed Deduction — auto-deduct {form.breakMinutes}min, no lunch punch-out needed</SelectItem>
                  <SelectItem value="TRACK_ACTUAL">Track Actual — employee must clock out &amp; in for lunch</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11.5px] text-[#6B7A8D] mt-1">
                {form.breakPolicy === "TRACK_ACTUAL"
                  ? "Worked hours = sum of all clock-in/out pairs. Break time is whatever the employee spends clocked out."
                  : `Worked hours = (last clock-out − first clock-in) − ${form.breakMinutes} min. Employee does not need to punch out for lunch.`
                }
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Time In</Label>
                <Input
                  type="time"
                  value={form.timeIn}
                  onChange={(e) => setForm({ ...form, timeIn: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Time Out</Label>
                <Input
                  type="time"
                  value={form.timeOut}
                  onChange={(e) => setForm({ ...form, timeOut: e.target.value })}
                />
              </div>
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
