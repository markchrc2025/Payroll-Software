"use client";

/**
 * PAY-197: offboarding cases. Each separation has a case with the company's
 * clearance checklist; each item's signatory signs it off; the final pay run
 * is finalized only when clearance is complete. DOLE Labor Advisory 06-2020:
 * final pay within 30 days of separation.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Item = { id: string; name: string; description: string | null; status: string; remarks: string | null; clearedAt: string | null; signatory: { id: string; firstName: string; lastName: string } };
type Case = {
  id: string; status: string; separationReason: string; lastWorkingDay: string; daysSinceSeparation: number; finalPayDueInDays: number; pendingItems: number;
  employee: { employeeNumber: string; firstName: string; lastName: string }; items: Item[];
};
type MyItem = { id: string; name: string; case: { id: string; lastWorkingDay: string; employee: { employeeNumber: string; firstName: string; lastName: string } } };

export default function OffboardingPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [mine, setMine] = useState<MyItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, m] = await Promise.all([fetch("/api/offboarding/cases").then((r) => r.json()), fetch("/api/offboarding/my-items").then((r) => r.json())]);
    setCases(c.data ?? []); setMine(m.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function clear(itemId: string) {
    const res = await fetch(`/api/offboarding/items/${itemId}/clear`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remarks: remarks[itemId] || null }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not sign off"); return; }
    toast.success("Signed off"); void load();
  }
  async function close(caseId: string) {
    const res = await fetch(`/api/offboarding/cases/${caseId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not close"); return; }
    toast.success("Case closed"); void load();
  }

  const day = (s: string) => s.slice(0, 10);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Offboarding</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">One case per separation. Final pay is released only when every clearance item is signed off; DOLE expects it within 30 days of the last working day.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {mine.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 space-y-2" data-testid="my-signoffs">
          <h2 className="text-[14px] font-semibold">Waiting for your sign-off</h2>
          {mine.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-medium">{i.case.employee.lastName}, {i.case.employee.firstName}</span>
              <span className="text-[#6B6B6B]">{i.name}</span>
              <Input className="h-8 w-56" placeholder="Remarks (optional)" value={remarks[i.id] ?? ""} onChange={(e) => setRemarks({ ...remarks, [i.id]: e.target.value })} />
              <Button size="sm" className="h-8" onClick={() => clear(i.id)}>Sign off</Button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E8E8E8] divide-y">
        {cases.length === 0 ? <p className="p-6 text-center text-[13px] text-[#6B6B6B]">{loading ? "Loading" : "No offboarding cases."}</p> : cases.map((c) => (
          <div key={c.id} className="p-4 text-[13px] space-y-2">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="font-medium">{c.employee.lastName}, {c.employee.firstName} <span className="text-[#6B6B6B]">({c.employee.employeeNumber})</span></span>
              <span className="flex items-center gap-2">
                <Badge variant={c.status === "OPEN" ? "secondary" : "default"}>{c.status}</Badge>
                <span>{c.items.length - c.pendingItems} of {c.items.length} cleared</span>
                <span className={c.status === "OPEN" && c.finalPayDueInDays < 0 ? "text-red-600 font-medium" : "text-[#6B6B6B]"} data-testid="days-since-separation">
                  last day {day(c.lastWorkingDay)}, {c.daysSinceSeparation} day{c.daysSinceSeparation === 1 ? "" : "s"} ago
                  {c.status === "OPEN" ? (c.finalPayDueInDays >= 0 ? `, final pay due in ${c.finalPayDueInDays}` : `, ${-c.finalPayDueInDays} past the 30 days`) : ""}
                </span>
              </span>
            </button>
            {open === c.id && (
              <div className="space-y-1 pl-2">
                {c.items.map((i) => (
                  <div key={i.id} className="flex flex-wrap gap-2">
                    <span className={i.status === "CLEARED" ? "text-green-700" : ""}>{i.status === "CLEARED" ? "Cleared" : "Pending"}</span>
                    <span className="font-medium">{i.name}</span>
                    <span className="text-[#6B6B6B]">signatory {i.signatory.firstName} {i.signatory.lastName}{i.clearedAt ? `, ${day(i.clearedAt)}` : ""}{i.remarks ? `: ${i.remarks}` : ""}</span>
                  </div>
                ))}
                {c.status === "CLEARED" && <Button size="sm" variant="outline" className="h-8 mt-1" onClick={() => close(c.id)}>Close case</Button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
