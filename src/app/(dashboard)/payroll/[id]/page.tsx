"use client";

/**
 * /payroll/[id] — Payroll Run Drill-Down
 *
 * Displays the full detail of a single payroll run:
 *  - Header: period, cycle, type, status, notes
 *  - Action bar (status-dependent):
 *      DRAFT      → Recompute | Finalize
 *      FINALIZED  → Bank file downloads (6 banks) | Annualize (YEAR_END only)
 *  - Employee sheets table (gross → deductions → net)
 *  - Adjustments section (list + add on DRAFT)
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PayrollSheet = {
  id: string;
  employeeId: string;
  employeeNumber?: string | null;
  // monetary fields serialised as strings (centavos)
  basicSalaryCentsSnapshot: string;
  basePayCents: string;
  grossCompensationCents: string;
  sssEeCents: string;
  philhealthEeCents: string;
  pagibigEeCents: string;
  withholdingTaxCents: string;
  loanDeductionsCents: string;
  nontaxableAdditionsCents: string;
  netPayCents: string;
};

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  cycle: string;
  runType: string;
  status: "DRAFT" | "FINALIZED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  sheets: PayrollSheet[];
};

type PayrollAdjustment = {
  id: string;
  employeeId: string;
  kind: string;
  amountCents: string;
  isTaxable: boolean;
  reason: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  DRAFT: "secondary",
  FINALIZED: "default",
  CANCELLED: "destructive",
};

const CYCLE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  SEMI_MONTHLY: "Semi-Monthly",
  MONTHLY: "Monthly",
};

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular",
  OFF_CYCLE: "Off-Cycle",
  FINAL_PAY: "Final Pay",
  YEAR_END: "Year-End",
};

const BANK_FILES = [
  { key: "bdo",       label: "BDO Unibank" },
  { key: "bpi",       label: "Bank of the Philippine Islands (BPI)" },
  { key: "metrobank", label: "Metrobank" },
  { key: "landbank",  label: "Landbank of the Philippines" },
  { key: "pnb",       label: "Philippine National Bank (PNB)" },
  { key: "unionbank", label: "UnionBank" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert centavo string to peso display string */
function formatPeso(cents: string): string {
  const value = Number(cents) / 100;
  return value.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

async function downloadBankFile(runId: string, bank: string) {
  const res = await fetch(`/api/payroll/runs/${runId}/bank-files/${bank}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? `Failed to download ${bank} file`);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? `${bank}-payroll.txt`;
  const text = await res.text();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Adjustment Sheet
// ---------------------------------------------------------------------------

type AdjForm = {
  employeeId: string;
  kind: "ADDITION" | "DEDUCTION";
  amountCents: string; // raw pesos input → we × 100
  isTaxable: boolean;
  reason: string;
};

const EMPTY_ADJ: AdjForm = {
  employeeId: "",
  kind: "ADDITION",
  amountCents: "",
  isTaxable: false,
  reason: "",
};

function AdjustmentSheet({
  open,
  onOpenChange,
  runId,
  sheets,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: string;
  sheets: PayrollSheet[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AdjForm>(EMPTY_ADJ);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const pesos = parseFloat(form.amountCents);
    if (isNaN(pesos) || pesos <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId || undefined,
          kind: form.kind,
          amountCents: Math.round(pesos * 100),
          isTaxable: form.isTaxable,
          reason: form.reason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save adjustment");
        return;
      }
      toast.success("Adjustment added");
      setForm(EMPTY_ADJ);
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>Add Adjustment</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee (leave blank for all)</Label>
            <Select
              value={form.employeeId}
              onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v ?? "" }))}
            >
              <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All employees</SelectItem>
                {sheets.map((s) => (
                  <SelectItem key={s.employeeId} value={s.employeeId}>
                    {s.employeeNumber ?? s.employeeId.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: (v ?? "ADDITION") as AdjForm["kind"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADDITION">Addition</SelectItem>
                  <SelectItem value="DEDUCTION">Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Amount (₱)</Label>
              <Input
                id="adj-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amountCents}
                onChange={(e) => setForm((f) => ({ ...f, amountCents: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="adj-taxable"
              type="checkbox"
              checked={form.isTaxable}
              onChange={(e) => setForm((f) => ({ ...f, isTaxable: e.target.checked }))}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="adj-taxable">Taxable</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Input
              id="adj-reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Optional reason…"
              maxLength={500}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [adjSheetOpen, setAdjSheetOpen] = useState(false);

  const fetchRun = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/payroll/runs/${id}`);
    const json = await res.json();
    if (res.ok) setRun(json.data ?? json);
    setIsLoading(false);
  }, [id]);

  const fetchAdjustments = useCallback(async () => {
    const res = await fetch(`/api/payroll/runs/${id}/adjustments`);
    const json = await res.json();
    if (res.ok) setAdjustments(json.data ?? json);
  }, [id]);

  useEffect(() => {
    fetchRun();
    fetchAdjustments();
  }, [fetchRun, fetchAdjustments]);

  async function handleAction(action: "recompute" | "finalize" | "annualize") {
    if (actionLoading) return;
    setActionLoading(action);
    try {
      const res = await fetch(`/api/payroll/runs/${id}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? `Failed to ${action}`);
        return;
      }
      toast.success(json.message ?? `${action} complete`);
      fetchRun();
      fetchAdjustments();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBankFile(bank: string) {
    setActionLoading(`bank-${bank}`);
    try {
      await downloadBankFile(id, bank);
      toast.success(`${bank.toUpperCase()} file downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Download failed`);
    } finally {
      setActionLoading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" nativeButton={false} className="-ml-2 gap-1" render={<Link href="/payroll" />}>
          <ArrowLeft className="h-4 w-4" /> Back to Payroll
        </Button>
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>Payroll run not found.</p>
        </div>
      </div>
    );
  }

  const isDraft = run.status === "DRAFT";
  const isFinalized = run.status === "FINALIZED";
  const isYearEnd = run.runType === "YEAR_END";

  // Aggregate totals from sheets
  const totals = run.sheets.reduce(
    (acc, s) => ({
      gross: acc.gross + Number(s.grossCompensationCents),
      sss: acc.sss + Number(s.sssEeCents),
      philhealth: acc.philhealth + Number(s.philhealthEeCents),
      pagibig: acc.pagibig + Number(s.pagibigEeCents),
      tax: acc.tax + Number(s.withholdingTaxCents),
      loans: acc.loans + Number(s.loanDeductionsCents),
      net: acc.net + Number(s.netPayCents),
    }),
    { gross: 0, sss: 0, philhealth: 0, pagibig: 0, tax: 0, loans: 0, net: 0 },
  );

  function centsStr(n: number) { return String(Math.round(n)); }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" nativeButton={false} className="-ml-2 gap-1" render={<Link href="/payroll" />}>
        <ArrowLeft className="h-4 w-4" /> Back to Payroll
      </Button>

      {/* Header card */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{formatPeriod(run.periodStart, run.periodEnd)}</h1>
              <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>{run.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {CYCLE_LABELS[run.cycle] ?? run.cycle} · {TYPE_LABELS[run.runType] ?? run.runType}
              {" · "}
              {run.sheets.length} employee{run.sheets.length !== 1 ? "s" : ""}
            </p>
            {run.notes && <p className="text-sm text-muted-foreground italic">{run.notes}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() => handleAction("recompute")}
                >
                  {actionLoading === "recompute"
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Recompute
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() => handleAction("finalize")}
                >
                  {actionLoading === "finalize"
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <Wallet className="h-3.5 w-3.5 mr-1.5" />}
                  Finalize
                </Button>
              </>
            )}

            {isFinalized && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    disabled={actionLoading !== null}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Bank File
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Download for</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {BANK_FILES.map((b) => (
                      <DropdownMenuItem
                        key={b.key}
                        onClick={() => handleBankFile(b.key)}
                        disabled={actionLoading === `bank-${b.key}`}
                      >
                        {actionLoading === `bank-${b.key}`
                          ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          : <Building2 className="h-3.5 w-3.5 mr-2" />}
                        {b.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {isYearEnd && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("annualize")}
                  >
                    {actionLoading === "annualize"
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Annualize
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Summary strip */}
        {run.sheets.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { label: "Gross", value: centsStr(totals.gross) },
                { label: "SSS EE", value: centsStr(totals.sss) },
                { label: "PhilHealth EE", value: centsStr(totals.philhealth) },
                { label: "Pag-IBIG EE", value: centsStr(totals.pagibig) },
                { label: "Withholding Tax", value: centsStr(totals.tax) },
                { label: "Loan Deductions", value: centsStr(totals.loans) },
                { label: "Net Pay", value: centsStr(totals.net) },
              ].map((item) => (
                <div key={item.label} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatPeso(item.value)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Employee sheets table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Employee Sheets</h2>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Basic Salary</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">SSS EE</TableHead>
                <TableHead className="text-right">PhilHealth EE</TableHead>
                <TableHead className="text-right">Pag-IBIG EE</TableHead>
                <TableHead className="text-right">WHT</TableHead>
                <TableHead className="text-right">Loans</TableHead>
                <TableHead className="text-right font-bold">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.sheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No employee sheets computed yet. Use Recompute to generate sheets.
                  </TableCell>
                </TableRow>
              ) : (
                run.sheets.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {s.employeeNumber ?? s.employeeId.substring(0, 12)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatPeso(s.basicSalaryCentsSnapshot)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatPeso(s.grossCompensationCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatPeso(s.sssEeCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatPeso(s.philhealthEeCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatPeso(s.pagibigEeCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatPeso(s.withholdingTaxCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatPeso(s.loanDeductionsCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">
                      {formatPeso(s.netPayCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Adjustments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Adjustments
            {adjustments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{adjustments.length}</Badge>
            )}
          </h2>
          {isDraft && (
            <Button size="sm" variant="outline" onClick={() => setAdjSheetOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Adjustment
            </Button>
          )}
        </div>

        {adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No adjustments for this payroll run.</p>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Taxable</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell className="font-mono text-xs">
                      {run.sheets.find((s) => s.employeeId === adj.employeeId)?.employeeNumber ?? adj.employeeId.substring(0, 12)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={adj.kind === "ADDITION" ? "default" : "destructive"} className="text-xs">
                        {adj.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatPeso(adj.amountCents)}
                    </TableCell>
                    <TableCell className="text-sm">{adj.isTaxable ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{adj.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(adj.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <AdjustmentSheet
        open={adjSheetOpen}
        onOpenChange={setAdjSheetOpen}
        runId={id}
        sheets={run.sheets}
        onSaved={() => { fetchAdjustments(); fetchRun(); }}
      />
    </div>
  );
}
