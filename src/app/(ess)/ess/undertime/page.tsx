"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────────

type UTStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface UndertimeRequest {
  id: string;
  date: string;
  undertimeMinutes: number;
  reason: string;
  status: UTStatus;
  rejectionReason: string | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: UTStatus) {
  const variants: Record<UTStatus, string> = {
    PENDING: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "secondary",
  };
  return (
    <Badge variant={(variants[status] ?? "secondary") as never}>{status}</Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { date: "", hours: "", minutes: "0", reason: "" };

export default function EssUndertimePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<UndertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<UndertimeRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchRequests = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) {
      router.replace("/ess/login");
      return;
    }
    setLoading(true);
    fetch("/api/ess/undertime", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setRequests(d?.data ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function computeMinutes() {
    return (parseInt(form.hours || "0") * 60) + parseInt(form.minutes || "0");
  }

  async function fileUndertime() {
    const undertimeMinutes = computeMinutes();
    if (!form.date || undertimeMinutes < 1 || form.reason.trim().length < 5) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/ess/undertime", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        undertimeMinutes,
        reason: form.reason.trim(),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to file undertime");
      return;
    }
    toast.success("Undertime request filed! Awaiting supervisor approval.");
    setSheetOpen(false);
    setForm(EMPTY_FORM);
    fetchRequests();
  }

  async function cancelRequest() {
    if (!cancelTarget) return;
    setCancelling(true);
    const res = await fetch(
      `/api/ess/undertime/${cancelTarget.id}/cancel`,
      { method: "POST", headers: authHeaders() },
    );
    const data = await res.json();
    setCancelling(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to cancel");
      setCancelTarget(null);
      return;
    }
    toast.success("Undertime request cancelled.");
    setCancelTarget(null);
    fetchRequests();
  }

  const totalMins = computeMinutes();
  const canSubmit =
    !!form.date && totalMins >= 1 && form.reason.trim().length >= 5;

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Undertime</h1>
          <p className="text-sm text-muted-foreground">
            File and track early departure requests
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(EMPTY_FORM);
            setSheetOpen(true);
          }}
        >
          + File Undertime
        </Button>
      </div>

      {/* Requests table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    No undertime requests yet
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {fmtDate(r.date)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtMinutes(r.undertimeMinutes)}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <div className="space-y-1">
                      <p className="text-sm truncate" title={r.reason}>
                        {r.reason}
                      </p>
                      {r.status === "REJECTED" && r.rejectionReason && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {r.rejectionReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(r)}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* File Undertime Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetOpen(false);
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>File Undertime Request</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="ut-date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ut-date"
                type="date"
                min={sevenDaysAgoIso()}
                max={todayIso()}
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Today or up to 7 days ago.
              </p>
            </div>
            <div className="space-y-1">
              <Label>
                Early Departure Duration <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="7"
                    placeholder="Hours"
                    value={form.hours}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hours: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">Hours</p>
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="Minutes"
                    value={form.minutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minutes: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">Minutes</p>
                </div>
              </div>
              {totalMins > 0 && (
                <p className="text-xs text-sky-600 font-medium">
                  Total: {fmtMinutes(totalMins)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ut-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ut-reason"
                rows={3}
                placeholder="e.g. Medical appointment, family emergency..."
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {form.reason.length}/2000 characters (min 5)
              </p>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={fileUndertime} disabled={saving || !canSubmit}>
              {saving ? "Submitting…" : "Submit Request"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Cancel Confirm Dialog */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Undertime Request</DialogTitle>
            <DialogDescription>
              Cancel your undertime request for{" "}
              <strong>{cancelTarget ? fmtDate(cancelTarget.date) : ""}</strong>{" "}
              ({cancelTarget ? fmtMinutes(cancelTarget.undertimeMinutes) : ""})?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={cancelRequest}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Yes, Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
