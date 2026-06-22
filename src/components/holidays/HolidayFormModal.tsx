"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Pencil,
  X,
  Layers,
  Building2,
  Globe,
  MapPin,
  FileText,
  Repeat,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared domain types & constants (consumed by the calendar page too)
// ---------------------------------------------------------------------------

export type HolidayCategory =
  | "LEGAL"
  | "SPECIAL_NON_WORKING"
  | "SPECIAL_ONE_TIME"
  | "AREA_SPECIFIC";
export type HolidayScope = "COMPANY_WIDE" | "BRANCH_SPECIFIC";

export interface Holiday {
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

export interface Branch {
  id: string;
  name: string;
  city: string | null;
  isHeadOffice: boolean;
}

export const CATEGORY_META: Record<
  HolidayCategory,
  { label: string; chip: string; badge: string; multiplier: string; blurb: string }
> = {
  LEGAL: {
    label: "Legal Holiday",
    chip: "bg-red-100 text-red-700 border border-red-200",
    badge: "bg-red-50 text-red-700 border-red-200",
    multiplier: "200%",
    blurb: "Regular holiday pay",
  },
  SPECIAL_NON_WORKING: {
    label: "Special Non-Working",
    chip: "bg-amber-100 text-amber-700 border border-amber-200",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    multiplier: "130%",
    blurb: "No work, no pay rule",
  },
  SPECIAL_ONE_TIME: {
    label: "Special One-Time",
    chip: "bg-purple-100 text-purple-700 border border-purple-200",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    multiplier: "130%",
    blurb: "One-off proclamation",
  },
  AREA_SPECIFIC: {
    label: "Area-Specific",
    chip: "bg-teal-100 text-teal-700 border border-teal-200",
    badge: "bg-teal-50 text-teal-700 border-teal-200",
    multiplier: "130%",
    blurb: "Local / regional only",
  },
};

export const PH_REGIONS = [
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

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

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

function hydrate(h: Holiday): FormState {
  return {
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
  };
}

// ---------------------------------------------------------------------------
// Live summary
// ---------------------------------------------------------------------------

function formatDate(d: string): string {
  if (!d) return "No date set";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return "No date set";
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function computeSummary(f: FormState) {
  const meta = CATEGORY_META[f.category];

  let scopeText: string;
  if (f.category === "AREA_SPECIFIC" && f.region) {
    scopeText = f.region.split("—")[0].trim();
  } else if (f.scope === "BRANCH_SPECIFIC") {
    const n = f.branchIds.length;
    scopeText = n === 0 ? "No branch" : `${n} branch${n === 1 ? "" : "es"}`;
  } else {
    scopeText = "Company-wide";
  }
  if (f.recurringAnnually) scopeText += " · annual";

  return {
    multiplier: meta.multiplier,
    categoryLabel: meta.label,
    chip: meta.chip,
    dateText: formatDate(f.date),
    scopeText,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "Name is required";
  if (!f.date) e.date = "Date is required";
  if (f.category === "AREA_SPECIFIC" && !f.region.trim())
    e.region = "Region is required for an area-specific holiday";
  if (f.scope === "BRANCH_SPECIFIC" && f.branchIds.length === 0)
    e.branches = "Select at least one branch";
  return e;
}

// ---------------------------------------------------------------------------
// Section divider (mirrors the Shift Schedule modal)
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
// Props
// ---------------------------------------------------------------------------

export interface HolidayFormModalProps {
  mode: "add" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialData?: Holiday;
  defaultDate?: string;
  branches: Branch[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HolidayFormModal({
  mode,
  open,
  onOpenChange,
  onSaved,
  initialData,
  defaultDate = "",
  branches,
}: HolidayFormModalProps) {
  const [form, setForm] = useState<FormState>(defaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Scroll-edge tracking (sticky header / footer shadows)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const measureEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 1);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(mode === "edit" && initialData ? hydrate(initialData) : defaultForm(defaultDate));
    setErrors({});
    setSaving(false);
  }, [open, mode, initialData, defaultDate]);

  useEffect(() => {
    measureEdge();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureEdge);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEdge, form]);

  const summary = computeSummary(form);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function setScope(scope: HolidayScope) {
    if (form.scope === scope) return;
    setForm((f) => ({
      ...f,
      scope,
      // Match the legacy behaviour: branch list only applies to branch-specific.
      branchIds: scope === "COMPANY_WIDE" ? [] : f.branchIds,
    }));
    if (errors.branches) setErrors((e) => { const n = { ...e }; delete n.branches; return n; });
  }

  function toggleBranch(id: string) {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id)
        ? f.branchIds.filter((b) => b !== id)
        : [...f.branchIds, id],
    }));
    if (errors.branches) setErrors((e) => { const n = { ...e }; delete n.branches; return n; });
  }

  async function handleSave() {
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
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
      const url = mode === "edit" && initialData ? `/api/holidays/${initialData.id}` : "/api/holidays";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const message = j?.error || "Save failed";
        setErrors((e) => ({ ...e, _form: message }));
        toast.error(message);
        return;
      }
      toast.success(mode === "edit" ? "Holiday updated" : "Holiday created");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save holiday";
      setErrors((er) => ({ ...er, _form: message }));
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const isArea = form.category === "AREA_SPECIFIC";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 overflow-hidden rounded-[18px] w-[600px] max-w-[calc(100%-2rem)] max-h-[min(760px,calc(100vh-56px))] sm:max-w-[600px]"
      >
        <style>{`
          [data-holiday-modal] {
            scrollbar-gutter: stable;
            scrollbar-width: thin;
            scrollbar-color: #d9cfc2 transparent;
          }
          [data-holiday-modal]::-webkit-scrollbar { width: 12px; }
          [data-holiday-modal]::-webkit-scrollbar-track { background: transparent; }
          [data-holiday-modal]::-webkit-scrollbar-thumb {
            background: #d9cfc2;
            border-radius: 99px;
            border: 4px solid transparent;
            background-clip: padding-box;
          }
          [data-holiday-modal]::-webkit-scrollbar-thumb:hover { background: #c3b29c; }
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
                : <CalendarDays className="size-[17px]" />}
            </div>
            <div>
              <DialogTitle
                className="text-[17px] font-semibold leading-tight text-[#2A2420]"
                style={{ fontFamily: "Instrument Sans, sans-serif" }}
              >
                {mode === "edit" ? "Edit Holiday" : "Add Holiday"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[12px] text-[#6B6259]">
                {mode === "edit"
                  ? "Update this holiday's details below."
                  : "Holidays drive payroll multipliers automatically."}
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
          data-holiday-modal
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
                <CalendarDays className="size-4" style={{ color: "#3e63a0" }} />
              </div>
              <span className="text-[12.5px] text-[#6B6259]">
                Changes apply to all <b className="text-[#2A2420]">future payroll runs</b>.
              </span>
            </div>
          )}

          {/* ── Section: Details ── */}
          <SectionDivider icon={<CalendarDays className="size-3.5" />} label="Details" />

          <div className="flex flex-col gap-1.5">
            <Label className="text-[12.5px] font-medium text-[#2A2420]">
              Holiday name <span style={{ color: "#E8693A" }}>*</span>
            </Label>
            <Input
              placeholder="e.g. Independence Day"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && <p className="text-[11.5px] text-destructive">{errors.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <Label className="text-[12.5px] font-medium text-[#2A2420]">
              Date <span style={{ color: "#E8693A" }}>*</span>
            </Label>
            <div className="relative">
              <CalendarDays
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: 15, height: 15, color: "#9b9085" }}
              />
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className={cn("pl-8", errors.date && "border-destructive")}
              />
            </div>
            {errors.date && <p className="text-[11.5px] text-destructive">{errors.date}</p>}
          </div>

          <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.recurringAnnually}
              onChange={(e) => set("recurringAnnually", e.target.checked)}
              className="rounded border-[#ECE6DD] accent-[#E8693A]"
            />
            <Repeat className="size-3.5" style={{ color: "#6B6259" }} />
            <span className="text-[12.5px]" style={{ color: "#2A2420" }}>
              Recurring annually (same date each year)
            </span>
          </label>

          <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isTentative}
              onChange={(e) => set("isTentative", e.target.checked)}
              className="rounded border-[#ECE6DD] accent-[#E8693A]"
            />
            <Info className="size-3.5" style={{ color: "#6B6259" }} />
            <span className="text-[12.5px]" style={{ color: "#2A2420" }}>
              Tentative date (subject to proclamation)
            </span>
          </label>

          {/* ── Section: Category ── */}
          <SectionDivider icon={<Layers className="size-3.5" />} label="Category" />

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {(Object.keys(CATEGORY_META) as HolidayCategory[]).map((key) => {
              const meta = CATEGORY_META[key];
              const selected = form.category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("category", key)}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-[12px] p-3 text-left border-[1.5px] transition-all",
                    selected
                      ? "border-[#E8693A] bg-[#fdeee6] shadow-[0_0_0_3px_rgba(232,105,58,.1)]"
                      : "border-[#ECE6DD] bg-white hover:border-[#d0c9c0]"
                  )}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[13px] font-semibold leading-tight"
                      style={{ color: selected ? "#C2552F" : "#2A2420" }}
                    >
                      {meta.label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "#9b9085" }}>
                      {meta.blurb}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                      meta.badge
                    )}
                  >
                    {meta.multiplier}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Section: Coverage ── */}
          <SectionDivider icon={<Globe className="size-3.5" />} label="Coverage" />

          {isArea && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">
                  Region <span style={{ color: "#E8693A" }}>*</span>
                </Label>
                <div className="relative">
                  <MapPin
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                    style={{ width: 15, height: 15, color: "#9b9085" }}
                  />
                  <select
                    value={form.region}
                    onChange={(e) => set("region", e.target.value)}
                    className={cn(
                      "h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-[13px] text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50",
                      errors.region ? "border-destructive" : "border-input"
                    )}
                  >
                    <option value="">Select region…</option>
                    {PH_REGIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                {errors.region && (
                  <p className="text-[11.5px] text-destructive">{errors.region}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#2A2420]">
                  Province / City <span style={{ color: "#9b9085" }} className="font-normal">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. Makati City"
                  value={form.provinceCity}
                  onChange={(e) => set("provinceCity", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {([
              { value: "COMPANY_WIDE", label: "Company-wide", desc: "Applies to all branches", icon: <Globe className="size-4" /> },
              { value: "BRANCH_SPECIFIC", label: "Branch-specific", desc: "Choose specific branches", icon: <Building2 className="size-4" /> },
            ] as const).map((opt) => {
              const selected = form.scope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
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
                      color: selected ? "#fff" : "#6B6259",
                    }}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <div
                      className="text-[13px] font-semibold leading-tight"
                      style={{ color: selected ? "#C2552F" : "#2A2420" }}
                    >
                      {opt.label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "#9b9085" }}>
                      {opt.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {form.scope === "BRANCH_SPECIFIC" && (
            <div className="flex flex-col gap-1.5 mt-3">
              <Label className="text-[12.5px] font-medium text-[#2A2420]">
                Select branches <span style={{ color: "#E8693A" }}>*</span>
              </Label>
              {branches.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#9b9085" }}>No branches found.</p>
              ) : (
                <div
                  className="rounded-[10px] border divide-y max-h-40 overflow-y-auto"
                  style={{ borderColor: "#ECE6DD" }}
                >
                  {branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#fdeee6]/40"
                      style={{ borderColor: "#F0EBE3" }}
                    >
                      <input
                        type="checkbox"
                        checked={form.branchIds.includes(b.id)}
                        onChange={() => toggleBranch(b.id)}
                        className="rounded border-[#ECE6DD] accent-[#E8693A]"
                      />
                      <span className="text-[12.5px]" style={{ color: "#2A2420" }}>
                        {b.name}
                        {b.isHeadOffice && (
                          <span className="ml-1.5 text-[10px]" style={{ color: "#9b9085" }}>(Head Office)</span>
                        )}
                        {b.city && (
                          <span className="ml-1 text-[11px]" style={{ color: "#9b9085" }}>· {b.city}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {errors.branches && (
                <p className="text-[11.5px] text-destructive">{errors.branches}</p>
              )}
            </div>
          )}

          {/* ── Section: Reference ── */}
          <SectionDivider icon={<FileText className="size-3.5" />} label="Reference" />

          <div className="flex flex-col gap-1.5">
            <Label className="text-[12.5px] font-medium text-[#2A2420]">
              Proclamation reference <span style={{ color: "#9b9085" }} className="font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Proclamation No. 368, s. 2023"
              value={form.proclamationReference}
              onChange={(e) => set("proclamationReference", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <Label className="text-[12.5px] font-medium text-[#2A2420]">
              Notes <span style={{ color: "#9b9085" }} className="font-normal">(optional)</span>
            </Label>
            <Textarea
              rows={2}
              placeholder="Additional notes…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

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
              {summary.multiplier}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "#9b9085" }}>pay</span>
            <div className="w-px h-[22px]" style={{ background: "#ECE6DD" }} />
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", summary.chip)} />
                <b className="text-[12px] font-semibold" style={{ color: "#2A2420" }}>
                  {summary.categoryLabel}
                </b>
              </span>
              <span className="text-[11px]" style={{ color: "#9b9085" }}>
                {summary.dateText} · {summary.scopeText}
              </span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2.5">
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
              {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save Holiday"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
