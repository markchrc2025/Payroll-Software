"use client";

/**
 * Wave D (PAY-214): one HR report with its filters, the table, the summary
 * sections and an Excel download (the main table and each section on its own
 * sheet). Data: GET /api/reports/hr/[kind].
 */
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { HR_REPORTS, sheetName, sheetRows, type Column, type HrReport, type HrReportKind, type Row } from "@/lib/reports/hr-reports-view";

const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

function Grid({ columns, rows, empty }: { columns: Column[]; rows: Row[]; empty: string }) {
  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B] whitespace-nowrap";
  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <table className="w-full">
        <thead className="border-b bg-[#FAFAFA]"><tr>{columns.map((c) => <th key={c.key} className={`${head} ${c.numeric ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="py-8 text-center text-[13px] text-[#6B6B6B]">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-b last:border-0">
              {columns.map((c) => {
                const v = r[c.key];
                const bad = c.key === "result" && v && v !== "Ties" && v !== "Matches";
                return <td key={c.key} className={`px-3 py-2 text-[13px] align-top ${c.numeric ? "text-right tabular-nums" : ""} ${bad ? "font-medium text-[#B42318]" : ""}`}>{v ?? ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HrReportView({ kind }: { kind: HrReportKind }) {
  const def = HR_REPORTS[kind];
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [year, setYear] = useState(today().slice(0, 4));
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<HrReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = def.params === "range" ? `from=${from}&to=${to}` : def.params === "year" ? `year=${year}` : `asOf=${asOf}`;
    setLoading(true);
    const res = await fetch(`/api/reports/hr/${kind}?${qs}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(json.error ?? "Could not load the report"); return; }
    setData(json.data);
  }, [kind, def.params, from, to, year, asOf]);
  useEffect(() => { void load(); }, [load]);

  function excel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows(data.columns, data.rows)), sheetName(data.title, used));
    for (const s of data.sections) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows(s.columns, s.rows)), sheetName(s.title, used));
    const stamp = def.params === "range" ? `${from}_${to}` : def.params === "year" ? year : asOf;
    XLSX.writeFile(wb, `${kind}_${stamp}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">{def.title}</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">{data?.subtitle ?? ""}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {def.params === "range" && (
            <>
              <div className="space-y-1"><Label className="text-[12px]">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] text-[13px]" /></div>
              <div className="space-y-1"><Label className="text-[12px]">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] text-[13px]" /></div>
            </>
          )}
          {def.params === "year" && <div className="space-y-1"><Label className="text-[12px]">Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="h-9 w-[100px] text-[13px]" /></div>}
          {def.params === "asOf" && <div className="space-y-1"><Label className="text-[12px]">As of</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-[150px] text-[13px]" /></div>}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="outline" size="sm" onClick={excel} disabled={!data} className="h-9 text-[13px]"><Download className="h-3.5 w-3.5 mr-1.5" /> Excel</Button>
        </div>
      </div>
      {loading && !data ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : data && (
        <>
          <Grid columns={data.columns} rows={data.rows} empty="Nothing in this period." />
          {data.sections.map((s) => (
            <section key={s.title} className="space-y-2">
              <h2 className="text-[15px] font-semibold">{s.title}</h2>
              <Grid columns={s.columns} rows={s.rows} empty="Nothing to show." />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
