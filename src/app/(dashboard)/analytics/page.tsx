"use client";

/**
 * /analytics — Workforce & Payroll Analytics
 *
 * Consumes the existing /api/analytics/* endpoints (all guarded by
 * REPORTS:READ and tenant-scoped):
 *   • payroll/summary   — gross / net / WHT totals for a month
 *   • payroll/trend     — 12-month net-pay series
 *   • payroll/headcount — active headcount, grouped by department
 *   • dtr/summary       — late / OT / absence totals for the month
 *   • employees/upcoming-events — birthdays / anniversaries (next 30 days)
 *
 * Charts are hand-rolled (CSS/SVG) to match the rest of the app — no charting
 * dependency is installed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Cake, Award, BadgeCheck, TrendingUp, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const INK = "#111827";
const MUTED = "#6B7A8D";
const ORANGE = "#E8693A";

// centavos (string|number) → "₱1,234.56"
function peso(cents: string | number): string {
  const n = Number(cents) / 100;
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// compact peso for axis/labels → "₱1.2M", "₱45K"
function pesoCompact(cents: string | number): string {
  const n = Number(cents) / 100;
  if (Math.abs(n) >= 1_000_000) return "₱" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "₱" + Math.round(n / 1_000) + "K";
  return "₱" + Math.round(n);
}
function minutesToHm(mins: number): string {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type SummaryTotals = { headcount: number; grossCents: string; netCents: string; whtCents: string };
type TrendMonth = { month: number; headcount: number; netCents: string; grossCents: string; whtCents: string };
type HeadGroup = { groupId: string; headcount: number };
type DtrTotals = { totalRecords: number; lateMinutes: number; otMinutes: number; absentCount: number };
type UpcomingEvent = {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  eventType: "birthday" | "regularization" | "workAnniversary";
  eventDate: string;
  yearsCompleting?: number;
};

const now = new Date();
const YEARS = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

export default function AnalyticsPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const [summary, setSummary] = useState<SummaryTotals | null>(null);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [headGroups, setHeadGroups] = useState<HeadGroup[]>([]);
  const [totalHeadcount, setTotalHeadcount] = useState(0);
  const [dtr, setDtr] = useState<DtrTotals | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);

    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    const periodStart = `${year}-${mm}-01`;
    const periodEnd = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

    try {
      const [sumRes, trendRes, headRes, dtrRes, evRes, deptRes] = await Promise.all([
        fetch(`/api/analytics/payroll/summary?year=${year}&month=${month}&groupBy=department`),
        fetch(`/api/analytics/payroll/trend?year=${year}`),
        fetch(`/api/analytics/payroll/headcount?year=${year}&month=${month}&groupBy=department`),
        fetch(`/api/analytics/dtr/summary?periodStart=${periodStart}&periodEnd=${periodEnd}&groupBy=department`),
        fetch(`/api/analytics/employees/upcoming-events?days=30`),
        fetch(`/api/departments`),
      ]);

      if (sumRes.status === 403) {
        setDenied(true);
        setLoading(false);
        return;
      }

      if (sumRes.ok) setSummary((await sumRes.json()).data.totals);
      if (trendRes.ok) setTrend((await trendRes.json()).data.months);
      if (headRes.ok) {
        const d = (await headRes.json()).data;
        setHeadGroups(d.groups);
        setTotalHeadcount(d.totalHeadcount);
      }
      if (dtrRes.ok) setDtr((await dtrRes.json()).data.totals);
      if (evRes.ok) setEvents((await evRes.json()).data.events);
      // Department names are best-effort: if the caller lacks access we just
      // fall back to showing the group id / "Unassigned".
      if (deptRes.ok) {
        const rows: Array<{ id: string; name: string }> = (await deptRes.json()).data;
        setDeptNames(Object.fromEntries(rows.map((r) => [r.id, r.name])));
      }
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const deptLabel = useCallback(
    (groupId: string) => (groupId === "unassigned" ? "Unassigned" : deptNames[groupId] ?? "—"),
    [deptNames],
  );

  const trendMax = useMemo(
    () => Math.max(1, ...trend.map((m) => Number(m.netCents))),
    [trend],
  );
  const headMax = useMemo(
    () => Math.max(1, ...headGroups.map((g) => g.headcount)),
    [headGroups],
  );
  const hasPayroll = useMemo(() => trend.some((m) => Number(m.netCents) > 0), [trend]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="space-y-6 pb-24">
        <Header />
        <div className="rounded-xl border border-[#E8EBF1] bg-white p-10 text-center shadow-sm">
          <p className="text-[14px] font-semibold text-[#111827]">No access to analytics</p>
          <p className="mt-1 text-[13px] text-[#6B7A8D]">
            Analytics requires the <span className="font-medium">Reports</span> permission. Ask an
            administrator to grant it on your role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header />
        <div className="flex items-center gap-2">
          <Select value={month} onChange={setMonth} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
          <Select value={year} onChange={setYear} options={YEARS.map((y) => ({ value: y, label: String(y) }))} />
          <button
            onClick={() => void load()}
            title="Refresh"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[#E8EBF1] bg-white text-[#6B7A8D] transition-colors hover:text-[#E8693A]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Gross Pay" value={peso(summary?.grossCents ?? 0)} caption={`${MONTHS_SHORT[month - 1]} ${year}`} accent />
        <Stat label="Net Pay" value={peso(summary?.netCents ?? 0)} caption={`${MONTHS_SHORT[month - 1]} ${year}`} accent />
        <Stat label="Withholding Tax" value={peso(summary?.whtCents ?? 0)} caption={`${MONTHS_SHORT[month - 1]} ${year}`} />
        <Stat label="Headcount" value={String(totalHeadcount)} caption="active employees" />
        <Stat label="Late" value={minutesToHm(dtr?.lateMinutes ?? 0)} caption="total this month" />
        <Stat label="Absences" value={String(dtr?.absentCount ?? 0)} caption="days this month" />
      </div>

      {/* Net pay trend */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: ORANGE }} />
          <p className="text-[14px] font-semibold" style={{ color: INK }}>Net Pay Trend — {year}</p>
        </div>
        {hasPayroll ? (
          <div className="flex h-52 items-end gap-1.5">
            {trend.map((m) => {
              const v = Number(m.netCents);
              const h = (v / trendMax) * 100;
              const isSel = m.month === month;
              return (
                <div key={m.month} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100" style={{ color: MUTED }}>
                    {v > 0 ? pesoCompact(m.netCents) : ""}
                  </div>
                  <div
                    className="w-full rounded-t-[5px] transition-all"
                    style={{
                      height: `${Math.max(h, v > 0 ? 2 : 0)}%`,
                      minHeight: v > 0 ? 4 : 0,
                      background: isSel ? ORANGE : "#F1C9B6",
                    }}
                  />
                  <div className="text-[10.5px] font-medium" style={{ color: isSel ? ORANGE : MUTED }}>
                    {MONTHS_SHORT[m.month - 1]}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text={`No finalized payroll runs in ${year} yet.`} />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Headcount by department */}
        <Card>
          <p className="mb-4 text-[14px] font-semibold" style={{ color: INK }}>Headcount by Department</p>
          {headGroups.length > 0 ? (
            <div className="space-y-3">
              {headGroups.map((g) => (
                <div key={g.groupId}>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span style={{ color: INK }}>{deptLabel(g.groupId)}</span>
                    <span className="font-semibold" style={{ color: MUTED }}>{g.headcount}</span>
                  </div>
                  <div className="h-2 w-full rounded-full" style={{ background: "#F3F4F6" }}>
                    <div className="h-2 rounded-full" style={{ width: `${(g.headcount / headMax) * 100}%`, background: ORANGE }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No active employees." />
          )}
        </Card>

        {/* Upcoming events */}
        <Card>
          <p className="mb-4 text-[14px] font-semibold" style={{ color: INK }}>Upcoming Events — next 30 days</p>
          {events.length > 0 ? (
            <div className="space-y-2.5">
              {events.slice(0, 8).map((e, i) => (
                <EventRow key={`${e.employeeId}-${e.eventType}-${i}`} ev={e} />
              ))}
              {events.length > 8 && (
                <p className="pt-1 text-[12px]" style={{ color: MUTED }}>+{events.length - 8} more</p>
              )}
            </div>
          ) : (
            <Empty text="No birthdays or anniversaries coming up." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-[18px] font-bold" style={{ color: INK }}>Analytics</h1>
      <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
        Workforce and payroll trends across your organization. Payroll figures reflect finalized runs only.
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[#E8EBF1] bg-white p-5 shadow-sm">{children}</div>;
}

function Stat({ label, value, caption, accent }: { label: string; value: string; caption: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E8EBF1] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1.5 truncate text-[19px] font-bold" style={{ color: accent ? ORANGE : INK }} title={value}>{value}</p>
      <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>{caption}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-[13px]" style={{ color: MUTED }}>{text}</p>;
}

function Select<T extends number>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as T)}
      className="h-[38px] rounded-lg border border-[#E8EBF1] bg-white px-3 text-[13px] font-medium outline-none focus:border-[#E8693A]"
      style={{ color: INK }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function EventRow({ ev }: { ev: UpcomingEvent }) {
  const cfg = {
    birthday: { icon: Cake, label: "Birthday", color: "#E8693A" },
    workAnniversary: { icon: Award, label: "Work anniversary", color: "#3e63a0" },
    regularization: { icon: BadgeCheck, label: "Regularization", color: "#4f9373" },
  }[ev.eventType];
  const Icon = cfg.icon;
  const d = new Date(ev.eventDate + "T00:00:00");
  const dateStr = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  const years = ev.yearsCompleting
    ? ev.eventType === "birthday"
      ? `turns ${ev.yearsCompleting}`
      : `${ev.yearsCompleting} yr${ev.yearsCompleting > 1 ? "s" : ""}`
    : "";
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg" style={{ background: `${cfg.color}1a`, color: cfg.color }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" style={{ color: INK }}>{ev.firstName} {ev.lastName}</p>
        <p className="text-[11.5px]" style={{ color: MUTED }}>{cfg.label}{years ? ` · ${years}` : ""}</p>
      </div>
      <span className="flex-none text-[12px] font-semibold" style={{ color: MUTED }}>{dateStr}</span>
    </div>
  );
}
