"use client";

import { use, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save } from "lucide-react";

interface Tenant {
  id: string;
  payrollCycle: string;
  payDay1: number | null;
  payDay2: number | null;
  thirteenthMonthBasis: string;
  workingDaysDenominator: number;
}

const PAY_CYCLES = [
  { value: "DAILY",        label: "Daily"                    },
  { value: "WEEKLY",       label: "Weekly"                   },
  { value: "BI_WEEKLY",    label: "Bi-Weekly (every 2 weeks)" },
  { value: "SEMI_MONTHLY", label: "Semi-monthly"             },
  { value: "MONTHLY",      label: "Monthly"                  },
];

const WEEKDAYS = [
  { value: 1, label: "Monday"    },
  { value: 2, label: "Tuesday"   },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday"  },
  { value: 5, label: "Friday"    },
  { value: 6, label: "Saturday"  },
  { value: 7, label: "Sunday"    },
];

// Days 1–28 + 0 = Last day of month
const MONTH_DAYS = [
  { value: 0, label: "Last day of month" },
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}${ordinal(i + 1)}` })),
];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const BIWEEKLY_STARTS = [
  { value: 1, label: "Week 1 of month (e.g. 1st & 3rd Friday)" },
  { value: 2, label: "Week 2 of month (e.g. 2nd & 4th Friday)" },
];

const THIRTEENTH_OPTIONS = [
  { value: "STRICT_DOLE",         label: "Strict DOLE — basic pay only"            },
  { value: "INCLUDE_ALLOWANCES",  label: "Include allowances in computation"       },
];

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-medium mb-1" style={{ color: "#374151" }}>{children}</p>;
}

function SHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>{children}</p>;
}

export default function PayrollSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    payrollCycle: "SEMI_MONTHLY",
    payDay1: null as number | null,
    payDay2: null as number | null,
    thirteenthMonthBasis: "STRICT_DOLE",
    workingDaysDenominator: 261,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const t: Tenant = j.data;
        setTenant(t);
        setForm({
          payrollCycle: t.payrollCycle ?? "SEMI_MONTHLY",
          payDay1: t.payDay1 ?? null,
          payDay2: t.payDay2 ?? null,
          thirteenthMonthBasis: t.thirteenthMonthBasis ?? "STRICT_DOLE",
          workingDaysDenominator: t.workingDaysDenominator ?? 261,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { toast.error("Failed to save"); return; }
      toast.success("Payroll settings saved");
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}
      </div>
    );
  }

  if (!tenant) return <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Tenant not found.</p>;

  const selectCls = "w-full rounded-[7px] px-3 py-2 text-[12px] outline-none appearance-none";
  const selectStyle = {
    border: "0.5px solid #D1D5DB", background: "white", color: "#111827",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
    paddingRight: 28,
  };

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Pay schedule */}
        <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <p className="text-[13px] font-medium mb-3" style={{ color: "#111827" }}>Pay schedule</p>

          {/* Cycle selector */}
          <div className="mb-3">
            <SLabel>Payroll cycle</SLabel>
            <select className={selectCls} style={selectStyle}
              value={form.payrollCycle}
              onChange={(e) => set("payrollCycle", e.target.value)}>
              {PAY_CYCLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <SHint>Determines how often payroll is processed for this tenant.</SHint>
          </div>

          {/* DAILY — no extra config */}
          {form.payrollCycle === "DAILY" && (
            <p className="text-[12px] px-3 py-2 rounded-[6px]" style={{ color: "#6B7280", background: "#F9FAFB", border: "0.5px solid #E5E7EB" }}>
              Payroll is processed every working day. No additional day configuration needed.
            </p>
          )}

          {/* WEEKLY — pick day of week */}
          {form.payrollCycle === "WEEKLY" && (
            <div>
              <SLabel>Pay day of week</SLabel>
              <select className={selectCls} style={selectStyle}
                value={form.payDay1 ?? 5}
                onChange={(e) => set("payDay1", Number(e.target.value))}>
                {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <SHint>Employees receive pay on this day each week.</SHint>
            </div>
          )}

          {/* BI_WEEKLY — pick day of week + starting week */}
          {form.payrollCycle === "BI_WEEKLY" && (
            <div className="space-y-3">
              <div>
                <SLabel>Pay day of week</SLabel>
                <select className={selectCls} style={selectStyle}
                  value={form.payDay1 ?? 5}
                  onChange={(e) => set("payDay1", Number(e.target.value))}>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <SHint>Day of the week payroll is disbursed.</SHint>
              </div>
              <div>
                <SLabel>Starting week</SLabel>
                <select className={selectCls} style={selectStyle}
                  value={form.payDay2 ?? 1}
                  onChange={(e) => set("payDay2", Number(e.target.value))}>
                  {BIWEEKLY_STARTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <SHint>Whether the first pay cycle starts on week 1 or week 2 of the month.</SHint>
              </div>
            </div>
          )}

          {/* SEMI_MONTHLY — pick two days of month */}
          {form.payrollCycle === "SEMI_MONTHLY" && (
            <div className="space-y-3">
              <div>
                <SLabel>First pay day</SLabel>
                <select className={selectCls} style={selectStyle}
                  value={form.payDay1 ?? 15}
                  onChange={(e) => set("payDay1", Number(e.target.value))}>
                  {MONTH_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <SLabel>Second pay day</SLabel>
                <select className={selectCls} style={selectStyle}
                  value={form.payDay2 ?? 0}
                  onChange={(e) => set("payDay2", Number(e.target.value))}>
                  {MONTH_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <SHint>Example: 15th &amp; last day, or 10th &amp; 25th.</SHint>
              </div>
            </div>
          )}

          {/* MONTHLY — pick one day of month */}
          {form.payrollCycle === "MONTHLY" && (
            <div>
              <SLabel>Pay day</SLabel>
              <select className={selectCls} style={selectStyle}
                value={form.payDay1 ?? 0}
                onChange={(e) => set("payDay1", Number(e.target.value))}>
                {MONTH_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <SHint>Day of the month on which payroll is disbursed.</SHint>
            </div>
          )}
        </div>

        {/* 13th month & computation */}
        <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <p className="text-[13px] font-medium mb-3" style={{ color: "#111827" }}>13th month & computation</p>
          <div className="mb-3">
            <SLabel>13th month computation basis</SLabel>
            <select className={selectCls} style={selectStyle}
              value={form.thirteenthMonthBasis}
              onChange={(e) => set("thirteenthMonthBasis", e.target.value)}>
              {THIRTEENTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <SHint>DOLE Presidential Decree 851 requires basic pay only. Some tenants elect to include allowances.</SHint>
          </div>
          <div>
            <SLabel>Working days denominator</SLabel>
            <input
              type="number"
              min={200} max={365}
              className="w-full rounded-[7px] px-3 py-2 text-[12px] outline-none"
              style={{ border: "0.5px solid #D1D5DB", background: "white", color: "#111827" }}
              value={form.workingDaysDenominator}
              onChange={(e) => set("workingDaysDenominator", Number(e.target.value))}
            />
            <SHint>Annual working days for daily rate computation (default: 261).</SHint>
          </div>
        </div>
      </div>

      {/* Bank file generation — static info card */}
      <div className="rounded-[10px] p-4 mb-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <p className="text-[13px] font-medium mb-2" style={{ color: "#111827" }}>Bank file generation</p>
        <p className="text-[12px]" style={{ color: "#6B7280" }}>
          Bank disbursement file formats (BDO, BPI, Metrobank, UnionBank) are auto-generated after each finalized payroll run.
          Format configuration is available on a per-tenant basis from the Payroll Engine settings.
        </p>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded-[7px] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60 transition-opacity"
          style={{ background: "#1E3A5F" }}
        >
          <Save size={13} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
