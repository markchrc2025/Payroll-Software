"use client";

/**
 * PAY-217 Causeless: a dated note on an employee with an optional attachment.
 * No cause, decision or sanction, and nothing for payroll.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Emp = { id: string; employeeNumber: string; firstName: string; lastName: string };
type Note = { id: string; employeeId: string; name: string; employeeNumber: string; noteDate: string; note: string; fileName: string | null };

export default function CauselessPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/incidents/causeless").then((r) => r.json()).then((j) => setNotes(j?.data ?? [])).catch(() => setNotes([]));
  }, []);
  useEffect(() => {
    fetch("/api/employees?limit=500").then((r) => r.json()).then((j) => setEmps(j?.data ?? [])).catch(() => setEmps([]));
    load();
  }, [load]);

  async function save() {
    if (!employeeId) { toast.error("Choose the employee"); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("employeeId", employeeId); fd.set("noteDate", noteDate); fd.set("note", note);
    if (file) fd.set("file", file);
    const res = await fetch("/api/incidents/causeless", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { toast.error(j?.error ?? "It was not saved"); return; }
    toast.success("Saved"); setNote(""); setFile(null); load();
  }
  async function remove(n: Note) {
    if (!window.confirm("Remove this note from the list?")) return;
    const res = await fetch(`/api/incidents/causeless/${n.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("It was not removed"); else load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Causeless</h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">A note on an employee, with an attachment if you have one. It carries no cause, decision or sanction, and nothing goes to payroll. Use Incidents for anything that needs a notice or a decision.</p>
      </div>
      <section className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
        <div className="space-y-1"><Label className="text-[12px]">Employee</Label>
          <select className="h-9 w-full rounded-md border px-2 text-[13px]" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose…</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label className="text-[12px]">Date</Label><Input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} /></div>
        <div className="space-y-1 md:col-span-2"><Label className="text-[12px]">Note</Label>
          <textarea className="min-h-[90px] w-full rounded-md border p-2 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-1"><Label className="text-[12px]">Attachment (optional, up to 10 MB)</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="flex items-end"><Button size="sm" onClick={save} disabled={busy}>Save note</Button></div>
      </section>
      <section className="rounded-lg border">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-[#6B6B6B]"><th className="p-2">Date</th><th>Employee</th><th>Note</th><th>Attachment</th><th /></tr></thead>
          <tbody>
            {notes.length === 0 && <tr><td colSpan={5} className="p-3 text-[#6B6B6B]">No notes yet.</td></tr>}
            {notes.map((n) => (
              <tr key={n.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{n.noteDate}</td>
                <td className="whitespace-nowrap">{n.name}</td>
                <td className="whitespace-pre-wrap py-2">{n.note}</td>
                <td>{n.fileName ? <a className="underline" href={`/api/incidents/causeless/${n.id}/file`}>{n.fileName}</a> : null}</td>
                <td className="text-right pr-2"><Button variant="outline" size="sm" onClick={() => remove(n)}>Remove</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
