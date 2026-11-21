"use client";

/**
 * Wave E1 (PAY-215): Leave Earning Policies. A reusable accrual rule per
 * leave type, assigned to a group; the preview shows the entitlements it
 * would write, and Apply writes them (src/lib/leave/earning-policy.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Ref = { id: string; name: string };
type Tier = { fromYear: number; accrualAmount: string };
type Policy = {
  id: string; name: string; leaveTypeId: string; accrualFrequency: string; accrualAmount: string; tiers: Tier[]; proRate: boolean; earnFrom: string;
  carryOverCap: string | null; expiresAfterMonths: number | null; convertUnusedToCash: boolean; effectiveFrom: string; isActive: boolean; lastAppliedAt: string | null;
  assignment: { employmentStatuses?: string[]; levelIds?: string[]; departmentIds?: string[]; jobTypeIds?: string[] };
  leaveType: { name: string }; _count: { entitlements: number };
};
type PlanRow = { employeeId: string; employeeNumber: string; employeeName: string; action: string; reason: string | null; segments: { startDate: string; endDate: string | null; accrualAmount: string }[]; endsExisting: { startDate: string; newEndDate: string }[] };

const FREQ = [["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["ANNUALLY", "Yearly"], ["UPON_REGULARIZATION", "Once, on regularization"], ["LUMP_SUM", "Once, in full at the start"]];
const STATUSES = [["PROBATIONARY", "Probationary"], ["REGULAR", "Regular"], ["CONTRACTUAL", "Contractual"], ["PROJECT_BASED", "Project-based"]];
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const EMPTY = { id: "", name: "", leaveTypeId: "", accrualFrequency: "MONTHLY", accrualAmount: "1.25", tiers: [] as Tier[], proRate: true, earnFrom: "HIRE",
  carryOverCap: "", expiresAfterMonths: "", convertUnusedToCash: false, effectiveFrom: today(), isActive: true,
  employmentStatuses: [] as string[], levelIds: [] as string[], departmentIds: [] as string[], jobTypeIds: [] as string[] };
type Form = typeof EMPTY;

const list = async (url: string): Promise<Ref[]> => {
  const j = await fetch(url).then((r) => r.json()).catch(() => null);
  const rows = (j?.data ?? []) as { id: string; name?: string; title?: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name ?? r.title ?? r.id }));
};

function Picks({ label, options, value, onChange }: { label: string; options: Ref[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-[11.5px] text-[#6B6B6B]">(none ticked: any)</span></Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          return <button key={o.id} type="button" onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${on ? "border-[#E8693A] bg-[#FDF1EC] text-[#B4471F]" : "hover:bg-[#F7F7F7]"}`}>{o.name}</button>;
        })}
        {options.length === 0 && <span className="text-[12px] text-[#6B6B6B]">None set up</span>}
      </div>
    </div>
  );
}

export default function EarningPolicyPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [refs, setRefs] = useState({ leaveTypes: [] as Ref[], levels: [] as Ref[], departments: [] as Ref[], jobTypes: [] as Ref[] });
  const [edit, setEdit] = useState<Form | null>(null);
  const [plan, setPlan] = useState<{ policy: Policy; rows: PlanRow[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/leave-earning-policies").then((r) => r.json()).catch(() => null);
    setPolicies(j?.data ?? []);
  }, []);
  useEffect(() => {
    void load();
    void Promise.all([list("/api/leave-types"), list("/api/job-levels"), list("/api/departments"), list("/api/job-types")])
      .then(([leaveTypes, levels, departments, jobTypes]) => setRefs({ leaveTypes, levels, departments, jobTypes }));
  }, [load]);

  function open(p?: Policy) {
    if (!p) { setEdit({ ...EMPTY }); return; }
    setEdit({
      id: p.id, name: p.name, leaveTypeId: p.leaveTypeId, accrualFrequency: p.accrualFrequency, accrualAmount: String(Number(p.accrualAmount)), tiers: p.tiers ?? [],
      proRate: p.proRate, earnFrom: p.earnFrom, carryOverCap: p.carryOverCap == null ? "" : String(Number(p.carryOverCap)), expiresAfterMonths: p.expiresAfterMonths == null ? "" : String(p.expiresAfterMonths),
      convertUnusedToCash: p.convertUnusedToCash, effectiveFrom: p.effectiveFrom.slice(0, 10), isActive: p.isActive,
      employmentStatuses: p.assignment.employmentStatuses ?? [], levelIds: p.assignment.levelIds ?? [], departmentIds: p.assignment.departmentIds ?? [], jobTypeIds: p.assignment.jobTypeIds ?? [],
    });
  }

  async function save() {
    if (!edit) return;
    const body = {
      name: edit.name, leaveTypeId: edit.leaveTypeId, accrualFrequency: edit.accrualFrequency, accrualAmount: edit.accrualAmount,
      tiers: edit.tiers.map((t) => ({ fromYear: Number(t.fromYear), accrualAmount: t.accrualAmount })), proRate: edit.proRate, earnFrom: edit.earnFrom,
      carryOverCap: edit.carryOverCap === "" ? null : edit.carryOverCap, expiresAfterMonths: edit.expiresAfterMonths === "" ? null : Number(edit.expiresAfterMonths),
      convertUnusedToCash: edit.convertUnusedToCash, effectiveFrom: edit.effectiveFrom, isActive: edit.isActive,
      assignment: { employmentStatuses: edit.employmentStatuses, levelIds: edit.levelIds, departmentIds: edit.departmentIds, jobTypeIds: edit.jobTypeIds },
    };
    setBusy(true);
    const res = await fetch(edit.id ? `/api/leave-earning-policies/${edit.id}` : "/api/leave-earning-policies", { method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "Could not save"); return; }
    toast.success("Policy saved. Preview it, then apply it to write the entitlements.");
    setEdit(null); void load();
  }

  async function showPlan(p: Policy) {
    const j = await fetch(`/api/leave-earning-policies/${p.id}/preview`).then((r) => r.json()).catch(() => null);
    setPlan({ policy: p, rows: j?.data ?? [] });
  }

  async function applyIt() {
    if (!plan) return;
    setBusy(true);
    const res = await fetch(`/api/leave-earning-policies/${plan.policy.id}/apply`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "Could not apply"); return; }
    toast.success(j?.message ?? "Applied");
    setPlan(null); void load();
  }

  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px] align-top";
  const freqLabel = (f: string) => FREQ.find(([k]) => k === f)?.[1] ?? f;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Leave Earning Policy</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">How employees earn leave, by group: the amount and how often, service tiers, pro-rating for joiners, and when earning starts. Applying a policy writes each employee&apos;s entitlement; the daily accrual then grants the leave. A change takes effect from its effective date and never edits leave already earned.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" className="h-9 text-[13px]" onClick={() => open()}><Plus className="h-3.5 w-3.5 mr-1.5" /> New policy</Button>
        </div>
      </div>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>Policy</th><th className={head}>Leave type</th><th className={head}>Earns</th><th className={head}>From</th><th className={head}>Entitlements</th><th className={head} /></tr></thead>
          <tbody>
            {policies.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-[13px] text-[#6B6B6B]">No policies yet.</td></tr>}
            {policies.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className={cell}><div className="font-medium">{p.name}</div>{!p.isActive && <span className="text-[12px] text-[#6B6B6B]">Off</span>}</td>
                <td className={cell}>{p.leaveType.name}</td>
                <td className={cell}>{Number(p.accrualAmount)} {freqLabel(p.accrualFrequency).toLowerCase()}{p.tiers?.length ? `, ${p.tiers.map((t) => `${Number(t.accrualAmount)} from year ${t.fromYear}`).join(", ")}` : ""}</td>
                <td className={cell}>{p.effectiveFrom.slice(0, 10)}</td>
                <td className={cell}>{p._count.entitlements}{p.lastAppliedAt ? ` (applied ${p.lastAppliedAt.slice(0, 10)})` : ""}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs mr-2" onClick={() => open(p)}>Edit</Button>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => showPlan(p)}>Preview and apply</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{edit?.id ? "Edit policy" : "New policy"}</SheetTitle></SheetHeader>
          {edit && (
            <div className="mt-4 space-y-3 text-[13px]">
              <div className="space-y-1.5"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Vacation, office staff" /></div>
              <div className="space-y-1.5"><Label>Leave type</Label>
                <select className="h-9 w-full rounded-md border px-2" value={edit.leaveTypeId} onChange={(e) => setEdit({ ...edit, leaveTypeId: e.target.value })}>
                  <option value="">Choose</option>{refs.leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>How often</Label>
                  <select className="h-9 w-full rounded-md border px-2" value={edit.accrualFrequency} onChange={(e) => setEdit({ ...edit, accrualFrequency: e.target.value })}>{FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
                <div className="space-y-1.5"><Label>Days each time</Label><Input value={edit.accrualAmount} onChange={(e) => setEdit({ ...edit, accrualAmount: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Service tiers</Label>
                {edit.tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span>From year</span><Input className="w-20" type="number" value={t.fromYear} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, k) => (k === i ? { ...x, fromYear: Number(e.target.value) } : x)) })} />
                    <span>earn</span><Input className="w-24" value={t.accrualAmount} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, k) => (k === i ? { ...x, accrualAmount: e.target.value } : x)) })} />
                    <Button variant="outline" size="sm" onClick={() => setEdit({ ...edit, tiers: edit.tiers.filter((_, k) => k !== i) })}>Remove</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEdit({ ...edit, tiers: [...edit.tiers, { fromYear: 3, accrualAmount: edit.accrualAmount }] })}>Add a tier</Button>
                <p className="text-[12px] text-[#6B6B6B]">Years of service from the hire date; the amount changes on that anniversary.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Starts earning from</Label>
                  <select className="h-9 w-full rounded-md border px-2" value={edit.earnFrom} onChange={(e) => setEdit({ ...edit, earnFrom: e.target.value })}><option value="HIRE">The hire date</option><option value="REGULARIZATION">Regularization</option></select>
                </div>
                <div className="space-y-1.5"><Label>Effective from</Label><Input type="date" value={edit.effectiveFrom} onChange={(e) => setEdit({ ...edit, effectiveFrom: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>Pro-rate a partial period (joiners)</span><Switch checked={edit.proRate} onCheckedChange={(c: boolean) => setEdit({ ...edit, proRate: c })} /></div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="font-medium">At year end</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Carry over at most (days)</Label><Input value={edit.carryOverCap} onChange={(e) => setEdit({ ...edit, carryOverCap: e.target.value })} placeholder="Blank: no cap" /></div>
                  <div className="space-y-1.5"><Label>Carried days expire after (months)</Label><Input value={edit.expiresAfterMonths} onChange={(e) => setEdit({ ...edit, expiresAfterMonths: e.target.value })} placeholder="Blank: never" /></div>
                </div>
                <div className="flex items-center justify-between"><span>Pay unused days in cash</span><Switch checked={edit.convertUnusedToCash} onCheckedChange={(c: boolean) => setEdit({ ...edit, convertUnusedToCash: c })} /></div>
              </div>
              <div className="rounded-md border p-3 space-y-3">
                <p className="font-medium">Who it covers</p>
                <Picks label="Employment status" options={STATUSES.map(([id, name]) => ({ id, name }))} value={edit.employmentStatuses} onChange={(v) => setEdit({ ...edit, employmentStatuses: v })} />
                <Picks label="Level" options={refs.levels} value={edit.levelIds} onChange={(v) => setEdit({ ...edit, levelIds: v })} />
                <Picks label="Department" options={refs.departments} value={edit.departmentIds} onChange={(v) => setEdit({ ...edit, departmentIds: v })} />
                <Picks label="Job type" options={refs.jobTypes} value={edit.jobTypeIds} onChange={(v) => setEdit({ ...edit, jobTypeIds: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>On</span><Switch checked={edit.isActive} onCheckedChange={(c: boolean) => setEdit({ ...edit, isActive: c })} /></div>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader><SheetTitle>{plan?.policy.name}: what applying writes</SheetTitle></SheetHeader>
          {plan && (
            <div className="mt-4 space-y-3">
              <table className="w-full">
                <thead className="border-b"><tr><th className={head}>Employee</th><th className={head}>Result</th><th className={head}>Entitlements</th></tr></thead>
                <tbody>
                  {plan.rows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-[13px] text-[#6B6B6B]">No employee matches the policy.</td></tr>}
                  {plan.rows.map((r) => (
                    <tr key={r.employeeId} className="border-b last:border-0">
                      <td className={cell}>{r.employeeName} <span className="text-[12px] text-[#6B6B6B]">{r.employeeNumber}</span></td>
                      <td className={cell}>{r.action === "CREATE" ? "Will be written" : r.action === "ALREADY" ? "Already applied" : `Skipped: ${r.reason}`}</td>
                      <td className={cell}>
                        {r.segments.map((s) => <div key={s.startDate}>{Number(s.accrualAmount)} from {s.startDate}{s.endDate ? ` to ${s.endDate}` : ""}</div>)}
                        {r.endsExisting.map((x) => <div key={x.startDate} className="text-[12px] text-[#B54708]">Ends the one from {x.startDate} on {x.newEndDate}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button onClick={applyIt} disabled={busy || !plan.rows.some((r) => r.action === "CREATE")}>{busy ? "Applying…" : "Apply"}</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
