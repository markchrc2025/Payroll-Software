"use client";

/**
 * /settings/holidays — Visual Holiday Calendar
 *
 * Full-month calendar grid with add/edit/delete holiday management.
 * Holidays are stored in the Holiday table and fetched from /api/holidays.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Info,
  Rows3,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HolidayCategory = "LEGAL" | "SPECIAL_NON_WORKING" | "SPECIAL_ONE_TIME" | "AREA_SPECIFIC";
type HolidayScope = "COMPANY_WIDE" | "BRANCH_SPECIFIC";

interface Holiday {
  id: string;
  name: string;
  category: HolidayCategory;
  date: string; // ISO string
  recurringAnnually: boolean;
  scope: HolidayScope;
  branchIds: string[];
  region: string | null;
  provinceCity: string | null;
  proclamationReference: string | null;
  notes: string | null;
  isTentative: boolean;
}

interface BulkRow {
  date: string;
  name: string;
  category: HolidayCategory;
}

const defaultBulkRow = (): BulkRow => ({ date: "", name: "", category: "LEGAL" });

interface Branch {
  id: string;
  name: string;
  city: string | null;
  isHeadOffice: boolean;
}

interface FormState {
  name: string;
  category: HolidayCategory;
  date: string; // YYYY-MM-DD
  recurringAnnually: boolean;
  scope: HolidayScope;
  branchIds: string[];
  region: string;
  provinceCity: string;
  proclamationReference: string;
  notes: string;
  isTentative: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  HolidayCategory,
  { label: string; chip: string; badge: string; multiplier: string }
> = {
  LEGAL: {
    label: "Legal Holiday",
    chip: "bg-red-100 text-red-700 border border-red-200",
    badge: "bg-red-50 text-red-700 border-red-200",
    multiplier: "200%",
  },
  SPECIAL_NON_WORKING: {
    label: "Special Non-Working",
    chip: "bg-amber-100 text-amber-700 border border-amber-200",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    multiplier: "130%",
  },
  SPECIAL_ONE_TIME: {
    label: "Special One-Time",
    chip: "bg-purple-100 text-purple-700 border border-purple-200",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    multiplier: "130%",
  },
  AREA_SPECIFIC: {
    label: "Area-Specific",
    chip: "bg-teal-100 text-teal-700 border border-teal-200",
    badge: "bg-teal-50 text-teal-700 border-teal-200",
    multiplier: "130%",
  },
};

const PH_REGIONS = [
  "NCR — National Capital Region",
  "CAR — Cordillera Administrative Region",
  "Region I — Ilocos Region",
  "Region II — Cagayan Valley",
  "Region III — Central Luzon",
  "Region IV-A — CALABARZON",
  "Region IV-B — MIMAROPA",
  "Region V — Bicol Region",
  "Region VI — Western Visayas",
  "Region VII — Central Visayas",
  "Region VIII — Eastern Visayas",
  "Region IX — Zamboanga Peninsula",
  "Region X — Northern Mindanao",
  "Region XI — Davao Region",
  "Region XII — SOCCSKSARGEN",
  "Region XIII — Caraga",
  "BARMM — Bangsamoro Autonomous Region in Muslim Mindanao",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

const defaultForm = (date = ""): FormState => ({
  name: "",
  category: "LEGAL",
  date,
  recurringAnnually: false,
  scope: "COMPANY_WIDE",
  branchIds: [],
  region: "",
  provinceCity: "",
  proclamationReference: "",
  notes: "",
  isTentative: false,
});

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function HolidayCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleteMode, setDeleteMode] = useState<"single" | "permanent">("permanent");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([defaultBulkRow(), defaultBulkRow(), defaultBulkRow()]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/holidays?year=${year}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setHolidays(json.data ?? []);
    } catch {
      toast.error("Could not load holidays");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((j) => setBranches(j.data ?? []))
      .catch(() => {});
  }, []);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const monthHolidays = holidays.filter((h) => {
    const d = new Date(h.date);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });

  const byDate = new Map<string, Holiday[]>();
  for (const h of monthHolidays) {
    const key = new Date(h.date).toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(h);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openAdd(dateStr = "") {
    setEditingId(null);
    setForm(defaultForm(dateStr));
    setModalOpen(true);
  }

  function openEdit(h: Holiday) {
    setEditingId(h.id);
    setForm({
      name: h.name,
      category: h.category,
      date: new Date(h.date).toISOString().slice(0, 10),
      recurringAnnually: h.recurringAnnually,
      scope: h.scope,
      branchIds: h.branchIds,
      region: h.region ?? "",
      provinceCity: h.provinceCity ?? "",
      proclamationReference: h.proclamationReference ?? "",
      notes: h.notes ?? "",
      isTentative: h.isTentative,
    });
    setModalOpen(true);
  }

  const branchRequiredMissing = form.scope === "BRANCH_SPECIFIC" && form.branchIds.length === 0;
  const regionRequiredMissing = form.category === "AREA_SPECIFIC" && !form.region.trim();
  const formInvalid = !form.name.trim() || !form.date || branchRequiredMissing || regionRequiredMissing;

  async function handleSubmit() {
    if (!form.name.trim() || !form.date) { toast.error("Name and date are required"); return; }
    if (branchRequiredMissing) { toast.error("Select at least one branch for a branch-specific holiday"); return; }
    if (regionRequiredMissing) { toast.error("Region is required for an area-specific holiday"); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        date: form.date,
        recurringAnnually: form.recurringAnnually,
        scope: form.scope,
        branchIds: form.branchIds,
        region: form.category === "AREA_SPECIFIC" ? (form.region || null) : null,
        provinceCity: form.category === "AREA_SPECIFIC" ? (form.provinceCity || null) : null,
        proclamationReference: form.proclamationReference || null,
        notes: form.notes || null,
        isTentative: form.isTentative,
      };
      const url = editingId ? `/api/holidays/${editingId}` : "/api/holidays";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Save failed");
      }
      toast.success(editingId ? "Holiday updated" : "Holiday created");
      setModalOpen(false);
      fetchHolidays();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save holiday"); }
    finally { setSubmitting(false); }
  }

  function openDelete(h: Holiday) {
    setDeleteTarget(h);
    setDeleteMode("permanent");
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // For single-occurrence deletes, tell the API which year to cancel.
      const occurrenceDate = new Date(deleteTarget.date).toISOString().slice(0, 10);
      const qs =
        deleteMode === "single"
          ? `mode=single&date=${occurrenceDate}`
          : "mode=permanent";
      const res = await fetch(`/api/holidays/${deleteTarget.id}?${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Holiday deleted");
      setDeleteOpen(false);
      fetchHolidays();
    } catch { toast.error("Could not delete holiday"); }
    finally { setDeleting(false); }
  }

  async function handleBulkSubmit() {
    const valid = bulkRows.filter((r) => r.date && r.name.trim());
    if (valid.length === 0) { toast.error("Add at least one holiday with a date and name"); return; }
    setBulkSubmitting(true);
    try {
      const res = await fetch("/api/holidays/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: valid.map((row) => ({
            name: row.name.trim(),
            category: row.category,
            date: row.date,
            recurringAnnually: false,
            scope: "COMPANY_WIDE",
            branchIds: [],
            isTentative: false,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Bulk add failed");
      }
      const { data } = await res.json();
      const created = data?.created ?? 0;
      const skipped = data?.skipped?.length ?? 0;
      if (skipped > 0) {
        toast.success(`${created} added, ${skipped} skipped (already exist).`);
      } else {
        toast.success(`${created} holiday(s) added successfully.`);
      }
      setBulkOpen(false);
      setBulkRows([defaultBulkRow(), defaultBulkRow(), defaultBulkRow()]);
      fetchHolidays();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk add failed");
    } finally {
      setBulkSubmitting(false);
    }
  }

  function HolidayChip({ h }: { h: Holiday }) {
    const meta = CATEGORY_META[h.category];
    return (
      <button
        onClick={(e) => { e.stopPropagation(); openEdit(h); }}
        className={`w-full text-left text-[10px] leading-snug px-1.5 py-0.5 rounded-full truncate ${meta.chip}`}
        title={`${h.name} — ${meta.multiplier}${h.isTentative ? " (tentative)" : ""}`}
      >
        {h.isTentative ? "* " : ""}{h.name} · {meta.multiplier}
      </button>
    );
  }

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Holiday Calendar
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Manage public and company holidays. Holidays drive payroll multipliers automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchHolidays} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setBulkRows([defaultBulkRow(), defaultBulkRow(), defaultBulkRow()]); setBulkOpen(true); }} className="gap-1.5">
            <Rows3 className="h-3.5 w-3.5" />Bulk Add
          </Button>
          <Button size="sm" onClick={() => openAdd()} className="bg-[#1E3A5F] text-white hover:bg-[#16304f] gap-1.5">
            <Plus className="h-4 w-4" />Add Holiday
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full inline-block ${meta.chip}`} />
            <span className="text-[#6B7A8D]">{meta.label} ({meta.multiplier})</span>
          </span>
        ))}
      </div>

      <div className="flex gap-5 items-start">

        {/* Calendar panel */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8EBF1] bg-[#F5F6FA]">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#E8EBF1] text-[#6B7A8D] transition-colors" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-semibold text-[#111827]">{MONTH_NAMES[month]} {year}</span>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-7 w-[90px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#E8EBF1] text-[#6B7A8D] transition-colors" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-[#E8EBF1]">
            {DAY_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-medium text-[#9AA5B4] uppercase">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-[13px] text-[#9AA5B4]">Loading…</div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((cell, idx) => {
                if (!cell.day || !cell.dateStr) {
                  return <div key={`empty-${idx}`} className="min-h-[84px] p-1.5 border-b border-r border-[#F0F2F7] bg-[#FAFAFA]" />;
                }
                const isToday = cell.dateStr === todayStr;
                const dayHolidays = byDate.get(cell.dateStr) ?? [];
                const visible = dayHolidays.slice(0, 2);
                const overflow = dayHolidays.length - 2;
                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => openAdd(cell.dateStr ?? "")}
                    className={`min-h-[84px] p-1.5 border-b border-r border-[#F0F2F7] cursor-pointer transition-colors hover:bg-[#fdeee6] flex flex-col gap-0.5 ${isToday ? "bg-[#fdeee6] border-[#f7c9ac]" : ""}`}
                  >
                    <span className={`text-[12px] font-semibold self-start w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-[#E8693A] text-white" : "text-[#374151]"}`}>
                      {cell.day}
                    </span>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {visible.map((h) => <HolidayChip key={h.id} h={h} />)}
                      {overflow > 0 && <span className="text-[10px] text-[#6B7A8D] pl-1">+{overflow} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[300px] flex-shrink-0 space-y-3">
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8EBF1] bg-[#F5F6FA]">
              <p className="text-[13px] font-semibold text-[#4A586B]">
                {MONTH_NAMES[month]} {year}
                <span className="ml-2 text-[11px] font-normal text-[#9AA5B4]">({monthHolidays.length})</span>
              </p>
            </div>
            {loading ? (
              <div className="p-4 text-[13px] text-[#9AA5B4]">Loading…</div>
            ) : monthHolidays.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-[#9AA5B4]">No holidays this month.</div>
            ) : (
              <div className="divide-y divide-[#F0F2F7] max-h-[480px] overflow-y-auto">
                {monthHolidays.map((h) => {
                  const meta = CATEGORY_META[h.category];
                  const d = new Date(h.date);
                  const dateLabel = `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
                  return (
                    <div key={h.id} className="px-4 py-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[12px] font-medium text-[#374151] truncate">{h.isTentative ? "* " : ""}{h.name}</span>
                          {h.isTentative && <Info className="h-3 w-3 text-[#9AA5B4] flex-shrink-0" aria-label="Exact date subject to proclamation" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-[#6B7A8D]">{dateLabel}</span>
                          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${meta.badge}`}>{meta.label}</Badge>
                          {h.category === "AREA_SPECIFIC" && h.region && (
                            <span className="text-[10px] text-[#9AA5B4]">{h.region.split("—")[0].trim()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(h)} className="p-1 rounded hover:bg-[#F0F2F7] text-[#6B7A8D] transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openDelete(h)} className="p-1 rounded hover:bg-red-50 text-[#9AA5B4] hover:text-red-500 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total", value: holidays.length, color: "text-[#E8693A]" },
              { label: "This Month", value: monthHolidays.length, color: "text-[#111827]" },
              { label: "Legal (200%)", value: holidays.filter(h => h.category === "LEGAL").length, color: "text-red-600" },
              { label: "Special (130%)", value: holidays.filter(h => h.category !== "LEGAL").length, color: "text-amber-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-[#E8EBF1] p-3 shadow-sm">
                <p className="text-[11px] text-[#6B7A8D]">{s.label}</p>
                <p className={`text-[22px] font-semibold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Holiday Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Independence Day" />
            </div>
            <div className="space-y-1.5">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as HolidayCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label} ({meta.multiplier})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="recurring" checked={form.recurringAnnually} onCheckedChange={(v) => setForm(f => ({ ...f, recurringAnnually: !!v }))} />
              <Label htmlFor="recurring" className="cursor-pointer">Recurring annually (same date each year)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="tentative" checked={form.isTentative} onCheckedChange={(v) => setForm(f => ({ ...f, isTentative: !!v }))} />
              <Label htmlFor="tentative" className="cursor-pointer text-[#6B7A8D]">Tentative date (subject to proclamation)</Label>
            </div>
            {form.category === "AREA_SPECIFIC" && (
              <>
                <div className="space-y-1.5">
                  <Label>Region <span className="text-red-500">*</span></Label>
                  <Select value={form.region} onValueChange={(v) => setForm(f => ({ ...f, region: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select region…" /></SelectTrigger>
                    <SelectContent>
                      {PH_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {regionRequiredMissing && (
                    <p className="text-[11px] text-red-500">Region is required for an area-specific holiday.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Province / City <span className="text-[#9AA5B4] font-normal">(optional)</span></Label>
                  <Input value={form.provinceCity} onChange={(e) => setForm(f => ({ ...f, provinceCity: e.target.value }))} placeholder="e.g. Makati City" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <div className="flex flex-col gap-1.5">
                {(["COMPANY_WIDE", "BRANCH_SPECIFIC"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.scope === s} onChange={() => setForm(f => ({ ...f, scope: s, branchIds: [] }))} className="accent-[#1E3A5F]" />
                    <span className="text-[13px]">{s === "COMPANY_WIDE" ? "Company-wide (applies to all branches)" : "Branch-specific"}</span>
                  </label>
                ))}
              </div>
              {form.scope === "BRANCH_SPECIFIC" && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-[12px] text-[#6B7A8D]">Select branches <span className="text-red-500">*</span></Label>
                  {branches.length === 0 ? (
                    <p className="text-[12px] text-[#9AA5B4]">No branches found.</p>
                  ) : (
                    <div className="border border-[#E8EBF1] rounded-lg divide-y divide-[#F0F2F7] max-h-40 overflow-y-auto">
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#F5F9FF]">
                          <Checkbox
                            checked={form.branchIds.includes(b.id)}
                            onCheckedChange={(checked) =>
                              setForm(f => ({
                                ...f,
                                branchIds: checked
                                  ? [...f.branchIds, b.id]
                                  : f.branchIds.filter(id => id !== b.id),
                              }))
                            }
                          />
                          <span className="text-[13px] text-[#374151]">
                            {b.name}
                            {b.isHeadOffice && <span className="ml-1.5 text-[10px] text-[#9AA5B4]">(Head Office)</span>}
                            {b.city && <span className="ml-1 text-[11px] text-[#9AA5B4]">· {b.city}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {branchRequiredMissing && (
                    <p className="text-[11px] text-red-500">Select at least one branch.</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Proclamation Reference <span className="text-[#9AA5B4] font-normal">(optional)</span></Label>
              <Input value={form.proclamationReference} onChange={(e) => setForm(f => ({ ...f, proclamationReference: e.target.value }))} placeholder="e.g. Proclamation No. 368, s. 2023" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-[#9AA5B4] font-normal">(optional)</span></Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || formInvalid} className="bg-[#1E3A5F] text-white hover:bg-[#16304f]">
              {submitting ? "Saving…" : "Save Holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Delete Holiday</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-[13px] text-[#374151]">
                Delete <span className="font-semibold">{deleteTarget.name}</span> on{" "}
                <span className="font-semibold">
                  {new Date(deleteTarget.date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
                </span>? This will remove it from payroll computation for all future runs.
              </p>
              {deleteTarget.recurringAnnually && (
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-[#6B7A8D]">This is a recurring holiday:</p>
                  <div className="flex flex-col gap-1.5">
                    {(["single", "permanent"] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={deleteMode === mode} onChange={() => setDeleteMode(mode)} className="accent-red-600" />
                        <span className="text-[13px]">{mode === "single" ? "Delete this year's occurrence only" : "Delete permanently (remove recurring record)"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Modal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Add Holidays</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[13px] text-[#6B7A8D]">
              Fill in multiple holidays at once. Leave blank rows empty — they will be skipped.
            </p>

            {/* Column headers */}
            <div className="grid grid-cols-[140px_1fr_160px_32px] gap-2 px-1">
              <span className="text-[11px] font-medium text-[#9AA5B4] uppercase tracking-wide">Date <span className="text-red-400">*</span></span>
              <span className="text-[11px] font-medium text-[#9AA5B4] uppercase tracking-wide">Holiday Name <span className="text-red-400">*</span></span>
              <span className="text-[11px] font-medium text-[#9AA5B4] uppercase tracking-wide">Category</span>
              <span />
            </div>

            {/* Rows */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {bulkRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[140px_1fr_160px_32px] gap-2 items-center">
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(e) => setBulkRows(rows => rows.map((r, i) => i === idx ? { ...r, date: e.target.value } : r))}
                    className="h-8 text-[12px]"
                  />
                  <Input
                    placeholder="e.g. Independence Day"
                    value={row.name}
                    onChange={(e) => setBulkRows(rows => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                    className="h-8 text-[12px]"
                  />
                  <Select
                    value={row.category}
                    onValueChange={(v) => setBulkRows(rows => rows.map((r, i) => i === idx ? { ...r, category: v as HolidayCategory } : r))}
                  >
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key} className="text-[12px]">{meta.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => setBulkRows(rows => rows.filter((_, i) => i !== idx))}
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-[#9AA5B4] hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="Remove row"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setBulkRows(rows => [...rows, defaultBulkRow()])}
              className="flex items-center gap-1.5 text-[12px] text-[#E8693A] hover:text-[#C2552F] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Cancel</Button>
            <Button onClick={handleBulkSubmit} disabled={bulkSubmitting} className="bg-[#1E3A5F] text-white hover:bg-[#16304f]">
              {bulkSubmitting ? "Saving…" : `Save ${bulkRows.filter(r => r.date && r.name.trim()).length || ""} Holiday(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

