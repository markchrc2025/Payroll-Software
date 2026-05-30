"use client";

/**
 * /settings/leave-policies — Leave Type CRUD
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
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

const ACCRUAL_FREQ = [
  { value: "MONTHLY",               label: "Monthly" },
  { value: "QUARTERLY",             label: "Quarterly" },
  { value: "ANNUALLY",              label: "Annually" },
  { value: "UPON_REGULARIZATION",   label: "Upon Regularization" },
  { value: "LUMP_SUM",              label: "Lump Sum (grant all at start)" },
];

type LeaveType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  isConvertibleToCash: boolean;
  unit: string;
  accrualFrequency: string;
  accrualAmount: number | string;
  maxAccruableBalance: number | string | null;
  carryOverLimit: number | string | null;
  requiresRegularization: boolean;
  isActive: boolean;
};

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  isPaid: true,
  isConvertibleToCash: false,
  unit: "DAYS",
  accrualFrequency: "MONTHLY",
  accrualAmount: "",
  maxAccruableBalance: "",
  carryOverLimit: "",
  requiresRegularization: false,
  isActive: true,
};

export default function LeavePoliciesPage() {
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leave-types?limit=200&includeDeleted=false");
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

  function openEdit(row: LeaveType) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      isPaid: row.isPaid,
      isConvertibleToCash: row.isConvertibleToCash,
      unit: row.unit,
      accrualFrequency: row.accrualFrequency,
      accrualAmount: String(row.accrualAmount),
      maxAccruableBalance: row.maxAccruableBalance != null ? String(row.maxAccruableBalance) : "",
      carryOverLimit: row.carryOverLimit != null ? String(row.carryOverLimit) : "",
      requiresRegularization: row.requiresRegularization,
      isActive: row.isActive,
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.accrualAmount === "" || isNaN(Number(form.accrualAmount))) {
      toast.error("Accrual amount must be a number"); return;
    }
    setSaving(true);
    const body = {
      code: form.code.toUpperCase(),
      name: form.name,
      description: form.description || null,
      isPaid: form.isPaid,
      isConvertibleToCash: form.isConvertibleToCash,
      unit: form.unit,
      accrualFrequency: form.accrualFrequency,
      accrualAmount: Number(form.accrualAmount),
      maxAccruableBalance: form.maxAccruableBalance !== "" ? Number(form.maxAccruableBalance) : null,
      carryOverLimit: form.carryOverLimit !== "" ? Number(form.carryOverLimit) : null,
      requiresRegularization: form.requiresRegularization,
      isActive: form.isActive,
    };
    const url = editing ? `/api/leave-types/${editing.id}` : "/api/leave-types";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Leave type updated" : "Leave type created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: LeaveType) {
    if (!confirm(`Archive leave type "${row.name}"? Existing balances will be preserved.`)) return;
    const res = await fetch(`/api/leave-types/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to archive"); return; }
    toast.success(`"${row.name}" archived`);
    load();
  }

  const freqLabel = (f: string) => ACCRUAL_FREQ.find((a) => a.value === f)?.label ?? f;

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Leave Policies
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Leave type catalog — accrual rules, carry-over limits, and monetization settings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#2D6BE4] hover:bg-[#2460CC] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Leave Type
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
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Accrual</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Paid</TableHead>
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
                  No leave types yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-mono text-xs text-[#4A586B]">{row.code}</TableCell>
                  <TableCell>
                    <p className="font-medium text-[13.5px] text-[#111827]">{row.name}</p>
                    {row.description && (
                      <p className="text-[12px] text-[#9AA5B4] truncate max-w-[200px]">{row.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-[#4A586B]">
                    {Number(row.accrualAmount)} {row.unit.toLowerCase()}/{freqLabel(row.accrualFrequency).toLowerCase()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isPaid ? "default" : "secondary"} className="text-xs">
                      {row.isPaid ? "Paid" : "Unpaid"}
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Leave Type" : "Add Leave Type"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="SL"
                  disabled={!!editing}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Sick Leave"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description…"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v ?? form.unit })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAYS">Days</SelectItem>
                    <SelectItem value="HOURS">Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accrual Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="1.25"
                  value={form.accrualAmount}
                  onChange={(e) => setForm({ ...form, accrualAmount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Accrual Frequency</Label>
              <Select value={form.accrualFrequency} onValueChange={(v) => setForm({ ...form, accrualFrequency: v ?? form.accrualFrequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCRUAL_FREQ.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Max Accrual Balance</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Leave blank for unlimited"
                  value={form.maxAccruableBalance}
                  onChange={(e) => setForm({ ...form, maxAccruableBalance: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Carry-Over Limit</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Leave blank for none"
                  value={form.carryOverLimit}
                  onChange={(e) => setForm({ ...form, carryOverLimit: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</p>
              {(
                [
                  { key: "isPaid" as const,                 label: "Paid leave" },
                  { key: "isConvertibleToCash" as const,    label: "Convertible to cash" },
                  { key: "requiresRegularization" as const, label: "Requires regularization before grant" },
                  { key: "isActive" as const,               label: "Active" },
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

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Leave Type"}
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
