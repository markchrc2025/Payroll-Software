"use client";

/**
 * Wave C3 (PAY-213): the employee requests a document (a Certificate of
 * Employment and the like) and downloads it once it is approved.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Template = { id: string; name: string };
type Req = { id: string; purpose: string | null; status: string; rejectionReason: string | null; createdAt: string; template: { name: string } };

const STATUS: Record<string, string> = { PENDING: "Waiting for approval", APPROVED: "Ready", REJECTED: "Not approved", CANCELLED: "Cancelled" };

export default function EssDocumentsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  const headers = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` }), []);
  const load = useCallback(async () => {
    if (!localStorage.getItem("ess_token")) { router.replace("/ess/login"); return; }
    const [t, r] = await Promise.all([
      fetch("/api/ess/document-templates", { headers: headers() }).then((x) => (x.ok ? x.json() : null)),
      fetch("/api/ess/document-requests", { headers: headers() }).then((x) => (x.ok ? x.json() : null)),
    ]);
    setTemplates(t?.data ?? []); setRequests(r?.data ?? []);
  }, [headers, router]);
  useEffect(() => { void load(); }, [load]);

  async function request() {
    if (!templateId) { toast.error("Choose the document"); return; }
    setSaving(true);
    const res = await fetch("/api/ess/document-requests", { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ templateId, purpose: purpose.trim() || null }) });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { toast.error(json?.error ?? "Could not request it"); return; }
    toast.success("Requested. You can download it here once it is approved.");
    setTemplateId(""); setPurpose(""); void load();
  }

  async function download(r: Req) {
    const res = await fetch(`/api/ess/document-requests/${r.id}/pdf`, { headers: headers() });
    if (!res.ok) { toast.error("The document could not be downloaded."); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `${r.template.name.replace(/[^A-Za-z0-9]+/g, "_")}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-2xl mx-auto">
      <Link href="/ess" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">Request a Certificate of Employment or another company document. HR approves it, then you download it here.</p>
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        {templates.length === 0 ? <p className="text-sm text-muted-foreground">Your company has no documents to request yet.</p> : (
          <>
            <div className="space-y-1">
              <Label>Document</Label>
              <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Purpose</Label><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. bank loan application" maxLength={300} /></div>
            <Button onClick={request} disabled={saving}>{saving ? "Sending…" : "Request"}</Button>
          </>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">My requests</h2>
        {requests.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <div className="font-medium text-sm">{r.template.name}</div>
              <div className="text-xs text-muted-foreground">{r.createdAt.slice(0, 10)}{r.purpose ? ` · ${r.purpose}` : ""} · {STATUS[r.status] ?? r.status}{r.status === "REJECTED" && r.rejectionReason ? `: ${r.rejectionReason}` : ""}</div>
            </div>
            {r.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => download(r)}><Download className="h-3.5 w-3.5 mr-1.5" /> PDF</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
