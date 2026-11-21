"use client";

/**
 * Wave E3 (PAY-215, decision 9): Leave Schedule, company shutdowns (leave
 * filed for a group) and blackout dates (requests blocked or flagged).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Ref = { id: string; name: string };
type Sched = { id: string; kind: string; name: string; startDate: string; endDate: string; departmentIds: string[]; leaveTypeId: string | null; blackoutMode: string | null; appliedAt: string | null };
type Plan = { employeeId: string; employeeName: string; employeeNumber: string; days: string[]; action: string; reason: string | null };

const EMPTY = { kind: "SHUTDOWN", name: "", startDate: "", endDate: "", departmentIds: [] as string[], leaveTypeId: "", blackoutMode: "BLOCK" };
const list = async (url: string): Promise<Ref[]> => ((await fetch(url).then((r) => r.json()).catch(() => null))?.data ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));

export default function LeaveSchedulePage() {
  const [rows, setRows] = useState<Sched[]>([]);
  const [types, setTypes] = useState<Ref[]>([]);
  const [depts, setDepts] = useState<Ref[]>([]);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [plan, setPlan] = useState<{ s: Sched; rows: Plan[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setRows((await fetch("/api/leave-schedules").then((r) => r.json()).catch(() => null))?.data ?? []), []);
  useEffect(() => { void load(); void list("/api/leave-types").then(setTypes); void list("/api/departments").then(setDepts); }, [load]);

  async function save() {
    if (!form) return;
    setBusy(true);
    const res = await fetch("/api/leave-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, leaveTypeId: form.leaveTypeId || null }) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "Could not save"); return; }
    setForm(null); void load();
  }
  async function remove(s: Sched) {
    if (!confirm(`Remove ${s.name}?`)) return;
    await fetch(`/api/leave-schedules/${s.id}`, { method: "DELETE" }); void load();
  }
  async function preview(s: Sched) {
    const j = await fetch(`/api/leave-schedules/${s.id}/preview`).then((r) => r.json()).catch(() => null);
    setPlan({ s, rows: j?.data ?? [] });
  }
  async function apply() {
    if (!plan) return;
    setBusy(true);
    const res = await fetch(`/api/leave-schedules/${plan.s.id}/apply`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "Could not file the leave"); return; }
    toast.success(j?.message ?? "Filed"); setPlan(null); void load();
  }

  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px] align-top";
  const deptNames = (ids: string[]) => (ids.length ? ids.map((i) => depts.find((d) => d.id === i)?.name ?? i).join(", ") : "Everyone");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Leave Schedule</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">Company shutdowns file leave for everyone they cover, on each person&apos;s working days, charged to the leave type you choose (an unpaid type for unpaid days). Blackout dates block leave requests, or let them through flagged for the approver.</p>
        </div>
        <Button size="sm" className="h-9 text-[13px]" onClick={() => setForm({ ...EMPTY })}>New</Button>
      </div>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>Name</th><th className={head}>Kind</th><th className={head}>Dates</th><th className={head}>Covers</th><th className={head} /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#6B6B6B]">Nothing scheduled.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className={cell}>{s.name}</td>
                <td className={cell}>{s.kind === "SHUTDOWN" ? `Shutdown, ${types.find((t) => t.id === s.leaveTypeId)?.name ?? ""}` : `Blackout, ${s.blackoutMode === "BLOCK" ? "blocked" : "flagged"}`}</td>
                <td className={cell}>{s.startDate.slice(0, 10)} to {s.endDate.slice(0, 10)}</td>
                <td className={cell}>{deptNames(s.departmentIds)}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  {s.kind === "SHUTDOWN" && <Button size="sm" className="h-7 px-2 text-xs mr-2" onClick={() => preview(s)}>{s.appliedAt ? "Filed: check" : "Preview and file"}</Button>}
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => remove(s)}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>New schedule</SheetTitle></SheetHeader>
          {form && (
            <div className="mt-4 space-y-3 text-[13px]">
              <div className="space-y-1.5"><Label>Kind</Label>
                <select className="h-9 w-full rounded-md border px-2" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="SHUTDOWN">Company shutdown</option><option value="BLACKOUT">Blackout dates</option></select>
              </div>
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Year-end shutdown" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>To</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              {form.kind === "SHUTDOWN" ? (
                <div className="space-y-1.5"><Label>Charged to</Label>
                  <select className="h-9 w-full rounded-md border px-2" value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}><option value="">Choose a leave type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </div>
              ) : (
                <div className="space-y-1.5"><Label>Requests in these dates</Label>
                  <select className="h-9 w-full rounded-md border px-2" value={form.blackoutMode} onChange={(e) => setForm({ ...form, blackoutMode: e.target.value })}><option value="BLOCK">Are refused</option><option value="FLAG">Go through, flagged for the approver</option></select>
                </div>
              )}
              <div className="space-y-1.5"><Label>Departments <span className="text-[11.5px] text-[#6B6B6B]">(none ticked: everyone)</span></Label>
                <div className="flex flex-wrap gap-1.5">{depts.map((d) => {
                  const on = form.departmentIds.includes(d.id);
                  return <button key={d.id} type="button" onClick={() => setForm({ ...form, departmentIds: on ? form.departmentIds.filter((x) => x !== d.id) : [...form.departmentIds, d.id] })} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${on ? "border-[#E8693A] bg-[#FDF1EC]" : ""}`}>{d.name}</button>;
                })}</div>
              </div>
              <Button onClick={save} disabled={busy}>Save</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{plan?.s.name}: leave to file</SheetTitle></SheetHeader>
          {plan && (
            <div className="mt-4 space-y-3">
              <table className="w-full"><tbody>
                {plan.rows.map((r) => (
                  <tr key={r.employeeId} className="border-b last:border-0">
                    <td className={cell}>{r.employeeName} <span className="text-[12px] text-[#6B6B6B]">{r.employeeNumber}</span></td>
                    <td className={cell}>{r.action === "FILE" ? `${r.days.length} day(s)` : r.action === "ALREADY" ? "Filed" : `Skipped: ${r.reason}`}</td>
                  </tr>
                ))}
              </tbody></table>
              <Button onClick={apply} disabled={busy || !plan.rows.some((r) => r.action === "FILE")}>File the leave</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
