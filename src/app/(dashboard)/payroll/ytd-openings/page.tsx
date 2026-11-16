"use client";

/**
 * /payroll/ytd-openings (PAY-144): year-to-date openings.
 *
 * For a company that starts on Sentire mid-year: what each employee was paid
 * earlier in the year before Sentire, and a previous employer's 2316 figures
 * for someone who transferred in. 13th month, the 90,000 exemption, year-end
 * tax and the 2316 use them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Lock, Pencil, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parsePesoAmount, YTD_CSV_COLUMNS } from "@/lib/payroll/ytd-openings";

type Opening = {
  source: "PRIOR_PAYROLL" | "PREVIOUS_EMPLOYER";
  previousEmployerName: string | null;
  previousEmployerTin: string | null;
  note: string | null;
  basicPayEarnedCents: string;
  thirteenthMonthPaidCents: string;
  taxableCompensationCents: string;
  withholdingTaxCents: string;
  nontaxable13MonthAndBenefitsCents: string;
  sssEeCents: string;
  philhealthEeCents: string;
  pagibigEeCents: string;
  otherNontaxableCents: string;
};

type Row = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  hireDate: string;
  lastWorkingDate: string | null;
  locked: boolean;
  priorPayroll: Opening | null;
  previousEmployer: Opening | null;
};

type Problem = { row: number; employeeNumber: string; errors: string[] };

/** Centavos (string) to "12,345.67". */
function pesos(cents: string | null | undefined): string {
  const c = BigInt(cents ?? "0");
  const whole = (c / 100n).toLocaleString("en-PH");
  const frac = (c % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

const PRIOR_FIELDS = [
  ["basicPayEarnedCents", "Basic pay earned", "Counts toward the 13th month."],
  ["thirteenthMonthPaidCents", "13th month already paid", "Subtracted from the 13th month Sentire pays."],
  ["taxableCompensationCents", "Taxable compensation", "For year-end tax."],
  ["withholdingTaxCents", "Tax withheld", ""],
  ["nontaxable13MonthAndBenefitsCents", "Non-taxable 13th month and other benefits", "Uses up part of the 90,000 exemption."],
  ["sssEeCents", "SSS (employee share)", ""],
  ["philhealthEeCents", "PhilHealth (employee share)", ""],
  ["pagibigEeCents", "Pag-IBIG (employee share)", ""],
  ["otherNontaxableCents", "Other non-taxable pay (de minimis and similar)", ""],
] as const;

const PREV_FIELDS = [
  ["taxableCompensationCents", "Taxable compensation", "From the previous employer's 2316."],
  ["withholdingTaxCents", "Tax withheld", ""],
  ["nontaxable13MonthAndBenefitsCents", "Non-taxable 13th month and other benefits", "Uses up part of the 90,000 exemption."],
] as const;

type FormState = Record<string, string>;

function toForm(o: Opening | null, fields: readonly (readonly [string, string, string])[]): FormState {
  const f: FormState = {
    previousEmployerName: o?.previousEmployerName ?? "",
    previousEmployerTin: o?.previousEmployerTin ?? "",
    note: o?.note ?? "",
  };
  for (const [key] of fields) {
    f[key] = o ? pesos((o as unknown as Record<string, string>)[key]) : "";
  }
  return f;
}

export default function YtdOpeningsPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [prior, setPrior] = useState<FormState>({});
  const [prev, setPrev] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/ytd-openings?year=${year}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load openings");
      setRows(body.data.employees);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(r: Row) {
    setEditing(r);
    setPrior(toForm(r.priorPayroll, PRIOR_FIELDS));
    setPrev(toForm(r.previousEmployer, PREV_FIELDS));
  }

  async function save(source: Opening["source"]) {
    if (!editing) return;
    const form = source === "PRIOR_PAYROLL" ? prior : prev;
    const fields = source === "PRIOR_PAYROLL" ? PRIOR_FIELDS : PREV_FIELDS;
    const body: Record<string, unknown> = { employeeId: editing.employeeId, year: Number(year), source, note: form.note || null };
    try {
      for (const [key, label] of fields) {
        try {
          body[key] = parsePesoAmount(form[key]).toString();
        } catch {
          throw new Error(`${label}: enter an amount in pesos, at most two decimals`);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    if (source === "PREVIOUS_EMPLOYER") {
      body.previousEmployerName = form.previousEmployerName;
      body.previousEmployerTin = form.previousEmployerTin || null;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/ytd-openings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error ?? "Could not save");
      toast.success("Saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(source: Opening["source"]) {
    if (!editing) return;
    setSaving(true);
    try {
      const qs = new URLSearchParams({ employeeId: editing.employeeId, year, source });
      const res = await fetch(`/api/payroll/ytd-openings?${qs}`, { method: "DELETE" });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error ?? "Could not remove");
      toast.success("Removed");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const lines = [YTD_CSV_COLUMNS.join(",")];
    for (const r of rows) {
      const cells: string[] = YTD_CSV_COLUMNS.map(() => "");
      cells[0] = r.employeeNumber;
      cells[1] = year;
      cells[2] = "PRIOR_PAYROLL";
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ytd-openings-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/payroll/ytd-openings/import", { method: "POST", body: fd });
      const out = await res.json();
      if (res.status === 422 && out?.details?.problems) {
        setProblems(out.details.problems);
        return;
      }
      if (!res.ok) throw new Error(out?.error ?? "Import failed");
      toast.success(`Imported: ${out.data.created} new, ${out.data.replaced} replaced`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const head = "text-[12.5px] font-medium text-[#525252]";
  const num = "text-right tabular-nums text-[13px]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Year-to-date Openings
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">
            If you started using Sentire partway through the year, enter what each employee was paid
            earlier in the year, and a previous employer&apos;s 2316 for anyone who transferred in.
            The 13th month, year-end tax and the 2316 include these figures.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger className="h-9 w-[110px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[thisYear, thisYear - 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={loading} className="h-9 text-[13px]">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Template
          </Button>
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="h-9 text-[13px] bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head}>Employee</TableHead>
              <TableHead className={`${head} text-right`}>Basic pay earned</TableHead>
              <TableHead className={`${head} text-right`}>13th month paid</TableHead>
              <TableHead className={`${head} text-right`}>Taxable pay</TableHead>
              <TableHead className={`${head} text-right`}>Tax withheld</TableHead>
              <TableHead className={head}>Previous employer</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              : rows.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[13px] text-[#6B6B6B] py-8">
                      No employees were employed in {year}.
                    </TableCell>
                  </TableRow>
                )
                : rows.map((r) => (
                  <TableRow key={r.employeeId}>
                    <TableCell className="text-[13px]">
                      <div className="font-medium text-[var(--ink)]">{r.name}</div>
                      <div className="text-[12px] text-[#6B6B6B]">{r.employeeNumber} · hired {r.hireDate}</div>
                    </TableCell>
                    <TableCell className={num}>{r.priorPayroll ? pesos(r.priorPayroll.basicPayEarnedCents) : "-"}</TableCell>
                    <TableCell className={num}>{r.priorPayroll ? pesos(r.priorPayroll.thirteenthMonthPaidCents) : "-"}</TableCell>
                    <TableCell className={num}>
                      {r.priorPayroll || r.previousEmployer
                        ? pesos(
                            (BigInt(r.priorPayroll?.taxableCompensationCents ?? "0") +
                              BigInt(r.previousEmployer?.taxableCompensationCents ?? "0")).toString(),
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className={num}>
                      {r.priorPayroll || r.previousEmployer
                        ? pesos(
                            (BigInt(r.priorPayroll?.withholdingTaxCents ?? "0") +
                              BigInt(r.previousEmployer?.withholdingTaxCents ?? "0")).toString(),
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="text-[13px]">{r.previousEmployer?.previousEmployerName ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {r.locked ? (
                        <Badge variant="outline" className="text-[11.5px] gap-1">
                          <Lock className="h-3 w-3" /> Locked
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12px] text-[#6B6B6B]">
        Taxable pay and tax withheld add up both sources. An employee is locked once their 13th month or
        final pay run for the year is finalized, because that run already used these figures.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name} · {year}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-6">
              <section className="space-y-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)]">This company, before Sentire</h3>
                  <p className="text-[12.5px] text-[#6B6B6B]">Totals from January (or the hire date) up to your first Sentire payroll. Amounts in pesos.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRIOR_FIELDS.map(([key, label, hint]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[12.5px]">{label}</Label>
                      <Input
                        inputMode="decimal"
                        value={prior[key] ?? ""}
                        onChange={(e) => setPrior({ ...prior, [key]: e.target.value })}
                        placeholder="0.00"
                        className="h-9 text-[13px] text-right tabular-nums"
                      />
                      {hint && <p className="text-[11.5px] text-[#8A8A8A]">{hint}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  {editing.priorPayroll && (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => remove("PRIOR_PAYROLL")}>Remove</Button>
                  )}
                  <Button size="sm" disabled={saving} onClick={() => save("PRIOR_PAYROLL")}
                    className="bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]">
                    Save
                  </Button>
                </div>
              </section>

              <section className="space-y-3 border-t border-[#EDEDED] pt-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)]">Previous employer (their 2316)</h3>
                  <p className="text-[12.5px] text-[#6B6B6B]">Only for an employee who worked for another employer earlier this year.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[12.5px]">Employer name</Label>
                    <Input value={prev.previousEmployerName ?? ""} onChange={(e) => setPrev({ ...prev, previousEmployerName: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12.5px]">Employer TIN</Label>
                    <Input value={prev.previousEmployerTin ?? ""} onChange={(e) => setPrev({ ...prev, previousEmployerTin: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  {PREV_FIELDS.map(([key, label, hint]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[12.5px]">{label}</Label>
                      <Input
                        inputMode="decimal"
                        value={prev[key] ?? ""}
                        onChange={(e) => setPrev({ ...prev, [key]: e.target.value })}
                        placeholder="0.00"
                        className="h-9 text-[13px] text-right tabular-nums"
                      />
                      {hint && <p className="text-[11.5px] text-[#8A8A8A]">{hint}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  {editing.previousEmployer && (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => remove("PREVIOUS_EMPLOYER")}>Remove</Button>
                  )}
                  <Button size="sm" disabled={saving} onClick={() => save("PREVIOUS_EMPLOYER")}
                    className="bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]">
                    Save
                  </Button>
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!problems} onOpenChange={(o) => !o && setProblems(null)}>
        <DialogContent className="max-w-xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nothing was imported</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-[#404040]">Fix these rows and import the file again:</p>
          <ul className="space-y-2">
            {problems?.map((p) => (
              <li key={`${p.row}-${p.employeeNumber}`} className="text-[13px]">
                <span className="font-medium">Row {p.row}{p.employeeNumber ? ` (${p.employeeNumber})` : ""}:</span>{" "}
                {p.errors.join("; ")}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button size="sm" onClick={() => setProblems(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
