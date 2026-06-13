"use client";

/**
 * ESS sign-in — restyled to the desktop design handoff (DLogin): a centered
 * single-column card on the warm background with the Sentire "Nexus" lockup and
 * a footer. Company code + employee number → 6-box PIN (with password / date of
 * birth / biometric fallbacks). All auth is real (POST /api/ess/auth and the
 * WebAuthn endpoints); the device remembers the employee so we can greet by name.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { NexusMark } from "@/components/sentire-login/glyphs";
import { EIcon } from "@/components/ess/icons";
import "@/components/ess/ess.css";

const IDENTITY_KEY = "ess_identity";
const TOKEN_KEY = "ess_token";

interface Identity {
  companyCode: string;
  employeeNumber: string;
  first?: string;
  company?: string;
  initials?: string;
}

type Method = "pin" | "password" | "dob";
type Status = "idle" | "error" | "success";

// 6-box PIN entry backed by a hidden numeric input (handoff DPinBoxes).
function DPinBoxes({
  pin,
  error,
  busy,
  onPin,
}: {
  pin: string;
  error: boolean;
  busy: boolean;
  onPin: (v: string) => void;
}) {
  const LEN = 6;
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={"d-pinrow" + (error ? " is-error" : "")}
      onClick={() => ref.current?.focus()}
    >
      {Array.from({ length: LEN }).map((_, i) => (
        <span
          key={i}
          className={
            "d-pinbox" +
            (i < pin.length ? " is-filled" : "") +
            (i === pin.length ? " is-next" : "")
          }
        >
          {i < pin.length ? "•" : ""}
        </span>
      ))}
      <input
        ref={ref}
        className="d-pinhidden"
        type="password"
        inputMode="numeric"
        autoFocus
        disabled={busy}
        value={pin}
        maxLength={LEN}
        aria-label="6-digit PIN"
        onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, LEN))}
      />
    </div>
  );
}

function EssLoginContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [phase, setPhase] = useState<"identify" | "unlock">("identify");
  const [companyCode, setCompanyCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [method, setMethod] = useState<Method>("pin");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Load remembered identity (or prefill company code from ?tenant / subdomain).
  useEffect(() => {
    let id: Identity | null = null;
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      if (raw) id = JSON.parse(raw) as Identity;
    } catch {
      id = null;
    }
    if (id?.companyCode && id.employeeNumber) {
      setIdentity(id);
      setCompanyCode(id.companyCode);
      setEmployeeNumber(id.employeeNumber);
      setPhase("unlock");
      return;
    }
    const tenant = sp.get("tenant");
    if (tenant) {
      setCompanyCode(tenant.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    } else {
      const parts = window.location.hostname.split(".");
      if (parts.length >= 3) setCompanyCode(parts[0].toUpperCase().replace(/[^A-Z0-9]/g, ""));
    }
  }, [sp]);

  const authenticate = useCallback(
    async (cred: { pin?: string; password?: string; birthDate?: string }) => {
      if (busy) return;
      setBusy(true);
      setErrMsg("");
      try {
        const res = await fetch("/api/ess/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: companyCode.trim().toUpperCase(),
            employeeNumber: employeeNumber.trim(),
            ...cred,
          }),
        });
        const data = await res.json().catch(() => null);
        const token = data?.data?.token;
        if (!res.ok || !token) {
          throw new Error(data?.error ?? data?.message ?? "We couldn't verify those details.");
        }
        localStorage.setItem(TOKEN_KEY, token);

        // Enrich remembered identity so next time we can greet them by name.
        try {
          const pr = await fetch("/api/ess/profile", { headers: { Authorization: `Bearer ${token}` } });
          const pd = await pr.json();
          const e = pd?.data;
          const next: Identity = {
            companyCode: companyCode.trim().toUpperCase(),
            employeeNumber: employeeNumber.trim(),
            first: e?.preferredName?.split(" ")[0] ?? e?.firstName ?? undefined,
            company: e?.company ?? undefined,
            initials: ((e?.firstName?.[0] ?? "") + (e?.lastName?.[0] ?? "")) || undefined,
          };
          localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
        } catch {
          /* identity enrichment is best-effort */
        }

        setStatus("success");
        setTimeout(() => router.replace("/ess"), 900);
      } catch (e) {
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : "Sign in failed. Please try again.");
        setPin("");
        setTimeout(() => setStatus("idle"), 700);
      } finally {
        setBusy(false);
      }
    },
    [busy, companyCode, employeeNumber, router],
  );

  function onPin(v: string) {
    if (busy || status === "success") return;
    if (status === "error") setStatus("idle");
    setPin(v);
    if (v.length === 6) setTimeout(() => authenticate({ pin: v }), 140);
  }

  const faceId = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErrMsg("");
    try {
      const startRes = await fetch("/api/ess/webauthn/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: companyCode.trim().toUpperCase(),
          employeeNumber: employeeNumber.trim(),
        }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        if (startRes.status === 404) {
          toast.info("No biometric key registered on this account. Use PIN or password.");
          setBusy(false);
          return;
        }
        throw new Error(d?.error ?? "Failed to start biometric authentication");
      }
      const { data } = await startRes.json();
      const { options, challengeToken } = data as { options: unknown; challengeToken: string };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await startAuthentication(options as any);

      const finishRes = await fetch("/api/ess/webauthn/authenticate/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, response: credential }),
      });
      const fd = await finishRes.json().catch(() => null);
      const token = fd?.data?.token;
      if (!finishRes.ok || !token) {
        throw new Error(fd?.error ?? "Biometric verification failed. Please try again.");
      }

      localStorage.setItem(TOKEN_KEY, token);
      setStatus("success");
      setTimeout(() => router.replace("/ess"), 900);
    } catch (e) {
      if (e instanceof Error && e.name === "NotAllowedError") {
        setBusy(false);
        return;
      }
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Biometric sign-in failed. Try again.");
      setTimeout(() => setStatus("idle"), 700);
    } finally {
      setBusy(false);
    }
  }, [busy, companyCode, employeeNumber, router]);

  function switchAccount() {
    localStorage.removeItem(IDENTITY_KEY);
    setIdentity(null);
    setPhase("identify");
    setEmployeeNumber("");
    setPin("");
    setPassword("");
    setBirthDate("");
    setMethod("pin");
    setStatus("idle");
    setErrMsg("");
  }

  function startUnlock(e?: React.FormEvent) {
    e?.preventDefault();
    if (!companyCode.trim() || !employeeNumber.trim()) {
      setErrMsg("Enter your company code and employee number.");
      return;
    }
    setErrMsg("");
    setPhase("unlock");
    setMethod("pin");
  }

  const brand = (
    <div className="d-login-brand">
      <NexusMark size={30} lineW={3.4} core="#E8693A" />
      <b>
        Sentire <span>Payroll</span>
      </b>
    </div>
  );

  const footer = (
    <div className="d-login-foot">
      <span>© 2026 Sentire</span>
      <span className="d-login-dot">·</span>
      <button type="button" onClick={() => toast.info("Privacy policy coming soon.")}>
        Privacy
      </button>
      <span className="d-login-dot">·</span>
      <button type="button" onClick={() => toast.info("Contact your HR admin for help.")}>
        Help
      </button>
    </div>
  );

  let card: React.ReactNode;

  if (status === "success") {
    card = (
      <div className="d-login-card d-login-okcard">
        <span className="e-success-ic">
          <EIcon name="checkCircle" size={50} />
        </span>
        <h2>Welcome back{identity?.first ? `, ${identity.first}` : ""}</h2>
        <p className="d-login-sub">Opening your workspace…</p>
      </div>
    );
  } else if (phase === "identify") {
    card = (
      <form className="d-login-card" onSubmit={startUnlock}>
        <h2>Sign in</h2>
        <p className="d-login-sub">Enter your company code and employee number</p>
        <div className="d-lfield">
          <label className="e-flabel">Company code</label>
          <div className="e-finput">
            <EIcon name="building" size={17} />
            <input
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="SENTIREPAYROLL"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Company code"
              autoFocus
            />
          </div>
        </div>
        <div className="d-lfield">
          <label className="e-flabel">Employee number</label>
          <div className="e-finput">
            <EIcon name="user" size={17} />
            <input
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value.toUpperCase())}
              placeholder="EMP-00001"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              aria-label="Employee number"
            />
          </div>
        </div>
        <button className="e-btn e-btn-primary e-btn-full" type="submit">
          Continue
        </button>
        {errMsg && <p className="d-login-err">{errMsg}</p>}
        <div className="d-login-new">
          <span>New employee?</span>
          <button type="button" onClick={() => toast.info("Ask your HR admin to send your activation link.")}>
            Activate your account
          </button>
        </div>
      </form>
    );
  } else if (method === "pin") {
    card = (
      <div className="d-login-card">
        <h2>Enter your PIN</h2>
        <p className="d-login-sub">
          Signing in as <b>{employeeNumber}</b> · {identity?.company ?? companyCode}
        </p>
        <DPinBoxes pin={pin} error={status === "error"} busy={busy} onPin={onPin} />
        <p className="d-pinlabel">
          {status === "error" ? errMsg || "Incorrect PIN — try again." : "Type your 6-digit PIN"}
        </p>
        <div className="d-login-links">
          <button type="button" onClick={faceId} disabled={busy}>
            Use Face ID
          </button>
          <button type="button" onClick={() => { setMethod("password"); setStatus("idle"); }}>
            Use password
          </button>
          <button type="button" onClick={() => { setMethod("dob"); setStatus("idle"); }}>
            Date of birth
          </button>
          <button type="button" onClick={switchAccount}>
            Use a different account
          </button>
        </div>
      </div>
    );
  } else if (method === "password") {
    card = (
      <div className="d-login-card">
        <h2>Enter your password</h2>
        <p className="d-login-sub">
          Signing in as <b>{employeeNumber}</b> · {identity?.company ?? companyCode}
        </p>
        <div className="d-lfield">
          <label className="e-flabel">Password</label>
          <div className="e-finput">
            <EIcon name="lock" size={17} />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && authenticate({ password })}
              autoComplete="current-password"
              autoFocus
            />
            <button className="e-seclink" onClick={() => setShowPw((s) => !s)} type="button" aria-label="Toggle password">
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button
          className="e-btn e-btn-primary e-btn-full"
          onClick={() => authenticate({ password })}
          disabled={busy || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {errMsg && <p className="d-login-err">{errMsg}</p>}
        <div className="d-login-links">
          <button type="button" onClick={() => { setMethod("pin"); setStatus("idle"); }}>
            Use PIN
          </button>
          <button type="button" onClick={() => { setMethod("dob"); setStatus("idle"); }}>
            Date of birth
          </button>
          <button type="button" onClick={switchAccount}>
            Different account
          </button>
        </div>
      </div>
    );
  } else {
    card = (
      <div className="d-login-card">
        <h2>Confirm your date of birth</h2>
        <p className="d-login-sub">
          Signing in as <b>{employeeNumber}</b> · {identity?.company ?? companyCode}
        </p>
        <div className="d-lfield">
          <label className="e-flabel">Date of birth</label>
          <div className="e-finput">
            <EIcon name="cal" size={17} />
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} autoFocus />
          </div>
        </div>
        <button
          className="e-btn e-btn-primary e-btn-full"
          onClick={() => authenticate({ birthDate })}
          disabled={busy || !birthDate}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {errMsg && <p className="d-login-err">{errMsg}</p>}
        <div className="d-login-links">
          <button type="button" onClick={() => { setMethod("pin"); setStatus("idle"); }}>
            Use PIN
          </button>
          <button type="button" onClick={switchAccount}>
            Different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-login">
      <div className="d-login-col">
        {brand}
        {card}
        {footer}
      </div>
    </div>
  );
}

export default function EssLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="d-login">
          <div className="d-login-col">
            <div className="d-login-card d-login-okcard">
              <p className="d-login-sub">Loading…</p>
            </div>
          </div>
        </div>
      }
    >
      <EssLoginContent />
    </Suspense>
  );
}
