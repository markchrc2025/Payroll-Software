"use client";

/**
 * PAY-160: Statutory Contribution (Payroll sidebar). Each employee's SSS,
 * PhilHealth and Pag-IBIG shares per month from finalized runs, the base each
 * was computed on, and the totals to remit per agency. Pick a month for
 * everyone, or an employee for their history; export to CSV. Read-only.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCentavos } from "@/lib/money";
import {
  monthLabel,
  sssBasisLabel,
  type ContributionEmployee,
  type ContributionRow,
  type ContributionTotals,
} from "@/lib/payroll/reports/statutory-contributions";

type Response_ = {
  year: number;
  month: number | null;
  employeeId: string | null;
  employees: ContributionEmployee[];
  rows: ContributionRow[];
  totals: ContributionTotals;
};

const ALL = "all";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const peso = (c: string) => formatCentavos(BigInt(c), { withSymbol: true });
const head = "text-[12px] font-medium text-[#525252] whitespace-nowrap";
const num = "text-right tabular-nums text-[13px] whitespace-nowrap";

function manilaToday(): { year: number; month: number } {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).split("-");
  return { year: Number(y), month: Number(m) };
}

function AgencyCard({ name, lines, total }: { name: string; lines: Array<[string, string]>; total: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E8E8] px-4 py-3 min-w-[220px] flex-1">
      <div className="text-[12.5px] font-semibold text-[#525252]">{name}</div>
      <div className="text-[20px] font-semibold tabular-nums text-[#171717] mt-0.5">{peso(total)}</div>
      <div className="mt-1 space-y-0.5">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[12px] text-[#6B6B6B] tabular-nums">
            <span>{k}</span>
            <span>{peso(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatutoryContributionsPage() {
  const today = manilaToday();
  const [year, setYear] = useState(String(today.year));
  const [month, setMonth] = useState(String(today.month));
  const [employeeId, setEmployeeId] = useState(ALL);
  const [data, setData] = useState<Response_ | null>(null);
  const [loading, setLoading] = useState(true);

  const query = employeeId === ALL ? `year=${year}&month=${month}` : `year=${year}&employeeId=${encodeURIComponent(employeeId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/statutory-contributions?${query}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "Could not load the contributions");
        return;
      }
      setData(json.data as Response_);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = employeeId !== ALL;
  const t = data?.totals;
  const years = [today.year, today.year - 1, today.year - 2];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Statutory Contribution
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">
            SSS, PhilHealth and Pag-IBIG shares from finalized payroll runs, by the month the pay period ends, with
            the base each was computed on. The totals match the SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF under
            Gov&apos;t Reports.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[12px] text-[#525252]">Year</Label>
            <Select value={year} onValueChange={(v) => v && setYear(v)}>
              <SelectTrigger className="h-9 w-[100px] text-[13px]" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!history && (
            <div className="space-y-1">
              <Label className="text-[12px] text-[#525252]">Month</Label>
              <Select value={month} onValueChange={(v) => v && setMonth(v)}>
                <SelectTrigger className="h-9 w-[140px] text-[13px]" aria-label="Month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[12px] text-[#525252]">Employee</Label>
            <Select value={employeeId} onValueChange={(v) => v && setEmployeeId(v)}>
              <SelectTrigger className="h-9 w-[240px] text-[13px]" aria-label="Employee">
<SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All employees</SelectItem>
                {(data?.employees ?? []).map((e) => (
                  <SelectItem key={e.employeeId} value={e.employeeId}>
                    {e.name} ({e.employeeNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9" aria-label="Reload">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[13px]"
            nativeButton={false}
            render={<a href={`/api/payroll/statutory-contributions?${query}&format=csv`} download />}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {t && (
        <div className="flex flex-wrap gap-3">
          <AgencyCard
            name="SSS"
            total={t.sss.totalCents}
            lines={[
              ["Employee share", t.sss.eeCents],
              ["Employer share", t.sss.erCents],
              ["EC (employer)", t.sss.ecCents],
            ]}
          />
          <AgencyCard
            name="PhilHealth"
            total={t.philhealth.totalCents}
            lines={[
              ["Employee share", t.philhealth.eeCents],
              ["Employer share", t.philhealth.erCents],
            ]}
          />
          <AgencyCard
            name="Pag-IBIG"
            total={t.pagibig.totalCents}
            lines={[
              ["Employee share", t.pagibig.eeCents],
              ["Employer share", t.pagibig.erCents],
            ]}
          />
          <AgencyCard
            name={history ? "All agencies, this year" : "All agencies, to remit"}
            total={t.totalCents}
            lines={[
              ["Employee share", t.eeCents],
              ["Employer share", t.erCents],
            ]}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head} rowSpan={2}>
                {history ? "Month" : "Employee"}
              </TableHead>
              <TableHead className={`${head} text-center border-l border-[#EDEDED]`} colSpan={6}>
                SSS
              </TableHead>
              <TableHead className={`${head} text-center border-l border-[#EDEDED]`} colSpan={3}>
                PhilHealth
              </TableHead>
              <TableHead className={`${head} text-center border-l border-[#EDEDED]`} colSpan={3}>
                Pag-IBIG
              </TableHead>
              <TableHead className={`${head} text-right border-l border-[#EDEDED]`} rowSpan={2}>
                Total
              </TableHead>
            </TableRow>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={`${head} text-right border-l border-[#EDEDED]`}>MSC</TableHead>
              <TableHead className={`${head} text-right`}>EE</TableHead>
              <TableHead className={`${head} text-right`}>ER</TableHead>
              <TableHead className={`${head} text-right`}>EC</TableHead>
              <TableHead className={`${head} text-right`}>MPF EE</TableHead>
              <TableHead className={`${head} text-right`}>MPF ER</TableHead>
              <TableHead className={`${head} text-right border-l border-[#EDEDED]`}>Base</TableHead>
              <TableHead className={`${head} text-right`}>EE</TableHead>
              <TableHead className={`${head} text-right`}>ER</TableHead>
              <TableHead className={`${head} text-right border-l border-[#EDEDED]`}>Base</TableHead>
              <TableHead className={`${head} text-right`}>EE</TableHead>
              <TableHead className={`${head} text-right`}>ER</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 14 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell colSpan={14} className="py-10 text-center text-[13px] text-[#6B6B6B]">
                  No finalized payroll {history ? "for this employee in this year" : "ends in this month"}.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => (
                <TableRow key={`${r.month}-${r.employeeId}`}>
                  <TableCell className="text-[13px] whitespace-nowrap">
                    <div className="font-medium text-[#171717]">
                      {history ? monthLabel(r.month) : r.name}
                    </div>
                    <div className="text-[11.5px] text-[#8A8A8A]">
                      {history ? "" : `${r.employeeNumber} · `}
                      {r.sssBasis ? `SSS on ${sssBasisLabel(r.sssBasis)}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className={`${num} border-l border-[#F2F2F2]`}>{peso(r.sss.mscCents)}</TableCell>
                  <TableCell className={num}>{peso(r.sss.eeRegularCents)}</TableCell>
                  <TableCell className={num}>{peso(r.sss.erRegularCents)}</TableCell>
                  <TableCell className={num}>{peso(r.sss.ecCents)}</TableCell>
                  <TableCell className={num}>{peso(r.sss.eeMpfCents)}</TableCell>
                  <TableCell className={num}>{peso(r.sss.erMpfCents)}</TableCell>
                  <TableCell className={`${num} border-l border-[#F2F2F2]`}>{peso(r.philhealth.baseCents)}</TableCell>
                  <TableCell className={num}>{peso(r.philhealth.eeCents)}</TableCell>
                  <TableCell className={num}>{peso(r.philhealth.erCents)}</TableCell>
                  <TableCell className={`${num} border-l border-[#F2F2F2]`}>{peso(r.pagibig.baseCents)}</TableCell>
                  <TableCell className={num}>{peso(r.pagibig.eeCents)}</TableCell>
                  <TableCell className={num}>{peso(r.pagibig.erCents)}</TableCell>
                  <TableCell className={`${num} font-medium border-l border-[#F2F2F2]`}>{peso(r.totalCents)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {t && data?.rows.length ? (
            <TableFooter>
              <TableRow className="bg-[#F7F7F7] font-medium">
                <TableCell className="text-[13px]">Total</TableCell>
                <TableCell className={`${num} border-l border-[#EDEDED]`} />
                <TableCell className={num}>{peso((BigInt(t.sss.eeCents) - BigInt(t.sss.eeMpfCents)).toString())}</TableCell>
                <TableCell className={num}>{peso((BigInt(t.sss.erCents) - BigInt(t.sss.erMpfCents)).toString())}</TableCell>
                <TableCell className={num}>{peso(t.sss.ecCents)}</TableCell>
                <TableCell className={num}>{peso(t.sss.eeMpfCents)}</TableCell>
                <TableCell className={num}>{peso(t.sss.erMpfCents)}</TableCell>
                <TableCell className={`${num} border-l border-[#EDEDED]`} />
                <TableCell className={num}>{peso(t.philhealth.eeCents)}</TableCell>
                <TableCell className={num}>{peso(t.philhealth.erCents)}</TableCell>
                <TableCell className={`${num} border-l border-[#EDEDED]`} />
                <TableCell className={num}>{peso(t.pagibig.eeCents)}</TableCell>
                <TableCell className={num}>{peso(t.pagibig.erCents)}</TableCell>
                <TableCell className={`${num} border-l border-[#EDEDED]`}>{peso(t.totalCents)}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
      <p className="text-[12px] text-[#6B6B6B]">
        EE and ER under SSS are the regular Social Security shares; MPF is the provident fund part above the regular
        ceiling. The SSS total to remit is EE + ER + EC + MPF.
      </p>
    </div>
  );
}
