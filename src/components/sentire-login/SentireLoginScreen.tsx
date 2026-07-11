"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import {
  NexusMark,
  PayrollGlyph,
  GoogleIcon,
  MicrosoftIcon,
  KeyIcon,
  Spinner,
  MailIcon,
  LockIcon,
  EyeIcon,
  AlertIcon,
  ShieldIcon,
  CheckMark,
  BuildingIcon,
} from "./glyphs";
import "./sentire-login.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORE = "#E8693A";

// Which Central Portal SSO providers are live (set at build time). Accepts a
// comma-separated list — e.g. "google,microsoft-entra-id" — so more than one
// IdP can be offered at once. Empty until an OAuth app is configured, in which
// case the button falls back to an "unavailable" toast.
const CENTRAL_SSO_PROVIDERS = (process.env.NEXT_PUBLIC_CENTRAL_SSO ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Per-provider button presentation. `long` is used when a provider is the only
// option (full-width button); `short` is used when several sit side by side.
const SSO_PROVIDER_META: Record<
  string,
  { short: string; long: string; Icon: () => ReturnType<typeof GoogleIcon> }
> = {
  google: { short: "Google", long: "Continue with Google", Icon: GoogleIcon },
  "microsoft-entra-id": { short: "Microsoft", long: "Continue with Microsoft", Icon: MicrosoftIcon },
  authenticize: { short: "Authenticize", long: "Continue with Authenticize", Icon: KeyIcon },
};

// Resolve the configured ids to renderable buttons (unknown ids get a generic label).
// Tenant-workspace SSO toggle (build-time). Set NEXT_PUBLIC_TENANT_SSO to a
// list including "authenticize" to replace the placeholder Google/Microsoft
// buttons with a working "Continue with Authenticize" button.
const TENANT_SSO_AUTHENTICIZE = (process.env.NEXT_PUBLIC_TENANT_SSO ?? "")
  .split(",")
  .map((p) => p.trim())
  .includes("authenticize");

const SSO_BUTTONS = CENTRAL_SSO_PROVIDERS.map((id) => {
  const meta = SSO_PROVIDER_META[id];
  return {
    id,
    short: meta?.short ?? "Company SSO",
    long: meta?.long ?? "Continue with company SSO",
    Icon: meta?.Icon ?? KeyIcon,
  };
});

type Mode = "tenant" | "admin";
type Status = "idle" | "loading" | "error" | "success";

/** Friendly message for a NextAuth ?error= bounce after a failed SSO attempt. */
function ssoErrorMessage(code: string | null, mode: Mode): string {
  if (!code) return "";
  if (mode === "admin") {
    return "That account isn't authorized for the Central Portal. Single sign-on is limited to provisioned Sentire administrators.";
  }
  return "We couldn't complete single sign-on. Please try again, or sign in with your email and password.";
}

export default function SentireLoginScreen({ mode }: { mode: Mode }) {
  const searchParams = useSearchParams();
  // Tenant honours ?callbackUrl (relative only, to block open redirects).
  // Missing or bare "/" lands on the dashboard, not the bare root.
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && rawCallback !== "/"
      ? rawCallback
      : "/dashboard";
  const redirectTo = mode === "admin" ? "/centralportal/dashboard" : callbackUrl;

  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(mode === "tenant");
  const [touched, setTouched] = useState<{ companyCode?: boolean; email?: boolean; pw?: boolean }>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formErr, setFormErr] = useState(() =>
    ssoErrorMessage(searchParams.get("error"), mode),
  );
  const shakeRef = useRef<HTMLFormElement>(null);

  const companyCodeErr =
    mode === "tenant" && touched.companyCode && !companyCode.trim()
      ? "Company code is required."
      : "";
  const emailErr =
    touched.email && !EMAIL_RE.test(email)
      ? email
        ? "Enter a valid email address."
        : "Email is required."
      : "";
  const pwErr =
    touched.pw && pw.length < 8
      ? pw
        ? "Password must be at least 8 characters."
        : "Password is required."
      : "";
  const busy = status === "loading";

  // After a successful sign-in, let the success animation play, then navigate.
  // Full browser navigation so the session cookie is in the first request.
  useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => {
      window.location.href = redirectTo;
    }, 1600);
    return () => clearTimeout(t);
  }, [status, redirectTo]);

  function shake() {
    const el = shakeRef.current;
    if (!el) return;
    el.classList.remove("sn-shake");
    void el.offsetWidth; // reflow to restart the animation
    el.classList.add("sn-shake");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched({ companyCode: true, email: true, pw: true });
    setFormErr("");
    const tenantCodeMissing = mode === "tenant" && !companyCode.trim();
    if (tenantCodeMissing || !EMAIL_RE.test(email) || pw.length < 8) {
      setStatus("error");
      shake();
      return;
    }
    setStatus("loading");
    try {
      const res = await signIn("credentials", {
        email,
        password: pw,
        ...(mode === "tenant" ? { companyCode: companyCode.trim().toUpperCase() } : {}),
        scope: mode,
        redirect: false,
      });
      if (!res || res.error) {
        setStatus("error");
        setFormErr(
          mode === "admin"
            ? "Those staff credentials weren't recognised. Access is restricted to authorized Sentire personnel."
            : "We couldn't verify those credentials. Check your company code, email and password.",
        );
        shake();
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setFormErr("Something went wrong. Please try again.");
      shake();
    }
  }

  function ssoUnavailable() {
    toast.info("Single sign-on isn't available yet. Please sign in with email.");
  }

  // Tenant SSO is company-code-first: the code chooses the workspace an email
  // resolves to. Stash it in a short-lived lax cookie the auth callbacks read,
  // then start the OIDC flow. All three tenant options go through the ONE
  // Authenticize application (our identity broker) — Payroll never holds any
  // Google/Microsoft client secret. `providerHint` asks Authenticize to jump
  // straight to Google/Microsoft instead of showing its own sign-in page, so
  // each button behaves like a native provider button.
  function tenantSso(providerHint?: "google" | "microsoft") {
    setTouched((t) => ({ ...t, companyCode: true }));
    if (!companyCode.trim()) {
      setFormErr("Enter your company code first, then choose how to sign in.");
      shake();
      return;
    }
    setFormErr("");
    // Drop any stale Central Portal marker so a failed tenant SSO bounce to
    // /login isn't captured and forwarded to /centralportal/login.
    document.cookie = "central_sso_flow=; path=/; max-age=0; samesite=lax";
    document.cookie = `tenant_sso_company=${encodeURIComponent(
      companyCode.trim().toUpperCase(),
    )}; path=/; max-age=300; samesite=lax`;
    void signIn(
      "authenticize-tenant",
      { callbackUrl: redirectTo },
      providerHint ? { provider_hint: providerHint } : undefined,
    );
  }

  return (
    <div className="sn-screen" data-accent={mode === "admin" ? "orange" : "sage"} data-mode={mode}>
      {/* ===== brand panel ===== */}
      <div className="sn-brand" data-texture="on">
        <div className="sn-brand-tex" aria-hidden="true" />

        <div className="sn-brand-top">
          {mode === "tenant" ? (
            <span className="sn-prodlock">
              <span className="sn-prodchip">
                <PayrollGlyph size={20} color="#F7F3EF" accent="#7FC4A6" />
              </span>
              <span className="sn-prodword">
                Sentire <b>Payroll</b>
              </span>
            </span>
          ) : (
            <span className="sn-prodlock">
              <NexusMark size={30} lineW={3.4} onDark core={CORE} />
              <span className="sn-prodword">
                Sentire <b className="sn-prodword-admin">Central</b>
              </span>
            </span>
          )}
          <span className="sn-env">{mode === "tenant" ? "Workspace" : "Admin Console"}</span>
        </div>

        <div className="sn-brand-mid">
          {mode === "tenant" ? (
            <>
              <h1 className="sn-headline">
                Payday,
                <br />
                handled.
              </h1>
              <p className="sn-subhead">
                Approvals, filings and payslips for your whole team — one calm, connected place.
              </p>
            </>
          ) : (
            <>
              <div className="sn-bigmark">
                <NexusMark size={120} lineW={3.4} onDark core={CORE} />
              </div>
              <h1 className="sn-headline sn-headline-sm">Central Portal</h1>
              <p className="sn-subhead">
                Operations console for Sentire administrators — tenants, billing, releases and support tooling.
              </p>
            </>
          )}
        </div>

        <div className="sn-brand-foot">
          {mode === "tenant" ? (
            <>
              <span className="sn-trust">
                <i />
                SOC 2 Type II
              </span>
              <span className="sn-trust">
                <i />
                256-bit encryption
              </span>
              <span className="sn-trust">
                <i />
                99.99% uptime
              </span>
            </>
          ) : (
            <>
              <span className="sn-trust">
                <i />
                Restricted system
              </span>
              <span className="sn-trust">
                <i />
                All activity audited
              </span>
              <span className="sn-trust">
                <i />
                2FA enforced
              </span>
            </>
          )}
        </div>
      </div>

      {/* ===== form pane ===== */}
      <div className="sn-pane">
        {status === "success" ? (
          <div className="sn-form-wrap">
            <div className="sn-success">
              <svg viewBox="0 0 52 52" width={56} height={56} aria-hidden="true">
                <circle className="sn-suc-c" cx="26" cy="26" r="24" fill="none" strokeWidth="3" />
                <path
                  className="sn-suc-k"
                  d="M15 27l7.5 7.5L38 19"
                  fill="none"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h2>{mode === "tenant" ? "Welcome back" : "Identity verified"}</h2>
              <p>
                {mode === "tenant"
                  ? "Opening your workspace…"
                  : "Taking you to the Central Portal…"}
              </p>
              <div className="sn-redir-bar">
                <i />
              </div>
            </div>
          </div>
        ) : (
          <div className="sn-form-wrap">
            <div className="sn-form-head">
              <h2 className="sn-title">{mode === "tenant" ? "Sign in" : "Administrator sign in"}</h2>
              <p className="sn-sub">
                {mode === "tenant"
                  ? "Welcome back — your team's payroll is waiting."
                  : "Authorized personnel only. Use your Sentire staff account."}
              </p>
            </div>

            {mode === "tenant" ? (
              <div className="sn-sso">
                {TENANT_SSO_AUTHENTICIZE ? (
                  <>
                    <button
                      type="button"
                      className="sn-sso-btn"
                      disabled={busy}
                      onClick={() => tenantSso("google")}
                    >
                      <GoogleIcon /> Google
                    </button>
                    <button
                      type="button"
                      className="sn-sso-btn"
                      disabled={busy}
                      onClick={() => tenantSso("microsoft")}
                    >
                      <MicrosoftIcon /> Microsoft
                    </button>
                    <button
                      type="button"
                      className="sn-sso-btn sn-sso-wide"
                      disabled={busy}
                      onClick={() => tenantSso()}
                    >
                      <KeyIcon /> Continue with Authenticize
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sn-sso-btn" disabled={busy} onClick={ssoUnavailable}>
                      <GoogleIcon /> Google
                    </button>
                    <button type="button" className="sn-sso-btn" disabled={busy} onClick={ssoUnavailable}>
                      <MicrosoftIcon /> Microsoft
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="sn-sso">
                {SSO_BUTTONS.length === 0 ? (
                  <button
                    type="button"
                    className="sn-sso-btn sn-sso-wide"
                    disabled={busy}
                    onClick={ssoUnavailable}
                  >
                    <KeyIcon /> Continue with company SSO
                  </button>
                ) : (
                  SSO_BUTTONS.map(({ id, short, long, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={"sn-sso-btn" + (SSO_BUTTONS.length === 1 ? " sn-sso-wide" : "")}
                      disabled={busy}
                      onClick={() => {
                        // Mark this as a Central Portal SSO flow so that if
                        // NextAuth bounces a failure to the global /login page,
                        // it can route the error back to /centralportal/login.
                        // Drop any stale tenant marker for realm symmetry.
                        document.cookie = "tenant_sso_company=; path=/; max-age=0; samesite=lax";
                        document.cookie = "central_sso_flow=1; path=/; max-age=300; samesite=lax";
                        void signIn(id, { callbackUrl: "/centralportal/dashboard" });
                      }}
                    >
                      <Icon /> {SSO_BUTTONS.length === 1 ? long : short}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="sn-or">
              <span>{mode === "tenant" ? "or sign in with email" : "or use admin credentials"}</span>
            </div>

            {formErr && (
              <div className="sn-alert" role="alert">
                <AlertIcon />
                <span>{formErr}</span>
              </div>
            )}

            <form ref={shakeRef} className="sn-form" onSubmit={submit} noValidate>
              {mode === "tenant" && (
                <label className="sn-field">
                  <span className="sn-label">Company code</span>
                  <div className={"sn-input" + (companyCodeErr ? " is-err" : "")}>
                    <BuildingIcon />
                    <input
                      type="text"
                      autoComplete="organization"
                      placeholder="e.g. ACMEFOODS"
                      value={companyCode}
                      disabled={busy}
                      onChange={(e) => setCompanyCode(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, companyCode: true }))}
                      aria-label="Company code"
                      aria-invalid={!!companyCodeErr}
                    />
                  </div>
                  {companyCodeErr && <span className="sn-err-txt">{companyCodeErr}</span>}
                </label>
              )}

              <label className="sn-field">
                <span className="sn-label">{mode === "tenant" ? "Work email" : "Staff email"}</span>
                <div className={"sn-input" + (emailErr ? " is-err" : "")}>
                  <MailIcon />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder={mode === "tenant" ? "you@company.com" : "name@sentire.io"}
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    aria-label={mode === "tenant" ? "Work email" : "Staff email"}
                    aria-invalid={!!emailErr}
                  />
                </div>
                {emailErr && <span className="sn-err-txt">{emailErr}</span>}
              </label>

              <label className="sn-field">
                <span className="sn-label">Password</span>
                <div className={"sn-input" + (pwErr ? " is-err" : "")}>
                  <LockIcon />
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={pw}
                    disabled={busy}
                    onChange={(e) => setPw(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
                    aria-label="Password"
                    aria-invalid={!!pwErr}
                  />
                  <button
                    type="button"
                    className="sn-eye"
                    tabIndex={-1}
                    disabled={busy}
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((s) => !s)}
                  >
                    <EyeIcon off={show} />
                  </button>
                </div>
                {pwErr && <span className="sn-err-txt">{pwErr}</span>}
              </label>

              <div className="sn-row">
                <label className="sn-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    disabled={busy}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="sn-check-box" aria-hidden="true">
                    <CheckMark />
                  </span>
                  Keep me signed in
                </label>
                {mode === "tenant" ? (
                  <Link className="sn-link" href="/forgot-password">
                    Forgot password?
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="sn-link"
                    onClick={() =>
                      toast.info("Contact your Sentire administrator to restore portal access.")
                    }
                  >
                    Trouble signing in?
                  </button>
                )}
              </div>

              <button type="submit" className="sn-submit" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> Verifying…
                  </>
                ) : mode === "tenant" ? (
                  "Sign in to workspace"
                ) : (
                  "Sign in to portal"
                )}
              </button>
            </form>

            <p className="sn-legal">
              <ShieldIcon />
              {mode === "tenant"
                ? "Protected by Sentire. Your payroll data is encrypted end-to-end."
                : "Restricted system. Sessions are monitored and logged for security."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
