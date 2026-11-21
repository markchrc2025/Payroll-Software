"use client";

/**
 * Wave F1 (PAY-216, decision 10): field check-ins for supervisors. Each
 * punch with where it was taken, the site it matched, and the ones outside
 * every fence (accepted and flagged). The map opens the location.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Row = { id: string; punchType: string; punchedAt: string; latitude: number | null; longitude: number | null; outsideGeofence: boolean; distanceMeters: number | null; siteName: string | null; employee: { firstName: string; lastName: string; employeeNumber: string } };
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const fmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export default function FieldCheckinsPage() {
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const [flagged, setFlagged] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/attendance/field-checkins?from=${from}&to=${to}${flagged ? "&flagged=1" : ""}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not load"); return; }
    setRows(j?.data ?? []);
  }, [from, to, flagged]);
  useEffect(() => { void load(); }, [load]);
  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px]";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Field Check-In</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">Punches of employees marked as field workers (on the employee or their job type), checked against every client and site fence. A punch outside all of them is recorded and flagged here, never refused. Locations are taken only at the punch.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1"><Label className="text-[12px]">From</Label><Input type="date" className="h-9 w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-[12px]">To</Label><Input type="date" className="h-9 w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <label className="flex items-center gap-2 pb-2 text-[13px]"><Switch checked={flagged} onCheckedChange={(c: boolean) => setFlagged(c)} /> Flagged only</label>
        </div>
      </div>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>When</th><th className={head}>Employee</th><th className={head}>Punch</th><th className={head}>Site</th><th className={head}>Location</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#6B6B6B]">No field punches in these dates.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className={cell}>{fmt.format(new Date(r.punchedAt))}</td>
                <td className={cell}>{r.employee.lastName}, {r.employee.firstName} <span className="text-[12px] text-[#6B6B6B]">{r.employee.employeeNumber}</span></td>
                <td className={cell}>{r.punchType}</td>
                <td className={cell}>{r.outsideGeofence ? <span className="font-medium text-[#B42318]">Outside every fence{r.distanceMeters != null ? ` (${r.distanceMeters} m from the nearest)` : ""}</span> : r.siteName ?? "No fence set"}</td>
                <td className={cell}>{r.latitude != null && r.longitude != null ? <a className="text-[#E8693A] hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`}>{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</a> : "Not captured"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
