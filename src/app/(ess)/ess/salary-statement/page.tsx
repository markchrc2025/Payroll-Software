"use client";

/** Wave G2 (PAY-217): my Annual Salary Statement, by month, with a PDF. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatementTable } from "@/components/payroll/StatementTable";
import type { Statement } from "@/lib/payroll/annual-statement-view";

export default function EssSalaryStatementPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [st, setSt] = useState<Statement | null>(null);
  const headers = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` }), []);
  useEffect(() => {
    fetch(`/api/ess/salary-statement?year=${year}`, { headers: headers() }).then((r) => (r.ok ? r.json() : null)).then((j) => setSt(j?.data ?? null)).catch(() => setSt(null));
  }, [year, headers]);
  async function pdf() {
    const res = await fetch(`/api/ess/salary-statement?year=${year}&format=pdf`, { headers: headers() });
    if (!res.ok) { toast.error("Could not download it"); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `Annual_Salary_Statement_${year}.pdf`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-5xl mx-auto">
      <Link href="/ess?tab=pay" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Pay</Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">Annual salary statement</h1>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2].map((d) => new Date().getFullYear() - d).map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <Button size="sm" variant="outline" onClick={pdf} disabled={!st?.runs}><Download className="h-3.5 w-3.5 mr-1.5" /> PDF</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Your pay for the year by month, from finalized payroll. For a bank or visa application; your BIR Form 2316 comes from HR.</p>
      {st && (st.runs ? <StatementTable st={st} /> : <p className="text-sm text-muted-foreground">No finalized payroll in {year} yet.</p>)}
    </div>
  );
}
