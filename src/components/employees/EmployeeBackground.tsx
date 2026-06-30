"use client";

/**
 * EmployeeBackground — three repeatable record sections for one employee:
 * Education, Work Experience, and Training. Each supports add / edit / delete
 * against /api/employees/[id]/{education,work-experience,training}. Training
 * entries can attach a certificate uploaded to R2 via the presigned-PUT flow.
 *
 * Seeded from server props; each section re-fetches its own list after a
 * mutation rather than refreshing the whole page.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from "@/lib/validations/document";

// ── types ─────────────────────────────────────────────────────────────────
type EducationRow = {
  id: string; level: string | null; school: string; degree: string | null;
  fieldOfStudy: string | null; startYear: number | null; endYear: number | null;
  honors: string | null; notes: string | null;
};
type WorkRow = {
  id: string; companyName: string; position: string; startDate: string | null;
  endDate: string | null; location: string | null; description: string | null;
  reasonForLeaving: string | null;
};
type TrainingRow = {
  id: string; title: string; provider: string | null; trainingDate: string | null;
  hours: number | null; expiresAt: string | null; notes: string | null;
  certificateKey: string | null; certificateFileName: string | null;
  certificateMimeType: string | null; certificateFileSize: number | null;
  certificateUrl: string | null;
};

const EDUCATION_LEVELS: { value: string; label: string }[] = [
  { value: "ELEMENTARY", label: "Elementary" },
  { value: "HIGH_SCHOOL", label: "High School" },
  { value: "SENIOR_HIGH", label: "Senior High" },
  { value: "VOCATIONAL", label: "Vocational" },
  { value: "COLLEGE", label: "College" },
  { value: "MASTERS", label: "Master's" },
  { value: "DOCTORATE", label: "Doctorate" },
  { value: "OTHER", label: "Other" },
];
const LEVEL_LABEL = Object.fromEntries(EDUCATION_LEVELS.map((l) => [l.value, l.label]));

// ── helpers ─────────────────────────────────────────────────────────────────
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

function Card({ title, count, onAdd, children }: { title: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-[#E8EBF1] bg-white shadow-[0_1px_2px_rgba(16,30,54,.06),0_1px_3px_rgba(16,30,54,.04)]">
      <div className="flex items-center justify-between border-b border-[#E8EBF1] bg-[#FBFCFE] px-5 py-3.5">
        <h2 className="text-[14px] font-semibold text-[#0E1B2E]">{title} <span className="text-[#8E9AAC]">({count})</span></h2>
        <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {children}
    </section>
  );
}

function RowItem({ title, subtitle, meta, extra, onEdit, onDelete }: {
  title: string; subtitle?: string; meta?: string; extra?: React.ReactNode; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-[#E8EBF1] px-5 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-[#0E1B2E]">{title}</div>
        {subtitle && <div className="text-[12.5px] text-[#4A586B]">{subtitle}</div>}
        {meta && <div className="mt-0.5 text-[11.5px] text-[#8E9AAC]">{meta}</div>}
        {extra}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[#8E9AAC]">{label}</div>;
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

// ── Education section ────────────────────────────────────────────────────────
function EducationSection({ employeeId, initial }: { employeeId: string; initial: EducationRow[] }) {
  const base = `/api/employees/${employeeId}/education`;
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ level: "NONE", school: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", honors: "", notes: "" });

  async function reload() {
    const { ok, json } = await api("GET", base);
    if (ok) setRows(json?.data ?? []);
  }
  function openAdd() {
    setEditing(null);
    setF({ level: "NONE", school: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", honors: "", notes: "" });
    setOpen(true);
  }
  function openEdit(r: EducationRow) {
    setEditing(r);
    setF({
      level: r.level ?? "NONE", school: r.school, degree: r.degree ?? "", fieldOfStudy: r.fieldOfStudy ?? "",
      startYear: r.startYear?.toString() ?? "", endYear: r.endYear?.toString() ?? "", honors: r.honors ?? "", notes: r.notes ?? "",
    });
    setOpen(true);
  }
  async function save() {
    if (!f.school.trim()) { toast.error("School is required."); return; }
    setBusy(true);
    const body = {
      level: f.level === "NONE" ? null : f.level, school: f.school.trim(), degree: f.degree, fieldOfStudy: f.fieldOfStudy,
      startYear: f.startYear, endYear: f.endYear, honors: f.honors, notes: f.notes,
    };
    const { ok, json } = editing ? await api("PUT", `${base}/${editing.id}`, body) : await api("POST", base, body);
    setBusy(false);
    if (!ok) { toast.error(json?.error ?? "Save failed"); return; }
    toast.success(editing ? "Education updated" : "Education added");
    setOpen(false); await reload();
  }
  async function remove(r: EducationRow) {
    if (!confirm(`Remove "${r.school}"?`)) return;
    const { ok, json } = await api("DELETE", `${base}/${r.id}`);
    if (!ok) { toast.error(json?.error ?? "Delete failed"); return; }
    toast.success("Education removed"); await reload();
  }

  return (
    <Card title="Education" count={rows.length} onAdd={openAdd}>
      {rows.length === 0 ? <Empty label="No education records yet." /> : rows.map((r) => (
        <RowItem key={r.id}
          title={r.school}
          subtitle={[r.degree, r.fieldOfStudy].filter(Boolean).join(" · ") || undefined}
          meta={[r.level ? LEVEL_LABEL[r.level] : null, [r.startYear, r.endYear].filter(Boolean).join("–") || null, r.honors].filter(Boolean).join("  ·  ") || undefined}
          onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit education" : "Add education"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldRow>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select value={f.level} onValueChange={(v) => setF({ ...f, level: v ?? "NONE" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {EDUCATION_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>School *</Label><Input value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} placeholder="University of the Philippines" /></div>
            </FieldRow>
            <FieldRow>
              <div className="space-y-1.5"><Label>Degree</Label><Input value={f.degree} onChange={(e) => setF({ ...f, degree: e.target.value })} placeholder="BS Accountancy" /></div>
              <div className="space-y-1.5"><Label>Field of study</Label><Input value={f.fieldOfStudy} onChange={(e) => setF({ ...f, fieldOfStudy: e.target.value })} /></div>
            </FieldRow>
            <FieldRow>
              <div className="space-y-1.5"><Label>Start year</Label><Input type="number" value={f.startYear} onChange={(e) => setF({ ...f, startYear: e.target.value })} placeholder="2014" /></div>
              <div className="space-y-1.5"><Label>End year</Label><Input type="number" value={f.endYear} onChange={(e) => setF({ ...f, endYear: e.target.value })} placeholder="2018" /></div>
            </FieldRow>
            <div className="space-y-1.5"><Label>Honors</Label><Input value={f.honors} onChange={(e) => setF({ ...f, honors: e.target.value })} placeholder="Cum Laude" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !f.school.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Work Experience section ──────────────────────────────────────────────────
function WorkSection({ employeeId, initial }: { employeeId: string; initial: WorkRow[] }) {
  const base = `/api/employees/${employeeId}/work-experience`;
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ companyName: "", position: "", startDate: "", endDate: "", location: "", description: "", reasonForLeaving: "" });

  async function reload() { const { ok, json } = await api("GET", base); if (ok) setRows(json?.data ?? []); }
  function openAdd() {
    setEditing(null);
    setF({ companyName: "", position: "", startDate: "", endDate: "", location: "", description: "", reasonForLeaving: "" });
    setOpen(true);
  }
  function openEdit(r: WorkRow) {
    setEditing(r);
    setF({
      companyName: r.companyName, position: r.position, startDate: toDateInput(r.startDate), endDate: toDateInput(r.endDate),
      location: r.location ?? "", description: r.description ?? "", reasonForLeaving: r.reasonForLeaving ?? "",
    });
    setOpen(true);
  }
  async function save() {
    if (!f.companyName.trim() || !f.position.trim()) { toast.error("Company and position are required."); return; }
    setBusy(true);
    const { ok, json } = editing ? await api("PUT", `${base}/${editing.id}`, f) : await api("POST", base, f);
    setBusy(false);
    if (!ok) { toast.error(json?.error ?? "Save failed"); return; }
    toast.success(editing ? "Experience updated" : "Experience added");
    setOpen(false); await reload();
  }
  async function remove(r: WorkRow) {
    if (!confirm(`Remove "${r.companyName}"?`)) return;
    const { ok, json } = await api("DELETE", `${base}/${r.id}`);
    if (!ok) { toast.error(json?.error ?? "Delete failed"); return; }
    toast.success("Experience removed"); await reload();
  }

  return (
    <Card title="Work Experience" count={rows.length} onAdd={openAdd}>
      {rows.length === 0 ? <Empty label="No work experience yet." /> : rows.map((r) => (
        <RowItem key={r.id}
          title={r.position}
          subtitle={r.companyName + (r.location ? ` · ${r.location}` : "")}
          meta={[(r.startDate || r.endDate) ? `${fmtDate(r.startDate) || "—"} – ${r.endDate ? fmtDate(r.endDate) : "Present"}` : null, r.reasonForLeaving ? `Left: ${r.reasonForLeaving}` : null].filter(Boolean).join("  ·  ") || undefined}
          extra={r.description ? <p className="mt-1 text-[12.5px] text-[#4A586B]">{r.description}</p> : undefined}
          onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit work experience" : "Add work experience"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldRow>
              <div className="space-y-1.5"><Label>Company *</Label><Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Position *</Label><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></div>
            </FieldRow>
            <FieldRow>
              <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>End date <span className="text-[#8E9AAC]">(blank = present)</span></Label><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
            </FieldRow>
            <div className="space-y-1.5"><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Makati City" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Key responsibilities…" /></div>
            <div className="space-y-1.5"><Label>Reason for leaving</Label><Input value={f.reasonForLeaving} onChange={(e) => setF({ ...f, reasonForLeaving: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !f.companyName.trim() || !f.position.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Training section ─────────────────────────────────────────────────────────
function TrainingSection({ employeeId, initial, storageReady }: { employeeId: string; initial: TrainingRow[]; storageReady: boolean }) {
  const base = `/api/employees/${employeeId}/training`;
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ title: "", provider: "", trainingDate: "", hours: "", expiresAt: "", notes: "" });

  async function reload() { const { ok, json } = await api("GET", base); if (ok) setRows(json?.data ?? []); }
  function openAdd() {
    setEditing(null); setFile(null);
    setF({ title: "", provider: "", trainingDate: "", hours: "", expiresAt: "", notes: "" });
    setOpen(true);
  }
  function openEdit(r: TrainingRow) {
    setEditing(r); setFile(null);
    setF({ title: r.title, provider: r.provider ?? "", trainingDate: toDateInput(r.trainingDate), hours: r.hours?.toString() ?? "", expiresAt: toDateInput(r.expiresAt), notes: r.notes ?? "" });
    setOpen(true);
  }

  async function uploadCert(): Promise<{ certificateKey: string; certificateFileName: string; certificateMimeType: string; certificateFileSize: number } | null> {
    if (!file) return null;
    if (file.size > MAX_FILE_SIZE) throw new Error(`File must be ≤ ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    const presign = await api("POST", `${base}/presign`, { fileName: file.name, mimeType: file.type, fileSize: file.size });
    if (!presign.ok) throw new Error(presign.json?.error ?? "Could not start upload");
    const { uploadUrl, storageKey } = presign.json.data as { uploadUrl: string; storageKey: string };
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
    return { certificateKey: storageKey, certificateFileName: file.name, certificateMimeType: file.type, certificateFileSize: file.size };
  }

  async function save() {
    if (!f.title.trim()) { toast.error("Title is required."); return; }
    setBusy(true);
    try {
      // New upload replaces; otherwise retain the editing record's certificate.
      const cert = file
        ? await uploadCert()
        : editing
          ? { certificateKey: editing.certificateKey, certificateFileName: editing.certificateFileName, certificateMimeType: editing.certificateMimeType, certificateFileSize: editing.certificateFileSize }
          : null;
      const body = { title: f.title.trim(), provider: f.provider, trainingDate: f.trainingDate, hours: f.hours, expiresAt: f.expiresAt, notes: f.notes, ...(cert ?? {}) };
      const { ok, json } = editing ? await api("PUT", `${base}/${editing.id}`, body) : await api("POST", base, body);
      if (!ok) { toast.error(json?.error ?? "Save failed"); return; }
      toast.success(editing ? "Training updated" : "Training added");
      setOpen(false); await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function remove(r: TrainingRow) {
    if (!confirm(`Remove "${r.title}"?`)) return;
    const { ok, json } = await api("DELETE", `${base}/${r.id}`);
    if (!ok) { toast.error(json?.error ?? "Delete failed"); return; }
    toast.success("Training removed"); await reload();
  }

  return (
    <Card title="Training" count={rows.length} onAdd={openAdd}>
      {rows.length === 0 ? <Empty label="No training records yet." /> : rows.map((r) => (
        <RowItem key={r.id}
          title={r.title}
          subtitle={[r.provider, r.hours ? `${r.hours} hr` : null].filter(Boolean).join(" · ") || undefined}
          meta={[r.trainingDate ? fmtDate(r.trainingDate) : null, r.expiresAt ? `Expires ${fmtDate(r.expiresAt)}` : null].filter(Boolean).join("  ·  ") || undefined}
          extra={r.certificateUrl ? (
            <a href={r.certificateUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#E8693A] hover:underline">
              <Download className="h-3 w-3" /> {r.certificateFileName ?? "Certificate"}
            </a>
          ) : undefined}
          onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit training" : "Add training"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Occupational Safety & Health" /></div>
            <FieldRow>
              <div className="space-y-1.5"><Label>Provider</Label><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} placeholder="DOLE-accredited STO" /></div>
              <div className="space-y-1.5"><Label>Hours</Label><Input type="number" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder="40" /></div>
            </FieldRow>
            <FieldRow>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={f.trainingDate} onChange={(e) => setF({ ...f, trainingDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Expires</Label><Input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></div>
            </FieldRow>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            {storageReady && (
              <div className="space-y-1.5">
                <Label>Certificate {editing?.certificateFileName ? <span className="text-[#8E9AAC]">(current: {editing.certificateFileName})</span> : null}</Label>
                <Input type="file" accept={ALLOWED_MIME_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="text-[11px] text-[#8E9AAC]">PDF or image, max {MAX_FILE_SIZE / 1024 / 1024} MB. {editing ? "Choosing a new file replaces the current one." : ""}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !f.title.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Parent ────────────────────────────────────────────────────────────────
export function EmployeeBackground({
  employeeId, initialEducation, initialWorkExperience, initialTraining, storageReady,
}: {
  employeeId: string;
  initialEducation: EducationRow[];
  initialWorkExperience: WorkRow[];
  initialTraining: TrainingRow[];
  storageReady: boolean;
}) {
  return (
    <div className="space-y-5">
      <EducationSection employeeId={employeeId} initial={initialEducation} />
      <WorkSection employeeId={employeeId} initial={initialWorkExperience} />
      <TrainingSection employeeId={employeeId} initial={initialTraining} storageReady={storageReady} />
    </div>
  );
}
