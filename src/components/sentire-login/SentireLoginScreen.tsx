"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { authErrorMessage } from "@/lib/auth-error-messages";
import {
  loginBannerMessage,
  postLoginDestination,
  submitCredentials,
} from "@/lib/login-redirect";

import {
  NexusMark,
  PayrollGlyph,
  GoogleIcon,
  MicrosoftIcon,
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

type Mode = "tenant" | "admin";
type Status = "idle" | "loading" | "error" | "success";

export default function SentireLoginScreen({ mode }: { mode: Mode }) {
  const searchParams = useSearchParams();
  // Tenant honours ?callbackUrl (same-origin app paths only — see
  // safeCallbackUrl); Central Portal always lands on its own dashboard.
  const redirectTo = postLoginDestination(mode, searchParams.get("callbackUrl"));

  // NextAuth redirects here with ?error=<code> when a sign-in fails server-side
  // (unit 0.4). Without this the code is silently dropped and the user sees a
  // login form with no explanation of what just went wrong.
  //
  // It is suppressed the moment a new attempt is submitted (unit 0.12): the
  // param stays in the URL for the whole visit, so without this the banner keeps
  // describing an earlier attempt while the user is looking at the result of a
  // newer one.
  const [urlErrDismissed, setUrlErrDismissed] = useState(false);
  const urlErr = authErrorMessage(searchParams.get("error"));

  const [companyCode, setCompanyCode] = useState("");
  // PAY-74: the sign-up confirmation page links here with ?email= filled in.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(mode === "tenant");
  const [touched, setTouched] = useState<{ companyCode?: boolean; email?: boolean; pw?: boolean }>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formErr, setFormErr] = useState("");
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
  // Single source of truth for the banner: the latest attempt wins, and the URL
  // error is dropped once the user has submitted again (unit 0.12).
  const bannerMsg = loginBannerMessage(urlErr, formErr, urlErrDismissed);

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
    // Clear BOTH error sources, so the banner always describes this attempt and
    // not a stale ?error= left in the URL by an earlier one (unit 0.12).
    setFormErr("");
    setUrlErrDismissed(true);
    const tenantCodeMissing = mode === "tenant" && !companyCode.trim();
    if (tenantCodeMissing || !EMAIL_RE.test(email) || pw.length < 8) {
      setStatus("error");
      shake();
      return;
    }
    setStatus("loading");
    try {
      const outcome = await submitCredentials(signIn, {
        mode,
        email,
        password: pw,
        companyCode: mode === "tenant" ? companyCode.trim().toUpperCase() : undefined,
        destination: redirectTo,
      });
      if (!outcome.ok && outcome.code === "locked") {
        // Unit 0.15 Am 4: five wrong passwords in a row lock sign-in.
        setStatus("error");
        setFormErr("Too many wrong attempts. Try again in 15 minutes, or reset your password to unlock now.");
        shake();
        return;
      }
      if (!outcome.ok) {
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

            {/* Google / Microsoft are placeholders for now — sign-in is
                email/password. The buttons show an "not available yet" toast. */}
            <div className="sn-sso">
              <button type="button" className="sn-sso-btn" disabled={busy} onClick={ssoUnavailable}>
                <GoogleIcon /> Google
              </button>
              <button type="button" className="sn-sso-btn" disabled={busy} onClick={ssoUnavailable}>
                <MicrosoftIcon /> Microsoft
              </button>
            </div>

            <div className="sn-or">
              <span>{mode === "tenant" ? "or sign in with email" : "or use admin credentials"}</span>
            </div>

            {bannerMsg && (
              <div className="sn-alert" role="alert">
                <AlertIcon />
                <span>{bannerMsg}</span>
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

            {mode === "tenant" && (
              <p className="sn-legal" data-testid="signup-link">
                New to Sentire Payroll? <Link className="sn-link" href="/signup">Create a company account</Link>
              </p>
            )}

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
