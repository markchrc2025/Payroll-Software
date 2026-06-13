"use client";

import { useRouter } from "next/navigation";
import { Badge, PlanBadge, HealthBar, CpIcon, STATUS_LABEL } from "./cp";
import { peso } from "@/lib/central/metrics";

export type TenantRow = {
  id: string;
  name: string;
  slug: string | null;
  tier: string;
  status: string;
  employees: number;
  mrr: number;
  health: number;
  since: string; // ISO date
};

function fmtSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function TenantTable({ rows, compact = false }: { rows: TenantRow[]; compact?: boolean }) {
  const router = useRouter();
  if (rows.length === 0) {
    return <div className="cp-empty">No tenants match those filters.</div>;
  }
  return (
    <table className="cp-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Plan</th>
          <th className="cp-num">Employees</th>
          <th>Status</th>
          <th className="cp-num">MRR</th>
          {!compact && <th>Health</th>}
          <th>Since</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr
            key={t.id}
            className="cp-row cp-row-click"
            onClick={() => router.push(`/centralportal/tenants/${t.id}`)}
          >
            <td>
              <div className="cp-co">
                <span className="cp-co-logo">{t.name.charAt(0).toUpperCase()}</span>
                <div>
                  <b>{t.name}</b>
                  {t.slug && <i>{t.slug}</i>}
                </div>
              </div>
            </td>
            <td><PlanBadge tier={t.tier} /></td>
            <td className="cp-num">{t.employees.toLocaleString("en-PH")}</td>
            <td><Badge tone={STATUS_LABEL[t.status]}>{STATUS_LABEL[t.status] ?? t.status}</Badge></td>
            <td className="cp-num">{t.mrr ? peso(t.mrr) : "—"}</td>
            {!compact && <td><HealthBar value={t.health} /></td>}
            <td className="cp-muted">{fmtSince(t.since)}</td>
            <td className="cp-chev"><CpIcon name="chevR" size={16} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
