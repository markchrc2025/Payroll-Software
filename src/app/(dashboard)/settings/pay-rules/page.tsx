"use client";

/**
 * /settings/pay-rules — Payroll Engine Defaults
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type TenantSettings = {
  payrollCycle: string;
  workingDaysDenominator: number;
  statutoryCutoffRule: string;
  thirteenthMonthBasis: string;
  nsdWindowStart: string;
  nsdWindowEnd: string;
};

const PAYROLL_CYCLE_OPTIONS = [
  { value: "SEMI_MONTHLY", label: "Semi-Monthly", sublabel: "1st–15th and 16th–end-of-month (DOLE default)" },
  { value: "MONTHLY",      label: "Monthly",      sublabel: "One payroll per calendar month" },
  { value: "WEEKLY",       label: "Weekly",       sublabel: "Every 7 days" },
  { value: "DAILY",        label: "Daily",        sublabel: "Each working day (piece-rate / contractual)" },
];

const DENOMINATOR_OPTIONS = [
  { value: 261, label: "261 days",  sublabel: "Standard calendar (52 weeks × 5 days + regular holidays)" },
  { value: 313, label: "313 days",  sublabel: "Includes Saturdays" },
  { value: 365, label: "365 days",  sublabel: "Calendar year (daily-rate workers)" },
];

const CUTOFF_OPTIONS = [
  { value: "SECOND_CUTOFF", label: "Second Cutoff (16th–EOM)", sublabel: "SSS, PhilHealth, Pag-IBIG deducted on 2nd payroll (DOLE common practice)" },
  { value: "FIRST_CUTOFF",  label: "First Cutoff (1st–15th)",  sublabel: "Statutory deductions taken on first payroll of the month" },
];

const THIRTEENTH_MONTH_OPTIONS = [
  { value: "STRICT_DOLE",         label: "Strict DOLE (Basic Salary only)",  sublabel: "Only basic pay counts — allowances and OT excluded (RA 9174 default)" },
  { value: "INCLUDE_ALLOWANCES",  label: "Include Regular Allowances",       sublabel: "Company policy allowing fixed allowances in the 13th-month base" },
];

export default function PayRulesPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [form, setForm] = useState<TenantSettings>({
    payrollCycle: "SEMI_MONTHLY",
    workingDaysDenominator: 261,
    statutoryCutoffRule: "SECOND_CUTOFF",
    thirteenthMonthBasis: "STRICT_DOLE",
    nsdWindowStart: "22:00",
    nsdWindowEnd: "06:00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/tenant");
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      const loaded: TenantSettings = {
        payrollCycle: d.payrollCycle,
        workingDaysDenominator: d.workingDaysDenominator,
        statutoryCutoffRule: d.statutoryCutoffRule,
        thirteenthMonthBasis: d.thirteenthMonthBasis,
        nsdWindowStart: d.nsdWindowStart ?? "22:00",
        nsdWindowEnd: d.nsdWindowEnd ?? "06:00",
      };
      setSettings(loaded);
      setForm(loaded);
    }
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update<K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success("Pay rules saved");
    setSettings(form);
    setDirty(false);
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Pay Rules
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Payroll engine defaults — these affect all employees unless overridden per-employee.
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
              disabled={saving}
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Payroll Cycle */}
          <RuleSection
            title="Payroll Frequency"
            description="How often employees are paid."
          >
            <OptionGroup
              options={PAYROLL_CYCLE_OPTIONS}
              value={form.payrollCycle}
              onChange={(v) => update("payrollCycle", v)}
            />
          </RuleSection>

          {/* Working Days Denominator */}
          <RuleSection
            title="Working Days Denominator"
            description="Used to convert monthly salary to a daily rate. DOLE standard is 261 days (R.A. 9187)."
          >
            <OptionGroup
              options={DENOMINATOR_OPTIONS.map((o) => ({ ...o, value: String(o.value) }))}
              value={String(form.workingDaysDenominator)}
              onChange={(v) => update("workingDaysDenominator", Number(v))}
            />
          </RuleSection>

          {/* Statutory Cutoff */}
          <RuleSection
            title="Statutory Deduction Cutoff"
            description="Which payroll period carries the SSS, PhilHealth, and Pag-IBIG employee-share deductions."
          >
            <OptionGroup
              options={CUTOFF_OPTIONS}
              value={form.statutoryCutoffRule}
              onChange={(v) => update("statutoryCutoffRule", v)}
            />
          </RuleSection>

          {/* 13th Month Basis */}
          <RuleSection
            title="13th-Month Pay Basis"
            description="What counts as the base salary for computing the mandatory 13th-month pay (P.D. 851)."
          >
            <OptionGroup
              options={THIRTEENTH_MONTH_OPTIONS}
              value={form.thirteenthMonthBasis}
              onChange={(v) => update("thirteenthMonthBasis", v)}
            />
          </RuleSection>

          {/* Night-Shift Differential Window */}
          <RuleSection
            title="Night-Shift Differential Window"
            description="NSD is always computed for hours worked in this window (Art. 86). It cannot be turned off — only the window is configurable. The 10% premium is set in Premium Rates."
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#111827]">Window start</Label>
                <Input
                  type="time"
                  className="w-36"
                  value={form.nsdWindowStart}
                  onChange={(e) => update("nsdWindowStart", e.target.value)}
                />
              </div>
              <span className="pb-2 text-[#6B7A8D]">→</span>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#111827]">Window end</Label>
                <Input
                  type="time"
                  className="w-36"
                  value={form.nsdWindowEnd}
                  onChange={(e) => update("nsdWindowEnd", e.target.value)}
                />
              </div>
            </div>
          </RuleSection>
        </div>
      )}

      {/* Save bar */}
      {dirty && !loading && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-[#fdeee6] bg-[#fdeee6] px-5 py-3 shadow-sm">
          <p className="text-[13px] text-[#E8693A] font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => { setForm(settings!); setDirty(false); }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
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

// ── Sub-components ──────────────────────────────────────────────────────────

function RuleSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-3">
      <div>
        <Label className="text-[14px] font-semibold text-[#111827]">{title}</Label>
        <p className="text-[12.5px] text-[#6B7A8D] mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function OptionGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; sublabel: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
          style={value === opt.value
            ? { background: "#fdeee6", borderColor: "#E8693A" }
            : { background: "#fff", borderColor: "#E8EBF1" }}
        >
          <span
            className="mt-0.5 flex h-4 w-4 flex-shrink-0 rounded-full border-2 items-center justify-center"
            style={value === opt.value
              ? { borderColor: "#E8693A", background: "#E8693A" }
              : { borderColor: "#C5CDD7", background: "#fff" }}
          >
            {value === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-[#111827]">{opt.label}</p>
            <p className="text-[12px] text-[#6B7A8D] mt-0.5">{opt.sublabel}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
