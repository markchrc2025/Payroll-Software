"use client";

import { use, useState, useEffect, useCallback } from "react";
import {
  Users, Briefcase, Clock, MapPin, Tablet, Smartphone,
  Calculator, FileOutput, FileText, BarChart2, Table2, Code2, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type FlagDef = {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  core: boolean;
};

const ALL_FEATURES: FlagDef[] = [
  { key: "hris",           label: "HRIS Core",               desc: "Employee profiles, 201 files, org chart",    icon: Users,        core: true },
  { key: "ats",            label: "Applicant Tracking",      desc: "ATS Kanban pipeline, hiring",               icon: Briefcase,    core: false },
  { key: "time",           label: "Time & Attendance",       desc: "DTR, shifts, leave management",             icon: Clock,        core: true },
  { key: "gps",            label: "GPS Geofencing",          desc: "Location-based clock-in verification",      icon: MapPin,       core: true },
  { key: "kiosk",          label: "Kiosk Mode",              desc: "Branch tablet clock-in kiosk",              icon: Tablet,       core: false },
  { key: "ess",            label: "ESS Mobile PWA",          desc: "Employee self-service app",                 icon: Smartphone,   core: true },
  { key: "payroll",        label: "Basic Payroll",           desc: "Gross-to-net, statutory deductions",        icon: Calculator,   core: true },
  { key: "bank_export",    label: "Bank File Export",        desc: "BDO, BPI, UnionBank, Metrobank",            icon: FileOutput,   core: true },
  { key: "compliance",     label: "Compliance Reports",      desc: "SSS, PhilHealth, Pag-IBIG, BIR",           icon: FileText,     core: true },
  { key: "analytics",      label: "Advanced Analytics",      desc: "Payroll trend, headcount reports",          icon: BarChart2,    core: true },
  { key: "custom_reports", label: "Custom Reports",          desc: "Build your own report templates",           icon: Table2,       core: false },
  { key: "api_access",     label: "API Access",              desc: "REST API for integrations",                 icon: Code2,        core: false },
  { key: "ai_enabled",     label: "AI Assistant",            desc: "HR Chat, Compliance Helper, Payslip Q&A",  icon: Bot,          core: false },
  { key: "expense_claims", label: "Expense Claims",          desc: "Employee expense reimbursement",            icon: FileText,     core: false },
  { key: "asset_tracking", label: "Asset Tracking",          desc: "Company asset management",                  icon: Code2,        core: false },
];

export default function TenantFeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [draft, setDraft]   = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const fetched: Record<string, boolean> = json.data?.featureFlags ?? {};
      setFlags(fetched);
      setDraft(fetched);
    } catch {
      toast.error("Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  function toggle(key: string, core: boolean) {
    if (core) return; // core features cannot be toggled off
    setDraft((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setDirty(JSON.stringify(next) !== JSON.stringify(flags));
      return next;
    });
  }

  function discard() {
    setDraft(flags);
    setDirty(false);
  }

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, boolean> = {};
      for (const f of ALL_FEATURES) {
        if (!f.core) patch[f.key] = draft[f.key] ?? false;
      }
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureFlagsPatch: patch }),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      const saved: Record<string, boolean> = json.data?.featureFlags ?? {};
      setFlags(saved);
      setDraft(saved);
      setDirty(false);
      toast.success("Feature flags saved");
    } catch {
      toast.error("Failed to save feature flags");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[10px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {ALL_FEATURES.map((f) => {
              const on = f.core ? true : (draft[f.key] ?? false);
              return (
                <div
                  key={f.key}
                  className="rounded-[10px] p-3"
                  style={{
                    background: "white",
                    border: `0.5px solid ${on ? "#E5E7EB" : "#F3F4F6"}`,
                    opacity: on ? 1 : 0.7,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <f.icon size={15} style={{ color: on ? "#1E3A5F" : "#9CA3AF" }} />
                      <p className="text-[11px] font-medium" style={{ color: on ? "#111827" : "#6B7280" }}>
                        {f.label}
                      </p>
                    </div>
                    {f.core ? (
                      <span
                        className="text-[9px] rounded-full px-1.5 py-0.5"
                        style={{ background: "#EEF2FF", color: "#4F46E5" }}
                      >
                        Core
                      </span>
                    ) : (
                      <button
                        onClick={() => toggle(f.key, f.core)}
                        aria-checked={on}
                        role="switch"
                        aria-label={f.label}
                        className="relative shrink-0 focus:outline-none"
                        style={{ width: 30, height: 17, borderRadius: 20, background: on ? "#1E3A5F" : "#D1D5DB", cursor: "pointer" }}
                      >
                        <span
                          className="absolute top-[2px] rounded-full"
                          style={{
                            width: 13,
                            height: 13,
                            background: "white",
                            left: on ? 15 : 2,
                            transition: "left 0.15s",
                          }}
                        />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{f.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={discard}
              disabled={!dirty || saving}
              className="rounded-[8px] px-4 py-2 text-[12px] border disabled:opacity-40 hover:bg-gray-50 transition-colors"
              style={{ borderColor: "#E5E7EB", color: "#374151" }}
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-[8px] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ background: "#1E3A5F" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
