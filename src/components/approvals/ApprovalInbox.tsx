"use client";

/**
 * Wave C0 (PAY-213): the shared approval inbox. Lists what waits for the
 * signed-in approver in one module, with the exceptions to look at; approve,
 * reject with a reason, send back (expense claims), and bulk approve the items
 * with no exceptions. Each action posts to the module's own route.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ACTION_ROUTES, bulkApprovable, type InboxItem, type InboxModule } from "@/lib/approvals/inbox-view";

const TAX = [
  { value: "NONTAXABLE_REIMBURSEMENT", label: "Non-taxable reimbursement" },
  { value: "DE_MINIMIS", label: "De minimis" },
  { value: "TAXABLE", label: "Taxable" },
];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, error: (json?.error as string | undefined) ?? "Request failed" };
}

export function ApprovalInbox({ module, title, blurb }: { module: InboxModule; title: string; blurb: string }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<InboxItem | null>(null);
  const [reason, setReason] = useState("");
  const [tax, setTax] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/approvals/inbox?module=${module}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(json.error ?? "Could not load the queue"); return; }
    setItems(json.data ?? []);
    setSelected(new Set());
  }, [module]);
  useEffect(() => { void load(); }, [load]);

  const clean = useMemo(() => new Set(bulkApprovable(items).map((i) => i.id)), [items]);

  function show(i: InboxItem) {
    setOpen(i); setReason(""); setTax((i.details.taxTreatment as string | null) ?? "");
  }

  async function act(i: InboxItem, kind: "approve" | "reject" | "returnTo") {
    const routes = ACTION_ROUTES[module];
    if (kind !== "approve" && !reason.trim()) { toast.error(kind === "reject" ? "Give the reason for rejecting" : "Say what the employee should fix"); return; }
    const body =
      kind === "approve"
        ? module === "EXPENSE"
          ? { ...(tax ? { taxTreatment: tax } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }
          : { ...(reason.trim() ? { note: reason.trim() } : {}) }
        : { reason: reason.trim() };
    setBusy(true);
    const r = await post(routes[kind]!(i.id), body);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Sent back to the employee");
    setOpen(null);
    void load();
  }

  async function bulk() {
    const chosen = items.filter((i) => selected.has(i.id) && clean.has(i.id));
    if (!chosen.length) return;
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const i of chosen) {
      const r = await post(ACTION_ROUTES[module].approve(i.id), {});
      if (r.ok) done++; else failed.push(`${i.employee.name}: ${r.error}`);
    }
    setBusy(false);
    if (done) toast.success(`${done} approved`);
    if (failed.length) toast.error(failed.slice(0, 3).join("\n"));
    void load();
  }

  async function viewReceipt(id: string) {
    const res = await fetch(`/api/expense-claims/${id}/receipt`);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data?.url) { toast.error(json?.error ?? "The receipt could not be opened."); return; }
    window.open(json.data.url, "_blank", "noopener");
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px] align-top";
  const typeTreatment = open?.details.taxTreatment as string | null | undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">{title}</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">{blurb}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button size="sm" className="h-9 text-[13px]" onClick={bulk} disabled={busy || ![...selected].some((id) => clean.has(id))}>
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Approve selected
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        {loading && !items.length ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <table className="w-full">
            <thead className="border-b bg-[#FAFAFA]">
              <tr>
                <th className={`${head} w-8`}>
                  <Checkbox checked={clean.size > 0 && [...clean].every((id) => selected.has(id))} onCheckedChange={(c: boolean) => setSelected(c ? new Set(clean) : new Set())} aria-label="Select all without exceptions" />
                </th>
                <th className={head}>Employee</th><th className={head}>Request</th><th className={head}>Dates</th>
                <th className={head}>Amount</th><th className={head}>To look at</th><th className={head} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[13px] text-[#6B6B6B]">Nothing waiting for you.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className={cell}>
                    <Checkbox checked={selected.has(i.id)} disabled={!clean.has(i.id)} onCheckedChange={() => toggle(i.id)} aria-label={`Select ${i.employee.name}`} />
                  </td>
                  <td className={cell}><div className="font-medium">{i.employee.name}</div><div className="text-[12px] text-[#6B6B6B]">{i.employee.employeeNumber}{i.employee.department ? ` · ${i.employee.department}` : ""}</div></td>
                  <td className={cell}><div>{i.title}</div><div className="text-[12px] text-[#6B6B6B] line-clamp-1">{i.reason}</div></td>
                  <td className={`${cell} whitespace-nowrap`}>{i.date}{i.endDate && i.endDate !== i.date ? ` to ${i.endDate}` : ""}</td>
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{i.amount}</td>
                  <td className={cell}>
                    {i.exceptions.length === 0 ? <span className="text-[12px] text-[#027A48]">None</span> : (
                      <ul className="space-y-0.5 text-[12px] text-[#B54708]">{i.exceptions.map((e) => <li key={e}>{e}</li>)}</ul>
                    )}
                    {i.via === "HR_OVERRIDE" && <div className="text-[11.5px] text-[#6B6B6B]">Waiting on another approver; you may approve over the chain.</div>}
                  </td>
                  <td className={cell}><Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => show(i)}>Review</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{open?.title}</SheetTitle></SheetHeader>
          {open && (
            <div className="mt-5 space-y-4 text-[13px]">
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> {open.employee.name} ({open.employee.employeeNumber})</p>
                <p><span className="text-muted-foreground">Dates:</span> {open.date}{open.endDate && open.endDate !== open.date ? ` to ${open.endDate}` : ""}</p>
                <p><span className="text-muted-foreground">Amount:</span> {open.amount}</p>
                {open.reason && <p><span className="text-muted-foreground">Reason:</span> {open.reason}</p>}
                {module === "EXPENSE" && <p><span className="text-muted-foreground">Type:</span> {String(open.details.type ?? "—")}</p>}
                {module === "LEAVE" && (
                  <p><span className="text-muted-foreground">Balance:</span> {String(open.details.balanceAvailable)} now, {String(open.details.balanceAfter)} after the pending requests</p>
                )}
              </div>
              {module === "EXPENSE" && open.details.hasReceipt === true && (
                <Button variant="outline" size="sm" onClick={() => viewReceipt(open.id)}>Open the receipt</Button>
              )}
              {module === "LEAVE" && Array.isArray(open.details.coverage) && open.details.coverage.length > 0 && (
                <div><p className="font-medium mb-1">Also off in the department</p><ul className="list-disc pl-5 text-[12.5px]">{(open.details.coverage as string[]).map((c) => <li key={c}>{c}</li>)}</ul></div>
              )}
              {open.exceptions.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 space-y-1">{open.exceptions.map((e) => <p key={e}>{e}</p>)}</div>
              )}
              {module === "EXPENSE" && (
                <div className="space-y-1.5">
                  <Label>Tax treatment</Label>
                  <Select value={tax} onValueChange={(v) => setTax(v ?? tax)}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{TAX.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {typeTreatment && tax && tax !== typeTreatment && <p className="text-[12px] text-[#B54708]">Differs from the type&apos;s treatment: give a reason below.</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Note or reason</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Needed to reject or send back" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act(open, "approve")} disabled={busy}>Approve</Button>
                <Button variant="outline" onClick={() => act(open, "reject")} disabled={busy}>Reject</Button>
                {ACTION_ROUTES[module].returnTo && <Button variant="outline" onClick={() => act(open, "returnTo")} disabled={busy}>Send back</Button>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
