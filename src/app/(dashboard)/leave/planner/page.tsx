"use client";

/**
 * Wave E3 (PAY-215): the Leave Planner. Approved and pending leave per day by
 * department, with a warning on days more are off than the department allows.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Off = { employeeId: string; name: string; status: string; leaveType: string };
type Dept = { departmentId: string | null; department: string; maxOnLeave: number | null; days: { date: string; off: Off[]; over: boolean }[] };

const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default function LeavePlannerPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(plus(today(), 27));
  const [data, setData] = useState<Dept[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/leave/planner?from=${from}&to=${to}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not load the planner"); return; }
    setData(j?.data ?? []);
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  async function setLimit(d: Dept, v: string) {
    if (!d.departmentId) return;
    const res = await fetch(`/api/departments/${d.departmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxOnLeave: v === "" ? null : Number(v) }) });
    if (!res.ok) { toast.error("Could not save the limit"); return; }
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Leave Planner</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">Who is off each day, by department: approved leave in solid, pending in outline. A day turns red when more are off than the department allows; set the limit beside the department&apos;s name.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-[12px]">From</Label><Input type="date" className="h-9 w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-[12px]">To</Label><Input type="date" className="h-9 w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={load}>Show</Button>
        </div>
      </div>
      {data.length === 0 && <p className="text-[13px] text-[#6B6B6B]">No leave in these dates.</p>}
      {data.map((d) => (
        <section key={d.departmentId ?? "none"} className="rounded-lg border bg-white p-3 space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-semibold">{d.department}</h2>
            {d.departmentId && (
              <label className="flex items-center gap-1.5 text-[12px] text-[#6B6B6B]">At most off a day
                <input className="h-7 w-14 rounded border px-1" defaultValue={d.maxOnLeave ?? ""} onBlur={(e) => setLimit(d, e.target.value)} />
              </label>
            )}
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-1">
              {d.days.map((day) => (
                <div key={day.date} className={`min-w-[86px] rounded border p-1.5 ${day.over ? "border-[#F04438] bg-[#FEF3F2]" : ""}`}>
                  <div className="text-[11px] font-semibold text-[#6B6B6B]">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>
                  {day.off.map((o) => (
                    <div key={o.employeeId} title={`${o.leaveType}, ${o.status.toLowerCase()}`} className={`mt-1 truncate rounded px-1 text-[11px] ${o.status === "APPROVED" ? "bg-[#E8693A] text-white" : "border border-[#E8693A] text-[#B4471F]"}`}>{o.name}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
