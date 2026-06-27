"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type EssRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  employmentStatus: string;
  essAccessStatus: "NOT_INVITED" | "INVITED" | "ACTIVE" | "DISABLED";
  essInvitedAt: string | null;
  essActivatedAt: string | null;
  essLastLoginAt: string | null;
  essDeactivateAt: string | null;
  essDeactivateReason: string | null;
  hasEssPin: boolean;
};

const STATUS_OPTIONS = [
  { value: "NOT_INVITED", label: "Not invited" },
  { value: "INVITED", label: "Invited" },
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { dateStyle: "medium" });
}

function StatusBadge({ row }: { row: EssRow }) {
  // A still-granted employee with a deactivation date set has a pending future
  // schedule — past ones are flipped to DISABLED by the sweep + auth gate.
  const scheduled = row.essAccessStatus !== "DISABLED" && !!row.essDeactivateAt;
  switch (row.essAccessStatus) {
    case "ACTIVE":
      return (
        <div className="flex flex-col">
          <Badge className="w-fit bg-emerald-600 hover:bg-emerald-600">Active</Badge>
          {scheduled && (
            <span className="mt-1 text-[11px] font-medium text-amber-600" title={row.essDeactivateReason ?? ""}>
              deactivates {fmtDate(row.essDeactivateAt)}
            </span>
          )}
        </div>
      );
    case "INVITED":
      return (
        <div className="flex flex-col">
          <Badge variant="outline" className="w-fit">Invited</Badge>
          {scheduled && (
            <span className="mt-1 text-[11px] font-medium text-amber-600" title={row.essDeactivateReason ?? ""}>
              deactivates {fmtDate(row.essDeactivateAt)}
            </span>
          )}
        </div>
      );
    case "DISABLED":
      return <Badge variant="destructive" className="w-fit" title={row.essDeactivateReason ?? ""}>Disabled</Badge>;
    default:
      return <Badge variant="secondary" className="w-fit">Not invited</Badge>;
  }
}

export function EssPortalClient({ initial }: { initial: EssRow[] }) {
  const [rows, setRows] = useState<EssRow[]>(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [disableTarget, setDisableTarget] = useState<EssRow | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [scheduleTarget, setScheduleTarget] = useState<EssRow | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/employees/ess?${params}`);
    const json = await res.json().catch(() => null);
    if (res.ok) setRows(json?.data ?? []);
    setLoading(false);
  }, [search, statusFilter]);

  async function act(id: string, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/employees/${id}/ess-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "Action failed");
        return false;
      }
      toast.success(json?.message ?? "Done");
      await reload();
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function invite(id: string): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/employees/${id}/ess-invite`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.error ?? "Could not send invitation"); return; }
      toast.success(json?.message ?? "Invitation sent");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    if (!disableReason.trim()) { toast.error("A reason is required."); return; }
    setSubmitting(true);
    const okDone = await act(disableTarget.id, { action: "disable", reason: disableReason.trim() });
    setSubmitting(false);
    if (okDone) { setDisableTarget(null); setDisableReason(""); }
  }

  async function confirmSchedule() {
    if (!scheduleTarget) return;
    if (!scheduleAt) { toast.error("Pick a date and time."); return; }
    if (!scheduleReason.trim()) { toast.error("A reason is required."); return; }
    setSubmitting(true);
    const okDone = await act(scheduleTarget.id, { action: "schedule", deactivateAt: scheduleAt, reason: scheduleReason.trim() });
    setSubmitting(false);
    if (okDone) { setScheduleTarget(null); setScheduleAt(""); setScheduleReason(""); }
  }

  const activeCount = rows.filter((r) => r.essAccessStatus === "ACTIVE" || r.essAccessStatus === "INVITED").length;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name or ID…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reload()}
        />
        <Select value={statusFilter || "all"} onValueChange={(v) => { const val = v ?? "all"; setStatusFilter(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {activeCount} of {rows.length} have ESS access
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Work Email</TableHead>
              <TableHead>ESS Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No employees found.</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const granted = r.essAccessStatus === "INVITED" || r.essAccessStatus === "ACTIVE";
                const scheduled = granted && !!r.essDeactivateAt;
                const busy = busyId === r.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.lastName}, {r.firstName}</div>
                      <div className="text-xs text-muted-foreground">{r.employeeNumber}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.workEmail || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><StatusBadge row={r} /></TableCell>
                    <TableCell className="text-sm">{fmt(r.essLastLoginAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {!granted ? (
                          <>
                            <Button size="sm" className="h-7 px-2 text-xs" disabled={busy}
                              onClick={() => act(r.id, { action: "activate" })}>
                              {r.essAccessStatus === "DISABLED" ? "Re-activate" : "Activate"}
                            </Button>
                            {r.workEmail && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                onClick={() => invite(r.id)}>
                                Invite by email
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            {r.essAccessStatus === "INVITED" && r.workEmail && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                onClick={() => invite(r.id)}>
                                Resend invite
                              </Button>
                            )}
                            {scheduled ? (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                onClick={() => act(r.id, { action: "cancel_schedule" })}>
                                Cancel schedule
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                onClick={() => { setScheduleTarget(r); setScheduleAt(""); setScheduleReason(""); }}>
                                Schedule deactivation
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" disabled={busy}
                              onClick={() => { setDisableTarget(r); setDisableReason(""); }}>
                              Disable
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Disable dialog */}
      <Dialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable ESS access</DialogTitle>
            <DialogDescription>
              {disableTarget ? `${disableTarget.firstName} ${disableTarget.lastName} (${disableTarget.employeeNumber}) ` : ""}
              will be signed out and blocked from the ESS portal immediately. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Reason (e.g. end of contract, security)" value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={submitting || !disableReason.trim()}>
              {submitting ? "Disabling…" : "Disable access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={!!scheduleTarget} onOpenChange={(o) => !o && setScheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule ESS deactivation</DialogTitle>
            <DialogDescription>
              {scheduleTarget ? `${scheduleTarget.firstName} ${scheduleTarget.lastName} (${scheduleTarget.employeeNumber}) ` : ""}
              will keep access until the date below, then be automatically disabled. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deactivate on</label>
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason</label>
              <Textarea rows={3} placeholder="Reason (e.g. last working day, resignation effective date)"
                value={scheduleReason} onChange={(e) => setScheduleReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleTarget(null)}>Cancel</Button>
            <Button onClick={confirmSchedule} disabled={submitting || !scheduleAt || !scheduleReason.trim()}>
              {submitting ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
