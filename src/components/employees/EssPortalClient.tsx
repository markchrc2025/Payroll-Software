"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Mail, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getAvatarColor, getInitials } from "./columns";

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
  const [emailTarget, setEmailTarget] = useState<EssRow | null>(null);
  const [emailValue, setEmailValue] = useState("");
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

  function openEmailDialog(r: EssRow) {
    setEmailTarget(r);
    setEmailValue(r.workEmail ?? "");
  }

  async function confirmEmail() {
    if (!emailTarget) return;
    const email = emailValue.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    const okDone = await act(emailTarget.id, { action: "set_work_email", workEmail: email });
    setSubmitting(false);
    if (okDone) { setEmailTarget(null); setEmailValue(""); }
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
  const stats = {
    active: rows.filter((r) => r.essAccessStatus === "ACTIVE").length,
    invited: rows.filter((r) => r.essAccessStatus === "INVITED").length,
    notInvited: rows.filter((r) => r.essAccessStatus === "NOT_INVITED").length,
    disabled: rows.filter((r) => r.essAccessStatus === "DISABLED").length,
    noEmail: rows.filter((r) => !r.workEmail).length,
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active" value={stats.active} tone="text-emerald-600" />
        <StatCard label="Invited" value={stats.invited} tone="text-blue-600" />
        <StatCard label="Not invited" value={stats.notInvited} tone="text-foreground" />
        <StatCard label="Disabled" value={stats.disabled} tone="text-destructive" />
        <StatCard label="No work email" value={stats.noEmail} tone="text-amber-600" />
      </div>

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
      </div>

      {/* Table card — mirrors the Employees table chrome */}
      <div className="overflow-hidden rounded-[14px] border border-[#E8EBF1] bg-white shadow-[0_1px_2px_rgba(16,30,54,.06),0_1px_3px_rgba(16,30,54,.04)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Employee", "Work Email", "ESS Status", "Last Login"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-[#E8EBF1] bg-[#FBFCFE] px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.7px] text-[#8E9AAC]">
                    {h}
                  </th>
                ))}
                <th className="whitespace-nowrap border-b border-[#E8EBF1] bg-[#FBFCFE] px-4 py-3 text-right text-[10.5px] font-bold uppercase tracking-[0.7px] text-[#8E9AAC]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-[13.5px] text-[#8E9AAC]">No employees found.</td>
                </tr>
              ) : (
                rows.map((r) => {
                  const granted = r.essAccessStatus === "INVITED" || r.essAccessStatus === "ACTIVE";
                  const scheduled = granted && !!r.essDeactivateAt;
                  const busy = busyId === r.id;
                  const avatar = getAvatarColor(`${r.firstName}${r.lastName}`);
                  return (
                    <tr key={r.id} className="border-b border-[#E8EBF1] transition-colors last:border-b-0 hover:bg-[#F8F9FC]">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                            style={{ background: avatar.bg, color: avatar.color }}>
                            {getInitials(r.firstName, r.lastName)}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-semibold leading-tight text-[#0E1B2E]">{r.firstName} {r.lastName}</div>
                            <div className="text-[11.5px] text-[#8E9AAC]">{r.employeeNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.workEmail ? (
                          <button
                            type="button"
                            onClick={() => openEmailDialog(r)}
                            title="Edit work email"
                            className="group inline-flex items-center gap-1.5 text-left text-[13.5px] text-[#4A586B] hover:text-[#E8693A]"
                          >
                            <span>{r.workEmail}</span>
                            <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                          </button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy}
                            onClick={() => openEmailDialog(r)}>
                            <Mail className="h-3.5 w-3.5" /> Add work email
                          </Button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge row={r} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13.5px] text-[#4A586B]">{fmt(r.essLastLoginAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {!granted ? (
                            r.workEmail ? (
                              <>
                                <Button size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                  onClick={() => act(r.id, { action: "activate" })}>
                                  {r.essAccessStatus === "DISABLED" ? "Re-activate" : "Activate"}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                                  onClick={() => invite(r.id)}>
                                  Invite by email
                                </Button>
                              </>
                            ) : (
                              // Safeguard: ESS access requires a work email on file.
                              // Offer to add it right here instead of a dead end.
                              <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy}
                                onClick={() => openEmailDialog(r)}
                                title="A work email is required before ESS access can be enabled.">
                                <Mail className="h-3.5 w-3.5" /> Add work email
                              </Button>
                            )
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
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E8EBF1] px-4 py-3.5">
          <span className="text-[12.5px] text-[#8E9AAC]">
            Showing {rows.length === 0 ? 0 : 1}–{rows.length} of {rows.length}
          </span>
          <span className="text-[12.5px] text-[#8E9AAC]">
            {activeCount} of {rows.length} have ESS access
          </span>
        </div>
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

      {/* Work email dialog */}
      <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{emailTarget?.workEmail ? "Edit work email" : "Add work email"}</DialogTitle>
            <DialogDescription>
              {emailTarget ? `${emailTarget.firstName} ${emailTarget.lastName} (${emailTarget.employeeNumber}). ` : ""}
              This is saved to the employee&apos;s record and is where ESS invites,
              password resets and notifications are sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Work email</label>
            <Input
              type="email"
              autoComplete="off"
              placeholder="e.g. juan.delacruz@company.com"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !submitting) confirmEmail(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)}>Cancel</Button>
            <Button onClick={confirmEmail} disabled={submitting || !emailValue.trim()}>
              {submitting ? "Saving…" : "Save email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[14px] border border-[#E8EBF1] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,30,54,.06),0_1px_3px_rgba(16,30,54,.04)]">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[#8E9AAC]">{label}</div>
    </div>
  );
}
