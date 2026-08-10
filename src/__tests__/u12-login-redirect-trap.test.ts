/**
 * Unit 0.12 — the login redirect trap.
 *
 * Established by hand in a browser: a user mistypes their password once,
 * NextAuth redirects to /login?error=CredentialsSignin, the user then types the
 * CORRECT password — authentication succeeds and the session cookie is set —
 * but the UI still shows the failure banner and never navigates. From the user's
 * side the account appears locked.
 *
 * The mechanism is NOT a browser redirect. From node_modules/next-auth/react.js,
 * signIn():
 *
 *   const { redirect = true, redirectTo = callbackUrl ?? window.location.href, ...
 *   body: new URLSearchParams({ ...signInParams, csrfToken, callbackUrl: redirectTo })
 *   ...
 *   const error = new URL(data.url).searchParams.get("error") ?? undefined;
 *   return { error, code, status: res.status, ok: res.ok, url: error ? null : data.url };
 *
 * We pass neither `callbackUrl` nor `redirectTo`, so it defaults to
 * window.location.href — which still carries ?error= from the earlier failure.
 * The server authenticates fine and echoes that URL back as data.url; signIn then
 * parses `error` back out of it and reports a failure that never happened.
 *
 * `fakeSignIn` below reproduces those exact lines so the test exercises the real
 * trap rather than a paraphrase of it.
 */
import { describe, expect, it, vi } from "vitest";

import {
  submitCredentials,
  postLoginDestination,
  safeCallbackUrl,
  loginBannerMessage,
  TENANT_HOME,
  CENTRAL_HOME,
  type SignInFn,
} from "@/lib/login-redirect";

const ORIGIN = "https://payroll.sentire.solutions";

/**
 * Stand-in for next-auth/react's signIn, mirroring its actual implementation:
 * redirectTo defaults to the current href, the server echoes it back on
 * success, and `error` is parsed back out of that echoed URL.
 */
function fakeSignIn(currentHref: string, opts?: { validCredentials?: boolean }) {
  const valid = opts?.validCredentials ?? true;
  const spy = vi.fn(async (_provider: string, options: Record<string, unknown>) => {
    const callbackUrl = options.callbackUrl as string | undefined;
    const redirectTo = (options.redirectTo as string | undefined) ?? callbackUrl ?? currentHref;

    // A genuine credential failure: @auth/core throws CredentialsSignin, whose
    // kind is "signIn", so it lands on pages.signIn with ?error=CredentialsSignin.
    const dataUrl = valid
      ? new URL(redirectTo, ORIGIN).toString()
      : `${ORIGIN}/login?error=CredentialsSignin&code=credentials`;

    const error = new URL(dataUrl).searchParams.get("error") ?? undefined;
    // NOTE: res.ok is TRUE even for a credential failure — with the
    // X-Auth-Return-Redirect header @auth/core answers Response.json({url}),
    // status 200. So `error` is the only usable discriminator, which is exactly
    // what the stale param poisons.
    return { error, ok: true, status: 200, url: error ? null : dataUrl };
  });
  return spy as unknown as SignInFn & { mock: { calls: unknown[][] } };
}

const CREDS = {
  mode: "tenant" as const,
  email: "hr@example.test",
  password: "correct-horse",
  companyCode: "ACME",
};

describe("unit 0.12 — a stale ?error= must not defeat a successful sign-in", () => {
  // T1 — the trap. Must fail against the unfixed code.
  it("T1: valid credentials from /login?error=CredentialsSignin still succeed", async () => {
    const signIn = fakeSignIn(`${ORIGIN}/login?error=CredentialsSignin`);
    const destination = postLoginDestination("tenant", null);

    const outcome = await submitCredentials(signIn, { ...CREDS, destination });

    expect(outcome.ok).toBe(true);
  });

  it("T1b: the redirect target carries no error param and is the canonical home", async () => {
    const signIn = fakeSignIn(`${ORIGIN}/login?error=CredentialsSignin`);
    const destination = postLoginDestination("tenant", null);

    const outcome = await submitCredentials(signIn, { ...CREDS, destination });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.destination).not.toContain("error=");
      expect(outcome.destination).toBe(TENANT_HOME);
    }
  });

  it("T1c: signIn is given an explicit redirectTo, so it never defaults to the current href", async () => {
    const signIn = fakeSignIn(`${ORIGIN}/login?error=CredentialsSignin`);
    const destination = postLoginDestination("tenant", null);

    await submitCredentials(signIn, { ...CREDS, destination });

    const options = (signIn as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as Record<string, unknown>;
    expect(options.redirectTo).toBe(TENANT_HOME);
    expect(String(options.redirectTo)).not.toContain("error=");
  });

  it("still reports a real credential failure as a failure", async () => {
    const signIn = fakeSignIn(`${ORIGIN}/login`, { validCredentials: false });
    const destination = postLoginDestination("tenant", null);

    const outcome = await submitCredentials(signIn, { ...CREDS, destination });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("CredentialsSignin");
  });

  // T4 — regression guard for the path that works today.
  it("T4: plain /login with valid credentials lands on the canonical destination", async () => {
    const signIn = fakeSignIn(`${ORIGIN}/login`);
    const destination = postLoginDestination("tenant", null);

    const outcome = await submitCredentials(signIn, { ...CREDS, destination });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.destination).toBe(TENANT_HOME);
  });

  it("T4b: Central Portal lands on its own dashboard and ignores ?callbackUrl", async () => {
    expect(postLoginDestination("admin", "/dashboard")).toBe(CENTRAL_HOME);
    expect(postLoginDestination("admin", null)).toBe(CENTRAL_HOME);
  });
});

describe("unit 0.12 — the banner describes the latest attempt (T2)", () => {
  const URL_ERR = "We couldn't verify those credentials. Check your company code…";
  const FORM_ERR = "Something went wrong. Please try again.";

  it("T2: shows the URL error on first load, before any submission", () => {
    expect(loginBannerMessage(URL_ERR, "", false)).toBe(URL_ERR);
  });

  it("T2: clears the stale URL error once a new attempt is submitted", () => {
    expect(loginBannerMessage(URL_ERR, "", true)).toBeNull();
  });

  it("T2: a fresh form error replaces the stale URL error", () => {
    expect(loginBannerMessage(URL_ERR, FORM_ERR, true)).toBe(FORM_ERR);
  });

  it("T2: no banner at all when there is neither source", () => {
    expect(loginBannerMessage(null, "", false)).toBeNull();
    expect(loginBannerMessage(null, "", true)).toBeNull();
  });
});

describe("unit 0.12 — callbackUrl allowlist (T3)", () => {
  it("T3: rejects a protocol-relative URL that would navigate off-origin", () => {
    expect(safeCallbackUrl("//evil.example")).toBe(TENANT_HOME);
  });

  it("T3: rejects the backslash variant browsers normalise to //", () => {
    expect(safeCallbackUrl("/\\evil.example")).toBe(TENANT_HOME);
    expect(safeCallbackUrl("/\\/evil.example")).toBe(TENANT_HOME);
  });

  it("T3: rejects a URL smuggling control characters browsers strip", () => {
    // Browsers remove TAB/LF/CR anywhere in a URL before resolving it, so this
    // resolves to "//evil.example".
    expect(safeCallbackUrl("/\t/evil.example")).toBe(TENANT_HOME);
    expect(safeCallbackUrl("/\n/evil.example")).toBe(TENANT_HOME);
  });

  it("T3: rejects absolute and scheme URLs", () => {
    expect(safeCallbackUrl("https://evil.example")).toBe(TENANT_HOME);
    expect(safeCallbackUrl("javascript:alert(1)")).toBe(TENANT_HOME);
  });

  it("T3: still accepts genuine same-origin app paths", () => {
    expect(safeCallbackUrl("/employees")).toBe("/employees");
    expect(safeCallbackUrl("/settings/roles?tab=1")).toBe("/settings/roles?tab=1");
  });

  it("falls back to the canonical home for empty, bare-root and missing values", () => {
    expect(safeCallbackUrl(null)).toBe(TENANT_HOME);
    expect(safeCallbackUrl(undefined)).toBe(TENANT_HOME);
    expect(safeCallbackUrl("")).toBe(TENANT_HOME);
    expect(safeCallbackUrl("/")).toBe(TENANT_HOME);
  });
});
