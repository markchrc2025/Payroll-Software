"use client";

/**
 * ESS login — returning-employee unlock, ported from the design handoff.
 * Brand lockup (Nexus + "Sentire Payroll"), then PIN / password / date-of-birth
 * methods wired to POST /api/ess/auth. The device remembers the employee's
 * identity (company code + employee number + display name) after a first
 * successful sign-in so the unlock screen can greet them by name.
 *
 * Phase 5: WebAuthn biometric — Face ID / fingerprint via @simplewebauthn/browser.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { NexusMark } from "@/components/sentire-login/glyphs";
import { EIcon } from "@/components/ess/icons";
import { EAvatar } from "@/components/ess/primitives";
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

        // Enrich the remembered identity from the profile so next time we can
        // greet them by name.
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

  function pressKey(d: string) {
    if (busy || status === "success") return;
    if (status === "error") setStatus("idle");
    setPin((p) => {
      if (p.length >= 6) return p;
      const np = p + d;
      if (np.length === 6) setTimeout(() => authenticate({ pin: np }), 140);
      return np;
    });
  }
  function delKey() {
    if (busy) return;
    if (status === "error") setStatus("idle");
    setPin((p) => p.slice(0, -1));
  }
  const faceId = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErrMsg("");
    try {
      // Start: fetch options from server.
      const startRes = await fetch("/api/ess/webauthn/authenticate/start", {
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

      // Call the browser WebAuthn API.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await startAuthentication(options as any);

      // Finish: send assertion to server.
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
        // User cancelled the biometric prompt — don't show error.
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
  function startUnlock() {
    if (!companyCode.trim() || !employeeNumber.trim()) {
      setErrMsg("Enter your company code and employee number.");
      return;
    }
    setErrMsg("");
    setPhase("unlock");
    setMethod("pin");
  }

  const brand = (
    <div className="e-login-brand">
      <NexusMark size={30} lineW={3.4} core="#E8693A" />
      <b>
        Sentire <span>Payroll</span>
      </b>
    </div>
  );

  // ── success splash ──
  if (status === "success") {
    return (
      <div className="e-login">
        <div className="e-login-success">
          <span className="e-login-check">
            <EIcon name="checkCircle" size={54} />
          </span>
          <h2>Welcome back</h2>
          <p>Opening your workspace…</p>
        </div>
      </div>
    );
  }

  // ── identify ──
  if (phase === "identify") {
    return (
      <div className="e-login">
        {brand}
        <div className="e-login-id">
          <h2>Sign in</h2>
          <p>Enter your company code and employee number</p>
        </div>
        <div className="e-pwwrap">
          <label className="e-flabel">Company code</label>
          <div className="e-finput">
            <EIcon name="building" size={17} />
            <input
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="e.g. DEMOCORP"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Company code"
            />
          </div>
          <label className="e-flabel">Employee number</label>
          <div className="e-finput">
            <EIcon name="user" size={17} />
            <input
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="EMP-00001"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="username"
              aria-label="Employee number"
              onKeyDown={(e) => e.key === "Enter" && startUnlock()}
            />
          </div>
          <div style={{ height: 6 }} />
          <button className="e-btn e-btn-primary e-btn-full" onClick={startUnlock}>
            Continue
          </button>
          {errMsg && <p className="e-login-err">{errMsg}</p>}
        </div>
        <div className="e-login-links">
          <button onClick={() => toast.info("Ask your HR admin to send your activation link.")}>
            New employee?
          </button>
        </div>
      </div>
    );
  }

  // ── unlock ──
  const greetName = identity?.first ? `Hi, ${identity.first}` : "Welcome back";
  const greetSub = identity?.company ?? companyCode;

  return (
    <div className="e-login">
      {brand}

      <div className="e-login-id">
        <EAvatar initials={identity?.initials || employeeNumber.slice(0, 2).toUpperCase() || "ME"} size={64} />
        <h2>{greetName}</h2>
        <p>{greetSub}</p>
      </div>

      {method === "pin" && (
        <div className="e-pinwrap">
          <div className={"e-pindots" + (status === "error" ? " is-error" : "")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={"e-pindot" + (i < pin.length ? " is-on" : "")} />
            ))}
          </div>
          <p className="e-pinlabel">
            {status === "error" ? errMsg || "Incorrect PIN. Try again." : "Enter your 6-digit PIN"}
          </p>

          <div className="e-keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} className="e-key" onClick={() => pressKey(String(d))} disabled={busy}>
                {d}
              </button>
            ))}
            <button className="e-key e-key-fn" onClick={faceId} aria-label="Face ID" disabled={busy}>
              <EIcon name="faceid" size={26} />
            </button>
            <button className="e-key" onClick={() => pressKey("0")} disabled={busy}>
              0
            </button>
            <button className="e-key e-key-fn" onClick={delKey} aria-label="Delete" disabled={busy}>
              <EIcon name="backspace" size={24} />
            </button>
          </div>

          <div className="e-login-links">
            <button onClick={() => { setMethod("password"); setStatus("idle"); }}>
              Use password instead
            </button>
            <button onClick={() => { setMethod("dob"); setStatus("idle"); }}>
              Use date of birth
            </button>
            <button onClick={switchAccount}>Not you? Switch account</button>
          </div>
        </div>
      )}

      {method === "password" && (
        <div className="e-pwwrap">
          <label className="e-flabel">Employee number</label>
          <div className="e-finput e-finput-ro">
            <EIcon name="user" size={17} />
            <input value={employeeNumber} readOnly />
          </div>
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
            />
            <button className="e-eye" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ height: 6 }} />
          <button
            className="e-btn e-btn-primary e-btn-full"
            onClick={() => authenticate({ password })}
            disabled={busy || !password}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {errMsg && <p className="e-login-err">{errMsg}</p>}
          <div className="e-login-links e-login-links-c">
            <button onClick={() => { setMethod("pin"); setStatus("idle"); }}>Use PIN instead</button>
            <button onClick={() => { setMethod("dob"); setStatus("idle"); }}>Date of birth</button>
          </div>
        </div>
      )}

      {method === "dob" && (
        <div className="e-pwwrap">
          <label className="e-flabel">Employee number</label>
          <div className="e-finput e-finput-ro">
            <EIcon name="user" size={17} />
            <input value={employeeNumber} readOnly />
          </div>
          <label className="e-flabel">Date of birth</label>
          <div className="e-finput">
            <EIcon name="cal" size={17} />
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div style={{ height: 6 }} />
          <button
            className="e-btn e-btn-primary e-btn-full"
            onClick={() => authenticate({ birthDate })}
            disabled={busy || !birthDate}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {errMsg && <p className="e-login-err">{errMsg}</p>}
          <div className="e-login-links e-login-links-c">
            <button onClick={() => { setMethod("pin"); setStatus("idle"); }}>Use PIN instead</button>
            <button onClick={switchAccount}>Switch account</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EssLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="e-login">
          <div className="e-login-success">
            <p>Loading…</p>
          </div>
        </div>
      }
    >
      <EssLoginContent />
    </Suspense>
  );
}
