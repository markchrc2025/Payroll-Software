"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

const NAVY = "#1E3A5F";
const GRAY = "#6B7280";
const INK = "#111827";

export default function SetPasswordForm({ mode }: { mode: "invite" | "reset" }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/central-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "invite" ? "Set your password" : "Reset your password";
  const sub =
    mode === "invite"
      ? "Welcome to the Sentire Central Portal. Choose a password to activate your account."
      : "Choose a new password for your Central Portal account.";

  if (!token) {
    return (
      <Shell>
        <h1 style={h1}>Invalid link</h1>
        <p style={{ color: GRAY, fontSize: 14 }}>This link is missing its token. Request a new one.</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <CheckCircle2 size={40} color="#0b7a3e" style={{ marginBottom: 12 }} />
        <h1 style={h1}>All set</h1>
        <p style={{ color: GRAY, fontSize: 14, marginBottom: 20 }}>
          Your password has been {mode === "invite" ? "created" : "updated"}. You can now sign in.
        </p>
        <a href="/centralportal/login" style={{ textDecoration: "none", width: "100%" }}>
          <Button style={{ background: NAVY, color: "#fff", width: "100%" }}>Go to login</Button>
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={h1}>{heading}</h1>
      <p style={{ color: GRAY, fontSize: 14, marginBottom: 20 }}>{sub}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="New password" type="password" value={password} onChange={setPassword} />
        <Input label="Confirm password" type="password" value={confirm} onChange={setConfirm} />
        {error && <div style={{ color: "#c0392b", fontSize: 13 }}>{error}</div>}
        <Button onClick={submit} disabled={busy} style={{ background: NAVY, color: "#fff", width: "100%", marginTop: 4 }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : heading}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F9FAFB", fontFamily: "var(--font-plus-jakarta-sans, sans-serif)", padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
          padding: 32, width: "100%", maxWidth: 400, textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Input({
  label, type, value, onChange,
}: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
      <span style={{ fontSize: 12, color: GRAY }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px",
          fontSize: 14, color: INK, outline: "none", fontFamily: "inherit",
        }}
      />
    </label>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: INK, margin: "0 0 6px" };
