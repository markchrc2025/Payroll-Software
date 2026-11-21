"use client";

/**
 * Wave C3 (PAY-213): Document Workflow Management. HR keeps the letter
 * templates employees request in ESS, and sees every request with the issued
 * letters to download.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Template = { id: string; name: string; title: string; body: string; signatoryName: string | null; signatoryTitle: string | null; showsSalary: boolean; availableInEss: boolean; isActive: boolean };
type Starter = { name: string; title: string; body: string };
type Req = { id: string; status: string; purpose: string | null; createdAt: string; decidedAt: string | null; rejectionReason: string | null; employee: { firstName: string; lastName: string; employeeNumber: string }; template: { name: string } };

const EMPTY = { id: "", name: "", title: "", body: "", signatoryName: "", signatoryTitle: "", availableInEss: true, isActive: true };

export default function DocumentManagementPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [starters, setStarters] = useState<Starter[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [edit, setEdit] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([fetch("/api/document-templates").then((x) => x.json()), fetch("/api/document-requests").then((x) => x.json())]);
    setTemplates(t?.data?.templates ?? []); setFields(t?.data?.mergeFields ?? {}); setStarters(t?.data?.starters ?? []);
    setRequests(r?.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!edit) return;
    setSaving(true);
    const { id, ...body } = edit;
    const res = await fetch(id ? `/api/document-templates/${id}` : "/api/document-templates", {
      method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, signatoryName: body.signatoryName || null, signatoryTitle: body.signatoryTitle || null }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { toast.error(json?.error ?? "Could not save"); return; }
    toast.success("Template saved"); setEdit(null); void load();
  }

  async function remove(t: Template) {
    if (!confirm(`Remove ${t.name}? Letters already issued are kept.`)) return;
    const res = await fetch(`/api/document-templates/${t.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not remove it"); return; }
    void load();
  }

  const insert = (key: string) => setEdit((e) => (e ? { ...e, body: `${e.body}{{${key}}}` } : e));
  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Document Management</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">The letters employees request in ESS (Certificates of Employment and the like). A request goes through the company&apos;s document approval workflow; approving it issues the letter, filled from the employee&apos;s record.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" className="h-9 text-[13px]" onClick={() => setEdit({ ...EMPTY })}><Plus className="h-3.5 w-3.5 mr-1.5" /> New template</Button>
        </div>
      </div>

      <section className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>Template</th><th className={head}>In ESS</th><th className={head}>Shows pay</th><th className={head} /></tr></thead>
          <tbody>
            {templates.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-[13px] text-[#6B6B6B]">
                No templates yet.{" "}
                {starters.map((st) => <Button key={st.name} variant="link" size="sm" onClick={() => setEdit({ ...EMPTY, ...st })}>Start from {st.name}</Button>)}
              </td></tr>
            )}
            {templates.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className={cell}><div className="font-medium">{t.name}</div>{!t.isActive && <span className="text-[12px] text-[#6B6B6B]">Inactive</span>}</td>
                <td className={cell}>{t.availableInEss ? "Yes" : "No"}</td>
                <td className={cell}>{t.showsSalary ? <Badge variant="outline">Pay access to approve</Badge> : "No"}</td>
                <td className={`${cell} text-right`}>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs mr-2" onClick={() => setEdit({ id: t.id, name: t.name, title: t.title, body: t.body, signatoryName: t.signatoryName ?? "", signatoryTitle: t.signatoryTitle ?? "", availableInEss: t.availableInEss, isActive: t.isActive })}>Edit</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => remove(t)}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Requests</h2>
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>Employee</th><th className={head}>Document</th><th className={head}>Purpose</th><th className={head}>Filed</th><th className={head}>Status</th><th className={head} /></tr></thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-[13px] text-[#6B6B6B]">No requests yet.</td></tr>}
              {requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={cell}>{r.employee.lastName}, {r.employee.firstName} <span className="text-[12px] text-[#6B6B6B]">{r.employee.employeeNumber}</span></td>
                  <td className={cell}>{r.template.name}</td>
                  <td className={cell}>{r.purpose ?? ""}</td>
                  <td className={cell}>{r.createdAt.slice(0, 10)}</td>
                  <td className={cell}>{r.status === "APPROVED" ? "Issued" : r.status === "REJECTED" ? `Rejected${r.rejectionReason ? `: ${r.rejectionReason}` : ""}` : r.status === "PENDING" ? "Pending" : r.status}</td>
                  <td className={`${cell} text-right`}>{r.status === "APPROVED" && <a href={`/api/document-requests/${r.id}/pdf`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#E8693A] hover:underline"><Download className="h-3.5 w-3.5" /> PDF</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{edit?.id ? "Edit template" : "New template"}</SheetTitle></SheetHeader>
          {edit && (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Certificate of Employment" /></div>
              <div className="space-y-1.5"><Label>Title on the letter</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Body</Label><Textarea rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /><p className="text-[12px] text-[#6B6B6B]">A blank line starts a new paragraph. Click a field to add it.</p></div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(fields).map(([k, label]) => <button key={k} type="button" title={label} onClick={() => insert(k)} className="rounded border px-1.5 py-0.5 text-[11.5px] font-mono hover:bg-[#F7F7F7]">{`{{${k}}}`}</button>)}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Signatory</Label><Input value={edit.signatoryName} onChange={(e) => setEdit({ ...edit, signatoryName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Signatory&apos;s position</Label><Input value={edit.signatoryTitle} onChange={(e) => setEdit({ ...edit, signatoryTitle: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-[13px]">Employees may request it in ESS</span><Switch checked={edit.availableInEss} onCheckedChange={(c: boolean) => setEdit({ ...edit, availableInEss: c })} /></div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-[13px]">Active</span><Switch checked={edit.isActive} onCheckedChange={(c: boolean) => setEdit({ ...edit, isActive: c })} /></div>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
