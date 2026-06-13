"use client";

import { useMemo, useState } from "react";
import { CpIcon } from "../components/cp";

export type AuditEvent = {
  id: string;
  who: string;
  action: string;
  target: string;
  time: string;
  timeMs: number;
  ip: string;
  kind: "security" | "billing" | "tenant" | "system";
};

const TYPES = ["All event types", "Security", "Billing", "Tenant", "System"];
const RANGES = ["Last 7 days", "Last 30 days", "All time"];

export function AuditFeed({ events, nowMs }: { events: AuditEvent[]; nowMs: number }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("All event types");
  const [range, setRange] = useState("Last 30 days");

  const filtered = useMemo(() => {
    const windowMs = range === "Last 7 days" ? 7 * 864e5 : range === "Last 30 days" ? 30 * 864e5 : Infinity;
    const ql = q.toLowerCase();
    return events.filter((e) => {
      if (type !== "All event types" && e.kind !== type.toLowerCase()) return false;
      if (windowMs !== Infinity && nowMs - e.timeMs > windowMs) return false;
      if (ql && !`${e.who} ${e.action} ${e.target}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [events, q, type, range, nowMs]);

  return (
    <section className="cp-card">
      <div className="cp-filters">
        <label className="cp-field">
          <CpIcon name="search" size={16} />
          <input placeholder="Search actions, admins, tenants…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="cp-empty">No audit events match those filters.</div>
      ) : (
        <ul className="cp-feed">
          {filtered.map((e) => (
            <li key={e.id}>
              <span className="cp-feed-dot" data-t={feedTone(e.kind)} />
              <div className="cp-feed-body">
                <p><b>{e.who}</b> {e.action} <b>{e.target}</b></p>
                <i>{e.time} · {e.ip}</i>
              </div>
              <span className="cp-feed-kind" data-t={feedTone(e.kind)}>{e.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function feedTone(kind: AuditEvent["kind"]): string {
  return kind === "security" ? "red" : kind === "billing" ? "orange" : kind === "tenant" ? "blue" : "slate";
}
