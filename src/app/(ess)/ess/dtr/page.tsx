"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  RotateCcw, Send, CalendarDays, TrendingDown, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DtrRecord {
  id: string;
  date: string;
  dayStatus: string;
  approvalStatus: string;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otMinutes: number;
  timeIn: string | null;
  timeOut: string | null;
  isLocked: boolean;
  notes: string | null;
}

interface DtrSubmission {
  id: string;
  status: string;
  submittedAt: string;
  supervisorActedAt: string | null;
  managerActedAt: string | null;
  returnedReason: string | null;
  returnedAt: string | null;
}

interface DtrPeriod {
  periodStart: string;
  periodEnd: string;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOTMinutes: number;
  presentDays: number;
  absentDays: number;
  recordCount: number;
  submission: DtrSubmission | null;
  records: DtrRecord[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPeriod(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-PH", opts)} – ${e.toLocaleDateString("en-PH", { ...opts, year: "numeric" })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function fmtMins(mins: number) {
  if (mins === 0) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    SUBMITTED:          { label: "Submitted",     className: "bg-sky-100 text-sky-700 border-sky-200" },
    SUPERVISOR_APPROVED:{ label: "Supervisor ✓",  className: "bg-blue-100 text-blue-700 border-blue-200" },
    MANAGER_APPROVED:   { label: "Approved",      className: "bg-green-100 text-green-700 border-green-200" },
    RETURNED:           { label: "Returned",      className: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  const m = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <Badge variant="outline" className={`text-xs ${m.className}`}>
      {m.label}
    </Badge>
  );
}

function dayStatusBadge(status: string) {
  const map: Record<string, string> = {
    PRESENT:      "text-green-700",
    ABSENT:       "text-red-600",
    PAID_LEAVE:   "text-sky-600",
    UNPAID_LEAVE: "text-orange-500",
    HOLIDAY:      "text-purple-600",
    REST_DAY:     "text-gray-400",
  };
  const label = status.replace("_", " ");
  return <span className={`text-xs font-medium ${map[status] ?? "text-gray-500"}`}>{label}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EssDtrPage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<DtrPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmPeriod, setConfirmPeriod] = useState<DtrPeriod | null>(null);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  const loadDtr = useCallback(async () => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ess/dtr?limit=6", { headers: authHeaders() });
      if (res.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return; }
      const data = await res.json();
      const list: DtrPeriod[] = data?.data ?? [];
      setPeriods(list);
      // Auto-open the most recent period
      if (list.length > 0) {
        setOpenPeriods(new Set([list[0].periodStart]));
      }
    } catch {
      toast.error("Failed to load DTR records.");
    } finally {
      setLoading(false);
    }
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDtr(); }, [loadDtr]);

  function togglePeriod(key: string) {
    setOpenPeriods((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function submitDtr(period: DtrPeriod) {
    setSubmitting(period.periodStart);
    try {
      const res = await fetch("/api/ess/dtr", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          periodStart: period.periodStart,
          periodEnd:   period.periodEnd,
        }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error("Already submitted for this period."); return; }
      if (!res.ok) { toast.error(data?.message ?? "Submission failed."); return; }
      toast.success("DTR submitted for approval!");
      loadDtr();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSubmitting(null);
      setConfirmPeriod(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">My DTR</h1>
        <Button variant="ghost" size="sm" onClick={loadDtr} disabled={loading}>
          <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Confirm submit dialog */}
      <AlertDialog open={!!confirmPeriod} onOpenChange={(open) => { if (!open) setConfirmPeriod(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit DTR for Approval?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPeriod && (
                <>
                  You are submitting your DTR for{" "}
                  <strong>{fmtPeriod(confirmPeriod.periodStart, confirmPeriod.periodEnd)}</strong>.
                  <br />
                  Once submitted it will go to your supervisor for review.
                  You won&apos;t be able to edit time entries while it&apos;s under review.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-sky-600 hover:bg-sky-700"
              onClick={() => confirmPeriod && submitDtr(confirmPeriod)}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit DTR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && periods.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No DTR records found.</p>
            <p className="text-xs mt-1">Records appear here once your daily time is logged.</p>
          </CardContent>
        </Card>
      )}

      {/* Period cards */}
      {!loading && periods.map((period) => {
        const isOpen = openPeriods.has(period.periodStart);
        const sub = period.submission;
        const canSubmit = !sub || sub.status === "RETURNED";
        const isSubmitting = submitting === period.periodStart;

        return (
          <Card key={period.periodStart} className="overflow-hidden">
            <Collapsible open={isOpen} onOpenChange={() => togglePeriod(period.periodStart)}>
              <CollapsibleTrigger render={<CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3 pt-4" />}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-semibold">
                          {fmtPeriod(period.periodStart, period.periodEnd)}
                        </CardTitle>
                        {sub ? statusBadge(sub.status) : (
                          <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                            Not submitted
                          </Badge>
                        )}
                      </div>

                      {/* Period summary pills */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {period.presentDays}d present
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtMins(period.totalWorkedMinutes)} worked
                        </span>
                        {period.totalLateMinutes > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <TrendingDown className="h-3 w-3" />
                            {fmtMins(period.totalLateMinutes)} late
                          </span>
                        )}
                        {period.totalOTMinutes > 0 && (
                          <span className="flex items-center gap-1 text-sky-600">
                            <Zap className="h-3 w-3" />
                            {fmtMins(period.totalOTMinutes)} OT
                          </span>
                        )}
                        {period.absentDays > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-3 w-3" />
                            {period.absentDays}d absent
                          </span>
                        )}
                      </div>

                      {/* Returned reason */}
                      {sub?.status === "RETURNED" && sub.returnedReason && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                          <strong>Returned:</strong> {sub.returnedReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canSubmit && period.recordCount > 0 && (
                        <Button
                          size="sm"
                          className="h-8 bg-sky-600 hover:bg-sky-700"
                          disabled={isSubmitting}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmPeriod(period);
                          }}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {sub?.status === "RETURNED" ? "Resubmit" : "Submit"}
                        </Button>
                      )}
                      {sub?.status === "MANAGER_APPROVED" && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {isOpen
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 pb-3">
                  <div className="border-t pt-3">
                    {period.records.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No daily records for this period.
                      </p>
                    ) : (
                      <div className="space-y-0">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-2 py-1 text-[11px] font-medium text-muted-foreground border-b mb-1">
                          <span>Date</span>
                          <span className="text-right">In</span>
                          <span className="text-right">Out</span>
                          <span className="text-right">Hours</span>
                          <span className="text-right">Status</span>
                        </div>

                        {/* Day rows */}
                        {[...period.records]
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((r) => (
                            <div
                              key={r.id}
                              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-2 py-1.5 text-xs hover:bg-muted/20 rounded items-center"
                            >
                              <span className="font-medium text-gray-700 truncate">{fmtDate(r.date)}</span>
                              <span className="text-right tabular-nums text-gray-600 min-w-[52px]">
                                {fmtTime(r.timeIn)}
                              </span>
                              <span className="text-right tabular-nums text-gray-600 min-w-[52px]">
                                {fmtTime(r.timeOut)}
                              </span>
                              <span className="text-right tabular-nums text-gray-700 font-medium min-w-[44px]">
                                {r.dayStatus === "PRESENT" ? fmtMins(r.workedMinutes) : "—"}
                              </span>
                              <span className="text-right">
                                {dayStatusBadge(r.dayStatus)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Approval timeline */}
                    {sub && (
                      <div className="mt-3 pt-3 border-t space-y-1 text-xs text-muted-foreground">
                        <p className="font-medium text-gray-700">Approval Timeline</p>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                          <span>
                            Submitted{" "}
                            {new Date(sub.submittedAt).toLocaleDateString("en-PH", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {sub.supervisorActedAt && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            <span>
                              Supervisor reviewed{" "}
                              {new Date(sub.supervisorActedAt).toLocaleDateString("en-PH", {
                                month: "short", day: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                        {sub.managerActedAt && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            <span>
                              Manager approved{" "}
                              {new Date(sub.managerActedAt).toLocaleDateString("en-PH", {
                                month: "short", day: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                        {sub.returnedAt && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span>
                              Returned{" "}
                              {new Date(sub.returnedAt).toLocaleDateString("en-PH", {
                                month: "short", day: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground text-center pb-2">
        Showing the last 6 payroll periods. Contact HR for older records.
      </p>
    </div>
  );
}
