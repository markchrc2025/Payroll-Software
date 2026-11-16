"use client";

/**
 * PAY-141: Settings, Pay Rules, "Paydays and timekeeping cutoffs".
 * One card per scheduled cycle (semi-monthly, monthly) with its own Save;
 * weekly and daily follow fixed rules and are shown read-only.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Slot = { payDay: number; cutoffStartDay: number; cutoffEndDay: number };
type Occ = { nominalDate: string; payDate: string; moved: boolean; cutoffStart: string; cutoffEnd: string; periodStart: string; periodEnd: string };
type Sched = { cycle: "SEMI_MONTHLY" | "MONTHLY"; isDefault: boolean; slots: Slot[]; nextPaydays: Occ[] };
type Data = { schedules: Sched[]; weekly: { rule: string; nextPaydays: Occ[] }; daily: { rule: string } };

const TITLE: Record<Sched["cycle"], string> = { SEMI_MONTHLY: "Semi-monthly", MONTHLY: "Monthly" };
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const dayLabel = (n: number) => (n >= 30 ? "month-end" : `${n}${n === 1 || n === 21 ? "st" : n === 2 || n === 22 ? "nd" : n === 3 || n === 23 ? "rd" : "th"}`);

function DayInput({ id, value, onChange, label }: { id: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-[#6B6B6B]">{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={31}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-20 tabular-nums"
      />
    </div>
  );
}

function CycleCard({ sched, onSaved }: { sched: Sched; onSaved: () => void }) {
  const [slots, setSlots] = useState<Slot[]>(sched.slots);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = JSON.stringify(slots) !== JSON.stringify(sched.slots);
  const set = (i: number, k: keyof Slot, v: number) =>
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function save() {
    setSaving(true);
    setProblem(null);
    const res = await fetch("/api/settings/pay-schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle: sched.cycle, slots }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setProblem(json.error ?? "Could not save"); return; }
    toast.success(`${TITLE[sched.cycle]} paydays saved`);
    onSaved();
  }

  return (
    <div className="rounded-lg border border-[#E8E8E8] p-4 space-y-3" data-testid={`schedule-${sched.cycle}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-medium text-[#171717]">
          {TITLE[sched.cycle]} {sched.isDefault && <span className="text-[12px] font-normal text-[#6B6B6B]">(default)</span>}
        </p>
        {dirty && (
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-[12.5px]">
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      {slots.map((s, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <DayInput id={`${sched.cycle}-pay-${i}`} label={slots.length > 1 ? `Payday ${i + 1}` : "Payday"} value={s.payDay} onChange={(v) => set(i, "payDay", v)} />
          <DayInput id={`${sched.cycle}-from-${i}`} label="Cutoff from" value={s.cutoffStartDay} onChange={(v) => set(i, "cutoffStartDay", v)} />
          <DayInput id={`${sched.cycle}-to-${i}`} label="Cutoff to" value={s.cutoffEndDay} onChange={(v) => set(i, "cutoffEndDay", v)} />
          <p className="pb-2 text-[12px] text-[#6B6B6B]">
            Paid on the {dayLabel(s.payDay)} for timekeeping from the {dayLabel(s.cutoffStartDay)} to the {dayLabel(s.cutoffEndDay)}.
          </p>
        </div>
      ))}
      {problem && <p className="text-[12.5px] text-destructive" role="alert">{problem}</p>}
      {!dirty && sched.nextPaydays.length > 0 && (
        <ul className="text-[12px] text-[#6B6B6B] space-y-0.5">
          {sched.nextPaydays.map((o) => (
            <li key={o.nominalDate} className="tabular-nums">
              {fmt(o.payDate)}{o.moved ? ` (moved from ${fmt(o.nominalDate)})` : ""}: cutoff {fmt(o.cutoffStart)} to {fmt(o.cutoffEnd)}, pays {fmt(o.periodStart)} to {fmt(o.periodEnd)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PayScheduleEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/pay-schedules");
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Could not load paydays"); return; }
    setData(json.data);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-32 w-full" />;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#6B6B6B]">
        Days 30 and 31 mean the last day of the month. A payday on a Sunday or a holiday is paid on the working day before.
        The two cutoffs must cover the whole month, each starting the day after the other ends.
      </p>
      {data.schedules.map((s) => (
        <CycleCard key={`${s.cycle}-${version}`} sched={s} onSaved={load} />
      ))}
      <div className="rounded-lg border border-[#E8E8E8] p-4 space-y-1">
        <p className="text-[13.5px] font-medium text-[#171717]">Weekly</p>
        <p className="text-[12px] text-[#6B6B6B]">{data.weekly.rule}, ending the day before payday.</p>
      </div>
      <div className="rounded-lg border border-[#E8E8E8] p-4 space-y-1">
        <p className="text-[13.5px] font-medium text-[#171717]">Daily</p>
        <p className="text-[12px] text-[#6B6B6B]">{data.daily.rule}.</p>
      </div>
    </div>
  );
}
