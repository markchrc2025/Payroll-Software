"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEmployeeId } from "@/lib/claim-employee-id";

type EmpIdSettings = {
  empIdPrefix: string;
  empIdIncludeYear: boolean;
  empIdPadding: number;
  empIdSuffix: string;
  empIdNextSeq: number;
};

const DEFAULT_FORM: EmpIdSettings = {
  empIdPrefix: "EMP-",
  empIdIncludeYear: false,
  empIdPadding: 4,
  empIdSuffix: "",
  empIdNextSeq: 1,
};

export default function EmployeeIdPage() {
  const [saved, setSaved] = useState<EmpIdSettings | null>(null);
  const [form, setForm] = useState<EmpIdSettings>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nextSeqError, setNextSeqError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/tenant");
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      const loaded: EmpIdSettings = {
        empIdPrefix: d.empIdPrefix ?? "EMP-",
        empIdIncludeYear: d.empIdIncludeYear ?? false,
        empIdPadding: d.empIdPadding ?? 4,
        empIdSuffix: d.empIdSuffix ?? "",
        empIdNextSeq: d.empIdNextSeq ?? 1,
      };
      setSaved(loaded);
      setForm(loaded);
    }
    setLoading(false);
    setDirty(false);
    setNextSeqError(null);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update<K extends keyof EmpIdSettings>(key: K, value: EmpIdSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    if (key === "empIdNextSeq") setNextSeqError(null);
  }

  const currentYear = new Date().getFullYear();

  const preview = useMemo(() => {
    const padding = Math.max(1, Math.min(10, form.empIdPadding || 1));
    return formatEmployeeId(
      { ...form, empIdPadding: padding },
      form.empIdNextSeq,
      form.empIdIncludeYear ? currentYear : null,
    );
  }, [form, currentYear]);

  async function handleSave() {
    if (nextSeqError) return;

    // Client-side guard: next seq cannot decrease
    if (saved && form.empIdNextSeq < saved.empIdNextSeq) {
      setNextSeqError(`Cannot set below current value (${saved.empIdNextSeq})`);
      return;
    }

    setSaving(true);
    const res = await fetch("/api/settings/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success("Employee ID settings saved");
    setSaved(form);
    setDirty(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Employee ID
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Configure the format auto-assigned to each new employee record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {dirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !!nextSeqError}
              className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Live Preview */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5">
            <Label className="text-[14px] font-semibold text-[#111827]">Preview</Label>
            <p className="text-[12.5px] text-[#6B7A8D] mt-0.5 mb-3">
              What the next employee&apos;s ID will look like with the current settings.
            </p>
            <div
              className="inline-flex items-center rounded-lg px-4 py-2.5 font-mono text-[17px] font-bold tracking-wide"
              style={{ background: "#fdeee6", color: "#E8693A", border: "1px solid #f5cbb0" }}
            >
              {preview}
            </div>
          </div>

          {/* Format */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-5">
            <div>
              <Label className="text-[14px] font-semibold text-[#111827]">Format</Label>
              <p className="text-[12.5px] text-[#6B7A8D] mt-0.5">
                ID = <span className="font-mono">Prefix</span>
                {form.empIdIncludeYear && <> + <span className="font-mono">Year</span></>}
                {" + "}<span className="font-mono">Sequence</span>
                {form.empIdSuffix && <> + <span className="font-mono">Suffix</span></>}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[13px] font-medium text-[#374151] mb-1.5 block">
                  Prefix <span className="text-[11px] text-[#9CA3AF] font-normal">(max 20 chars)</span>
                </Label>
                <Input
                  value={form.empIdPrefix}
                  onChange={(e) => update("empIdPrefix", e.target.value.slice(0, 20))}
                  placeholder="EMP-"
                  className="h-10 text-[13.5px] font-mono"
                  style={{ borderColor: "#ECE6DD" }}
                />
              </div>

              <div>
                <Label className="text-[13px] font-medium text-[#374151] mb-1.5 block">
                  Suffix <span className="text-[11px] text-[#9CA3AF] font-normal">(optional, max 20 chars)</span>
                </Label>
                <Input
                  value={form.empIdSuffix}
                  onChange={(e) => update("empIdSuffix", e.target.value.slice(0, 20))}
                  placeholder=""
                  className="h-10 text-[13.5px] font-mono"
                  style={{ borderColor: "#ECE6DD" }}
                />
              </div>

              <div>
                <Label className="text-[13px] font-medium text-[#374151] mb-1.5 block">
                  Sequence Digits <span className="text-[11px] text-[#9CA3AF] font-normal">(zero-padding width)</span>
                </Label>
                <select
                  value={form.empIdPadding}
                  onChange={(e) => update("empIdPadding", Number(e.target.value))}
                  className="h-10 w-full rounded-md border px-3 text-[13.5px] bg-white outline-none"
                  style={{ borderColor: "#ECE6DD", color: "#111827" }}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} digit{n !== 1 ? "s" : ""} — {String(1).padStart(n, "0")}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="flex items-center justify-between rounded-[9px] px-4 py-3"
                style={{ background: "#F6F2EC", border: "1px solid #ECE6DD" }}
              >
                <div>
                  <p className="text-[13.5px] font-medium" style={{ color: "#2A2420" }}>
                    Include Year
                  </p>
                  <p className="text-[11.5px]" style={{ color: "#9b9085" }}>
                    Adds {currentYear} before the sequence; resets to 1 each year
                  </p>
                </div>
                <Switch
                  checked={form.empIdIncludeYear}
                  onCheckedChange={(v) => update("empIdIncludeYear", v)}
                />
              </div>
            </div>
          </div>

          {/* Sequence */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-3">
            <div>
              <Label className="text-[14px] font-semibold text-[#111827]">Next Sequence Number</Label>
              <p className="text-[12.5px] text-[#6B7A8D] mt-0.5">
                The sequence number that will be assigned to the next new employee.
                You can advance this (e.g., if migrating from another system), but it cannot be decreased.
              </p>
            </div>
            <div className="max-w-[200px]">
              <Input
                type="number"
                min={saved?.empIdNextSeq ?? 1}
                step={1}
                value={form.empIdNextSeq}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                  update("empIdNextSeq", v);
                  if (saved && v < saved.empIdNextSeq) {
                    setNextSeqError(`Cannot set below current value (${saved.empIdNextSeq})`);
                  } else {
                    setNextSeqError(null);
                  }
                }}
                className="h-10 text-[13.5px]"
                style={{ borderColor: nextSeqError ? "#E0463B" : "#ECE6DD" }}
              />
              {nextSeqError && (
                <p className="mt-1 text-[11.5px]" style={{ color: "#E0463B" }}>{nextSeqError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      {dirty && !loading && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-[#fdeee6] bg-[#fdeee6] px-5 py-3 shadow-sm">
          <p className="text-[13px] text-[#E8693A] font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => { setForm(saved!); setDirty(false); setNextSeqError(null); }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !!nextSeqError}
              className="h-8 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
