"use client";

/**
 * Wave B (PAY-212, decision 7): the employee adds their own education, work
 * experience or training. It is filed as a Profile Request
 * (POST /api/ess/background/[kind]) and saved once HR approves it.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BackgroundKindEss = "education" | "experience" | "training";

const FIELDS: Record<BackgroundKindEss, { title: string; fields: { key: string; label: string; type?: string; required?: boolean; placeholder?: string }[] }> = {
  education: {
    title: "Add education",
    fields: [
      { key: "school", label: "School", required: true },
      { key: "degree", label: "Degree or level", placeholder: "BS Accountancy" },
      { key: "fieldOfStudy", label: "Field of study" },
      { key: "startYear", label: "From (year)", type: "number" },
      { key: "endYear", label: "To (year)", type: "number", placeholder: "Blank if ongoing" },
      { key: "honors", label: "Honors" },
    ],
  },
  experience: {
    title: "Add work experience",
    fields: [
      { key: "companyName", label: "Company", required: true },
      { key: "position", label: "Position", required: true },
      { key: "startDate", label: "From", type: "date" },
      { key: "endDate", label: "To", type: "date" },
      { key: "location", label: "Location" },
      { key: "reasonForLeaving", label: "Reason for leaving" },
    ],
  },
  training: {
    title: "Add training",
    fields: [
      { key: "title", label: "Training", required: true },
      { key: "provider", label: "Provider" },
      { key: "trainingDate", label: "Date", type: "date" },
      { key: "hours", label: "Hours", type: "number" },
      { key: "expiresAt", label: "Certificate expires", type: "date" },
    ],
  },
};

export function BackgroundEntrySheet({ kind, open, onOpenChange, onFiled }: { kind: BackgroundKindEss | null; open: boolean; onOpenChange: (o: boolean) => void; onFiled: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const def = kind ? FIELDS[kind] : null;

  async function file() {
    if (!kind || !def) return;
    const missing = def.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    setSaving(true);
    const token = localStorage.getItem("ess_token");
    const res = await fetch(`/api/ess/background/${kind}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { toast.error(json?.error ?? "Could not file it"); return; }
    toast.success("Sent to HR. It is added to your records once approved.");
    setValues({});
    onOpenChange(false);
    onFiled();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setValues({}); onOpenChange(o); }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{def?.title ?? ""}</SheetTitle></SheetHeader>
        <div className="space-y-3 py-4">
          {def?.fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
              <Input type={f.type ?? "text"} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">HR reviews it before it is added to your records.</p>
        </div>
        <SheetFooter>
          <Button onClick={file} disabled={saving}>{saving ? "Sending…" : "Send to HR"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
