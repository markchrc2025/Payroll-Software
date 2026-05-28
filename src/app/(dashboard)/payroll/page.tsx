"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Wallet, Eye } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
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

const STATUS_COLORS: Record<string, string> = {
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

const EMPTY_FORM = {
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

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(filterStatus !== "all" && { status: filterStatus }),
    });
    const res = await fetch(`/api/payroll/runs?${params}`);
    const json = await res.json();
    setRuns(json);
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
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          cycle: form.cycle,
          runType: form.runType,
          notes: form.notes.trim() || null,
          skipStatutory: form.skipStatutory,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create payroll run");
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            {runs ? `${runs.total} run${runs.total !== 1 ? "s" : ""}` : "Loading…"}
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Payroll Run
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
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

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pay Period</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !runs?.data.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Wallet className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No payroll runs yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              runs.data.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium tabular-nums text-sm">
                    {formatPeriod(run.periodStart, run.periodEnd)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {CYCLE_LABELS[run.cycle] ?? run.cycle}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {TYPE_LABELS[run.runType] ?? run.runType}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[run.status] as "secondary" | "default" | "destructive" ?? "secondary"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(run.createdAt).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" nativeButton={false} render={<a href={`/api/payroll/runs/${run.id}`} target="_blank" rel="noreferrer" />}>
                        <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {runs && runs.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={runs.totalPages}
          onPageChange={setPage}
        />
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pay Cycle</Label>
                <Select value={form.cycle} onValueChange={(v) => setForm((f) => ({ ...f, cycle: v }))}>
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
              <div className="space-y-1.5">
                <Label>Run Type</Label>
                <Select value={form.runType} onValueChange={(v) => setForm((f) => ({ ...f, runType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="OFF_CYCLE">Off-Cycle</SelectItem>
                    <SelectItem value="FINAL_PAY">Final Pay</SelectItem>
                    <SelectItem value="YEAR_END">Year-End</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <Button type="submit" disabled={submitting} className="flex-1">
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
