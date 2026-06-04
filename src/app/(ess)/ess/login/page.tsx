"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Building2, IdCard, CalendarDays, Delete } from "lucide-react";

// ── PIN Keypad ────────────────────────────────────────────────────────────────
const KEYPAD: Array<{ label: string; value: string } | null> = [
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" },
  { label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" },
  { label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" },
  null,                        { label: "0", value: "0" }, { label: "⌫", value: "back" },
];

function PinKeypad({ pin, onChange }: { pin: string; onChange: (p: string) => void }) {
  return (
    <div className="space-y-4">
      {/* 6-dot indicator */}
      <div className="flex justify-center gap-3 py-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full border-[1.5px] transition-all ${
              i < pin.length
                ? "bg-[#1E3A5F] border-[#1E3A5F]"
                : "bg-transparent border-gray-300"
            }`}
          />
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {KEYPAD.map((key, i) => {
          if (!key) return <div key={i} />;
          if (key.value === "back") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChange(pin.slice(0, -1))}
                className="flex items-center justify-center border border-gray-200 rounded-xl py-3.5 bg-white active:bg-gray-50 transition-colors"
                aria-label="Backspace"
              >
                <Delete className="h-5 w-5 text-gray-500" />
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => { if (pin.length < 6) onChange(pin + key.value); }}
              className="text-[19px] font-medium text-[#1E3A5F] border border-gray-200 rounded-xl py-3.5 bg-white active:bg-gray-50 transition-colors leading-none"
            >
              {key.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label, icon: Icon, children,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        {children}
      </div>
    </div>
  );
}

const INPUT_CLS =
  "w-full pl-9 pr-3 py-2.5 text-[13px] text-gray-900 bg-white border border-gray-200 rounded-xl outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] transition";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EssLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"dob" | "pin">("dob");
  const [companyCode, setCompanyCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const tenantFromQuery = searchParams.get("tenant");

  useEffect(() => {
    if (tenantFromQuery) { setCompanyCode(tenantFromQuery.toUpperCase().replace(/[^A-Z0-9]/g, "")); return; }
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3) setCompanyCode(parts[0].toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }, [tenantFromQuery]);

  // Reset PIN when switching mode
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current !== mode) { setPin(""); prevMode.current = mode; }
  }, [mode]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!companyCode.trim()) {
      toast.error("Company Code is required.");
      return;
    }
    if (!employeeNumber.trim()) {
      toast.error("Employee number is required.");
      return;
    }
    setLoading(true);
    const body: Record<string, string> = { companyCode: companyCode.trim().toUpperCase(), employeeNumber: employeeNumber.trim() };
    if (mode === "dob") body.birthDate = birthDate;
    else body.pin = pin;

    try {
      const res = await fetch("/api/ess/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? data?.message ?? "Login failed. Check your credentials.");
        return;
      }
      const token = data?.data?.token;
      if (!token) { toast.error("Unexpected response from server."); return; }
      localStorage.setItem("ess_token", token);
      toast.success("Logged in successfully!");
      router.replace("/ess");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const pinReady = pin.length === 6;

  // ── Shared form content (used in both mobile and desktop layouts) ─────────
  const FormContent = (
    <>
      {/* Mode toggle */}
      <div className="grid grid-cols-2 bg-gray-100 rounded-xl p-[3px] mb-5">
        {(["dob", "pin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`py-2.5 rounded-[9px] text-[12.5px] font-medium transition-all ${
              mode === m
                ? "bg-[#1E3A5F] text-white shadow-sm"
                : "text-gray-400 font-normal"
            }`}
          >
            {m === "dob" ? "Date of Birth" : "PIN Login"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Company Code */}
        {!tenantFromQuery && (
          <Field label="Company Code" icon={Building2}>
            <input
              className={INPUT_CLS + " font-mono tracking-widest"}
              placeholder="e.g. DEMOCORP"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </Field>
        )}
        {!tenantFromQuery && (
          <p className="text-[10px] text-gray-400 -mt-2">
            Tip: Your HR may have given you a direct company link.
          </p>
        )}

        {/* Employee Number */}
        <Field label="Employee Number" icon={IdCard}>
          <input
            className={INPUT_CLS}
            placeholder="EMP-00001"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </Field>

        {/* Date of Birth mode */}
        {mode === "dob" && (
          <>
            <Field label="Date of Birth" icon={CalendarDays}>
              <input
                className={INPUT_CLS}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1E3A5F] text-white rounded-xl py-3.5 text-[14px] font-medium tracking-[0.2px] disabled:opacity-60 transition-opacity mt-1"
            >
              {loading ? "Logging in…" : "Log In"}
            </button>
          </>
        )}
      </form>

      {/* PIN mode — outside form to avoid submit on keypad taps */}
      {mode === "pin" && (
        <div className="mt-3.5 space-y-4">
          <p className="text-[11px] font-medium text-gray-500">Enter your 6-digit PIN</p>
          <PinKeypad pin={pin} onChange={setPin} />
          <button
            type="button"
            disabled={!pinReady || loading}
            onClick={() => handleSubmit()}
            className={`w-full rounded-xl py-3.5 text-[14px] font-medium tracking-[0.2px] transition-all ${
              pinReady && !loading
                ? "bg-[#1E3A5F] text-white"
                : "bg-slate-300 text-white cursor-not-allowed"
            }`}
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-100 text-center space-y-0.5">
        <p className="text-[11px] text-gray-400">New employee?</p>
        <p className="text-[11px] text-gray-400">Ask your HR Admin to send your activation link.</p>
      </div>
    </>
  );

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans), sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════
          MOBILE LAYOUT  (< md)
          Navy header + overlapping white card, full-width
         ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen flex flex-col items-center justify-start bg-[#F8FAFC]">
        <div className="w-full max-w-sm">
          {/* Navy header */}
          <div className="bg-[#1E3A5F] px-6 pt-10 pb-14 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[18px] bg-white/10 border border-white/20 flex items-center justify-center mb-4">
              <span className="text-[30px] font-medium text-white" style={{ fontFamily: "Georgia, serif" }}>S</span>
            </div>
            <p className="text-white text-[19px] font-medium tracking-[-0.2px] mb-1">Sentire Payroll</p>
            <p className="text-white/50 text-[12px]">Employee Self-Service</p>
          </div>
          {/* White card overlapping header */}
          <div className="bg-white rounded-[26px] -mt-7 mx-0 px-5 pt-6 pb-8 shadow-sm">
            {FormContent}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (≥ md)
          Left: navy brand panel  |  Right: white form panel
         ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex min-h-screen">

        {/* Left — brand panel */}
        <div className="w-[44%] bg-[#1E3A5F] flex flex-col items-center justify-center px-12 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/[0.04] pointer-events-none" />
          <div className="absolute bottom-[-60px] right-[-60px] w-96 h-96 rounded-full bg-white/[0.04] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center max-w-xs">
            <div className="w-[72px] h-[72px] rounded-[20px] bg-white/10 border border-white/20 flex items-center justify-center mb-6">
              <span className="text-[34px] font-medium text-white" style={{ fontFamily: "Georgia, serif" }}>S</span>
            </div>
            <h1 className="text-white text-[26px] font-semibold tracking-[-0.4px] mb-2">Sentire Payroll</h1>
            <p className="text-white/50 text-[14px] mb-10">Employee Self-Service Portal</p>

            {/* Feature highlights */}
            <div className="space-y-4 text-left w-full">
              {[
                { icon: "💰", title: "View Payslips", desc: "Access your payslips and earnings history" },
                { icon: "🏖️", title: "File Leave", desc: "Submit and track leave applications" },
                { icon: "👤", title: "Manage Profile", desc: "Update your personal information" },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <span className="text-[20px] mt-0.5 leading-none">{f.icon}</span>
                  <div>
                    <p className="text-white/90 text-[13px] font-semibold">{f.title}</p>
                    <p className="text-white/40 text-[12px]">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — form panel */}
        <div className="flex-1 bg-[#F5F7FA] flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <h2 className="text-[22px] font-semibold text-[#1E3A5F] tracking-[-0.3px]">Welcome back</h2>
              <p className="text-[13px] text-gray-400 mt-1">Sign in to your employee account</p>
            </div>
            <div className="bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-[0_2px_16px_rgba(0,0,0,0.07)]">
              {FormContent}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
