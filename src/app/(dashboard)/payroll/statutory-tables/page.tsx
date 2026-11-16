"use client";

/**
 * PAY-159: Statutory Table (Payroll sidebar). The SSS, PhilHealth, Pag-IBIG
 * and BIR withholding tables this company's payroll uses, read-only. Every
 * version can be viewed; the one marked "In force" is the one the payroll
 * uses on the chosen date.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCentavos } from "@/lib/money";
import {
  BIR_FREQUENCIES,
  birRanges,
  pagibigRanges,
  type StatutoryTablesResponse,
  type TableStatus,
  type TableVersion,
} from "@/lib/statutory/tables";
import type {
  BirWithholdingPayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

type StatTable = StatutoryTablesResponse["tables"][number];

const peso = (c: number) => formatCentavos(BigInt(c), { withSymbol: true });
const pct = (r: number) => `${Number((r * 100).toFixed(4))}%`;
const day = (s: string) =>
  new Date(`${s}T00:00:00.000Z`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const STATUS: Record<TableStatus, { label: string; bg: string; color: string }> = {
  IN_FORCE: { label: "In force", bg: "#E5F6EE", color: "#0FA36B" },
  UPCOMING: { label: "Upcoming", bg: "#EAF1FD", color: "#2F6FDB" },
  EARLIER: { label: "Earlier", bg: "#F2F2F2", color: "#6B6B6B" },
  REPLACED: { label: "Not used", bg: "#FDF3E6", color: "#B26A00" },
};

const FREQUENCY_LABELS: Record<(typeof BIR_FREQUENCIES)[number], string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  SEMI_MONTHLY: "Semi-monthly",
  MONTHLY: "Monthly",
};

const head = "text-[12.5px] font-medium text-[#525252]";
const num = "text-right tabular-nums text-[13px]";

function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function StatusBadge({ status }: { status: TableStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function VersionCard({ v }: { v: TableVersion }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E8E8] px-4 py-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-[#171717]">{v.version}</span>
        <StatusBadge status={v.status} />
        {v.companyRate && (
          <span className="text-[11px] font-semibold text-[#6B6B6B] border border-[#E8E8E8] rounded-full px-2 py-0.5">
            Your company&apos;s own rate
          </span>
        )}
      </div>
      <p className="text-[13px] text-[#404040]">
        In force from {day(v.effectiveFrom)}
        {v.lastDay ? ` to ${day(v.lastDay)}` : ", until replaced"}.
      </p>
      <p className="text-[12.5px] text-[#6B6B6B]">Legal basis: {v.legalBasis}</p>
      {v.status === "REPLACED" && (
        <p className="text-[12.5px] text-[#B26A00]">
          This version covers the date you chose, but your payroll uses another one for that date.
        </p>
      )}
    </div>
  );
}

function SssTable({ p }: { p: SssSchedulePayload }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
            <TableHead className={head}>Monthly compensation</TableHead>
            <TableHead className={`${head} text-right`}>MSC</TableHead>
            <TableHead className={`${head} text-right`}>Regular SS, ER</TableHead>
            <TableHead className={`${head} text-right`}>Regular SS, EE</TableHead>
            <TableHead className={`${head} text-right`}>EC, ER</TableHead>
            <TableHead className={`${head} text-right`}>MPF, ER</TableHead>
            <TableHead className={`${head} text-right`}>MPF, EE</TableHead>
            <TableHead className={`${head} text-right`}>Total ER</TableHead>
            <TableHead className={`${head} text-right`}>Total EE</TableHead>
            <TableHead className={`${head} text-right`}>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.rows.map((r, i) => (
            <TableRow key={r.msc}>
              <TableCell className="tabular-nums text-[13px] whitespace-nowrap">
                {i === 0
                  ? `Below ${peso(p.rows[1]?.compensationFrom ?? r.compensationTo + 1)}`
                  : i === p.rows.length - 1
                    ? `${peso(r.compensationFrom)} and over`
                    : `${peso(r.compensationFrom)} to ${peso(r.compensationTo)}`}
              </TableCell>
              <TableCell className={num}>{peso(r.msc)}</TableCell>
              <TableCell className={num}>{peso(r.regularSSEmployer)}</TableCell>
              <TableCell className={num}>{peso(r.regularSSEmployee)}</TableCell>
              <TableCell className={num}>{peso(r.ecEmployer)}</TableCell>
              <TableCell className={num}>{peso(r.mpfEmployer)}</TableCell>
              <TableCell className={num}>{peso(r.mpfEmployee)}</TableCell>
              <TableCell className={num}>{peso(r.totalEmployer)}</TableCell>
              <TableCell className={num}>{peso(r.totalEmployee)}</TableCell>
              <TableCell className={`${num} font-medium`}>{peso(r.totalTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
      <Table>
        <TableBody>
          {rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="text-[13px] text-[#525252] w-[280px]">{k}</TableCell>
              <TableCell className="tabular-nums text-[13px] text-[#171717] font-medium">{v}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PhilHealthTable({ p }: { p: PhilHealthSchedulePayload }) {
  return (
    <div className="space-y-2">
      <Facts
        rows={[
          ["Premium rate", pct(p.rate)],
          ["Employee share", `${pct(p.split.ee)} of the premium`],
          ["Employer share", `${pct(p.split.er)} of the premium`],
          ["Monthly salary floor", peso(p.msc.floor)],
          ["Monthly salary ceiling", peso(p.msc.ceiling)],
          ["Minimum monthly premium", peso(p.premium.min)],
          ["Maximum monthly premium", peso(p.premium.max)],
        ]}
      />
      <p className="text-[12px] text-[#6B6B6B]">
        Premium = monthly salary, kept between the floor and the ceiling, times the rate. The employer pays the
        rest of the premium after the employee share, so the two always add up to the premium.
      </p>
    </div>
  );
}

function PagibigTable({ p }: { p: PagibigSchedulePayload }) {
  return (
    <div className="space-y-2">
      <Facts rows={[["Fund salary cap (monthly)", peso(p.mfsCap)]]} />
      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head}>Monthly compensation</TableHead>
              <TableHead className={`${head} text-right`}>Employee rate</TableHead>
              <TableHead className={`${head} text-right`}>Employer rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagibigRanges(p).map((r) => (
              <TableRow key={r.from}>
                <TableCell className="tabular-nums text-[13px]">
                  {r.to === null ? `${peso(r.from)} and over` : `${peso(r.from)} to ${peso(r.to)}`}
                </TableCell>
                <TableCell className={num}>{pct(r.eeRate)}</TableCell>
                <TableCell className={num}>{pct(r.erRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12px] text-[#6B6B6B]">
        The rate is chosen by the monthly compensation; the contribution is the rate times the compensation, up to
        the fund salary cap.
      </p>
    </div>
  );
}

function BirTable({ p }: { p: BirWithholdingPayload }) {
  const available = BIR_FREQUENCIES.filter((f) => p.frequencies[f]);
  const [freq, setFreq] = useState<(typeof BIR_FREQUENCIES)[number]>(
    available.includes("SEMI_MONTHLY") ? "SEMI_MONTHLY" : available[0]!,
  );
  const brackets = p.frequencies[freq] ?? p.frequencies.MONTHLY;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-[12.5px] text-[#525252]">Pay frequency</Label>
        <Select value={freq} onValueChange={(v) => v && setFreq(v as typeof freq)}>
          <SelectTrigger className="h-8 w-[150px] text-[13px]" aria-label="Pay frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map((f) => (
              <SelectItem key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head}>Taxable pay</TableHead>
              <TableHead className={`${head} text-right`}>Fixed tax</TableHead>
              <TableHead className={`${head} text-right`}>Plus</TableHead>
              <TableHead className={head}>Of the excess over</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {birRanges(brackets).map((r) => (
              <TableRow key={r.from}>
                <TableCell className="tabular-nums text-[13px] whitespace-nowrap">
                  {r.to === null ? `${peso(r.from)} and over` : `${peso(r.from)} to ${peso(r.to)}`}
                </TableCell>
                <TableCell className={num}>{peso(r.fixedTax)}</TableCell>
                <TableCell className={num}>{pct(r.plusRate)}</TableCell>
                <TableCell className="tabular-nums text-[13px]">{peso(r.from)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12px] text-[#6B6B6B]">
        Tax for the pay period = fixed tax + the rate on the taxable pay above the start of its bracket. Minimum wage
        earners are exempt.
      </p>
    </div>
  );
}

function TablePanel({ table }: { table: StatTable }) {
  const preferred = table.versions.find((v) => v.status === "IN_FORCE") ?? table.versions[0];
  // The panel is keyed by table and date, so a new date starts on its in-force version.
  const [versionId, setVersionId] = useState<string | undefined>(preferred?.id);
  const v = table.versions.find((x) => x.id === versionId) ?? preferred;

  if (!v) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E8E8] py-10 text-center text-[13px] text-[#6B6B6B]">
        No {table.label} table yet.
      </div>
    );
  }
  const noneInForce = !table.versions.some((x) => x.status === "IN_FORCE");
  return (
    <div className="space-y-3">
      {table.versions.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-[12.5px] text-[#525252]">Version</Label>
          <Select value={v.id} onValueChange={(id) => id && setVersionId(id)}>
            <SelectTrigger className="h-8 min-w-[280px] text-[13px]" aria-label={`${table.label} version`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {table.versions.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.version}, from {day(x.effectiveFrom)} ({STATUS[x.status].label})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {noneInForce && (
        <p className="text-[12.5px] text-[#E0463B]">
          No {table.label} table is in force on this date, so a payroll for this date cannot be computed.
        </p>
      )}
      <VersionCard v={v} />
      {table.category === "SSS_SCHEDULE" && <SssTable p={v.payload as SssSchedulePayload} />}
      {table.category === "PHILHEALTH_SCHEDULE" && <PhilHealthTable p={v.payload as PhilHealthSchedulePayload} />}
      {table.category === "PAGIBIG_SCHEDULE" && <PagibigTable p={v.payload as PagibigSchedulePayload} />}
      {table.category === "BIR_WITHHOLDING_TABLE" && (
        <BirTable key={v.id} p={v.payload as BirWithholdingPayload} />
      )}
    </div>
  );
}

export default function StatutoryTablesPage() {
  const [asOf, setAsOf] = useState(todayManila);
  const [data, setData] = useState<StatutoryTablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("sss");

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/statutory-tables?asOf=${asOf}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "Could not load the statutory tables");
        return;
      }
      setData(json.data as StatutoryTablesResponse);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => data?.tables.find((t) => t.key === tab), [data, tab]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Statutory Table
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">
            The SSS, PhilHealth, Pag-IBIG and withholding tax tables your payroll uses. Sentire keeps them up to date
            when the government changes a rate, so they can&apos;t be edited here. Pick a date to see the tables in
            force on that date.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="asOf" className="text-[12px] text-[#525252]">
              In force on
            </Label>
            <Input
              id="asOf"
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="h-9 w-[160px] text-[13px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9" aria-label="Reload">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Statutory tables">
          {(data?.tables ?? []).map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-[13px]">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : current ? (
        <TablePanel key={`${current.key}-${data?.asOf}`} table={current} />
      ) : null}
    </div>
  );
}
