"use client";

/**
 * PAY-68: payroll corrections. A finalized payslip is never edited: a
 * correction is a new document that a second person approves and that lands
 * in a later draft run. API: /api/payroll/corrections.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ITEMS: [string, string][] = [
  ["BASIC", "Basic pay"], ["OVERTIME", "Overtime"], ["NIGHT_DIFF", "Night differential"], ["HOLIDAY", "Holiday pay"],
  ["REST_DAY", "Rest day pay"], ["HAZARD", "Hazard pay"], ["ALLOWANCE", "Taxable allowances"], ["LATES", "Lates and undertime"], ["OTHER", "Other"],
];
type Run = { id: string; periodStart: string; periodEnd: string; status: string; controlNumber?: string | null; runType: string };
type Sheet = { id: string; employeeId: string; employeeName?: string | null; employeeNumber?: string | null };
type Correction = {
  id: string; status: string; kind?: string; batchId?: string | null; controlNumber: string | null; reason: string; netEffectCents: string; createdAt: string;
  lines: { item: string; amountCents: string; taxable: boolean; description?: string }[];
  employee: { employeeNumber: string; firstName: string; lastName: string };
  originalSheet: { controlNumber: string | null; payrollBook: { periodStart: string; periodEnd: string } };
  targetBook: { id: string; status: string; periodStart: string; periodEnd: string; controlNumber: string | null } | null;
};
type Line = { item: string; pesos: string; taxable: boolean; description: string };

const day = (s: string) => s.slice(0, 10);
const runLabel = (r: Run) => `${day(r.periodStart)} to ${day(r.periodEnd)}${r.controlNumber ? ` · ${r.controlNumber}` : ""}`;
function toCents(pesos: string): string | null {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(pesos.replace(/,/g, "").trim());
  if (!m) return null;
  return `${m[1] ?? ""}${BigInt(m[2]!) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0")}`;
}
function peso(c: string) {
  const n = BigInt(c); const a = n < 0n ? -n : n;
  const s = `${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(a % 100n).toString().padStart(2, "0")}`;
  return n < 0n ? `(${s})` : s;
}

export default function CorrectionsPage() {
  const [rows, setRows] = useState<Correction[]>([]);
  const [finalRuns, setFinalRuns] = useState<Run[]>([]);
  const [draftRuns, setDraftRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runId, setRunId] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetId, setSheetId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item: "BASIC", pesos: "", taxable: true, description: "" }]);
  const [landIn, setLandIn] = useState<Record<string, string>>({});
  // PAY-166: retroactive salary increase.
  const [retroOpen, setRetroOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; employeeNumber: string; firstName: string; lastName: string }[]>([]);
  const [retro, setRetro] = useState({ employeeId: "", pesos: "", from: "", to: "", reason: "" });
  const [retroItems, setRetroItems] = useState<string[]>(["BASIC", "OVERTIME", "NIGHT_DIFF", "HOLIDAY", "REST_DAY", "LATES"]);
  const [retroPreview, setRetroPreview] = useState<{ sheetId: string; periodStart: string; periodEnd: string; totalCents: string }[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, f, d] = await Promise.all([
      fetch("/api/payroll/corrections").then((r) => r.json()),
      fetch("/api/payroll/runs?status=FINALIZED&limit=100").then((r) => r.json()),
      fetch("/api/payroll/runs?status=DRAFT&limit=100").then((r) => r.json()),
    ]);
    setRows(c.data ?? []); setFinalRuns(f.data ?? []); setDraftRuns(d.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!runId) { setSheets([]); return; }
    void fetch(`/api/payroll/runs/${runId}`).then((r) => r.json()).then((j) => setSheets(j.data?.sheets ?? []));
  }, [runId]);

  async function submit() {
    const body = { originalSheetId: sheetId, reason, lines: lines.map((l) => ({ item: l.item, amountCents: toCents(l.pesos) ?? "x", taxable: l.taxable, description: l.description || undefined })) };
    const res = await fetch("/api/payroll/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error([json.error, ...(json.details?.problems ?? [])].filter(Boolean).join(" ")); return; }
    toast.success("Correction saved as a draft. Someone else approves it.");
    setCreating(false); setReason(""); setLines([{ item: "BASIC", pesos: "", taxable: true, description: "" }]); setSheetId(""); setRunId("");
    void load();
  }

  useEffect(() => {
    if (!retroOpen || people.length) return;
    void fetch("/api/employees?limit=500").then((r) => r.json()).then((j) => setPeople(j.data ?? []));
  }, [retroOpen, people.length]);

  function retroBody() {
    return { employees: [{ employeeId: retro.employeeId, newBasicSalaryCents: toCents(retro.pesos) ?? "x" }], from: retro.from, to: retro.to, items: retroItems, reason: retro.reason };
  }
  async function retroSend(preview: boolean) {
    const res = await fetch(`/api/payroll/retro-pay${preview ? "?preview=1" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(retroBody()) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not work out the increase"); return; }
    if (preview) { setRetroPreview(json.data); return; }
    toast.success(`Saved for ${json.data.payslips} payslip(s): ${peso(json.data.totalCents)}. Someone else approves it.`);
    setRetroOpen(false); setRetroPreview(null); void load();
  }
  async function approveBatch(batchId: string, rowId: string) {
    const bookId = landIn[rowId];
    if (!bookId) { toast.error("Pick the draft run it lands in"); return; }
    const res = await fetch(`/api/payroll/retro-pay/${batchId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error([json.error, ...(json.details?.problems ?? [])].filter(Boolean).join(" ")); return; }
    toast.success(`Approved ${json.data.approved} correction(s): ${json.data.controlNumbers.join(", ")}`);
    void load();
  }

  async function act(id: string, action: "approve" | "land" | "cancel") {
    const bookId = landIn[id];
    if (action !== "cancel" && !bookId) { toast.error("Pick the draft run it lands in"); return; }
    const res = await fetch(`/api/payroll/corrections/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "cancel" ? {} : { bookId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error([json.error, ...(json.details?.problems ?? [])].filter(Boolean).join(" ")); return; }
    toast.success(action === "cancel" ? "Correction cancelled" : `Correction ${json.data.controlNumber} landed in the draft run`);
    void load();
  }

  const head = "text-[12px] font-semibold text-[#6B6B6B]";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Payroll Corrections</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">
            A finalized payslip is never edited. A correction is a new document: someone other than its author approves it, and it is paid or taken back in a later draft run.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="outline" size="sm" onClick={() => setRetroOpen((v) => !v)} className="h-9 text-[13px]" data-testid="new-retro-pay">Retroactive increase</Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)} className="h-9 text-[13px]" data-testid="new-correction"><Plus className="h-3.5 w-3.5 mr-1.5" /> New correction</Button>
        </div>
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 space-y-3 text-[13px]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">Finalized run</span>
              <select className="h-9 w-full rounded-md border px-2" value={runId} onChange={(e) => { setRunId(e.target.value); setSheetId(""); }}>
                <option value="">Pick a run</option>
                {finalRuns.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="font-medium">Payslip</span>
              <select className="h-9 w-full rounded-md border px-2" value={sheetId} onChange={(e) => setSheetId(e.target.value)} disabled={!runId}>
                <option value="">Pick an employee</option>
                {sheets.map((s) => <option key={s.id} value={s.id}>{s.employeeName ?? s.employeeId}{s.employeeNumber ? ` (${s.employeeNumber})` : ""}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <span className="font-medium">Lines (positive pays more, negative takes back)</span>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <select className="h-9 rounded-md border px-2" value={l.item} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, item: e.target.value } : x)))}>
                  {ITEMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <Input className="h-9 w-36" placeholder="-500.00" value={l.pesos} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, pesos: e.target.value } : x)))} />
                <label className="flex items-center gap-1"><input type="checkbox" checked={l.taxable} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, taxable: e.target.checked } : x)))} /> Taxable</label>
                <Input className="h-9 flex-1 min-w-40" placeholder="Note (optional)" value={l.description} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLines(lines.filter((_, k) => k !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { item: "OTHER", pesos: "", taxable: true, description: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Line</Button>
          </div>
          <label className="block space-y-1"><span className="font-medium">Reason</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the payslip was wrong" />
          </label>
          <Button size="sm" onClick={submit} disabled={!sheetId || !reason.trim()}>Save draft</Button>
        </div>
      )}

      {retroOpen && (
        <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 space-y-3 text-[13px]">
          <p className="text-[#6B6B6B]">Re-prices the finalized regular payslips of the period at the new rate, for the days and hours actually paid, and pays the difference in a later draft run.</p>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 md:col-span-2"><span className="font-medium">Employee</span>
              <select className="h-9 w-full rounded-md border px-2" value={retro.employeeId} onChange={(e) => setRetro({ ...retro, employeeId: e.target.value })}>
                <option value="">Pick an employee</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} ({p.employeeNumber})</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="font-medium">New basic salary</span><Input value={retro.pesos} onChange={(e) => setRetro({ ...retro, pesos: e.target.value })} placeholder="35,000.00" /></label>
            <div />
            <label className="space-y-1"><span className="font-medium">From</span><Input type="date" value={retro.from} onChange={(e) => setRetro({ ...retro, from: e.target.value })} /></label>
            <label className="space-y-1"><span className="font-medium">To</span><Input type="date" value={retro.to} onChange={(e) => setRetro({ ...retro, to: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap gap-3">
            {ITEMS.filter(([v]) => ["BASIC", "OVERTIME", "NIGHT_DIFF", "HOLIDAY", "REST_DAY", "LATES"].includes(v)).map(([v, label]) => (
              <label key={v} className="flex items-center gap-1"><input type="checkbox" checked={retroItems.includes(v)} onChange={(e) => setRetroItems(e.target.checked ? [...retroItems, v] : retroItems.filter((x) => x !== v))} /> {label}</label>
            ))}
          </div>
          <label className="block space-y-1"><span className="font-medium">Reason</span><Input value={retro.reason} onChange={(e) => setRetro({ ...retro, reason: e.target.value })} placeholder="Merit increase approved on ..." /></label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => retroSend(true)} disabled={!retro.employeeId || !retro.from || !retro.to}>Preview</Button>
            <Button size="sm" onClick={() => retroSend(false)} disabled={!retroPreview?.length || !retro.reason.trim()}>Save draft</Button>
          </div>
          {retroPreview && (retroPreview.length === 0 ? <p className="text-[#6B6B6B]">No finalized payslip in the period is below the new rate.</p> : (
            <ul className="text-[12.5px]">{retroPreview.map((r) => <li key={r.sheetId}>{r.periodStart} to {r.periodEnd}: {peso(r.totalCents)}</li>)}
              <li className="font-semibold">Total: {peso(retroPreview.reduce((t, r) => t + BigInt(r.totalCents), 0n).toString())}</li></ul>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] hover:bg-[#F7F7F7]">
              <TableHead className={head}>Correction</TableHead>
              <TableHead className={head}>Employee</TableHead>
              <TableHead className={head}>Corrects</TableHead>
              <TableHead className={`${head} text-right`}>Effect on pay</TableHead>
              <TableHead className={head}>Lands in</TableHead>
              <TableHead className={head} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-[13px] text-[#6B6B6B] py-8">{loading ? "Loading" : "No corrections yet."}</TableCell></TableRow>
            ) : rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-[13px]">
                  <div className="font-medium">{c.controlNumber ?? "Draft"} <Badge variant="secondary">{c.status}</Badge></div>
                  <div className="text-[12px] text-[#6B6B6B]">{c.reason}</div>
                  <div className="text-[12px] text-[#6B6B6B]">{c.lines.map((l) => `${ITEMS.find(([v]) => v === l.item)?.[1] ?? l.item} ${peso(l.amountCents)}`).join("; ")}</div>
                </TableCell>
                <TableCell className="text-[13px]">{c.employee.lastName}, {c.employee.firstName}<div className="text-[12px] text-[#6B6B6B]">{c.employee.employeeNumber}</div></TableCell>
                <TableCell className="text-[13px]">{c.originalSheet.controlNumber ?? ""}<div className="text-[12px] text-[#6B6B6B]">{day(c.originalSheet.payrollBook.periodStart)} to {day(c.originalSheet.payrollBook.periodEnd)}</div></TableCell>
                <TableCell className="text-right tabular-nums text-[13px]">{peso(c.netEffectCents)}</TableCell>
                <TableCell className="text-[13px]">{c.targetBook ? `${day(c.targetBook.periodStart)} to ${day(c.targetBook.periodEnd)} (${c.targetBook.status.toLowerCase()})` : c.status === "CANCELLED" ? "" : (
                  <select className="h-8 rounded-md border px-2 text-[12.5px]" value={landIn[c.id] ?? ""} onChange={(e) => setLandIn({ ...landIn, [c.id]: e.target.value })}>
                    <option value="">Pick a draft run</option>
                    {draftRuns.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
                  </select>
                )}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {c.status === "DRAFT" && c.batchId && <Button size="sm" className="h-8 mr-1" onClick={() => approveBatch(c.batchId!, c.id)}>Approve batch</Button>}
                  {c.status === "DRAFT" && !c.batchId && <Button size="sm" className="h-8 mr-1" onClick={() => act(c.id, "approve")} data-testid="approve-correction">Approve</Button>}
                  {c.status === "APPROVED" && !c.targetBook && <Button size="sm" className="h-8 mr-1" onClick={() => act(c.id, "land")}>Land</Button>}
                  {c.status !== "CANCELLED" && c.targetBook?.status !== "FINALIZED" && <Button variant="outline" size="sm" className="h-8" onClick={() => act(c.id, "cancel")}>Cancel</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
