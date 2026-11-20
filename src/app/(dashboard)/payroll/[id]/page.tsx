"use client";

/**
 * /payroll/[id] — Payroll Run Drill-Down
 *
 * Displays the full detail of a single payroll run:
 *  - Header: period, cycle, type, status, notes
 *  - Action bar (status-dependent):
 *      DRAFT      → Recompute | Annualize (YEAR_END only) | Finalize
 *      FINALIZED  → Bank file downloads (6 banks)
 *  PAY-155: a 13th month run is annualized while it is a draft; a finalized
 *  run is a sealed record and is never changed.
 *  - Employee sheets table (gross → deductions → net)
 *  - Adjustments section (list + add on DRAFT)
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
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
import { ProcessingRunPanel } from "@/components/payroll/ProcessingRunPanel";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type Payslip,
  PayslipDetailBody,
  downloadPayslipPdf,
} from "@/components/payslip/payslip-detail";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RunCrossFoot } from "@/components/reports/CrossFootPanel";
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
  employeeName?: string | null;
  /** PAY-150: applied components, with refused and carried deductions. */
  payComponentsApplied?: unknown;
  // monetary fields serialised as strings (centavos)
  basicSalaryCentsSnapshot: string;
  basePayCents: string;
  grossCompensationCents: string;
  sssEeCents: string;
  philhealthEeCents: string;
  pagibigEeCents: string;
  withholdingTaxCents: string;
  loanDeductionsCents: string;
  loanDeferredCents: string;
  nontaxableAdditionsCents: string;
  netPayCents: string;
  /** PAY-168: 13th month run fields. */
  nontaxable13MonthAndBenefitsCents?: string;
  taxableAllowancesCents?: string;
  thirteenthMonthBreakdown?: { dueCents: string } | null;
  annualizationData?: { trueUpCents: string; yearEndBaselineWhtCents?: string } | null;
};

/**
 * PAY-168: the figures a 13th month (YEAR_END) sheet is read by. Gross on
 * such a run IS the 13th month (plus any taxable adjustment); the tax is the
 * tax on its taxable excess plus, once annualized, the year-end adjustment
 * (negative = refund).
 */
function yearEndFigures(s: PayrollSheet) {
  const nonTaxable = BigInt(s.nontaxable13MonthAndBenefitsCents ?? "0");
  const pay = s.thirteenthMonthBreakdown
    ? BigInt(s.thirteenthMonthBreakdown.dueCents)
    : nonTaxable + BigInt(s.taxableAllowancesCents ?? "0");
  const excess = pay - nonTaxable > 0n ? pay - nonTaxable : 0n;
  const trueUp = s.annualizationData ? BigInt(s.annualizationData.trueUpCents) : 0n;
  const taxOnExcess = BigInt(s.withholdingTaxCents) - trueUp;
  return { pay, nonTaxable, excess, taxOnExcess, trueUp };
}

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  /** PAY-141: set on runs created from a payday. */
  payDate?: string | null;
  cutoffStart?: string | null;
  cutoffEnd?: string | null;
  cycle: string;
  runType: string;
  status: "DRAFT" | "PROCESSING" | "FINALIZED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  sheets: PayrollSheet[];
  /** PAY-172: employees without an approved DTR for days of the cutoff. */
  dtrGaps?: { employeeId: string; days: number; held: boolean; employeeName: string | null; employeeNumber: string | null }[];
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
  PROCESSING: "secondary",
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
                    {s.employeeName
                      ? `${s.employeeName}${s.employeeNumber ? ` (${s.employeeNumber})` : ""}`
                      : s.employeeNumber ?? s.employeeId.substring(0, 8)}
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
  const [payslipFor, setPayslipFor] = useState<string | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipDownloading, setPayslipDownloading] = useState(false);

  useEffect(() => {
    if (!payslipFor) { setPayslip(null); return; }
    setPayslipLoading(true);
    fetch(`/api/payroll/runs/${id}/payslips/${payslipFor}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json?.data) {
          toast.error(json?.error ?? "Payslip not available");
          return;
        }
        setPayslip(json.data);
      })
      .catch(() => toast.error("Failed to load payslip"))
      .finally(() => setPayslipLoading(false));
  }, [id, payslipFor]);

  async function handlePayslipDownload() {
    if (!payslip || !payslipFor) return;
    setPayslipDownloading(true);
    try {
      await downloadPayslipPdf(`/api/payroll/runs/${id}/payslips/${payslipFor}/pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download the payslip.");
    } finally {
      setPayslipDownloading(false);
    }
  }

  const fetchRun = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/payroll/runs/${id}`);
    const json = await res.json();
    if (res.ok) setRun(json.data ?? json);
    setIsLoading(false);
  }, [id]);

  // PAY-192: refresh without the loading skeleton while a run is computing.
  const refreshRunQuietly = useCallback(async () => {
    const res = await fetch(`/api/payroll/runs/${id}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json) setRun(json.data ?? json);
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

  // PAY-168: a 13th month run is read as 13th month pay, its tax-free part,
  // the taxable excess, the tax on it and the year-end adjustment. SSS,
  // PhilHealth and Pag-IBIG are never deducted on it, so they are not shown.
  const ye = run.sheets.reduce(
    (acc, s) => {
      const f = yearEndFigures(s);
      return {
        pay: acc.pay + f.pay, nonTaxable: acc.nonTaxable + f.nonTaxable, excess: acc.excess + f.excess,
        taxOnExcess: acc.taxOnExcess + f.taxOnExcess, trueUp: acc.trueUp + f.trueUp,
      };
    },
    { pay: 0n, nonTaxable: 0n, excess: 0n, taxOnExcess: 0n, trueUp: 0n },
  );
  const anyAnnualized = run.sheets.some((s) => s.annualizationData);

  type Col = { label: string; value: (s: PayrollSheet) => string; strong?: boolean; muted?: boolean };
  const columns: Col[] = isYearEnd
    ? [
        { label: "Basic Salary", value: (s) => s.basicSalaryCentsSnapshot },
        { label: "13th Month Pay", value: (s) => yearEndFigures(s).pay.toString(), strong: true },
        { label: "Tax-free", value: (s) => yearEndFigures(s).nonTaxable.toString(), muted: true },
        { label: "Taxable Excess", value: (s) => yearEndFigures(s).excess.toString(), muted: true },
        { label: "Tax on Excess", value: (s) => yearEndFigures(s).taxOnExcess.toString(), muted: true },
        ...(anyAnnualized
          ? [{ label: "Year-end Tax Adj.", value: (s: PayrollSheet) => yearEndFigures(s).trueUp.toString(), muted: true }]
          : []),
        { label: "Loans", value: (s) => s.loanDeductionsCents, muted: true },
      ]
    : [
        { label: "Basic Salary", value: (s) => s.basicSalaryCentsSnapshot },
        { label: "Gross", value: (s) => s.grossCompensationCents },
        { label: "SSS EE", value: (s) => s.sssEeCents, muted: true },
        { label: "PhilHealth EE", value: (s) => s.philhealthEeCents, muted: true },
        { label: "Pag-IBIG EE", value: (s) => s.pagibigEeCents, muted: true },
        { label: "WHT", value: (s) => s.withholdingTaxCents, muted: true },
        { label: "Loans", value: (s) => s.loanDeductionsCents, muted: true },
      ];
  const summary: { label: string; value: string }[] = isYearEnd
    ? [
        { label: "13th Month Pay", value: ye.pay.toString() },
        { label: "Tax-free", value: ye.nonTaxable.toString() },
        { label: "Taxable Excess", value: ye.excess.toString() },
        { label: "Tax on Excess", value: ye.taxOnExcess.toString() },
        ...(anyAnnualized ? [{ label: "Year-end Tax Adj.", value: ye.trueUp.toString() }] : []),
        { label: "Loan Deductions", value: String(Math.round(totals.loans)) },
        { label: "Net Pay", value: String(Math.round(totals.net)) },
      ]
    : [
        { label: "Gross", value: String(Math.round(totals.gross)) },
        { label: "SSS EE", value: String(Math.round(totals.sss)) },
        { label: "PhilHealth EE", value: String(Math.round(totals.philhealth)) },
        { label: "Pag-IBIG EE", value: String(Math.round(totals.pagibig)) },
        { label: "Withholding Tax", value: String(Math.round(totals.tax)) },
        { label: "Loan Deductions", value: String(Math.round(totals.loans)) },
        { label: "Net Pay", value: String(Math.round(totals.net)) },
      ];
  // PAY-168: any employee line opens the payslip (finalized) or its preview (draft).
  const canPreview = run.status === "DRAFT" || run.status === "FINALIZED";

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
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{formatPeriod(run.periodStart, run.periodEnd)}</h1>
              <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>{run.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {CYCLE_LABELS[run.cycle] ?? run.cycle} · {TYPE_LABELS[run.runType] ?? run.runType}
              {" · "}
              {run.sheets.length} employee{run.sheets.length !== 1 ? "s" : ""}
            </p>
            {run.payDate && (
              <p className="text-sm text-muted-foreground tabular-nums" data-testid="run-paydate-cutoff">
                Pay date {new Date(run.payDate).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                {run.cutoffStart && run.cutoffEnd && (
                  <> · Timekeeping cutoff {formatPeriod(run.cutoffStart, run.cutoffEnd)}</>
                )}
              </p>
            )}
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
                    {/* Base UI throws (and the whole page fails to load) if a
                        menu label is not inside a group. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Download for</DropdownMenuLabel>
                    </DropdownMenuGroup>
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

              </>
            )}
          </div>
        </div>

        {/* PAY-61 (Mark, 17 Nov 2026: option B): a net pay below zero is
            allowed. It is money the employee owes the company, so it is never
            credited and those employees are left out of every bank file. */}
        {(() => {
          const negatives = run.sheets.filter((s) => BigInt(s.netPayCents) < 0n);
          if (negatives.length === 0) return null;
          return (
            <div
              role="alert"
              data-testid="negative-net-warning"
              className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {negatives.length === 1
                    ? "1 employee has a net pay below zero."
                    : `${negatives.length} employees have a net pay below zero.`}
                </p>
                <p className="mt-0.5">
                  Deductions are more than this period&apos;s pay. The amount is owed to the company,
                  nothing is credited, and these employees are left out of the bank files.
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {negatives.map((s) => (
                    <li key={s.id ?? s.employeeId}>
                      {s.employeeName ?? s.employeeId.substring(0, 12)}: {formatPeso(s.netPayCents)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        {/* Summary strip */}
        {run.sheets.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {summary.map((item) => (
                <div key={item.label} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatPeso(item.value)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {(run.dtrGaps?.length ?? 0) > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Employees without an approved DTR for this cutoff</p>
          <ul className="list-disc pl-5 space-y-1">
            {run.dtrGaps!.map((g) => (
              <li key={g.employeeId}>
                {g.employeeName ?? g.employeeId}
                {g.employeeNumber ? ` (${g.employeeNumber})` : ""}:{" "}
                {g.held
                  ? "left out of this run; salary held until the DTR for the cutoff is approved"
                  : `${g.days} day${g.days === 1 ? "" : "s"} counted as absent`}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            HR and each employee&apos;s immediate supervisor were emailed. Approve the DTR, then recompute this run.
          </p>
        </div>
      )}

      {/* PAY-70: the run's cross-foot checks (payslips, register, bank file) */}
      {(run.status === "DRAFT" || run.status === "FINALIZED") && run.sheets.length > 0 && (
        <RunCrossFoot runId={run.id} version={`${run.status}:${run.sheets.map((s) => s.netPayCents).join(",")}`} />
      )}

      {/* PAY-150: Other Deductions the run refused or carried over */}
      {(() => {
        const notes = run.sheets.flatMap((s) =>
          ((Array.isArray(s.payComponentsApplied) ? s.payComponentsApplied : []) as { name: string; refusedReason?: string; deferredCents?: string }[])
            .filter((a) => a.refusedReason || a.deferredCents)
            .map((a) => ({ key: `${s.id}-${a.name}`, who: s.employeeName ?? s.employeeId, a })),
        );
        if (notes.length === 0) return null;
        return (
          <div data-testid="deduction-notes" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-medium">Deductions not taken in full</p>
            <ul className="list-disc pl-5 space-y-1">
              {notes.map((n) => (
                <li key={n.key}>
                  {n.who}: {n.a.name}:{" "}
                  {n.a.refusedReason
                    ? `not deducted. ${n.a.refusedReason}.`
                    : `${formatPeso(n.a.deferredCents!)} carried to the next payday (a loss or damage deduction takes at most 20% of the period's wages).`}
                </li>
              ))}
            </ul>
            <p className="text-xs">Add the missing record on the employee&apos;s Compensation tab, then recompute this run.</p>
          </div>
        );
      })()}

      {run.status === "PROCESSING" && (
        <ProcessingRunPanel runId={run.id} createdAt={run.createdAt} onRefresh={refreshRunQuietly} />
      )}

      {/* Employee sheets table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Employee Sheets</h2>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.label} className="text-right">{c.label}</TableHead>
                ))}
                <TableHead className="text-right font-bold">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.sheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} className="py-10 text-center text-muted-foreground">
                    No employee sheets computed yet. Use Recompute to generate sheets.
                  </TableCell>
                </TableRow>
              ) : (
                run.sheets.map((s) => (
                  <TableRow
                    key={s.id}
                    data-testid="sheet-row"
                    className={canPreview ? "cursor-pointer hover:bg-muted/50" : undefined}
                    tabIndex={canPreview ? 0 : undefined}
                    title={canPreview ? (isFinalized ? "View payslip" : "Preview payslip") : undefined}
                    onClick={canPreview ? () => setPayslipFor(s.employeeId) : undefined}
                    onKeyDown={
                      canPreview
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPayslipFor(s.employeeId);
                            }
                          }
                        : undefined
                    }
                  >
                    <TableCell>
                      <span className="block text-sm font-medium">{s.employeeName ?? s.employeeId.substring(0, 12)}</span>
                      {s.employeeNumber && (
                        <span className="block font-mono text-xs text-muted-foreground">{s.employeeNumber}</span>
                      )}
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell
                        key={c.label}
                        className={`text-right tabular-nums text-sm${c.muted ? " text-muted-foreground" : ""}${c.strong ? " font-medium" : ""}`}
                      >
                        {formatPeso(c.value(s))}
                        {c.label === "Loans" && Number(s.loanDeferredCents) > 0 && (
                          <span
                            className="block text-[11px] font-medium text-amber-600"
                            title="Loan amortization deferred to keep net pay at or above zero. The unpaid amount stays in the loan balance and carries to the next period."
                          >
                            {formatPeso(s.loanDeferredCents)} deferred
                          </span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell
                      className={`text-right tabular-nums text-sm font-semibold${BigInt(s.netPayCents) < 0n ? " text-red-600" : ""}`}
                    >
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
                    <TableCell className="text-sm">
                      {(() => {
                        const sh = run.sheets.find((x) => x.employeeId === adj.employeeId);
                        return sh?.employeeName ?? sh?.employeeNumber ?? adj.employeeId.substring(0, 12);
                      })()}
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

      {/* PAY-168: payslip of one employee (same view as ESS); a preview on a draft run */}
      <Dialog open={payslipFor !== null} onOpenChange={(o) => { if (!o) setPayslipFor(null); }}>
        <DialogContent className="max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{isFinalized ? "Payslip" : "Payslip preview"}</DialogTitle>
          </DialogHeader>
          {payslipLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : payslip ? (
            <PayslipDetailBody detail={payslip} onDownload={handlePayslipDownload} downloading={payslipDownloading} />
          ) : (
            <p className="text-sm text-muted-foreground mt-4 text-center">Payslip not available.</p>
          )}
        </DialogContent>
      </Dialog>

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
