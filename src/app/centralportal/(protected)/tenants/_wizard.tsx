"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ArrowRight, Building2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type AccountStatus = "ACTIVE" | "TRIALING";
type PackageOption = { id: string; name: string; monthlyPrice: number; description: string | null };

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
  packageId: string;
  packageName: string;
  accountStatus: AccountStatus;
  trialEndsAt: string;
  billingEmail: string;
  // Step 3 — Admin account
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  companyCode: string;
  subdomain: string;
}

const INITIAL: WizardState = {
  name: "", tradeName: "", tinNumber: "", industry: "", address: "",
  province: "", city: "", zipCode: "",
  packageId: "", packageName: "", accountStatus: "TRIALING", trialEndsAt: "", billingEmail: "",
  adminFirstName: "", adminLastName: "", adminEmail: "", adminPhone: "",
  adminPassword: "", companyCode: "", subdomain: "",
};

const pesoFromCentavos = (c: number) => "₱" + (c / 100).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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
function toCompanyCode(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldGroup({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label className="text-[12px] font-medium" style={{ color: "#574D44" }}>
        {label}{required && <span style={{ color: "#b23b34", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <span className="text-[11px]" style={{ color: "#978C80" }}>{hint}</span>}
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
      style={{ border: "0.5px solid #E0D7CA", background: "white", color: "#2A2420" }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#E8693A"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(232,105,58,0.1)"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "#E0D7CA"; e.currentTarget.style.boxShadow = "none"; }}
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
        border: "0.5px solid #E0D7CA", background: "white", color: "#2A2420",
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
      style={{ color: "#978C80", borderBottom: "0.5px solid #F1ECE4" }}>
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
            onChange={(v) => {
              set({ name: v });
              if (!w.subdomain || w.subdomain === slugify(w.name)) set({ subdomain: slugify(v) });
              if (!w.companyCode || w.companyCode === toCompanyCode(w.name)) set({ companyCode: toCompanyCode(v) });
            }} />
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
  const [packages, setPackages] = useState<PackageOption[]>([]);
  useEffect(() => {
    fetch("/api/admin/billing/packages")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pubs: PackageOption[] = (d?.data ?? []).filter((p: { isPublished: boolean }) => p.isPublished);
        setPackages(pubs);
        // Default to the first published package if none chosen yet.
        if (!w.packageId && pubs[0]) set({ packageId: pubs[0].id, packageName: pubs[0].name });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <SectionTitle>Subscription plan</SectionTitle>
      {packages.length === 0 ? (
        <p className="text-[12px] mb-4" style={{ color: "#6B6259" }}>
          No published packages yet. Create one under Billing → Packages first.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-[10px] mb-4">
          {packages.map((p) => (
            <div
              key={p.id}
              onClick={() => set({ packageId: p.id, packageName: p.name })}
              className="rounded-[6px] p-3 cursor-pointer text-center transition-all"
              style={{
                border: w.packageId === p.id ? "1.5px solid #E8693A" : "0.5px solid #ECE6DD",
                background: w.packageId === p.id ? "rgba(232,105,58,0.05)" : "white",
              }}
            >
              <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2A2420" }}>{p.name}</div>
              <div className="text-[11px]" style={{ color: "#6B6259" }}>{p.description || "—"}</div>
              <div className="text-[12px] font-medium mt-1" style={{ color: "#E8693A" }}>{pesoFromCentavos(p.monthlyPrice)} / mo</div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Account status</SectionTitle>
      <div className="flex gap-2 mb-4">
        {(["ACTIVE", "TRIALING"] as const).map((s) => (
          <div
            key={s}
            onClick={() => set({ accountStatus: s })}
            className="flex-1 py-2 rounded-[6px] text-center text-[12px] cursor-pointer transition-all"
            style={{
              border: w.accountStatus === s
                ? (s === "ACTIVE" ? "0.5px solid #1f7a4d" : "0.5px solid #9a6a12")
                : "0.5px solid #ECE6DD",
              background: w.accountStatus === s
                ? (s === "ACTIVE" ? "rgba(31,122,77,0.06)" : "rgba(154,106,18,0.06)")
                : "white",
              color: w.accountStatus === s
                ? (s === "ACTIVE" ? "#1f7a4d" : "#9a6a12")
                : "#6B6259",
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
      <FieldGroup label="Company Code" required hint="Used by employees and admins to identify your company at login. Uppercase letters and numbers only, max 20 characters.">
        <div className="flex items-center rounded-[6px] overflow-hidden" style={{ border: "0.5px solid #E0D7CA" }}>
          <input
            type="text"
            value={w.companyCode}
            onChange={(e) => set({ companyCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
            placeholder="ACMECORP"
            className="flex-1 px-2.5 py-[7px] text-[13px] outline-none font-mono tracking-widest"
            style={{ background: "white", color: "#2A2420" }}
          />
        </div>
      </FieldGroup>
      <div className="mt-3" />
      <FieldGroup label="App subdomain" hint="Auto-generated from company name. Only lowercase letters, numbers, and hyphens.">
        <div className="flex items-center rounded-[6px] overflow-hidden" style={{ border: "0.5px solid #E0D7CA" }}>
          <span className="px-2.5 py-[7px] text-[12px] shrink-0" style={{ background: "#F7F4EF", borderRight: "0.5px solid #E0D7CA", color: "#6B6259" }}>
            app.sentire.ph/
          </span>
          <input
            type="text"
            value={w.subdomain}
            onChange={(e) => set({ subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder="acme-corp"
            className="flex-1 px-2.5 py-[7px] text-[13px] outline-none"
            style={{ background: "white", color: "#2A2420" }}
          />
        </div>
      </FieldGroup>
    </div>
  );
}

function Step4({ w }: { w: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div>
      <SectionTitle>Review summary</SectionTitle>
      <div>
        {[
          ["Company", w.name || "—"],
          ["TIN", w.tinNumber || "—"],
          ["Plan", w.packageName || "—"],
          ["Status", w.accountStatus === "ACTIVE" ? "Active" : "Trial"],
          ["Admin", w.adminEmail ? `${w.adminFirstName} ${w.adminLastName} · ${w.adminEmail}` : "—"],
          ["Billing email", w.billingEmail || "—"],
          ["Company Code", w.companyCode || "—"],
          ["Subdomain", w.subdomain ? `app.sentire.ph/${w.subdomain}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between py-[7px]" style={{ borderBottom: "0.5px solid #F1ECE4" }}>
            <span className="text-[12px]" style={{ color: "#6B6259" }}>{k}</span>
            <span className="text-[12px] font-medium text-right" style={{ color: "#2A2420", maxWidth: "60%" }}>{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] mt-4 px-3 py-2 rounded-[6px]" style={{ color: "#6B6259", background: "#F7F4EF", border: "0.5px solid #ECE6DD" }}>
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
      if (!w.companyCode.trim()) return "Company Code is required";
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
        companyCode: w.companyCode.trim() || null,
        subdomain: w.subdomain.trim() || null,
        packageId: w.packageId || null,
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
      router.push(`/centralportal/tenants/${json.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ fontFamily: "var(--font-hanken-grotesk), var(--font-instrument-sans), system-ui, sans-serif" }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(33,26,21,0.5)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex flex-col"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "92vh",
          background: "white", borderRadius: 12,
          border: "0.5px solid #ECE6DD",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "0.5px solid #F1ECE4" }}>
          <div>
            <p className="text-[16px] font-medium" style={{ color: "#2A2420" }}>Add new tenant</p>
            <p className="text-[12px] mt-0.5" style={{ color: "#6B6259" }}>Complete all steps to provision a new company account</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-[5px] hover:bg-[#f1ece4] transition-colors ml-4">
            <X size={16} style={{ color: "#6B6259" }} />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex px-6 py-4 gap-0 shrink-0" style={{ borderBottom: "0.5px solid #F1ECE4" }}>
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
                    height: 0.5, background: "#ECE6DD", zIndex: 0,
                  }} />
                )}
                <div
                  className="flex items-center justify-center text-[12px] font-medium relative z-10 transition-all"
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: done || active ? "#E8693A" : "#F7F4EF",
                    border: done || active ? "none" : "0.5px solid #ECE6DD",
                    color: done || active ? "white" : "#978C80",
                    boxShadow: active ? "0 0 0 3px rgba(232,105,58,0.15)" : "none",
                  }}
                >
                  {done ? <Check size={12} /> : n === 1 ? <Building2 size={13} /> : n}
                </div>
                <span className="text-[10px] text-center leading-tight"
                  style={{ color: active ? "#2A2420" : "#978C80", fontWeight: active ? 500 : 400 }}>
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
          style={{ borderTop: "0.5px solid #F1ECE4" }}>
          <span className="text-[12px]" style={{ color: "#978C80" }}>Step {step} of 4</span>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-[7px] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[#f6f1ea]"
                style={{ border: "0.5px solid #ECE6DD", color: "#6B6259", background: "white" }}
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-[7px] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60 transition-opacity"
              style={{ background: "#E8693A" }}
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
