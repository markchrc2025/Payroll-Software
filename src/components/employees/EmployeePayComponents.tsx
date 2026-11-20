"use client";

/**
 * PAY-150: an employee's earnings and deductions (pay component assignments),
 * on the Compensation tab. There was no screen for this before: assignments
 * could only be made through the API.
 *
 * A deduction needs the employee's written authorization on file (date signed
 * and an uploaded copy) or payroll will not take it. A loss or damage
 * deduction also needs the incident record and the actual loss.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileCheck2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Component = { id: string; code: string; name: string; kind: string; isLossOrDamage: boolean; isActive: boolean };
type Assignment = {
  id: string; amountCents: string; effectiveFrom: string; endDate: string | null;
  authorizationDate: string | null; authorizationFileKey: string | null;
  incidentReportId: string | null; actualLossCents: string | null;
  payComponent: Component;
};
type Incident = { id: string; subject: string; incidentDate: string; employeeResponse: string | null; resolution: string | null };

const peso = (cents: string | null) =>
  cents == null ? "-" : (Number(cents) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** What payroll will say about this deduction, or null when it will be taken. */
export function deductionProblem(a: Pick<Assignment, "authorizationDate" | "authorizationFileKey" | "incidentReportId" | "actualLossCents"> & { payComponent: Pick<Component, "kind" | "isLossOrDamage"> }): string | null {
  if (a.payComponent.kind !== "DEDUCTION") return null;
  if (!a.authorizationDate || !a.authorizationFileKey) return "No written authorization on file: payroll will not deduct this";
  if (a.payComponent.isLossOrDamage && !a.incidentReportId) return "No incident record: payroll will not deduct this";
  if (a.payComponent.isLossOrDamage && !a.actualLossCents) return "The actual loss is not recorded: payroll will not deduct this";
  return null;
}

const EMPTY = { payComponentId: "", amount: "", effectiveFrom: new Date().toISOString().slice(0, 10), authorizationDate: "", incidentReportId: "", actualLoss: "" };

export function EmployeePayComponents({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [catalog, setCatalog] = useState<Component[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, c, i] = await Promise.all([
      fetch(`/api/employees/${employeeId}/pay-components`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pay-components?limit=200&isActive=true`).then((r) => r.json()).catch(() => null),
      fetch(`/api/incidents?employeeId=${employeeId}&limit=100`).then((r) => r.json()).catch(() => null),
    ]);
    setRows(a?.data ?? []);
    setCatalog(c?.data ?? []);
    setIncidents(i?.data ?? []);
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const chosen = editing?.payComponent ?? catalog.find((c) => c.id === form.payComponentId);
  const isDeduction = chosen?.kind === "DEDUCTION";
  const isLoss = !!chosen?.isLossOrDamage;

  function startAdd() { setEditing(null); setForm(EMPTY); setFile(null); setOpen(true); }
  function startEdit(a: Assignment) {
    setEditing(a);
    setForm({
      payComponentId: a.payComponent.id, amount: (Number(a.amountCents) / 100).toFixed(2), effectiveFrom: day(a.effectiveFrom),
      authorizationDate: day(a.authorizationDate), incidentReportId: a.incidentReportId ?? "",
      actualLoss: a.actualLossCents ? (Number(a.actualLossCents) / 100).toFixed(2) : "",
    });
    setFile(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      let authorizationFileKey: string | undefined;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch(`/api/employees/${employeeId}/pay-components/authorization`, { method: "POST", body: fd });
        const uj = await up.json().catch(() => null);
        if (!up.ok) { toast.error(uj?.error ?? "The authorization could not be uploaded"); return; }
        authorizationFileKey = uj.data.key;
      }
      const guard = isDeduction
        ? {
            authorizationDate: form.authorizationDate || null,
            ...(authorizationFileKey ? { authorizationFileKey } : {}),
            ...(isLoss ? { incidentReportId: form.incidentReportId || null, actualLoss: form.actualLoss || null } : {}),
          }
        : {};
      const res = editing
        ? await fetch(`/api/employees/${employeeId}/pay-components/${editing.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(guard),
          })
        : await fetch(`/api/employees/${employeeId}/pay-components`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payComponentId: form.payComponentId, amount: form.amount || "0", effectiveFrom: form.effectiveFrom, ...guard }),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.error ?? "Could not save"); return; }
      toast.success(editing ? "Saved" : "Assigned");
      setOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: Assignment) {
    if (!confirm(`Remove ${a.payComponent.name} from this employee?`)) return;
    const res = await fetch(`/api/employees/${employeeId}/pay-components/${a.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not remove"); return; }
    load();
  }

  async function view(a: Assignment) {
    const res = await fetch(`/api/employees/${employeeId}/pay-components/${a.id}/authorization`);
    const json = await res.json().catch(() => null);
    if (!res.ok) { toast.error(json?.error ?? "Could not open the authorization"); return; }
    window.open(json.data.url, "_blank", "noopener");
  }

  return (
    <section aria-label="Earnings and deductions" className="rounded-xl border border-[#E8E8E8] bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8]">
        <div>
          <h3 className="text-[14px] font-semibold text-[#171717]">Earnings and deductions</h3>
          <p className="text-[12.5px] text-[#6B6B6B]">Pay components applied to this employee on every payroll, from the start date.</p>
        </div>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Assign</Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-[#6B6B6B]">Nothing assigned.</p>
      ) : (
        <ul>
          {rows.map((a) => {
            const problem = deductionProblem(a);
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-[#F1F1F1]">
                <span className="text-[13.5px] font-medium text-[#171717] w-52">{a.payComponent.name}</span>
                <span className="text-[12px] text-[#6B6B6B] w-24">{a.payComponent.kind === "DEDUCTION" ? "Deduction" : "Earning"}</span>
                <span className="text-[13px] tabular-nums w-28">
                  {a.payComponent.isLossOrDamage ? `Loss ${peso(a.actualLossCents)}` : peso(a.amountCents)}
                </span>
                <span className="text-[12px] text-[#6B6B6B]">from {day(a.effectiveFrom)}{a.endDate ? ` to ${day(a.endDate)}` : ""}</span>
                {problem ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{problem}</span>
                ) : a.payComponent.kind === "DEDUCTION" ? (
                  <button className="inline-flex items-center gap-1 text-[12px] text-emerald-700 hover:underline" onClick={() => view(a)}>
                    <FileCheck2 className="h-3.5 w-3.5" />Authorized {day(a.authorizationDate)}
                  </button>
                ) : null}
                <span className="ml-auto flex gap-1">
                  {a.payComponent.kind === "DEDUCTION" && <Button size="sm" variant="ghost" onClick={() => startEdit(a)}>Authorization</Button>}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Remove ${a.payComponent.name}`} onClick={() => remove(a)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? `${editing.payComponent.name}: authorization` : "Assign a pay component"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <>
                <div className="space-y-1.5">
                  <Label>Pay component</Label>
                  <Select value={form.payComponentId} onValueChange={(v) => setForm({ ...form, payComponentId: v ?? "" })}>
                    <SelectTrigger aria-label="Pay component"><SelectValue placeholder="Choose..." /></SelectTrigger>
                    <SelectContent>
                      {catalog.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.kind === "DEDUCTION" ? "deduction" : "earning"})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="epc-amount">{isLoss ? "Installment per payroll (optional)" : "Amount per payroll"}</Label>
                    <Input id="epc-amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="epc-from">Starts</Label>
                    <Input id="epc-from" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            {isDeduction && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-[12.5px] text-muted-foreground">
                  A deduction needs the employee&apos;s written authorization (Labor Code Article 113). Payroll will not take it until the date and a copy are on file.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="epc-auth-date">Date the employee signed</Label>
                  <Input id="epc-auth-date" type="date" value={form.authorizationDate} onChange={(e) => setForm({ ...form, authorizationDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epc-auth-file">Signed authorization (PDF or photo){editing?.authorizationFileKey ? ": one is on file; choose a file to replace it" : ""}</Label>
                  <input id="epc-auth-file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
                {isLoss && (
                  <>
                    <p className="text-[12.5px] text-muted-foreground">
                      Loss or damage (Articles 114 and 115): the employee must first be heard and shown to be responsible. Payroll recovers no more than the actual loss, at most 20% of each period&apos;s wages.
                    </p>
                    <div className="space-y-1.5">
                      <Label>Incident record</Label>
                      <Select value={form.incidentReportId} onValueChange={(v) => setForm({ ...form, incidentReportId: v ?? "" })}>
                        <SelectTrigger aria-label="Incident record"><SelectValue placeholder="Choose the incident..." /></SelectTrigger>
                        <SelectContent>
                          {incidents.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {day(i.incidentDate)} {i.subject}{i.employeeResponse && i.resolution ? "" : " (employee not yet heard or not resolved)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="epc-loss">Actual loss</Label>
                      <Input id="epc-loss" inputMode="decimal" placeholder="0.00" value={form.actualLoss} onChange={(e) => setForm({ ...form, actualLoss: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || (!editing && (!form.payComponentId || (!isLoss && !form.amount)))}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
