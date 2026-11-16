"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Wallet, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type PayrollRun = {  id: string;
  periodStart: string;
  periodEnd: string;
  /** PAY-141: set on runs created from a payday. */
  payDate?: string | null;
  cutoffStart?: string | null;
  cutoffEnd?: string | null;
  cycle: string;
  runType: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

type RunsResponse = {
  data: PayrollRun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

// PAY-141: a regular run is picked by payday; GET /api/payroll/paydays.
type Payday = {
  nominalDate: string;
  payDate: string;
  moved: boolean;
  periodStart: string;
  periodEnd: string;
  cutoffStart: string;
  cutoffEnd: string;
  existingRun: { id: string; status: string } | null;
};

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtRange = (a: string, b: string) => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", month: "short", day: "numeric" });
  return `${f(a)} to ${f(b)}, ${b.slice(0, 4)}`;
};

const EMPTY_FORM = {
  payday: "",
  periodStart: "",
  periodEnd: "",
  cycle: "SEMI_MONTHLY",
  runType: "REGULAR",
  notes: "",
  skipStatutory: false,
};

export default function PayrollPage() {
  const [runs, setRuns] = useState<RunsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [paydays, setPaydays] = useState<Payday[] | null>(null);
  const [paydayError, setPaydayError] = useState<string | null>(null);
  const isRegular = form.runType === "REGULAR";
  const chosen = paydays?.find((p) => p.nominalDate === form.payday) ?? null;

  // PAY-141: load the cycle's paydays; preselect the next one without a run.
  useEffect(() => {
    if (!dialogOpen || !isRegular) return;
    let gone = false;
    setPaydays(null);
    setPaydayError(null);
    fetch(`/api/payroll/paydays?cycle=${form.cycle}`)
      .then(async (res) => {
        const json = await res.json();
        if (gone) return;
        if (!res.ok) { setPaydayError(json.error ?? "Could not load paydays"); return; }
        const list: Payday[] = json.data.paydays;
        const today: string = json.data.today;
        setPaydays(list);
        const next = list.find((p) => p.nominalDate >= today && !p.existingRun) ?? list.find((p) => !p.existingRun);
        setForm((f) => ({ ...f, payday: next?.nominalDate ?? "" }));
      })
      .catch(() => { if (!gone) setPaydayError("Could not load paydays"); });
    return () => { gone = true; };
  }, [dialogOpen, isRegular, form.cycle]);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(filterStatus !== "all" && { status: filterStatus }),
    });
    const res = await fetch(`/api/payroll/runs?${params}`);
    const json = await res.json();
    if (res.ok) setRuns(json);
    else toast.error(json.error ?? "Failed to load payroll runs");
    setIsLoading(false);
  }, [page, filterStatus]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);
  useEffect(() => { setPage(1); }, [filterStatus]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // PAY-141: regular runs send only the payday; the server fills and
          // locks the dates from the company's pay schedule.
          ...(isRegular
            ? { payday: form.payday }
            : { periodStart: form.periodStart, periodEnd: form.periodEnd }),
          cycle: form.cycle,
          runType: form.runType,
          notes: form.notes.trim() || null,
          skipStatutory: form.skipStatutory,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const fieldError = Object.values(
          (json.details?.fieldErrors ?? {}) as Record<string, string[]>,
        ).flat()[0];
        toast.error(fieldError ?? json.error ?? "Failed to create payroll run");
        return;
      }
      toast.success("Payroll run created (DRAFT)");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      fetchRuns();
    } finally {
      setSubmitting(false);
    }
  }

  function formatPeriod(start: string, end: string) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Payroll
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5">
            {runs ? `${runs.total} run${runs.total !== 1 ? "s" : ""}` : "Loading…"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="h-9 text-[13px] bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]"
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          New Payroll Run
        </Button>
      </div>

      {/* ── Filters toolbar ── */}
      <div className="flex gap-2 p-3 bg-white rounded-xl border border-[#E8E8E8]">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? filterStatus)}>
          <SelectTrigger className="w-44 h-9 text-[13px] border-[#E8E8E8]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="FINALIZED">Finalized</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Pay Period</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Pay Date</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Cycle</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Type</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Status</TableHead>
              <TableHead className="text-[12.5px] font-medium text-[#525252]">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !runs?.data?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-[#6B6B6B]">
                  <Wallet className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No payroll runs yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              runs.data.map((run) => {
                const statusStyle: Record<string, { bg: string; color: string }> = {
                  DRAFT: { bg: "#fdeee6", color: "#E8693A" },
                  FINALIZED: { bg: "#E5F6EE", color: "#0FA36B" },
                  CANCELLED: { bg: "#FCE9E7", color: "#E0463B" },
                };
                const s = statusStyle[run.status] ?? { bg: "#F7F7F7", color: "#525252" };
                return (
                  <TableRow key={run.id} className="hover:bg-[#FAFAFA]">
                    <TableCell className="font-medium tabular-nums text-[13.5px] text-[#171717]">
                      {formatPeriod(run.periodStart, run.periodEnd)}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#6B6B6B] tabular-nums">
                      {run.payDate ? fmtDay(run.payDate.slice(0, 10)) : "Not set"}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#6B6B6B]">
                      {CYCLE_LABELS[run.cycle] ?? run.cycle}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#6B6B6B]">
                      {TYPE_LABELS[run.runType] ?? run.runType}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {run.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-[#6B6B6B] tabular-nums">
                      {new Date(run.createdAt).toLocaleDateString("en-PH")}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" nativeButton={false} className="h-7 w-7 text-[#6B6B6B]" render={<Link href={`/payroll/${run.id}`} />}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {runs && runs.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {runs.totalPages}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= runs.totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* New Run Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Run Type</Label>
                <Select value={form.runType} onValueChange={(v) => setForm((f) => ({ ...f, runType: v ?? f.runType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="OFF_CYCLE">Off-Cycle</SelectItem>
                    <SelectItem value="YEAR_END">Year-End</SelectItem>
                  </SelectContent>
                </Select>
                {/* PAY-135: a final pay is for named leavers, so it is created
                    from Offboard on the employee's page, never for everyone. */}
                <p className="text-xs text-muted-foreground">
                  Final pay: use Offboard on the employee&apos;s page.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Pay Cycle</Label>
                <Select value={form.cycle} onValueChange={(v) => setForm((f) => ({ ...f, cycle: v ?? f.cycle, payday: "" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEMI_MONTHLY">Semi-Monthly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isRegular ? (
              <>
                <div className="space-y-1.5">
                  <Label>Payday <span className="text-destructive">*</span></Label>
                  {paydayError ? (
                    <p className="text-sm text-destructive">{paydayError}</p>
                  ) : !paydays ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select value={form.payday} onValueChange={(v) => setForm((f) => ({ ...f, payday: v ?? f.payday }))}>
                      <SelectTrigger aria-label="Payday">
                        <SelectValue placeholder="Pick a payday" />
                      </SelectTrigger>
                      <SelectContent>
                        {paydays.map((p) => (
                          <SelectItem key={p.nominalDate} value={p.nominalDate} disabled={!!p.existingRun}>
                            {fmtDay(p.nominalDate)}
                            {p.existingRun ? " (run exists)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Paydays and cutoffs come from Settings, Pay Rules.
                  </p>
                </div>
                {chosen && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-[#E8E8E8] bg-[#FAFAFA] p-3 text-[13px]" aria-label="Run dates (locked)">
                    <dt className="text-[#6B6B6B]">Pay date</dt>
                    <dd className="tabular-nums text-[#171717]" data-testid="run-paydate">
                      {fmtDay(chosen.payDate)}
                      {chosen.moved && <span className="text-[#6B6B6B]"> (moved from {fmtDay(chosen.nominalDate)}: Sunday or holiday)</span>}
                    </dd>
                    <dt className="text-[#6B6B6B]">Pay period</dt>
                    <dd className="tabular-nums text-[#171717]" data-testid="run-period">{fmtRange(chosen.periodStart, chosen.periodEnd)}</dd>
                    <dt className="text-[#6B6B6B]">Timekeeping cutoff</dt>
                    <dd className="tabular-nums text-[#171717]" data-testid="run-cutoff">{fmtRange(chosen.cutoffStart, chosen.cutoffEnd)}</dd>
                  </dl>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-start">Period Start <span className="text-destructive">*</span></Label>
                  <Input
                    id="pr-start"
                    type="date"
                    value={form.periodStart}
                    onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-end">Period End <span className="text-destructive">*</span></Label>
                  <Input
                    id="pr-end"
                    type="date"
                    value={form.periodEnd}
                    onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pr-notes">Notes</Label>
              <Input
                id="pr-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                maxLength={500}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={submitting || (isRegular && !chosen)} className="flex-1">
                {submitting ? "Creating…" : "Create Run"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
