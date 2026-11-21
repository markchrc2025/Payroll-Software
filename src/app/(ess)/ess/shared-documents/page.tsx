"use client";

/** Wave F3 (PAY-216): the documents and forms HR shared with me; acknowledge the ones that ask. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Doc = { id: string; title: string; description: string | null; version: number; fileName: string | null; updatedAt: string; note: string | null; requiresAck: boolean; acknowledged: boolean };

export default function EssSharedDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const headers = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` }), []);
  const load = useCallback(async () => setDocs((await fetch("/api/ess/team/documents", { headers: headers() }).then((r) => (r.ok ? r.json() : null)).catch(() => null))?.data ?? []), [headers]);
  useEffect(() => { void load(); }, [load]);
  async function download(d: Doc) {
    const res = await fetch(`/api/ess/team/documents/${d.id}/file`, { headers: headers() });
    if (!res.ok) { toast.error("The file could not be downloaded."); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = d.fileName ?? "file"; a.click(); URL.revokeObjectURL(url);
  }
  async function ack(d: Doc) {
    const res = await fetch(`/api/ess/team/documents/${d.id}/ack`, { method: "POST", headers: headers() });
    if (!res.ok) { toast.error("Could not record it"); return; }
    toast.success("Thank you"); void load();
  }
  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-2xl mx-auto">
      <Link href="/ess" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
      <div><h1 className="text-xl lg:text-2xl font-bold">Company documents</h1><p className="text-sm text-muted-foreground">Policies, the handbook and forms from HR.</p></div>
      {docs.length === 0 && <p className="text-sm text-muted-foreground">Nothing shared with you yet.</p>}
      {docs.map((d) => (
        <div key={d.id} className="rounded-lg border p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-medium">{d.title}</div><div className="text-xs text-muted-foreground">Version {d.version}, {d.updatedAt.slice(0, 10)}{d.note ? `: ${d.note}` : ""}</div></div>
            <Button size="sm" variant="outline" onClick={() => download(d)}><Download className="h-3.5 w-3.5 mr-1.5" /> Open</Button>
          </div>
          {d.description && <p className="text-sm">{d.description}</p>}
          {d.requiresAck && (d.acknowledged
            ? <p className="text-xs text-[#027A48]">You acknowledged this version.</p>
            : <Button size="sm" onClick={() => ack(d)}>I have read and understood</Button>)}
        </div>
      ))}
    </div>
  );
}
