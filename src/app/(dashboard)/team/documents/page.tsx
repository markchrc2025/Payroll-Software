"use client";

/**
 * Wave F3 (PAY-216): Document and Form Sharing. Share a file with everyone or
 * some departments, optionally asking for an "I have read and understood";
 * a new version asks again; the tracker shows who has not.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Doc = { id: string; title: string; description: string | null; requiresAck: boolean; version: number; fileName: string | null; updatedAt: string; audienceCount: number; acknowledged: number; audience: { departmentIds: string[] } };
type Track = { version: number; rows: { employeeId: string; employeeNumber: string; name: string; acknowledgedAt: string | null }[] };

export default function SharedDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiresAck, setRequiresAck] = useState(true);
  const [dept, setDept] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [track, setTrack] = useState<{ doc: Doc; t: Track } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setDocs((await fetch("/api/team/documents").then((r) => r.json()).catch(() => null))?.data ?? []), []);
  useEffect(() => { void load(); fetch("/api/departments").then((r) => r.json()).then((j) => setDepts(j?.data ?? [])).catch(() => setDepts([])); }, [load]);

  async function share() {
    if (!file) { toast.error("Choose the file"); return; }
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title); fd.append("description", description);
    fd.append("requiresAck", String(requiresAck)); fd.append("departmentIds", dept.join(",")); fd.append("branchIds", "");
    setBusy(true);
    const res = await fetch("/api/team/documents", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "Could not share it"); return; }
    toast.success("Shared"); setTitle(""); setDescription(""); setFile(null); setDept([]); void load();
  }
  async function newVersion(d: Doc, f: File | undefined) {
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    const note = prompt("What changed? (optional)") ?? "";
    fd.append("note", note);
    const res = await fetch(`/api/team/documents/${d.id}/versions`, { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not upload"); return; }
    toast.success(j?.message ?? "New version shared"); void load();
  }
  async function stop(d: Doc) {
    if (!confirm(`Stop sharing ${d.title}?`)) return;
    await fetch(`/api/team/documents/${d.id}`, { method: "DELETE" }); void load();
  }
  async function showTracker(d: Doc) {
    setTrack({ doc: d, t: (await fetch(`/api/team/documents/${d.id}/tracker`).then((r) => r.json()).catch(() => null))?.data ?? { version: d.version, rows: [] } });
  }

  const head = "px-3 py-2 text-left text-[12px] font-semibold text-[#6B6B6B]";
  const cell = "px-3 py-2.5 text-[13px] align-top";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Document &amp; Form Sharing</h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">Files for employees to read or download in ESS: the handbook, policies, forms. Ask for an &quot;I have read and understood&quot; and see who has not; a new version asks everyone again.</p>
      </div>
      <section className="rounded-lg border bg-white p-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Employee Handbook 2027" /></div>
        <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] sm:col-span-2"><span className="text-[#6B6B6B]">For:</span>{depts.map((d) => {
          const on = dept.includes(d.id);
          return <button key={d.id} type="button" onClick={() => setDept(on ? dept.filter((x) => x !== d.id) : [...dept, d.id])} className={`rounded-full border px-2 ${on ? "border-[#E8693A] bg-[#FDF1EC]" : ""}`}>{d.name}</button>;
        })}<span className="text-[#6B6B6B]">{dept.length ? "" : "(everyone)"}</span></div>
        <label className="flex items-center gap-2 text-[13px]"><Switch checked={requiresAck} onCheckedChange={(c: boolean) => setRequiresAck(c)} /> Ask for &quot;I have read and understood&quot;</label>
        <div className="sm:text-right"><Button size="sm" onClick={share} disabled={busy || !title.trim()}>Share</Button></div>
      </section>
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-[#FAFAFA]"><tr><th className={head}>Document</th><th className={head}>Version</th><th className={head}>Acknowledged</th><th className={head} /></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-[13px] text-[#6B6B6B]">Nothing shared yet.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="border-b last:border-0">
                <td className={cell}><div className="font-medium">{d.title}</div><div className="text-[12px] text-[#6B6B6B]">{d.fileName} · {d.audience.departmentIds.length ? `${d.audience.departmentIds.length} department(s)` : "Everyone"}</div></td>
                <td className={cell}>{d.version} <span className="text-[12px] text-[#6B6B6B]">({d.updatedAt.slice(0, 10)})</span></td>
                <td className={cell}>{d.requiresAck ? <button type="button" className="text-[#E8693A] hover:underline" onClick={() => showTracker(d)}>{d.acknowledged} of {d.audienceCount}</button> : "Not asked"}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  <a href={`/api/team/documents/${d.id}/file`} className="mr-3 inline-flex items-center gap-1 text-[12.5px] text-[#E8693A] hover:underline"><Download className="h-3.5 w-3.5" /> File</a>
                  <label className="mr-2 cursor-pointer rounded border px-2 py-1 text-xs hover:bg-[#F7F7F7]">New version<input type="file" className="hidden" onChange={(e) => newVersion(d, e.target.files?.[0])} /></label>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => stop(d)}>Stop sharing</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={!!track} onOpenChange={(o) => !o && setTrack(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{track?.doc.title}, version {track?.t.version}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-1">
            {track?.t.rows.map((r) => (
              <div key={r.employeeId} className="flex justify-between border-b py-1.5 text-[13px]"><span>{r.name} <span className="text-[12px] text-[#6B6B6B]">{r.employeeNumber}</span></span>
                <span className={r.acknowledgedAt ? "text-[#027A48]" : "text-[#B42318]"}>{r.acknowledgedAt ? r.acknowledgedAt.slice(0, 10) : "Not yet"}</span></div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
