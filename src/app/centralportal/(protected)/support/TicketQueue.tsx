"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "../components/cp";

export type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  createdAtMs: number;
  tenant: { id: string; name: string };
  agent: { id: string; firstName: string; lastName: string } | null;
};
type Agent = { id: string; name: string };

const PRIORITY_LABEL: Record<Ticket["priority"], string> = { URGENT: "Urgent", HIGH: "High", NORMAL: "Normal", LOW: "Low" };
const STATUSES: Ticket["status"][] = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];

function age(fromMs: number, nowMs: number): string {
  const h = Math.floor((nowMs - fromMs) / 3.6e6);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ctrlStyle: React.CSSProperties = {
  fontFamily: "var(--font)", fontSize: 12.5, height: 30, borderRadius: 8,
  border: "1px solid var(--line)", padding: "0 8px", background: "var(--paper)", color: "var(--ink)",
};

export function TicketQueue({ tickets: initial, agents, nowMs }: { tickets: Ticket[]; agents: Agent[]; nowMs: number }) {
  const [tickets, setTickets] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>, optimistic: Partial<Ticket>) {
    setBusy(id);
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, ...optimistic } : t)));
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Ticket updated");
    } catch {
      toast.error("Failed to update ticket");
    } finally {
      setBusy(null);
    }
  }

  if (tickets.length === 0) {
    return <div className="cp-empty">No tickets in the queue — every account is running smoothly.</div>;
  }

  return (
    <table className="cp-table">
      <thead>
        <tr><th>ID</th><th>Subject</th><th>Tenant</th><th>Priority</th><th>Agent</th><th>Status</th><th className="cp-num">Age</th></tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id} className="cp-row">
            <td><b className="cp-mono">{t.ticketNumber}</b></td>
            <td className="cp-subj">{t.subject}</td>
            <td className="cp-muted">{t.tenant.name}</td>
            <td><Badge tone={PRIORITY_LABEL[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></td>
            <td>
              <select
                style={ctrlStyle}
                disabled={busy === t.id}
                value={t.agent?.id ?? ""}
                onChange={(e) => {
                  const agentUserId = e.target.value || null;
                  const a = agents.find((x) => x.id === agentUserId);
                  patch(t.id, { agentUserId }, { agent: a ? { id: a.id, firstName: a.name.split(" ")[0] ?? a.name, lastName: a.name.split(" ").slice(1).join(" ") } : null });
                }}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </td>
            <td>
              <select
                style={ctrlStyle}
                disabled={busy === t.id}
                value={t.status}
                onChange={(e) => patch(t.id, { status: e.target.value }, { status: e.target.value as Ticket["status"] })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              </select>
            </td>
            <td className="cp-num cp-muted">{age(t.createdAtMs, nowMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
