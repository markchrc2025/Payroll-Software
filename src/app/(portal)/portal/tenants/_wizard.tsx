"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ArrowRight, Building2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type Plan = "STARTER" | "GROWTH" | "PRO";
type AccountStatus = "ACTIVE" | "TRIALING";

interface WizardState {
  // Step 1 — Company
  name: string;
  tradeName: string;
  tinNumber: string;
  industry: string;
  address: string;
  province: string;
  city: string;
  zipCode: string;
  // Step 2 — Subscription
  plan: Plan;
  accountStatus: AccountStatus;
  trialEndsAt: string;
  billingEmail: string;
  // Step 3 — Admin account
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  subdomain: string;
}

const INITIAL: WizardState = {
  name: "", tradeName: "", tinNumber: "", industry: "", address: "",
  province: "", city: "", zipCode: "",
  plan: "GROWTH", accountStatus: "TRIALING", trialEndsAt: "", billingEmail: "",
  adminFirstName: "", adminLastName: "", adminEmail: "", adminPhone: "",
  adminPassword: "", subdomain: "",
};

const PLANS: { key: Plan; label: string; limit: string; price: string }[] = [
  { key: "STARTER",  label: "Starter",    limit: "Up to 50 employees",     price: "₱700 / mo" },
  { key: "GROWTH",   label: "Growth",     limit: "Up to 200 employees",    price: "₱950 / mo" },
  { key: "PRO",      label: "Enterprise", limit: "Unlimited employees",    price: "Custom" },
];

const INDUSTRIES = [
  "Retail / E-Commerce", "Manufacturing", "BPO / IT Services", "Food & Beverage",
  "Healthcare", "Education", "Construction", "Finance / Insurance",
  "Real Estate", "Transportation / Logistics", "Hospitality", "Other",
];

const REGIONS = [
  "NCR — National Capital Region", "CAR — Cordillera Administrative Region",
  "Region I — Ilocos Region", "Region II — Cagayan Valley",
  "Region III — Central Luzon", "Region IV-A — CALABARZON",
  "Region IV-B — MIMAROPA", "Region V — Bicol Region",
  "Region VI — Western Visayas", "Region VII — Central Visayas",
  "Region VIII — Eastern Visayas", "Region IX — Zamboanga Peninsula",
  "Region X — Northern Mindanao", "Region XI — Davao Region",
  "Region XII — SOCCSKSARGEN", "Region XIII — Caraga",
  "BARMM — Bangsamoro Autonomous Region in Muslim Mindanao",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldGroup({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label className="text-[12px] font-medium" style={{ color: "#4B5563" }}>
        {label}{required && <span style={{ color: "#c0392b", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{hint}</span>}
    </div>
  );
}

function FInput({ value, onChange, placeholder, type = "text", autoComplete }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="rounded-[6px] px-[10px] py-[7px] text-[13px] outline-none w-full"
      style={{ border: "0.5px solid #D1D5DB", background: "white", color: "#111827" }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#1E3A5F"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(30,58,95,0.1)"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.boxShadow = "none"; }}
    />
  );
}

function FSelect({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[6px] px-[10px] py-[7px] text-[13px] outline-none w-full appearance-none"
      style={{
        border: "0.5px solid #D1D5DB", background: "white", color: "#111827",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
        paddingRight: 28,
      }}
    >
      {children}
    </select>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-3 pb-2"
      style={{ color: "#9CA3AF", borderBottom: "0.5px solid #F3F4F6" }}>
      {children}
    </p>
  );
}

// ─── Step panels ─────────────────────────────────────────────────────────────

function Step1({ w, set }: { w: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div>
      <SectionTitle>Company information</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <FieldGroup label="Legal company name" required>
          <FInput value={w.name} placeholder="Acme Corp Inc."
            onChange={(v) => { set({ name: v }); if (!w.subdomain || w.subdomain === slugify(w.name)) set({ subdomain: slugify(v) }); }} />
        </FieldGroup>
        <FieldGroup label="Trade / DBA name">
          <FInput value={w.tradeName} placeholder="Acme Corp" onChange={(v) => set({ tradeName: v })} />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <FieldGroup label="TIN (tax identification no.)" required hint="BIR-issued TIN, required for statutory reports">
          <FInput value={w.tinNumber} placeholder="000-000-000-000" onChange={(v) => set({ tinNumber: v })} />
        </FieldGroup>
        <FieldGroup label="Industry" required>
          <FSelect value={w.industry} onChange={(v) => set({ industry: v })}>
            <option value="">Select industry</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </FSelect>
        </FieldGroup>
      </div>
      <div className="mb-3">
        <FieldGroup label="Registered address" required>
          <FInput value={w.address} placeholder="Unit 4B, 123 EDSA, Mandaluyong City, Metro Manila" onChange={(v) => set({ address: v })} />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="DOLE region" hint="Sets minimum wage table for payroll computation">
          <FSelect value={w.province} onChange={(v) => set({ province: v })}>
            <option value="">Select region</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </FSelect>
        </FieldGroup>
        <FieldGroup label="City">
          <FInput value={w.city} placeholder="Mandaluyong City" onChange={(v) => set({ city: v })} />
        </FieldGroup>
      </div>
    </div>
  );
}

function Step2({ w, set }: { w: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div>
      <SectionTitle>Subscription plan</SectionTitle>
      <div className="grid grid-cols-3 gap-[10px] mb-4">
        {PLANS.map((p) => (
          <div
            key={p.key}
            onClick={() => set({ plan: p.key })}
            className="rounded-[6px] p-3 cursor-pointer text-center transition-all"
            style={{
              border: w.plan === p.key ? "1.5px solid #1E3A5F" : "0.5px solid #E5E7EB",
              background: w.plan === p.key ? "rgba(30,58,95,0.05)" : "white",
            }}
          >
            <div className="text-[13px] font-medium mb-0.5" style={{ color: "#111827" }}>{p.label}</div>
            <div className="text-[11px]" style={{ color: "#6B7280" }}>{p.limit}</div>
            <div className="text-[12px] font-medium mt-1" style={{ color: "#1E3A5F" }}>{p.price}</div>
          </div>
        ))}
      </div>

      <SectionTitle>Account status</SectionTitle>
      <div className="flex gap-2 mb-4">
        {(["ACTIVE", "TRIALING"] as const).map((s) => (
          <div
            key={s}
            onClick={() => set({ accountStatus: s })}
            className="flex-1 py-2 rounded-[6px] text-center text-[12px] cursor-pointer transition-all"
            style={{
              border: w.accountStatus === s
                ? (s === "ACTIVE" ? "0.5px solid #0b7a3e" : "0.5px solid #b35c00")
                : "0.5px solid #E5E7EB",
              background: w.accountStatus === s
                ? (s === "ACTIVE" ? "rgba(11,122,62,0.06)" : "rgba(179,92,0,0.06)")
                : "white",
              color: w.accountStatus === s
                ? (s === "ACTIVE" ? "#0b7a3e" : "#b35c00")
                : "#6B7280",
              fontWeight: w.accountStatus === s ? 500 : 400,
            }}
          >
            {s === "ACTIVE" ? "Active" : "Trial"}
          </div>
        ))}
      </div>

      {w.accountStatus === "TRIALING" && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <FieldGroup label="Trial end date">
            <FInput type="date" value={w.trialEndsAt} onChange={(v) => set({ trialEndsAt: v })} />
          </FieldGroup>
        </div>
      )}

      <SectionTitle>Billing</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Billing email">
          <FInput type="email" value={w.billingEmail} placeholder="billing@company.com" onChange={(v) => set({ billingEmail: v })} />
        </FieldGroup>
      </div>
    </div>
  );
}

function Step3({ w, set }: { w: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div>
      <SectionTitle>Primary admin account</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <FieldGroup label="First name" required>
          <FInput value={w.adminFirstName} placeholder="Juan" onChange={(v) => set({ adminFirstName: v })} autoComplete="given-name" />
        </FieldGroup>
        <FieldGroup label="Last name" required>
          <FInput value={w.adminLastName} placeholder="dela Cruz" onChange={(v) => set({ adminLastName: v })} autoComplete="family-name" />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <FieldGroup label="Email address" required>
          <FInput type="email" value={w.adminEmail} placeholder="admin@company.com" onChange={(v) => set({ adminEmail: v })} autoComplete="email" />
        </FieldGroup>
        <FieldGroup label="Mobile number">
          <FInput value={w.adminPhone} placeholder="+63 9XX XXX XXXX" onChange={(v) => set({ adminPhone: v })} />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <FieldGroup label="Password" required hint="Minimum 8 characters">
          <FInput type="password" value={w.adminPassword} placeholder="••••••••" onChange={(v) => set({ adminPassword: v })} autoComplete="new-password" />
        </FieldGroup>
      </div>

      <SectionTitle>Portal access</SectionTitle>
      <FieldGroup label="App subdomain" hint="Auto-generated from company name. Only lowercase letters, numbers, and hyphens.">
        <div className="flex items-center rounded-[6px] overflow-hidden" style={{ border: "0.5px solid #D1D5DB" }}>
          <span className="px-2.5 py-[7px] text-[12px] shrink-0" style={{ background: "#F9FAFB", borderRight: "0.5px solid #D1D5DB", color: "#6B7280" }}>
            app.sentire.ph/
          </span>
          <input
            type="text"
            value={w.subdomain}
            onChange={(e) => set({ subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder="acme-corp"
            className="flex-1 px-2.5 py-[7px] text-[13px] outline-none"
            style={{ background: "white", color: "#111827" }}
          />
        </div>
      </FieldGroup>
    </div>
  );
}

function Step4({ w }: { w: WizardState; set: (p: Partial<WizardState>) => void }) {
  const planLabel = PLANS.find((p) => p.key === w.plan);
  return (
    <div>
      <SectionTitle>Review summary</SectionTitle>
      <div>
        {[
          ["Company", w.name || "—"],
          ["TIN", w.tinNumber || "—"],
          ["Plan", planLabel ? `${planLabel.label} · ${planLabel.price}` : "—"],
          ["Status", w.accountStatus === "ACTIVE" ? "Active" : "Trial"],
          ["Admin", w.adminEmail ? `${w.adminFirstName} ${w.adminLastName} · ${w.adminEmail}` : "—"],
          ["Billing email", w.billingEmail || "—"],
          ["Subdomain", w.subdomain ? `app.sentire.ph/${w.subdomain}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between py-[7px]" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
            <span className="text-[12px]" style={{ color: "#6B7280" }}>{k}</span>
            <span className="text-[12px] font-medium text-right" style={{ color: "#111827", maxWidth: "60%" }}>{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] mt-4 px-3 py-2 rounded-[6px]" style={{ color: "#6B7280", background: "#F9FAFB", border: "0.5px solid #E5E7EB" }}>
        Pay schedule, statutory cutoff, and 13th month settings can be configured in the Payroll setup tab after creation.
      </p>
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

const STEP_LABELS = ["Company", "Subscription", "Admin account", "Config & review"];

export function AddTenantWizard({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [w, setWFull] = useState<WizardState>(INITIAL);
  const [saving, setSaving] = useState(false);

  function set(patch: Partial<WizardState>) { setWFull((prev) => ({ ...prev, ...patch })); }

  // Reset when opened
  useEffect(() => {
    if (open) { setStep(1); setWFull(INITIAL); }
  }, [open]);

  function validate(): string | null {
    if (step === 1) {
      if (!w.name.trim()) return "Legal company name is required";
      if (!w.tinNumber.trim()) return "TIN is required";
      if (!w.industry) return "Industry is required";
    }
    if (step === 3) {
      if (!w.adminFirstName.trim()) return "Admin first name is required";
      if (!w.adminLastName.trim()) return "Admin last name is required";
      if (!w.adminEmail.trim()) return "Admin email is required";
      if (!w.adminPassword || w.adminPassword.length < 8) return "Password must be at least 8 characters";
    }
    return null;
  }

  async function handleNext() {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (step < 4) { setStep((s) => s + 1); return; }

    // Submit
    setSaving(true);
    try {
      const payload = {
        name: w.name.trim(),
        tradeName: w.tradeName.trim() || null,
        tinNumber: w.tinNumber.trim() || null,
        industry: w.industry || null,
        address: w.address.trim() || null,
        province: w.province || null,
        city: w.city.trim() || null,
        subdomain: w.subdomain.trim() || null,
        subscriptionTier: w.plan,
        subscriptionStatus: w.accountStatus,
        billingEmail: w.billingEmail.trim() || null,
        trialEndsAt: w.trialEndsAt ? new Date(w.trialEndsAt).toISOString() : null,
        adminFirstName: w.adminFirstName.trim() || null,
        adminLastName: w.adminLastName.trim() || null,
        adminEmail: w.adminEmail.trim() || null,
        adminPassword: w.adminPassword || null,
        adminPhone: w.adminPhone.trim() || null,
        featureFlags: {},
      };

      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Failed to create tenant"); return; }

      toast.success(`Tenant "${w.name}" created`);
      onClose();
      onCreated(json.data.id);
      router.push(`/portal/tenants/${json.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(15,30,54,0.55)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex flex-col"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "92vh",
          background: "white", borderRadius: 12,
          border: "0.5px solid #E5E7EB",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "0.5px solid #F3F4F6" }}>
          <div>
            <p className="text-[16px] font-medium" style={{ color: "#111827" }}>Add new tenant</p>
            <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>Complete all steps to provision a new company account</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-[5px] hover:bg-gray-100 transition-colors ml-4">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex px-6 py-4 gap-0 shrink-0" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex-1 flex flex-col items-center gap-1.5 relative">
                {/* connector line */}
                {i < STEP_LABELS.length - 1 && (
                  <div className="absolute" style={{
                    top: 14, left: "calc(50% + 16px)", right: "calc(-50% + 16px)",
                    height: 0.5, background: "#E5E7EB", zIndex: 0,
                  }} />
                )}
                <div
                  className="flex items-center justify-center text-[12px] font-medium relative z-10 transition-all"
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: done || active ? "#1E3A5F" : "#F9FAFB",
                    border: done || active ? "none" : "0.5px solid #E5E7EB",
                    color: done || active ? "white" : "#9CA3AF",
                    boxShadow: active ? "0 0 0 3px rgba(30,58,95,0.15)" : "none",
                  }}
                >
                  {done ? <Check size={12} /> : n === 1 ? <Building2 size={13} /> : n}
                </div>
                <span className="text-[10px] text-center leading-tight"
                  style={{ color: active ? "#111827" : "#9CA3AF", fontWeight: active ? 500 : 400 }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {step === 1 && <Step1 w={w} set={set} />}
          {step === 2 && <Step2 w={w} set={set} />}
          {step === 3 && <Step3 w={w} set={set} />}
          {step === 4 && <Step4 w={w} set={set} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 shrink-0"
          style={{ borderTop: "0.5px solid #F3F4F6" }}>
          <span className="text-[12px]" style={{ color: "#9CA3AF" }}>Step {step} of 4</span>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-[7px] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-gray-50"
                style={{ border: "0.5px solid #E5E7EB", color: "#6B7280", background: "white" }}
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-[7px] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60 transition-opacity"
              style={{ background: "#1E3A5F" }}
            >
              {step === 4 ? (
                saving ? "Creating…" : <><Check size={13} /> Create tenant</>
              ) : (
                <>Continue <ArrowRight size={13} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
