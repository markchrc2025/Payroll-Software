"use client";

/**
 * PAY-152: the 13th month accrued so far, the projected payout and what was
 * paid, for Finance. Data: GET /api/payroll/reports/thirteenth-accrual.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { accrualCsv, peso, type AccrualReportView as Report } from "@/lib/payroll/thirteenth-accrual-view";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ThirteenthAccrualPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/payroll/reports/thirteenth-accrual?year=${year}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(json.error ?? "Could not load the accrual"); return; }
    setData(json.data);
  }, [year]);
  useEffect(() => { void load(); }, [load]);

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([accrualCsv(data)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `thirteenth_month_accrual_${data.year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const head = "text-[12px] font-semibold text-[#6B6B6B]";
  const num = "text-right tabular-nums text-[13px]";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">13th Month Accrual</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">
            The 13th month earned so far on finalized payroll runs, what it is projected to be at year end, and what has been paid.
            {data?.asOf ? ` As of ${data.asOf}, ${data.monthsLeft} months left in the year.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger className="h-9 w-[110px] text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[thisYear, thisYear - 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="outline" size="sm" onClick={download} disabled={!data} className="h-9 text-[13px]" data-testid="accrual-csv"><Download className="h-3.5 w-3.5 mr-1.5" /> CSV</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head}>Employee</TableHead>
              <TableHead className={`${head} text-right`}>Base earned</TableHead>
              <TableHead className={`${head} text-right`}>Accrued to date</TableHead>
              <TableHead className={`${head} text-right`}>Monthly basic</TableHead>
              <TableHead className={`${head} text-right`}>Projected payout</TableHead>
              <TableHead className={`${head} text-right`}>Paid</TableHead>
              <TableHead className={`${head} text-right`}>Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || !data
              ? <TableRow><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              : data.rows.length === 0
                ? <TableRow><TableCell colSpan={7} className="text-center text-[13px] text-[#6B6B6B] py-8">No finalized payroll in {data.year}.</TableCell></TableRow>
                : <>
                    {data.rows.map((r) => (
                      <TableRow key={r.employeeId}>
                        <TableCell className="text-[13px]"><div className="font-medium">{r.name}</div><div className="text-[12px] text-[#6B6B6B]">{r.employeeNumber} · {r.runs} run{r.runs === 1 ? "" : "s"}</div></TableCell>
                        <TableCell className={num}>{peso((BigInt(r.basisFromRunsCents) + BigInt(r.basisFromOpeningCents)).toString())}</TableCell>
                        <TableCell className={num}>{peso(r.accruedToDateCents)}</TableCell>
                        <TableCell className={num}>{peso(r.monthlyBasicCents)}</TableCell>
                        <TableCell className={num}>{peso(r.projectedPayoutCents)}</TableCell>
                        <TableCell className={num}>{peso(r.paidCents)}</TableCell>
                        <TableCell className={num}>{peso(r.differenceCents)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-[#F7F7F7]">
                      <TableCell className="text-[13px]">Total</TableCell>
                      <TableCell className={num}>{peso((BigInt(data.totals.basisFromRunsCents) + BigInt(data.totals.basisFromOpeningCents)).toString())}</TableCell>
                      <TableCell className={num} data-testid="accrual-total">{peso(data.totals.accruedToDateCents)}</TableCell>
                      <TableCell />
                      <TableCell className={num}>{peso(data.totals.projectedPayoutCents)}</TableCell>
                      <TableCell className={num}>{peso(data.totals.paidCents)}</TableCell>
                      <TableCell className={num}>{peso(data.totals.differenceCents)}</TableCell>
                    </TableRow>
                  </>}
          </TableBody>
        </Table>
      </div>

      {data && (
        <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 space-y-2">
          <h2 className="text-[14px] font-semibold">Journal</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={head}>Month</TableHead>
                <TableHead className={`${head} text-right`}>Dr 13th Month Pay Expense, Cr Accrued 13th Month Pay</TableHead>
                <TableHead className={`${head} text-right`}>Dr Accrued 13th Month Pay, Cr Cash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.journal.filter((j) => j.accrualCents !== "0" || j.payoutCents !== "0").map((j) => (
                <TableRow key={j.month}>
                  <TableCell className="text-[13px]">{MONTHS[j.month - 1]} {data.year}</TableCell>
                  <TableCell className={num}>{peso(j.accrualCents)}</TableCell>
                  <TableCell className={num}>{peso(j.payoutCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ul className="list-disc pl-5 text-[12.5px] text-[#6B6B6B] space-y-1">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
