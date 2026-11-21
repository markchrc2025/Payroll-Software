"use client";

/** Wave G2 (PAY-217): an employee's Annual Salary Statement, by month, with a PDF. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatementTable } from "@/components/payroll/StatementTable";
import type { Statement } from "@/lib/payroll/annual-statement-view";

type Emp = { id: string; employeeNumber: string; firstName: string; lastName: string };

export default function AnnualSalaryStatementPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [st, setSt] = useState<Statement | null>(null);
  useEffect(() => { fetch("/api/employees?limit=500").then((r) => r.json()).then((j) => setEmps(j?.data ?? [])).catch(() => setEmps([])); }, []);
  async function show() {
    if (!employeeId) { toast.error("Choose the employee"); return; }
    const res = await fetch(`/api/payroll/annual-statement?employeeId=${employeeId}&year=${year}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not load it"); return; }
    setSt(j.data);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Annual Salary Statement</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">A one-page record of an employee&apos;s pay for a year, by month, from finalized payroll runs. For a bank or a visa application; the BIR form is the 2316. Employees download their own in ESS.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-[12px]">Employee</Label>
            <select className="h-9 w-[240px] rounded-md border px-2 text-[13px]" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Choose</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label className="text-[12px]">Year</Label><Input type="number" className="h-9 w-24" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={show}>Show</Button>
          {st && <a className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-[13px] hover:bg-[#F7F7F7]" href={`/api/payroll/annual-statement?employeeId=${employeeId}&year=${year}&format=pdf`}><Download className="h-3.5 w-3.5" /> PDF</a>}
        </div>
      </div>
      {st && (<><p className="text-[13px]">{st.employee.name} · {st.employee.number}{st.employee.position ? ` · ${st.employee.position}` : ""} · {st.runs} finalized payslip{st.runs === 1 ? "" : "s"}</p><StatementTable st={st} /></>)}
    </div>
  );
}
