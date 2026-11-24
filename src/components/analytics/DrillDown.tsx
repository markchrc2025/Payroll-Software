"use client";

/**
 * PAY-219 (Mark, 25 Nov 2026): drill-down analytics on /analytics.
 * Page-wide filters (period range, branch, department, employment type), one
 * tab per topic, and rows you click: department, then employee, then that
 * employee's payslips or attendance days. The engine is src/lib/analytics/drill.ts.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Kind = "money" | "count" | "days" | "minutes" | "pct";
type Column = { key: string; label: string; kind: Kind };
type Value = string | number | null;
type Row = { id: string; name: string; sub?: string; values: Record<string, Value> };
type DetailRow = { id: string; label: string; sub?: string; href?: string; values: Record<string, Value> };
type Detail = { kind: string; columns: Column[]; rows: DetailRow[] };
type Result = {
  topic: string; level: "company" | "department" | "employee"; window: { start: string; end: string };
  columns: Column[]; totals: Record<string, Value>; rows: Row[]; detail?: Detail; detail2?: Detail;
};
type Option = { id: string; name: string };

export const DRILL_TOPICS: { key: string; label: string }[] = [
  { key: "payroll", label: "Payroll cost" },
  { key: "statutory", label: "Contributions and tax" },
  { key: "overtime", label: "Overtime" },
  { key: "attendance", label: "Lates, absences and undertime" },
  { key: "leave", label: "Leave" },
  { key: "headcount", label: "Hires and separations" },
  { key: "thirteenth", label: "13th month accrual" },
];

const EMPLOYMENT_TYPES = [
  { id: "FULL_TIME", name: "Full time" },
  { id: "PART_TIME", name: "Part time" },
  { id: "CASUAL", name: "Casual" },
];

export function formatValue(v: Value, kind: Kind): string {
  if (v === null || v === undefined) return "";
  if (kind === "money") {
    const n = BigInt(String(v));
    const neg = n < 0n;
    const a = neg ? -n : n;
    const whole = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg ? "-" : ""}₱${whole}.${(a % 100n).toString().padStart(2, "0")}`;
  }
  if (kind === "minutes") {
    const m = Number(v);
    if (!m) return "0h";
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  }
  if (kind === "pct") return `${Number(v).toFixed(1)}%`;
  return Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const janOf = (ym: string) => `${ym.slice(0, 4)}-01`;

export function DrillDown() {
  const [topic, setTopic] = useState("payroll");
  const [from, setFrom] = useState(janOf(thisMonth()));
  const [to, setTo] = useState(thisMonth());
  const [branchId, setBranchId] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [dept, setDept] = useState<Option | null>(null);
  const [emp, setEmp] = useState<Option | null>(null);
  const [branches, setBranches] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [b, d] = await Promise.all([fetch("/api/branches"), fetch("/api/departments")]);
      if (b.ok) setBranches(((await b.json()).data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      if (d.ok) setDepartments(((await d.json()).data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ topic, from, to });
    if (branchId) q.set("branchId", branchId);
    if (employmentType) q.set("employmentType", employmentType);
    if (dept) q.set("departmentId", dept.id);
    if (emp) q.set("employeeId", emp.id);
    const res = await fetch(`/api/analytics/drill?${q}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setData(null); setError(json.error ?? "Could not load the figures"); return; }
    setData(json.data);
  }, [topic, from, to, branchId, employmentType, dept, emp]);
  useEffect(() => { void load(); }, [load]);

  const open = (r: Row) => {
    if (!data) return;
    if (data.level === "company") setDept({ id: r.id, name: r.name });
    else if (data.level === "department") setEmp({ id: r.id, name: r.name });
  };

  const sel = "h-8 rounded-[8px] border border-[#E8E8E8] bg-white px-2 text-[13px]";
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-5 space-y-4 text-[13px]" data-testid="analytics-drill">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <p className="text-[14px] font-semibold text-[var(--ink)]">Explore</p>
          <p className="text-[#6B6B6B]">Click a department to see its employees, then an employee to see the payslips or days behind the figures.</p>
        </div>
        <label className="space-y-1"><span className="block text-[12px] text-[#6B6B6B]">From</span>
          <input type="month" className={sel} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="space-y-1"><span className="block text-[12px] text-[#6B6B6B]">To</span>
          <input type="month" className={sel} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label className="space-y-1"><span className="block text-[12px] text-[#6B6B6B]">Branch</span>
          <select className={sel} value={branchId} onChange={(e) => { setBranchId(e.target.value); setEmp(null); }} data-testid="drill-branch">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        <label className="space-y-1"><span className="block text-[12px] text-[#6B6B6B]">Department</span>
          <select className={sel} value={dept?.id ?? ""} onChange={(e) => {
            const id = e.target.value;
            setDept(id ? { id, name: id === "none" ? "No department" : departments.find((d) => d.id === id)?.name ?? "" } : null);
            setEmp(null);
          }} data-testid="drill-department">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="none">No department</option>
          </select></label>
        <label className="space-y-1"><span className="block text-[12px] text-[#6B6B6B]">Employment type</span>
          <select className={sel} value={employmentType} onChange={(e) => { setEmploymentType(e.target.value); setEmp(null); }}>
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#E8E8E8]">
        {DRILL_TOPICS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === topic} data-testid={`drill-topic-${t.key}`}
            onClick={() => setTopic(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 ${t.key === topic ? "border-[var(--ink)] text-[var(--ink)] font-medium" : "border-transparent text-[#6B6B6B] hover:text-[var(--ink)]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <nav className="flex items-center gap-1 text-[#6B6B6B]" aria-label="Drill path">
        <button className={dept ? "hover:text-[var(--ink)]" : "text-[var(--ink)] font-medium"} onClick={() => { setDept(null); setEmp(null); }}>All departments</button>
        {dept && <><ChevronRight className="h-3.5 w-3.5" />
          <button className={emp ? "hover:text-[var(--ink)]" : "text-[var(--ink)] font-medium"} onClick={() => setEmp(null)}>{dept.name}</button></>}
        {emp && <><ChevronRight className="h-3.5 w-3.5" /><span className="text-[var(--ink)] font-medium">{emp.name}</span></>}
        {data && <span className="ml-auto text-[12px]">{data.window.start} to {data.window.end}</span>}
      </nav>

      {error ? (
        <p className="rounded-lg bg-[#FFF4EF] p-4 text-[#9A3412]" data-testid="drill-error">{error}</p>
      ) : !data ? (
        <p className="text-[#6B6B6B]">{loading ? "Loading" : ""}</p>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" data-testid="drill-totals">
            {data.columns.map((c) => (
              <div key={c.key} className="rounded-lg border border-[#E8E8E8] p-3">
                <p className="text-[12px] text-[#6B6B6B]">{c.label}</p>
                <p className="mt-1 text-[16px] font-semibold text-[var(--ink)]">{formatValue(data.totals[c.key] ?? null, c.kind) || "None"}</p>
              </div>
            ))}
          </div>

          {data.level !== "employee" ? (
            <Table
              first={data.level === "company" ? "Department" : "Employee"}
              columns={data.columns}
              rows={data.rows.map((r) => ({ id: r.id, label: r.name, sub: r.sub, values: r.values }))}
              onOpen={(id) => { const r = data.rows.find((x) => x.id === id); if (r) open(r); }}
              empty="No employees in these filters."
            />
          ) : (
            <>
              {data.detail && data.detail.kind === "facts" ? (
                <ul className="space-y-1">{data.detail.rows.map((r) => <li key={r.id}><span className="text-[#6B6B6B]">{r.label}:</span> {r.sub}</li>)}</ul>
              ) : data.detail ? (
                <Table
                  first={data.detail.kind === "payslips" ? "Payslip" : "Day"}
                  columns={data.detail.columns}
                  rows={data.detail.rows}
                  empty={data.detail.kind === "payslips" ? "No finalized payslips in this period." : "No days to show in this period."}
                />
              ) : null}
              {data.detail2 && (
                <Table first="Leave type" columns={data.detail2.columns} rows={data.detail2.rows} empty="No leave balances for this year." />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Table({ first, columns, rows, onOpen, empty }: {
  first: string; columns: Column[]; rows: DetailRow[]; onOpen?: (id: string) => void; empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E8E8E8]">
      <table className="w-full">
        <thead>
          <tr className="bg-[#F7F7F7] text-left text-[12px] text-[#6B6B6B]">
            <th className="p-2">{first}</th>
            {columns.map((c) => <th key={c.key} className="p-2 text-right">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + 1} className="p-6 text-center text-[#6B6B6B]">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} className={`border-t ${onOpen ? "cursor-pointer hover:bg-[#FAFAFA]" : ""}`}
              onClick={onOpen ? () => onOpen(r.id) : undefined} data-testid={`drill-row-${r.id}`}>
              <td className="p-2">
                {r.href ? <Link href={r.href} className="font-medium text-[var(--ink)] hover:underline">{r.label}</Link>
                  : <span className={`font-medium ${onOpen ? "text-[var(--ink)]" : ""}`}>{r.label}</span>}
                {r.sub && <span className="block text-[12px] text-[#6B6B6B]">{r.sub}</span>}
              </td>
              {columns.map((c) => <td key={c.key} className="p-2 text-right tabular-nums">{formatValue(r.values[c.key] ?? null, c.kind)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
