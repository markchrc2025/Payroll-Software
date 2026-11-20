"use client";

/**
 * /pay-components — Pay Component Catalog
 * PAY-149: two tabs. Earning Components (allowances, bonuses, commissions,
 * reimbursements) and Deduction Components (Mandatory Deductions, shown
 * locked; Other Deductions: loans, the seeded Inventory Deduction, and the
 * deductions a company adds).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Lock } from "lucide-react";
import Link from "next/link";
import { MANDATORY_DEDUCTIONS, LOAN_DEDUCTIONS, groupPayComponents } from "@/lib/payroll/deduction-components";
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
  isBonus: false,
  isOneOff: false,
  isLossOrDamage: false,
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
  isBonus: boolean;
  isOneOff: boolean;
  isLossOrDamage: boolean;
  isSystem: boolean;
  isActive: boolean;
};

export default function PayComponentsPage() {
  const [rows, setRows] = useState<PayComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PayComponent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"earnings" | "deductions">("earnings");
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
    setForm(tab === "deductions" ? { ...EMPTY_FORM, kind: "DEDUCTION", taxability: "NON_TAXABLE" } : EMPTY_FORM);
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
      isBonus: row.isBonus,
      isOneOff: row.isOneOff,
      isLossOrDamage: row.isLossOrDamage,
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
    if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? "Failed to archive"); return; }
    toast.success(`"${row.name}" archived`);
    load();
  }

  const kindLabel = (k: string) => PAY_COMPONENT_KINDS.find(x => x.value === k)?.label ?? k;
  const taxLabel = (t: string) => TAXABILITY_OPTIONS.find(x => x.value === t)?.label ?? t;
  const grouped = groupPayComponents(rows);
  const shown = tab === "earnings" ? grouped.earnings : grouped.deductions;
  const isDeductionForm = form.kind === "DEDUCTION";

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Pay Components
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5">
            Earnings and deductions that can be assigned to employees.
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
            className="h-9 text-[13px] bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {tab === "earnings" ? "Add Earning" : "Add Deduction"}
          </Button>
        </div>
      </div>

      {/* PAY-149: Earning Components and Deduction Components */}
      <div role="tablist" aria-label="Pay components" className="inline-flex rounded-lg bg-[#F1F1F1] p-1">
        {([["earnings", "Earning Components"], ["deductions", "Deduction Components"]] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 text-[13px] rounded-md ${tab === k ? "bg-white font-medium text-[#171717] shadow-sm" : "text-[#525252]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "deductions" && (
        <>
          <section aria-label="Mandatory Deductions" className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8E8E8]">
              <h2 className="text-[14px] font-semibold text-[#171717]">Mandatory Deductions</h2>
              <p className="text-[12.5px] text-[#6B6B6B]">
                Required by law and worked out from the official tables, which Sentire keeps up to date. They cannot be edited or removed.
              </p>
            </div>
            <ul>
              {MANDATORY_DEDUCTIONS.map((m) => (
                <li key={m.code} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-[#F1F1F1]">
                  <Lock className="h-3.5 w-3.5 text-[#8A8A8A]" aria-label="Locked" />
                  <span className="text-[13.5px] font-medium text-[#171717] w-56">{m.name}</span>
                  <span className="text-[12.5px] text-[#6B6B6B]">{m.basis}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Loan Deduction" className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-[#171717]">Other Deductions: Loan Deduction</h2>
                <p className="text-[12.5px] text-[#6B6B6B]">Each loan is deducted by its installment until it is paid. Loans are recorded per employee.</p>
              </div>
              <Link href="/loans" className="text-[13px] font-medium text-[#E8693A] hover:underline">Open Loans</Link>
            </div>
            <ul>
              {LOAN_DEDUCTIONS.map((l) => (
                <li key={l.loanType} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-[#F1F1F1]">
                  {l.locked ? <Lock className="h-3.5 w-3.5 text-[#8A8A8A]" aria-label="Locked" /> : <span className="w-3.5" />}
                  <span className="text-[13.5px] font-medium text-[#171717] w-56">{l.name}</span>
                  <span className="text-[12.5px] text-[#6B6B6B]">{l.locked ? "Government loan: the installment is set by the agency" : "Set by the company"}</span>
                </li>
              ))}
            </ul>
          </section>

          <h2 className="text-[14px] font-semibold text-[#171717] pt-1">Other Deductions: company deductions</h2>
        </>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Code</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Name</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Kind</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Tax Treatment</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Status</TableHead>
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
            ) : shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[#6B6B6B] py-10">
                  {tab === "earnings" ? "No earning components yet. Add your first one." : "No company deductions yet."}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((row) => (
                <TableRow key={row.id} className={`hover:bg-[#FAFAFA] ${!row.isActive ? "opacity-50" : ""}`}>
                  <TableCell className="font-mono text-xs text-[#525252]">{row.code}</TableCell>
                  <TableCell className="font-medium text-[13.5px] text-[#171717]">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[12px]">{row.isLossOrDamage ? "Loss or damage" : kindLabel(row.kind)}</Badge>
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
                        : { background: "#F7F7F7", color: "#6B6B6B" }}
                    >
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {row.isSystem ? (
                        <span className="inline-flex h-8 w-8 items-center justify-center" title="Built in: cannot be deleted">
                          <Lock className="h-3.5 w-3.5 text-[#8A8A8A]" aria-label="Built in: cannot be deleted" />
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
            <SheetTitle>{editing ? (isDeductionForm ? "Edit Deduction" : "Edit Earning") : isDeductionForm ? "Add Deduction" : "Add Earning"}</SheetTitle>
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

            {isDeductionForm && (
              <div className="space-y-1 rounded-md border p-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pc-isLossOrDamage"
                    checked={form.isLossOrDamage}
                    onCheckedChange={(v) => setForm({ ...form, isLossOrDamage: !!v })}
                  />
                  <Label htmlFor="pc-isLossOrDamage" className="font-normal cursor-pointer">Loss or damage deduction</Label>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  For lost or damaged tools, materials or stock (Labor Code Articles 114 and 115). A deduction is taken
                  from net pay after tax.
                </p>
              </div>
            )}

            {!isDeductionForm && (<>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v ?? form.kind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_COMPONENT_KINDS.filter((k) => k.value !== "DEDUCTION").map((k) => (
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
              <p className="text-[12.5px] font-medium text-muted-foreground">Include in computation bases</p>
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

            {/* PAY-171: bonus tick box */}
            <div className="space-y-1 rounded-md border p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pc-isBonus"
                  checked={form.isBonus}
                  onCheckedChange={(v) => setForm({ ...form, isBonus: !!v })}
                />
                <Label htmlFor="pc-isBonus" className="font-normal cursor-pointer">Bonus</Label>
              </div>
              <p className="text-[12px] text-muted-foreground">
                For 14th month, 15th month, incentives and other bonuses. Tax-free together with the 13th month up to
                ₱90,000 a year; any excess is taxed at the employee&apos;s rate for the year. The Taxability above is not
                used for a bonus.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="pc-isOneOff"
                  checked={form.isOneOff}
                  disabled={form.isBonus}
                  onCheckedChange={(v) => setForm({ ...form, isOneOff: !!v })}
                />
                <Label htmlFor="pc-isOneOff" className="font-normal cursor-pointer">One-off pay</Label>
              </div>
              <p className="text-[12px] text-muted-foreground">
                For taxable one-time pay that is not a bonus, such as leave conversion. Taxed at the employee&apos;s
                rate for the year instead of through the payroll period&apos;s tax table.
              </p>
            </div>

            </>)}

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
