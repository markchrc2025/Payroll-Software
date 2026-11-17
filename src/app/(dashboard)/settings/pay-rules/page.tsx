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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PayScheduleEditor } from "@/components/settings/pay-schedule-editor";

type TenantSettings = {
  payrollCycle: string;
  workingDaysDenominator: number;
  statutoryCutoffRule: string;
  thirteenthMonthBasis: string;
  maxDeductionPctOfGross: number;
  breakDeductAfterMinutes: number;
  allowNegativeFinalPay: boolean;
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

// PAY-133: first payday is the default for new companies. This only decides
// WHEN contributions are deducted. SSS is always on LAST month's basic pay
// after unpaid days and lates, whichever payday is chosen.
const CUTOFF_OPTIONS = [
  { value: "FIRST_CUTOFF",  label: "First payday of the month (1st to 15th payroll)", sublabel: "SSS, PhilHealth and Pag-IBIG deducted here. SSS is based on last month's basic pay after unpaid days and lates." },
  { value: "SECOND_CUTOFF", label: "Second payday of the month (16th to month-end payroll)", sublabel: "SSS, PhilHealth and Pag-IBIG deducted here. SSS is based on last month's basic pay after unpaid days and lates." },
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
    statutoryCutoffRule: "FIRST_CUTOFF",
    thirteenthMonthBasis: "STRICT_DOLE",
    maxDeductionPctOfGross: 50,
    breakDeductAfterMinutes: 300,
    allowNegativeFinalPay: true,
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
        maxDeductionPctOfGross: d.maxDeductionPctOfGross ?? 50,
        breakDeductAfterMinutes: d.breakDeductAfterMinutes ?? 300,
        allowNegativeFinalPay: d.allowNegativeFinalPay ?? true,
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
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Pay Rules
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5">
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
              className="h-9 text-[13px] bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]"
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
            <div key={i} className="bg-white rounded-xl border border-[#E8E8E8] p-5 space-y-3">
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

          {/* PAY-141: paydays and DTR cutoffs (saved on their own) */}
          <RuleSection
            title="Paydays and Timekeeping Cutoffs"
            description="When each pay cycle is paid, and which days of timekeeping feed each payday. New payroll runs take their dates from here."
          >
            <PayScheduleEditor />
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

          {/* Deduction Cap — "no negative pay" safeguard */}
          <RuleSection
            title="Maximum Deduction Limit"
            description="No-negative-pay safeguard. The combined SSS, PhilHealth, Pag-IBIG, and loan deductions may not exceed this share of an employee's monthly gross. It is checked twice: a new loan that would breach the limit is blocked when it is added, and every payroll run (regular, off-cycle and 13th month) deducts loan installments only up to the limit; the rest of an installment waits for a later payday and stays in the loan balance."
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#171717]">
                  Cap (% of monthly gross)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="w-28"
                    value={form.maxDeductionPctOfGross}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) {
                        update("maxDeductionPctOfGross", Math.min(100, Math.max(1, Math.round(n))));
                      }
                    }}
                  />
                  <span className="text-[13px] text-[#6B6B6B]">%</span>
                </div>
                <p className="text-[12px] text-[#6B6B6B]">
                  Common practice caps total deductions at 50% of gross. Final-pay
                  settlements on separation are exempt from this limit.
                </p>
              </div>
            </div>
          </RuleSection>

          <RuleSection
            title="Meal break"
            description="An unpaid meal break is deducted only on days long enough to have one. A day counts when the time from first clock-in to last clock-out is longer than this. A half day of 4 hours loses no break, and a day just over the limit never drops below it."
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-[12.5px] font-medium text-[#171717]">
                Deduct the break only on days longer than
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  className="w-28"
                  aria-label="Deduct the break only on days longer than (hours)"
                  value={form.breakDeductAfterMinutes / 60}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      update("breakDeductAfterMinutes", Math.min(1440, Math.max(0, Math.round(n * 60))));
                    }
                  }}
                />
                <span className="text-[13px] text-[#6B6B6B]">hours</span>
              </div>
              <p className="text-[12px] text-[#6B6B6B]">
                Default 5 hours. Each shift&apos;s break length is set in Shift Schedules; an unpaid break under 20
                minutes is not allowed (Labor Code Art. 85).
              </p>
            </div>
          </RuleSection>

          {/* Allow negative final pay toggle */}
          <RuleSection
            title="Allow Negative Final Pay"
            description="In regular and 13th month runs, loan installments never push net pay below zero: what does not fit is deferred and stays in the loan balance. Net pay can still go below zero when contributions, tax and other deductions are more than the period's pay (for example, few approved DTR days). That amount is owed to the company, nothing is credited, and the employee is left out of the bank files. Final-pay settlements on separation may also make it negative when this is on: charges against an employee's last pay (for example, unreturned assets or outstanding loan balances)."
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-[#E8E8E8] bg-white px-4 py-3">
              <div>
                <p className="text-[13.5px] font-medium text-[#171717]">
                  Permit negative net on final pay
                </p>
                <p className="text-[12px] text-[#6B6B6B] mt-0.5">
                  Turn off to also floor final-pay runs at zero (deferring any
                  loan balance instead of collecting it from the last pay).
                </p>
              </div>
              <Switch
                checked={form.allowNegativeFinalPay}
                onCheckedChange={(v) => update("allowNegativeFinalPay", v)}
              />
            </div>
          </RuleSection>

          {/* Night-Shift Differential Window */}
          <RuleSection
            title="Night-Shift Differential Window"
            description="NSD is always computed for hours worked in this window (Art. 86). It cannot be turned off — only the window is configurable. The 10% premium is set in Premium Rates."
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#171717]">Window start</Label>
                <Input
                  type="time"
                  className="w-36"
                  value={form.nsdWindowStart}
                  onChange={(e) => update("nsdWindowStart", e.target.value)}
                />
              </div>
              <span className="pb-2 text-[#6B6B6B]">→</span>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12.5px] font-medium text-[#171717]">Window end</Label>
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
        <div className="sticky bottom-0 flex items-center justify-between rounded-[8px] border border-[var(--line)] border-l-[3px] border-l-[var(--acc)] bg-[var(--hover)] px-5 py-3">
          <p className="text-[13px] text-[var(--ink)] font-medium">You have unsaved changes</p>
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
              className="h-8 text-[13px] bg-[#E8693A] hover:brightness-[1.07] text-[var(--on-acc)]"
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
    <div className="bg-white rounded-xl border border-[#E8E8E8] p-5 space-y-3">
      <div>
        <Label className="text-[14px] font-semibold text-[#171717]">{title}</Label>
        <p className="text-[12.5px] text-[#6B6B6B] mt-0.5">{description}</p>
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
            ? { background: "#F7F7F7", borderColor: "#171717" }
            : { background: "#fff", borderColor: "#E8E8E8" }}
        >
          <span
            className="mt-0.5 flex h-4 w-4 flex-shrink-0 rounded-full border-2 items-center justify-center"
            style={value === opt.value
              ? { borderColor: "#171717", background: "#171717" }
              : { borderColor: "#D4D4D4", background: "#fff" }}
          >
            {value === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-[#171717]">{opt.label}</p>
            <p className="text-[12px] text-[#6B6B6B] mt-0.5">{opt.sublabel}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
