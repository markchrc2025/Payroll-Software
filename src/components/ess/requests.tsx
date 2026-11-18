"use client";

/**
 * PAY-191: the employee's requests in one list on the ESS home screen, the
 * pattern of the Frappe HR mobile app (Mark, 18 Nov 2026): one card per request
 * (type, dates, status) that opens a bottom sheet with the details. Written for
 * Sentire from the pattern, not from Frappe's code (Frappe HR is GPL-3).
 *
 * Reads the employee's own leave, overtime, undertime and expense claims from
 * the existing ESS list endpoints. Team requests (for approvers) are a later
 * step: ESS has no approver endpoints yet, so no Team tab is shown.
 */

import { useEffect, useMemo, useState } from "react";
import { EIcon, type EIconName } from "./icons";
import { EStatus } from "./primitives";
import { useEssData } from "./use-ess-data";
import { centsToPeso, type ApiList, type LeaveTxn } from "./api";

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

  return (
    <div className="e-reqpanel">
      <div className="e-reqtabs" role="tablist" aria-label="Requests">
        <button role="tab" aria-selected="true" className="is-on">My requests</button>
      </div>
      {loading && items.length === 0 ? (
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
    </div>
  );
}

/** Bottom sheet with one request's details. */
export function RequestSheet({ item, onClose }: { item: RequestItem; onClose: () => void }) {
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
