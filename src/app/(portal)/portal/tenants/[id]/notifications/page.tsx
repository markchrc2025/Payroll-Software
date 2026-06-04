"use client";

import { useState } from "react";
import { toast } from "sonner";

interface NotifRow {
  id: string;
  label: string;
  description: string;
  email: boolean;
  sms: boolean;
  inApp: boolean;
  enabled: boolean;
}

const DEFAULT_NOTIFICATIONS: NotifRow[] = [
  {
    id: "payroll_finalized",
    label: "Payroll finalized",
    description: "Notify when a payroll book is approved and finalized",
    email: true, sms: false, inApp: true, enabled: true,
  },
  {
    id: "trial_expiry",
    label: "Trial expiry warning",
    description: "Send reminder 7 days and 1 day before trial ends",
    email: true, sms: false, inApp: true, enabled: true,
  },
  {
    id: "payment_overdue",
    label: "Payment overdue",
    description: "Alert when subscription payment is past due",
    email: true, sms: false, inApp: true, enabled: true,
  },
  {
    id: "new_employee",
    label: "New employee onboarded",
    description: "Notify admin when a new employee record is created",
    email: false, sms: false, inApp: true, enabled: false,
  },
  {
    id: "leave_approved",
    label: "Leave request approved",
    description: "Notify employee when their leave is approved",
    email: true, sms: false, inApp: true, enabled: true,
  },
  {
    id: "payslip_released",
    label: "Payslip released",
    description: "Notify employees when payslips are available in ESS",
    email: true, sms: false, inApp: true, enabled: true,
  },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative inline-flex items-center rounded-full transition-colors shrink-0"
      style={{
        width: 36, height: 20,
        background: value ? "#1E3A5F" : "#E5E7EB",
      }}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform"
        style={{
          width: 14, height: 14,
          transform: value ? "translateX(18px)" : "translateX(3px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

function ChannelChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="text-[9px] font-medium rounded-full px-2 py-0.5"
      style={{
        background: active ? "rgba(30,58,95,0.08)" : "#F3F4F6",
        color: active ? "#1E3A5F" : "#9CA3AF",
      }}
    >
      {label}
    </span>
  );
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotifRow[]>(DEFAULT_NOTIFICATIONS);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setRows((r) => r.map((n) => n.id === id ? { ...n, enabled: !n.enabled } : n));
  }

  async function save() {
    setSaving(true);
    // In a real implementation this would PATCH /api/admin/tenants/[id] featureFlagsPatch
    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);
    toast.success("Notification preferences saved");
  }

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      <div className="rounded-[10px] overflow-hidden mb-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "0.5px solid #F3F4F6", background: "#F9FAFB" }}>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center">
            <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: "#6B7280" }}>Notification</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: "#6B7280" }}>Email</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: "#6B7280" }}>SMS</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: "#6B7280" }}>In-app</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: "#6B7280" }}>Enabled</span>
          </div>
        </div>

        {rows.map((n, idx) => (
          <div
            key={n.id}
            className="px-5 py-3.5 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center"
            style={{ borderBottom: idx < rows.length - 1 ? "0.5px solid #F3F4F6" : "none" }}
          >
            <div>
              <p className="text-[12px] font-medium" style={{ color: "#111827" }}>{n.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>{n.description}</p>
            </div>
            <ChannelChip active={n.email} label="Email" />
            <ChannelChip active={n.sms} label="SMS" />
            <ChannelChip active={n.inApp} label="In-app" />
            <Toggle value={n.enabled} onChange={() => toggle(n.id)} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-[7px] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          style={{ background: "#1E3A5F" }}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
