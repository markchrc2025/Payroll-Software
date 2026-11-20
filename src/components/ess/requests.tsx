"use client";

/**
 * PAY-191: the employee's requests in one list on the ESS home screen, the
 * pattern of the Frappe HR mobile app (Mark, 18 Nov 2026): one card per request
 * (type, dates, status) that opens a bottom sheet with the details. Written for
 * Sentire from the pattern, not from Frappe's code (Frappe HR is GPL-3).
 *
 * Reads the employee's own leave, overtime, undertime and expense claims from
 * the existing ESS list endpoints.
 *
 * PAY-191 part 2: an employee named as an approver in the company's approval
 * workflow also gets a Team requests tab: the leave, overtime and undertime
 * waiting for them, each with Approve and Reject in its bottom sheet.
 */

import { useEffect, useMemo, useState } from "react";
import { EIcon, type EIconName } from "./icons";
import { EStatus } from "./primitives";
import { useEssData } from "./use-ess-data";
import { centsToPeso, essFetch, type ApiList, type LeaveTxn } from "./api";

interface OtRow { id: string; date: string; hours: string; justification: string; status: string; rejectionReason: string | null; createdAt: string }
interface UtRow { id: string; date: string; undertimeMinutes: number; reason: string; status: string; rejectionReason: string | null; createdAt: string }
interface ClaimRow { id: string; claimDate: string; category: string; description: string; amountCents: string; status: string; createdAt: string }

export interface RequestItem {
  key: string;
  icon: EIconName;
  title: string;
  sub: string;
  status: string;
  createdAt: string;
  fields: [string, string][];
}

const dateFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

/** The status label shown on a card ("Pending", "Approved", ...). */
export function statusLabel(raw: string): string {
  const map: Record<string, string> = {
    PENDING: "Pending", SUBMITTED: "Pending", APPROVED: "Approved", REJECTED: "Rejected",
    CANCELLED: "Cancelled", PAID: "Paid", DRAFT: "Draft", ATTACHED: "Approved",
  };
  return map[raw] ?? titleCase(raw);
}

/** Every request as one card, newest first. */
export function toRequestItems(
  leaves: LeaveTxn[], ots: OtRow[], uts: UtRow[], claims: ClaimRow[],
): RequestItem[] {
  const items: RequestItem[] = [
    ...leaves
      .filter((l) => l.type === "USAGE")
      .map((l) => {
        const range = l.startDate && l.endDate && l.startDate !== l.endDate
          ? `${dateFmt(l.startDate)} to ${dateFmt(l.endDate)}`
          : dateFmt(l.startDate);
        const unit = l.leaveType.unit === "HOURS" ? "h" : "d";
        return {
          key: `leave-${l.id}`, icon: "leave" as const, title: l.leaveType.name,
          sub: `${range} · ${l.amount}${unit}`, status: statusLabel(l.approvalStatus), createdAt: l.createdAt,
          fields: [["Type", l.leaveType.name], ["Dates", range], ["Length", `${l.amount} ${l.leaveType.unit === "HOURS" ? "hour(s)" : "day(s)"}`], ["Reason", l.reason || "—"], ["Status", statusLabel(l.approvalStatus)]] as [string, string][],
        };
      }),
    ...ots.map((o) => ({
      key: `ot-${o.id}`, icon: "clock" as const, title: "Overtime",
      sub: `${dateFmt(o.date)} · ${Number(o.hours)}h`, status: statusLabel(o.status), createdAt: o.createdAt,
      fields: [["Date", dateFmt(o.date)], ["Hours", String(Number(o.hours))], ["Reason", o.justification], ["Status", statusLabel(o.status)],
        ...(o.rejectionReason ? [["Why rejected", o.rejectionReason] as [string, string]] : [])] as [string, string][],
    })),
    ...uts.map((u) => ({
      key: `ut-${u.id}`, icon: "clock" as const, title: "Undertime",
      sub: `${dateFmt(u.date)} · ${u.undertimeMinutes} min`, status: statusLabel(u.status), createdAt: u.createdAt,
      fields: [["Date", dateFmt(u.date)], ["Minutes", String(u.undertimeMinutes)], ["Reason", u.reason], ["Status", statusLabel(u.status)],
        ...(u.rejectionReason ? [["Why rejected", u.rejectionReason] as [string, string]] : [])] as [string, string][],
    })),
    ...claims.map((c) => ({
      key: `claim-${c.id}`, icon: "wallet" as const, title: `Expense: ${titleCase(c.category)}`,
      sub: `${dateFmt(c.claimDate)} · ${centsToPeso(c.amountCents)}`, status: statusLabel(c.status), createdAt: c.createdAt,
      fields: [["Category", titleCase(c.category)], ["Date", dateFmt(c.claimDate)], ["Amount", centsToPeso(c.amountCents)], ["Description", c.description], ["Status", statusLabel(c.status)]] as [string, string][],
    })),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A request waiting for the signed-in employee as an approver (GET /api/ess/team-requests). */
export interface TeamRow {
  stepId: string;
  module: "LEAVE" | "OT" | "UNDERTIME";
  entityId: string;
  employee: { id: string; name: string; employeeNumber: string };
  title: string;
  date: string;
  endDate: string | null;
  amount: string;
  reason: string;
  stepIndex: number;
  steps: number;
  filedAt: string;
}

export interface TeamItem extends RequestItem { stepId: string }

/** Team requests as cards: who, what, when; oldest first, as the API sends them. */
export function toTeamItems(rows: TeamRow[]): TeamItem[] {
  return rows.map((r) => {
    const when = r.endDate && r.endDate !== r.date ? `${dateFmt(r.date)} to ${dateFmt(r.endDate)}` : dateFmt(r.date);
    const icon: EIconName = r.module === "LEAVE" ? "leave" : "clock";
    return {
      key: `team-${r.stepId}`, stepId: r.stepId, icon, title: `${r.employee.name} · ${r.title}`,
      sub: `${when} · ${r.amount}`, status: "Pending", createdAt: r.filedAt,
      fields: [
        ["Employee", `${r.employee.name} (${r.employee.employeeNumber})`], ["Request", r.title], ["Date", when],
        ["Length", r.amount], ["Reason", r.reason || "—"],
        ...(r.steps > 1 ? [["Approval", `Step ${r.stepIndex + 1} of ${r.steps}`] as [string, string]] : []),
      ] as [string, string][],
    };
  });
}

/** A card per request; tapping one opens its bottom sheet. */
export function RequestsPanel({ limit = 8 }: { limit?: number }) {
  const leaves = useEssData<ApiList<LeaveTxn>>("/api/ess/leaves?limit=20");
  const ots = useEssData<ApiList<OtRow>>("/api/ess/ot-applications?limit=20");
  const uts = useEssData<ApiList<UtRow>>("/api/ess/undertime?limit=20");
  const claims = useEssData<ApiList<ClaimRow>>("/api/ess/expense-claims?limit=20");
  const [open, setOpen] = useState<RequestItem | null>(null);

  const items = useMemo(
    () => toRequestItems(leaves.data?.data ?? [], ots.data?.data ?? [], uts.data?.data ?? [], claims.data?.data ?? []).slice(0, limit),
    [leaves.data, ots.data, uts.data, claims.data, limit],
  );
  const loading = leaves.loading || ots.loading || uts.loading || claims.loading;
  const [teamNonce, setTeamNonce] = useState(0);
  const team = useEssData<{ data: TeamRow[] }>(`/api/ess/team-requests?n=${teamNonce}`);
  const teamItems = useMemo(() => toTeamItems(team.data?.data ?? []), [team.data]);
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [openTeam, setOpenTeam] = useState<TeamItem | null>(null);
  const showTeam = teamItems.length > 0;

  return (
    <div className="e-reqpanel">
      <div className="e-reqtabs" role="tablist" aria-label="Requests">
        <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-on" : undefined} onClick={() => setTab("mine")}>My requests</button>
        {showTeam && (
          <button role="tab" aria-selected={tab === "team"} className={tab === "team" ? "is-on" : undefined} onClick={() => setTab("team")}>
            Team requests ({teamItems.length})
          </button>
        )}
      </div>
      {tab === "team" && showTeam ? (
        <div className="e-reqlist">
          {teamItems.map((it) => (
            <button key={it.key} className="e-req" onClick={() => setOpenTeam(it)}>
              <span className="e-req-ic"><EIcon name={it.icon} size={18} /></span>
              <span className="e-req-t">
                <b>{it.title}</b>
                <i>{it.sub}</i>
              </span>
              <EStatus>{it.status}</EStatus>
              <EIcon name="chevR" size={16} />
            </button>
          ))}
        </div>
      ) : loading && items.length === 0 ? (
        <p className="e-empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="e-empty">No requests yet.</p>
      ) : (
        <div className="e-reqlist">
          {items.map((it) => (
            <button key={it.key} className="e-req" onClick={() => setOpen(it)}>
              <span className="e-req-ic"><EIcon name={it.icon} size={18} /></span>
              <span className="e-req-t">
                <b>{it.title}</b>
                <i>{it.sub}</i>
              </span>
              <EStatus>{it.status}</EStatus>
              <EIcon name="chevR" size={16} />
            </button>
          ))}
        </div>
      )}
      {open && <RequestSheet item={open} onClose={() => setOpen(null)} />}
      {openTeam && (
        <RequestSheet
          item={openTeam}
          onClose={() => setOpenTeam(null)}
          actions={
            <TeamDecision
              stepId={openTeam.stepId}
              onDone={() => {
                setOpenTeam(null);
                setTeamNonce((n) => n + 1);
                if (teamItems.length <= 1) setTab("mine");
              }}
            />
          }
        />
      )}
    </div>
  );
}

/** Approve, or reject with a reason, a team request (POST /api/ess/team-requests/[stepId]). */
export function TeamDecision({ stepId, onDone }: { stepId: string; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setError("");
    try {
      await essFetch(`/api/ess/team-requests/${stepId}`, {
        method: "POST",
        body: JSON.stringify({ decision, note: decision === "REJECT" ? reason : undefined }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="e-sheet-actions">
      {error && <p role="alert" className="e-sheet-err">{error}</p>}
      {rejecting ? (
        <>
          <textarea
            aria-label="Reason for rejecting"
            className="e-sheet-reason"
            rows={3}
            placeholder="Why is this rejected?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="e-sheet-btns">
            <button className="e-btn e-btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>Back</button>
            <button className="e-btn e-btn-danger" disabled={busy || reason.trim() === ""} onClick={() => decide("REJECT")}>
              {busy ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </>
      ) : (
        <div className="e-sheet-btns">
          <button className="e-btn e-btn-ghost" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
          <button className="e-btn e-btn-primary" disabled={busy} onClick={() => decide("APPROVE")}>
            {busy ? "Approving…" : "Approve"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Bottom sheet with one request's details. */
export function RequestSheet({ item, onClose, actions }: { item: RequestItem; onClose: () => void; actions?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="e-sheet-ov" onClick={onClose}>
      <div className="e-sheet" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <span className="e-sheet-grip" aria-hidden="true" />
        <h3 className="e-sheet-h">{item.title}</h3>
        <dl className="e-sheet-dl">
          {item.fields.map(([k, v]) => (
            <div key={k} className={v.length > 40 ? "is-long" : undefined}>
              <dt>{k}</dt>
              <dd>{k === "Status" ? <EStatus>{v}</EStatus> : v}</dd>
            </div>
          ))}
        </dl>
        {actions}
        <button className="e-sheet-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Quick links: a plain list of the things an employee files most. */
export interface QuickLink { icon: EIconName; label: string; onClick: () => void }
export function QuickLinks({ items }: { items: QuickLink[] }) {
  return (
    <div className="e-links">
      {items.map((l) => (
        <button key={l.label} className="e-link" onClick={l.onClick}>
          <EIcon name={l.icon} size={18} />
          <span>{l.label}</span>
          <EIcon name="chevR" size={16} />
        </button>
      ))}
    </div>
  );
}
