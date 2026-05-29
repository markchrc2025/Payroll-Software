"use client";

/**
 * /settings — Settings Page
 *
 * Tabs:
 *  1. Pay Components  — catalog of earnings / deductions (API: /api/pay-components)
 *  2. Shift Schedules — named shift templates    (API: /api/shifts)
 *  3. Work Locations  — payroll region mapping   (API: /api/work-locations)
 *  4. Roles           — access-control roles     (API: /api/roles)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Boxes,
  Clock,
  MapPin,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
// Shared constants
// ---------------------------------------------------------------------------

const PHILIPPINE_REGIONS: { value: string; label: string }[] = [
  { value: "NCR", label: "NCR — National Capital Region" },
  { value: "CAR", label: "CAR — Cordillera Administrative Region" },
  { value: "REGION_I", label: "Region I — Ilocos Region" },
  { value: "REGION_II", label: "Region II — Cagayan Valley" },
  { value: "REGION_III", label: "Region III — Central Luzon" },
  { value: "REGION_IV_A", label: "Region IV-A — CALABARZON" },
  { value: "REGION_IV_B", label: "Region IV-B — MIMAROPA" },
  { value: "REGION_V", label: "Region V — Bicol Region" },
  { value: "REGION_VI", label: "Region VI — Western Visayas" },
  { value: "REGION_VII", label: "Region VII — Central Visayas" },
  { value: "REGION_VIII", label: "Region VIII — Eastern Visayas" },
  { value: "REGION_IX", label: "Region IX — Zamboanga Peninsula" },
  { value: "REGION_X", label: "Region X — Northern Mindanao" },
  { value: "REGION_XI", label: "Region XI — Davao Region" },
  { value: "REGION_XII", label: "Region XII — SOCCSKSARGEN" },
  { value: "REGION_XIII", label: "Region XIII — Caraga" },
  { value: "BARMM", label: "BARMM — Bangsamoro" },
];

// ---------------------------------------------------------------------------
// 1. Pay Components Tab
// ---------------------------------------------------------------------------

type PayComponent = {
  id: string;
  code: string;
  name: string;
  kind: string;
  taxability: string;
  deMinimisCode: string | null;
  includeIn13thMonth: boolean;
  includeInSssBase: boolean;
  includeInPhilHealthBase: boolean;
  includeInPagibigBase: boolean;
  isActive: boolean;
};

const PAY_COMPONENT_KINDS = [
  { value: "ALLOWANCE", label: "Allowance" },
  { value: "BONUS", label: "Bonus" },
  { value: "COMMISSION", label: "Commission" },
  { value: "OTHER_EARNING", label: "Other Earning" },
  { value: "REIMBURSEMENT", label: "Reimbursement" },
  { value: "DEDUCTION", label: "Deduction" },
];

const TAXABILITY_OPTIONS = [
  { value: "TAXABLE", label: "Taxable" },
  { value: "NON_TAXABLE", label: "Non-taxable" },
  { value: "DE_MINIMIS", label: "De Minimis" },
  { value: "STATUTORY_EXEMPT", label: "Statutory Exempt" },
];

const DE_MINIMIS_CODES = [
  { value: "RICE_SUBSIDY", label: "Rice Subsidy" },
  { value: "UNIFORM_CLOTHING", label: "Uniform / Clothing" },
  { value: "MEDICAL_HEALTH_EMPLOYEE", label: "Medical (Employee)" },
  { value: "MEDICAL_HEALTH_DEPENDENT", label: "Medical (Dependent)" },
  { value: "ACHIEVEMENT_AWARD", label: "Achievement Award" },
  { value: "GIFTS_CHRISTMAS", label: "Christmas / Anniversary Gift" },
  { value: "LAUNDRY", label: "Laundry Allowance" },
  { value: "OT_MEAL", label: "OT Meal Allowance" },
  { value: "PRODUCTIVITY_INCENTIVE", label: "Productivity Incentive" },
];

const EMPTY_PC_FORM = {
  code: "",
  name: "",
  kind: "ALLOWANCE",
  taxability: "TAXABLE",
  deMinimisCode: "",
  includeIn13thMonth: false,
  includeInSssBase: false,
  includeInPhilHealthBase: false,
  includeInPagibigBase: false,
  isActive: true,
};

function PayComponentsTab() {
  const [rows, setRows] = useState<PayComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PayComponent | null>(null);
  const [form, setForm] = useState(EMPTY_PC_FORM);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pay-components?limit=200&includeDeleted=false");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_PC_FORM);
    setSheetOpen(true);
    setTimeout(() => firstInputRef.current?.focus(), 100);
  }

  function openEdit(row: PayComponent) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      kind: row.kind,
      taxability: row.taxability,
      deMinimisCode: row.deMinimisCode ?? "",
      includeIn13thMonth: row.includeIn13thMonth,
      includeInSssBase: row.includeInSssBase,
      includeInPhilHealthBase: row.includeInPhilHealthBase,
      includeInPagibigBase: row.includeInPagibigBase,
      isActive: row.isActive,
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    const body = {
      ...form,
      code: form.code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      deMinimisCode: form.taxability === "DE_MINIMIS" ? form.deMinimisCode || null : null,
    };
    const url = editing ? `/api/pay-components/${editing.id}` : "/api/pay-components";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Pay component updated" : "Pay component created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: PayComponent) {
    if (!confirm(`Archive "${row.name}"? It will no longer appear in employee assignments.`)) return;
    const res = await fetch(`/api/pay-components/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to archive"); return; }
    toast.success(`"${row.name}" archived`);
    load();
  }

  const kindLabel = (k: string) => PAY_COMPONENT_KINDS.find(x => x.value === k)?.label ?? k;
  const taxLabel = (t: string) => TAXABILITY_OPTIONS.find(x => x.value === t)?.label ?? t;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define earnings and deductions that can be assigned to employees.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Component
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Tax Treatment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No pay components yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={!row.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{kindLabel(row.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.taxability === "TAXABLE" ? "destructive"
                          : row.taxability === "DE_MINIMIS" ? "secondary"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {taxLabel(row.taxability)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "secondary"}>
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Pay Component" : "Add Pay Component"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  ref={firstInputRef}
                  placeholder="RICE_SUBSIDY"
                  value={form.code}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
                <p className="text-xs text-muted-foreground">Uppercase, underscores allowed</p>
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Rice Subsidy"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v ?? form.kind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_COMPONENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tax Treatment</Label>
                <Select value={form.taxability} onValueChange={(v) => setForm({ ...form, taxability: v ?? form.taxability, deMinimisCode: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAXABILITY_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.taxability === "DE_MINIMIS" && (
              <div className="space-y-1.5">
                <Label>De Minimis Category <span className="text-destructive">*</span></Label>
                <Select value={form.deMinimisCode} onValueChange={(v) => setForm({ ...form, deMinimisCode: v ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    {DE_MINIMIS_CODES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Include in computation bases</p>
              {(
                [
                  { key: "includeIn13thMonth" as const, label: "13th-Month Pay basis" },
                  { key: "includeInSssBase" as const, label: "SSS monthly salary credit" },
                  { key: "includeInPhilHealthBase" as const, label: "PhilHealth premium base" },
                  { key: "includeInPagibigBase" as const, label: "Pag-IBIG monthly fund base" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={form[key]}
                    onCheckedChange={(v) => setForm({ ...form, [key]: !!v })}
                  />
                  <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="pc-isActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: !!v })}
              />
              <Label htmlFor="pc-isActive" className="font-normal cursor-pointer">Active (visible in employee assignments)</Label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Component"}
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
// 2. Shift Schedules Tab
// ---------------------------------------------------------------------------

type ShiftSchedule = {
  id: string;
  name: string;
  type: string;
  timeIn: string;
  timeOut: string;
  breakMinutes: number;
  crossesMidnight: boolean;
  workDays: string[];
  isActive: boolean;
};

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu",
  FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

const EMPTY_SHIFT_FORM = {
  name: "",
  type: "FIXED",
  timeIn: "08:00",
  timeOut: "17:00",
  breakMinutes: 60,
  crossesMidnight: false,
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
};

function ShiftSchedulesTab() {
  const [rows, setRows] = useState<ShiftSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftSchedule | null>(null);
  const [form, setForm] = useState(EMPTY_SHIFT_FORM);
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
    setForm(EMPTY_SHIFT_FORM);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Named shift templates used for DTR processing and OT calculation.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Shift
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Work Days</TableHead>
              <TableHead>Break</TableHead>
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
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No shift schedules yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.name}
                    {row.crossesMidnight && (
                      <Badge variant="secondary" className="ml-2 text-xs">Night</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.timeIn} – {row.timeOut}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 flex-wrap">
                      {ALL_DAYS.map((d) => (
                        <span
                          key={d}
                          className={`text-xs px-1 rounded ${
                            (Array.isArray(row.workDays) ? row.workDays : []).includes(d)
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.breakMinutes}m</TableCell>
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
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
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      form.workDays.includes(d)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
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

// ---------------------------------------------------------------------------
// 3. Work Locations Tab
// ---------------------------------------------------------------------------

type WorkLocation = {
  id: string;
  name: string;
  region: string;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  deletedAt: string | null;
  _count: { branches: number };
};

const EMPTY_WL_FORM = {
  name: "",
  region: "NCR",
  address: "",
  city: "",
  province: "",
  zipCode: "",
};

function WorkLocationsTab() {
  const [rows, setRows] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [form, setForm] = useState(EMPTY_WL_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/work-locations");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_WL_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: WorkLocation) {
    setEditing(row);
    setForm({
      name: row.name,
      region: row.region,
      address: "",
      city: row.city ?? "",
      province: row.province ?? "",
      zipCode: row.zipCode ?? "",
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.region) { toast.error("Region is required"); return; }
    setSaving(true);
    const body = {
      name: form.name,
      region: form.region,
      address: form.address || null,
      city: form.city || null,
      province: form.province || null,
      zipCode: form.zipCode || null,
    };
    const url = editing ? `/api/work-locations/${editing.id}` : "/api/work-locations";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Work location updated" : "Work location created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: WorkLocation) {
    if (row._count.branches > 0) {
      toast.error(`Cannot delete: ${row._count.branches} branch(es) linked to this location`);
      return;
    }
    if (!confirm(`Delete "${row.name}"?`)) return;
    const res = await fetch(`/api/work-locations/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`"${row.name}" deleted`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Work locations map branches to DOLE regions for minimum-wage computation.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Location
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>City / Province</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No work locations yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{row.region}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[row.city, row.province].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row._count.branches}</Badge>
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
                        disabled={row._count.branches > 0}
                        title={row._count.branches > 0 ? "Cannot delete: has linked branches" : "Delete"}
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Work Location" : "Add Work Location"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Head Office"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>DOLE Region <span className="text-destructive">*</span></Label>
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v ?? form.region })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {PHILIPPINE_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines which RTWPB wage order applies for minimum-wage checks.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                placeholder="Makati City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Province</Label>
                <Input
                  placeholder="Metro Manila"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP Code</Label>
                <Input
                  placeholder="1200"
                  maxLength={10}
                  value={form.zipCode}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Location"}
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
// 4. Roles Tab
// ---------------------------------------------------------------------------

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  createdAt: string;
};

const EMPTY_ROLE_FORM = { name: "", description: "" };

function RolesTab() {
  const [rows, setRows] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(EMPTY_ROLE_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/roles");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_ROLE_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: Role) {
    if (row.isSystem) return;
    setEditing(row);
    setForm({ name: row.name, description: row.description ?? "" });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Role name is required"); return; }
    setSaving(true);
    const body = { name: form.name, description: form.description || null };
    const url = editing ? `/api/roles/${editing.id}` : "/api/roles";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Role updated" : "Role created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: Role) {
    if (row.isSystem) return;
    if (!confirm(`Delete role "${row.name}"? Users assigned this role will lose access.`)) return;
    const res = await fetch(`/api/roles/${row.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to delete"); return; }
    toast.success(`"${row.name}" deleted`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          System roles are built-in and read-only. Custom roles can be renamed or deleted.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Role
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No roles found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                    {row.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.permissionCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isSystem ? "default" : "outline"}>
                      {row.isSystem ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!row.isSystem && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Role" : "Add Role"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Payroll Manager"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this role…"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Role"}
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
// 5. Positions Tab
// ---------------------------------------------------------------------------

type Position = {
  id: string;
  title: string;
  level: string;
  description: string | null;
  deletedAt: string | null;
  _count: { employees: number };
};

const POSITION_LEVELS = [
  { value: "ENTRY", label: "Entry", color: "bg-slate-100 text-slate-700" },
  { value: "MID", label: "Mid", color: "bg-blue-100 text-blue-700" },
  { value: "SENIOR", label: "Senior", color: "bg-indigo-100 text-indigo-700" },
  { value: "MANAGER", label: "Manager", color: "bg-violet-100 text-violet-700" },
  { value: "DIRECTOR", label: "Director", color: "bg-amber-100 text-amber-700" },
  { value: "EXECUTIVE", label: "Executive", color: "bg-rose-100 text-rose-700" },
];

const EMPTY_POS_FORM = { title: "", level: "MID", description: "" };

function PositionsTab() {
  const [rows, setRows] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState(EMPTY_POS_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/positions?includeDeleted=false");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_POS_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: Position) {
    setEditing(row);
    setForm({ title: row.title, level: row.level, description: row.description ?? "" });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const body = { title: form.title.trim(), level: form.level, description: form.description || null };
    const url = editing ? `/api/positions/${editing.id}` : "/api/positions";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Position updated" : "Position created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: Position) {
    if (row._count.employees > 0) {
      toast.error(`Cannot delete — ${row._count.employees} employee(s) assigned to this position`);
      return;
    }
    if (!confirm(`Delete position "${row.title}"?`)) return;
    const res = await fetch(`/api/positions/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`"${row.title}" deleted`);
    load();
  }

  const levelMeta = (v: string) => POSITION_LEVELS.find((l) => l.value === v);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Job positions and levels used in employee profiles, movements, and recruitment.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Position
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No positions yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const meta = levelMeta(row.level);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta?.color ?? "bg-gray-100 text-gray-700"}`}>
                        {meta?.label ?? row.level}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {row.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row._count.employees}</TableCell>
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Position" : "Add Position"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Senior Software Engineer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v ?? form.level })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSITION_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the role…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Position"}
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
// Page Shell
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company and system configuration</p>
      </div>

      <Tabs defaultValue="pay-components">
        <TabsList>
          <TabsTrigger value="pay-components" className="gap-1.5">
            <Boxes className="h-4 w-4" /> Pay Components
          </TabsTrigger>
          <TabsTrigger value="shifts" className="gap-1.5">
            <Clock className="h-4 w-4" /> Shifts
          </TabsTrigger>
          <TabsTrigger value="work-locations" className="gap-1.5">
            <MapPin className="h-4 w-4" /> Work Locations
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Roles
          </TabsTrigger>
          <TabsTrigger value="positions" className="gap-1.5">
            <Briefcase className="h-4 w-4" /> Positions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pay-components" className="mt-4">
          <PayComponentsTab />
        </TabsContent>
        <TabsContent value="shifts" className="mt-4">
          <ShiftSchedulesTab />
        </TabsContent>
        <TabsContent value="work-locations" className="mt-4">
          <WorkLocationsTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
        <TabsContent value="positions" className="mt-4">
          <PositionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
