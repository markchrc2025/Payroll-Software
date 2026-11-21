"use client";

/** Wave E3 (PAY-215): who in my department is away (approved leave; no leave types). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default function TeamCalendarPage() {
  const [days, setDays] = useState<{ date: string; away: string[] }[]>([]);
  useEffect(() => {
    const t = today();
    fetch(`/api/ess/team-calendar?from=${t}&to=${plus(t, 27)}`, { headers: { Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setDays(j?.data ?? [])).catch(() => setDays([]));
  }, []);
  const busy = days.filter((d) => d.away.length);
  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-2xl mx-auto">
      <Link href="/ess?tab=leave" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Leave</Link>
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Team calendar</h1>
        <p className="text-sm text-muted-foreground">Who in your department is away in the next four weeks.</p>
      </div>
      {busy.length === 0 && <p className="text-sm text-muted-foreground">Everyone is in.</p>}
      {busy.map((d) => (
        <div key={d.date} className="rounded-lg border px-4 py-3">
          <div className="text-xs font-semibold text-muted-foreground">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</div>
          <div className="text-sm">{d.away.join(", ")}</div>
        </div>
      ))}
    </div>
  );
}
