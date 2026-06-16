"use client";

/**
 * /pay-components — Pay Component Catalog
 * Full CRUD for earnings and deductions (moved from /settings).
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

const PHILIPPINE_REGIONS: { value: string; label: string }[] = [
  { value: "NCR", label: "NCR — National Capital Region" },
];

void PHILIPPINE_REGIONS; // referenced by work-locations, kept here for completeness

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

const EMPTY_FORM = {
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

export default function PayComponentsPage() {
  const [rows, setRows] = useState<PayComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PayComponent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
    setForm(EMPTY_FORM);
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
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Pay Components
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Define earnings and deductions that can be assigned to employees.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-9 text-[13px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Component
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Code</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Kind</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Tax Treatment</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Status</TableHead>
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
                <TableCell colSpan={6} className="text-center text-[#6B7A8D] py-10">
                  No pay components yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={`hover:bg-[#FAFBFF] ${!row.isActive ? "opacity-50" : ""}`}>
                  <TableCell className="font-mono text-xs text-[#4A586B]">{row.code}</TableCell>
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[12px]">{kindLabel(row.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.taxability === "TAXABLE" ? "destructive"
                          : row.taxability === "DE_MINIMIS" ? "secondary"
                          : "outline"
                      }
                      className="text-[12px]"
                    >
                      {taxLabel(row.taxability)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={row.isActive
                        ? { background: "#E5F6EE", color: "#0FA36B" }
                        : { background: "#F5F6FA", color: "#6B7A8D" }}
                    >
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
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
                <Select
                  value={form.taxability}
                  onValueChange={(v) => setForm({ ...form, taxability: v ?? form.taxability, deMinimisCode: "" })}
                >
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
              <Label htmlFor="pc-isActive" className="font-normal cursor-pointer">
                Active (visible in employee assignments)
              </Label>
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
