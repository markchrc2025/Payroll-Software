"use client";

/**
 * /settings/premium-rates -- Premium Multiplier Rates
 * Tenant-configurable premium pay rates (must be >= DOLE minimums).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// DOLE floor labels, grouped by scenario category
const RATE_GROUPS = [
  {
    label: "Overtime & Night Shift",
    description: "Applied to hours worked beyond the standard schedule or between 10 PM and 6 AM.",
    items: [
      { key: "OT",  label: "Regular Overtime",  unit: "× hourly rate", floor: 1.25, note: "Art. 87 Labor Code" },
      { key: "NSD", label: "Night-Shift Differential (NSD)", unit: "× hourly rate (premium only)", floor: 0.10, note: "Art. 86 Labor Code" },
    ],
  },
  {
    label: "Rest Day",
    description: "Applied when an employee works on their scheduled day off.",
    items: [
      { key: "REST_DAY",    label: "Rest Day — regular hours",  unit: "× hourly rate", floor: 1.30, note: "Art. 93 Labor Code" },
      { key: "REST_DAY_OT", label: "Rest Day — overtime hours",  unit: "× hourly rate", floor: 1.69, note: "1.30 × 1.30" },
    ],
  },
  {
    label: "Special Non-Working Holiday",
    description: "Applies to SPECIAL_NON_WORKING, SPECIAL_ONE_TIME, and AREA_SPECIFIC holiday categories.",
    items: [
      { key: "SPECIAL_HOLIDAY",             label: "Special Holiday — regular hours",             unit: "× hourly rate", floor: 1.30, note: "DOLE DO 28-2006" },
      { key: "SPECIAL_HOLIDAY_OT",          label: "Special Holiday — OT hours",                 unit: "× hourly rate", floor: 1.69, note: "1.30 × 1.30" },
      { key: "SPECIAL_HOLIDAY_REST_DAY",    label: "Special Holiday + Rest Day — regular",        unit: "× hourly rate", floor: 1.50, note: "DOLE explicitly 1.50 (not 1.69)" },
      { key: "SPECIAL_HOLIDAY_REST_DAY_OT", label: "Special Holiday + Rest Day — OT hours",       unit: "× hourly rate", floor: 1.95, note: "1.50 × 1.30" },
    ],
  },
  {
    label: "Regular (Legal) Holiday",
    description: "Applies to LEGAL holiday category (Art. 94 Labor Code). No-work pay uses the daily rate.",
    items: [
      { key: "REGULAR_HOLIDAY",             label: "Regular Holiday — worked hours",              unit: "× hourly rate", floor: 2.00, note: "Art. 94 Labor Code" },
      { key: "REGULAR_HOLIDAY_OT",          label: "Regular Holiday — OT hours",                 unit: "× hourly rate", floor: 2.60, note: "2.00 × 1.30" },
      { key: "REGULAR_HOLIDAY_REST_DAY",    label: "Regular Holiday + Rest Day — regular",        unit: "× hourly rate", floor: 2.60, note: "2.00 × 1.30" },
      { key: "REGULAR_HOLIDAY_REST_DAY_OT", label: "Regular Holiday + Rest Day — OT hours",       unit: "× hourly rate", floor: 3.38, note: "2.60 × 1.30" },
      { key: "NO_WORK_REGULAR_HOLIDAY",     label: "Regular Holiday — no-work entitlement",       unit: "× daily rate",  floor: 1.00, note: "Art. 94(b)" },
    ],
  },
  {
    label: "Double Holiday",
    description: "When a Regular Holiday and a Special Non-Working Holiday fall on the same date.",
    items: [
      { key: "DOUBLE_HOLIDAY",             label: "Double Holiday — regular hours",               unit: "× hourly rate", floor: 3.00, note: "DOLE DO" },
      { key: "DOUBLE_HOLIDAY_OT",          label: "Double Holiday — OT hours",                   unit: "× hourly rate", floor: 3.90, note: "3.00 × 1.30" },
      { key: "DOUBLE_HOLIDAY_REST_DAY",    label: "Double Holiday + Rest Day — regular",          unit: "× hourly rate", floor: 3.90, note: "3.00 × 1.30" },
      { key: "DOUBLE_HOLIDAY_REST_DAY_OT", label: "Double Holiday + Rest Day — OT hours",         unit: "× hourly rate", floor: 5.07, note: "3.90 × 1.30" },
    ],
  },
  {
    label: "Hazard Pay",
    description: "For work performed under hazardous conditions (RA 6727 implementing rules).",
    items: [
      { key: "HAZARD", label: "Hazard Pay", unit: "× hourly rate", floor: 1.25, note: "RA 6727" },
    ],
  },
];

type RateEntry = {
  multiplierKey: string;
  rate: number;
  doleFloor: number;
  isCustom: boolean;
};

export default function PremiumRatesPage() {
  const [rates, setRates]   = useState<RateEntry[]>([]);
  const [form, setForm]     = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/premium-rates");
    if (res.ok) {
      const json = await res.json();
      const data: RateEntry[] = json.data;
      setRates(data);
      const init: Record<string, number> = {};
      for (const r of data) init[r.multiplierKey] = r.rate;
      setForm(init);
    }
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function update(key: string, raw: string) {
    const v = parseFloat(raw);
    if (isNaN(v)) return;
    setForm((f) => ({ ...f, [key]: v }));
    setDirty(true);
  }

  async function handleSave() {
    // Validate floors before saving
    const violations: string[] = [];
    for (const r of rates) {
      const val = form[r.multiplierKey] ?? r.rate;
      if (val < r.doleFloor) {
        violations.push(`${r.multiplierKey}: ${val} < DOLE floor ${r.doleFloor}`);
      }
    }
    if (violations.length > 0) {
      toast.error("Rate below DOLE minimum", {
        description: violations.slice(0, 3).join("\n"),
      });
      return;
    }

    setSaving(true);
    const payload = rates.map((r) => ({
      multiplierKey: r.multiplierKey,
      rate: form[r.multiplierKey] ?? r.rate,
    }));
    const res = await fetch("/api/settings/premium-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates: payload }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Premium rates saved");
      await load();
    } else {
      const j = await res.json().catch(() => ({}));
      const msg = j?.error?.message ?? j?.error ?? "Save failed";
      toast.error(msg);
    }
  }

  async function handleReset() {
    // Reset a key to DOLE floor by removing the custom override
    // (just reload; actual reset would require a DELETE endpoint — for now
    // just restore form to loaded values)
    await load();
    toast.info("Reverted to last saved values");
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold text-[#111827]">Premium Pay Rates</h1>
        <p className="text-[13px] text-[#6B7A8D] mt-1">
          Configure premium multipliers for overtime, holidays, and night-shift pay.
          All rates must be at or above the DOLE statutory minimum (Labor Code Art. 86–94).
          Changes take effect on the next payroll run.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-xl border border-[#fdeee6] bg-[#fdeee6] px-4 py-3 text-[12.5px] text-[#E8693A]">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          NSD compound rates auto-cascade from the NSD base rate (10%) × the base scenario rate.
          For example, NSD-on-OT premium = NSD × OT = 0.10 × 1.25 = 0.125× hourly rate.
          Only the base rates are stored; compounds are computed at payroll time.
        </p>
      </div>

      {/* Rate groups */}
      {RATE_GROUPS.map((group) => (
        <div
          key={group.label}
          className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-4"
        >
          <div>
            <p className="text-[14px] font-semibold text-[#111827]">{group.label}</p>
            <p className="text-[12.5px] text-[#6B7A8D] mt-0.5">{group.description}</p>
          </div>

          <div className="divide-y divide-[#F3F4F6]">
            {group.items.map((item) => {
              const current = form[item.key] ?? item.floor;
              const isCustom = rates.find((r) => r.multiplierKey === item.key)?.isCustom ?? false;
              const belowFloor = current < item.floor;

              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#111827]">{item.label}</p>
                    <p className="text-[11.5px] text-[#6B7A8D] mt-0.5">
                      {item.unit} &nbsp;&middot;&nbsp; DOLE floor: {item.floor.toFixed(2)}&nbsp;
                      <span className="text-[#9CA3AF]">({item.note})</span>
                      {isCustom && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-[#fdeee6] px-2 py-0.5 text-[10px] font-medium text-[#E8693A]">
                          Custom
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min={item.floor}
                      value={current.toFixed(2)}
                      onChange={(e) => update(item.key, e.target.value)}
                      className={[
                        "w-24 rounded-lg border px-3 py-1.5 text-right text-[13px] font-mono",
                        "focus:outline-none focus:ring-2 focus:ring-[#E8693A]",
                        belowFloor
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-[#D1D5DB] bg-white text-[#111827]",
                      ].join(" ")}
                    />
                    <span className="text-[12px] text-[#9CA3AF] w-14">× hr rate</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-[#fdeee6] bg-[#fdeee6] px-5 py-3 shadow-sm">
          <p className="text-[13px] text-[#E8693A] font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => void handleReset()}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-8 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
