"use client";

/**
 * Wave G1 (PAY-217): Salary Adjustment. Choose employees and a rule, preview
 * old pay, new pay and the difference, save for a second person to approve.
 * Back pay for finalized runs appears on the Corrections page as a batch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Emp = { id: string; employeeNumber: string; firstName: string; lastName: string; department?: { name: string } | null };
type Line = { employeeId: string; name: string; employeeNumber?: string; salaryType: string; fromCents: string; toCents: string; diffCents: string; split?: boolean };
type Preview = { lines: Line[]; skipped: { employeeId: string; name: string; reason: string }[] };
type Batch = { id: string; name: string; rule: string; effectiveDate: string; reason: string; status: string; retroBatchId: string | null; rejectionReason: string | null; lines: Line[] };
type Run = { id: string; periodStart: string; periodEnd: string; status: string; runType: string };

const peso = (c: string) => `₱${(Number(BigInt(c)) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const unit = (t: string) => (t === "DAILY" ? "/day" : t === "WEEKLY" ? "/week" : "/month");

export default function SalaryAdjustmentPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ name: "", rule: "PERCENT", percent: "", fixedAmount: "", effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
  const [pv, setPv] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  const load = useCallback(() => {
    fetch("/api/salary-adjustments").then((r) => r.json()).then((j) => setBatches(j?.data ?? [])).catch(() => setBatches([]));
  }, []);
  useEffect(() => {
    fetch("/api/employees?limit=500").then((r) => r.json()).then((j) => setEmps(j?.data ?? [])).catch(() => setEmps([]));
    fetch("/api/payroll/runs?limit=50&status=DRAFT&runType=REGULAR").then((r) => r.json()).then((j) => setRuns((j?.data ?? []).filter((r: Run) => r.status === "DRAFT" && r.runType === "REGULAR"))).catch(() => setRuns([]));
    load();
  }, [load]);

  const shown = useMemo(() => emps.filter((e) => `${e.lastName} ${e.firstName} ${e.employeeNumber} ${e.department?.name ?? ""}`.toLowerCase().includes(filter.toLowerCase())), [emps, filter]);
  const body = () => ({ ...form, percent: form.percent || undefined, fixedAmount: form.fixedAmount || undefined, employeeIds: [...picked] });

  async function post(url: string, data: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "It did not work"); return null; }
    return j.data;
  }
  async function preview() { const d = await post("/api/salary-adjustments?preview=1", body()); if (d) setPv(d); }
  async function save() { const d = await post("/api/salary-adjustments", body()); if (d) { toast.success("Saved for approval"); setPv(null); setPicked(new Set()); load(); } }
  async function wageOrder() {
    const res = await fetch(`/api/salary-adjustments/wage-order?asOf=${form.effectiveDate}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not read the minimum wage"); return; }
    const ids: string[] = j.data.employees.map((e: { employeeId: string }) => e.employeeId);
    if (!ids.length) { toast.info("No one is below the minimum wage in force on that date"); return; }
    setPicked(new Set(ids));
    setForm((f) => ({ ...f, rule: "MIN_WAGE", name: f.name || `Wage order ${form.effectiveDate}`, reason: f.reason || "New regional minimum wage" }));
    toast.success(`${ids.length} employee(s) below the minimum wage are proposed`);
  }
  async function decide(b: Batch, approve: boolean) {
    if (approve) { const d = await post(`/api/salary-adjustments/${b.id}/approve`, {}); if (d) toast.success(d.backPay ? `Approved. Back pay of ${peso(d.backPay.totalCents)} is waiting on the Corrections page.` : "Approved"); }
    else { const reason = window.prompt("Why is it rejected?"); if (!reason) return; await post(`/api/salary-adjustments/${b.id}/reject`, { reason }); }
    load();
  }
  async function split(b: Batch, bookId: string) {
    if (!bookId) return;
    const d = await post(`/api/salary-adjustments/${b.id}/split`, { bookId });
    if (d) { toast.success(d.adjustments.length ? `Split done for ${d.adjustments.length} employee(s); the run was recomputed` : "Nothing to split in that run"); load(); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Salary Adjustment</h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[820px]">Bulk changes of basic salary: a merit increase, a cost-of-living adjustment, or a wage order. A second person approves. Each employee gets one salary adjustment movement from the effective date. Back pay for runs already finalized lands in a later run through the Corrections page; a sealed run is never reopened.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1"><Label className="text-[12px]">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2027 merit increase" /></div>
          <div className="space-y-1"><Label className="text-[12px]">Rule</Label>
            <select className="h-9 w-full rounded-md border px-2 text-[13px]" value={form.rule} onChange={(e) => setForm({ ...form, rule: e.target.value })}>
              <option value="PERCENT">A percentage</option><option value="FIXED">A fixed amount</option><option value="MIN_WAGE">Bring to the new minimum wage</option>
            </select>
          </div>
          {form.rule === "PERCENT" && <div className="space-y-1"><Label className="text-[12px]">Percent</Label><Input value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} placeholder="5" /></div>}
          {form.rule === "FIXED" && <div className="space-y-1"><Label className="text-[12px]">Amount added, in the salary&apos;s own unit (per month or per day)</Label><Input value={form.fixedAmount} onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })} placeholder="1000" /></div>}
          <div className="space-y-1"><Label className="text-[12px]">Effective date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-[12px]">Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Annual review approved by the board" /></div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={wageOrder}>Propose from wage order</Button>
            <Button variant="outline" size="sm" onClick={preview} disabled={!picked.size}>Preview</Button>
            <Button size="sm" onClick={save} disabled={!pv?.lines.length}>Save for approval</Button>
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium">Employees ({picked.size} chosen)</p>
            <div className="flex gap-2"><Input className="h-8 w-56" placeholder="Filter by name or department" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set([...picked, ...shown.map((e) => e.id)]))}>Choose shown</Button>
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set())}>Clear</Button></div>
          </div>
          <div className="max-h-[300px] overflow-auto text-[13px]">
            {shown.map((e) => (
              <label key={e.id} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => { const n = new Set(picked); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); setPicked(n); }} />
                {e.lastName}, {e.firstName} <span className="text-[#6B6B6B]">({e.employeeNumber}{e.department ? `, ${e.department.name}` : ""})</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {pv && (
        <section className="rounded-lg border p-4 space-y-2">
          <p className="text-[13px] font-medium">Preview</p>
          <LineTable lines={pv.lines} />
          {pv.skipped.length > 0 && <p className="text-[12px] text-[#6B6B6B]">Not changed: {pv.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}</p>}
        </section>
      )}

      <section className="space-y-3">
        <p className="text-[14px] font-medium">Adjustments</p>
        {batches.length === 0 && <p className="text-[13px] text-[#6B6B6B]">None yet.</p>}
        {batches.map((b) => (
          <div key={b.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px]"><span className="font-medium">{b.name}</span> · effective {b.effectiveDate} · {b.lines.length} employee(s) · <span className="font-medium">{b.status}</span>{b.rejectionReason ? `: ${b.rejectionReason}` : ""}</p>
              <div className="flex gap-2">
                {b.status === "PENDING" && (<><Button size="sm" onClick={() => decide(b, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(b, false)}>Reject</Button></>)}
                {b.status === "APPROVED" && runs.length > 0 && (
                  <select className="h-8 rounded-md border px-2 text-[12px]" defaultValue="" onChange={(e) => split(b, e.target.value)}>
                    <option value="">Split a run that straddles {b.effectiveDate}</option>
                    {runs.map((r) => <option key={r.id} value={r.id}>{r.periodStart.slice(0, 10)} to {r.periodEnd.slice(0, 10)}</option>)}
                  </select>
                )}
              </div>
            </div>
            <p className="text-[12px] text-[#6B6B6B]">{b.reason}{b.retroBatchId ? " · Back pay is waiting for approval on the Corrections page." : ""}</p>
            <LineTable lines={b.lines} />
          </div>
        ))}
      </section>
    </div>
  );
}

function LineTable({ lines }: { lines: Line[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead><tr className="text-left text-[12px] text-[#6B6B6B]"><th className="py-1">Employee</th><th>Old pay</th><th>New pay</th><th>Difference</th></tr></thead>
      <tbody>{lines.map((l) => (
        <tr key={l.employeeId} className="border-t"><td className="py-1">{l.name}{l.split ? " · split" : ""}</td><td>{peso(l.fromCents)}{unit(l.salaryType)}</td><td>{peso(l.toCents)}{unit(l.salaryType)}</td><td>{peso(l.diffCents)}</td></tr>
      ))}</tbody>
    </table>
  );
}
