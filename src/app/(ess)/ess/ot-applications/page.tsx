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

// ─── Types ──────────────────────────────────────────────────────────────────

type OTStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface OTApplication {
  id: string;
  date: string;
  hours: number;
  justification: string;
  status: OTStatus;
  rejectionReason: string | null;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: OTStatus) {
  const variants: Record<OTStatus, string> = {
    PENDING: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "secondary",
  };
  return (
    <Badge variant={(variants[status] ?? "secondary") as never}>
      {status}
    </Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Today ISO string for max date attribute
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// 7 days ago ISO string for min date attribute
function sevenDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { date: "", hours: "1", justification: "" };

export default function EssOTPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<OTApplication[]>([]);
  const [loading, setLoading] = useState(true);

  // File OT sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Cancel confirm dialog
  const [cancelTarget, setCancelTarget] = useState<OTApplication | null>(null);
  const [cancelling, setCancelling] = useState(false);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchApplications = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) {
      router.replace("/ess/login");
      return;
    }
    setLoading(true);
    fetch("/api/ess/ot-applications", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setApplications(d?.data ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  async function fileOT() {
    if (!form.date || !form.hours || !form.justification.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    const body = {
      date: form.date,
      hours: parseFloat(form.hours),
      justification: form.justification.trim(),
    };
    const res = await fetch("/api/ess/ot-applications", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to file OT application");
      return;
    }
    toast.success("OT application filed! Awaiting manager approval.");
    setSheetOpen(false);
    setForm(EMPTY_FORM);
    fetchApplications();
  }

  async function cancelApplication() {
    if (!cancelTarget) return;
    setCancelling(true);
    const res = await fetch(
      `/api/ess/ot-applications/${cancelTarget.id}/cancel`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    const data = await res.json();
    setCancelling(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to cancel application");
      setCancelTarget(null);
      return;
    }
    toast.success("OT application cancelled.");
    setCancelTarget(null);
    fetchApplications();
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Overtime</h1>
          <p className="text-sm text-muted-foreground">
            File and track your OT requests
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(EMPTY_FORM);
            setSheetOpen(true);
          }}
        >
          + File OT
        </Button>
      </div>

      {/* Applications table */}
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
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Justification</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    No OT applications yet
                  </TableCell>
                </TableRow>
              )}
              {applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {fmtDate(app.date)}
                  </TableCell>
                  <TableCell className="text-right">{app.hours}h</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {statusBadge(app.status)}
                      {app.status === "REJECTED" && app.rejectionReason && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {app.rejectionReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <p className="text-sm truncate" title={app.justification}>
                      {app.justification}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    {app.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(app)}
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

      {/* File OT Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetOpen(false);
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>File OT Application</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="ot-date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ot-date"
                type="date"
                min={sevenDaysAgoIso()}
                max={todayIso()}
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Can only file OT for today or up to 7 days ago.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ot-hours">
                OT Hours <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ot-hours"
                type="number"
                min="0.5"
                max="16"
                step="0.5"
                placeholder="e.g. 2"
                value={form.hours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hours: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Enter in 0.5-hour increments (0.5–16).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ot-justification">
                Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ot-justification"
                rows={4}
                placeholder="Describe the work that required overtime..."
                value={form.justification}
                onChange={(e) =>
                  setForm((f) => ({ ...f, justification: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {form.justification.length}/2000 characters (min 5)
              </p>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={fileOT}
              disabled={
                saving ||
                !form.date ||
                !form.hours ||
                parseFloat(form.hours) <= 0 ||
                form.justification.trim().length < 5
              }
            >
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
            <DialogTitle>Cancel OT Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your OT application for{" "}
              <strong>
                {cancelTarget ? fmtDate(cancelTarget.date) : ""}
              </strong>{" "}
              ({cancelTarget?.hours}h)? This action cannot be undone.
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
              onClick={cancelApplication}
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
