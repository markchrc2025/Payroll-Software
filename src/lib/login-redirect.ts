/**
 * Post-login destination resolution and the credentials sign-in call (unit 0.12).
 *
 * Extracted from SentireLoginScreen so the sign-in path can be exercised without
 * a DOM. The screen is a client component and vitest runs in the node
 * environment, so the logic that decides *where a successful sign-in lands* has
 * to live somewhere testable.
 */

export type LoginMode = "tenant" | "admin";

/**
 * Which banner the login screen should show (unit 0.12, B2).
 *
 * The ?error= param stays in the URL for the whole visit, so it cannot simply be
 * read on every render: once the user submits again, it describes an older
 * attempt than the one they are looking at. `submitted` suppresses it, leaving
 * the live form error as the only source.
 *
 * @param urlError  message derived from ?error=, or null
 * @param formError message from the latest submission, or "" when there is none
 * @param submitted whether the user has submitted since the page loaded
 */
export function loginBannerMessage(
  urlError: string | null,
  formError: string,
  submitted: boolean,
): string | null {
  if (formError) return formError;
  if (submitted) return null;
  return urlError;
}

/** Canonical post-login destinations. */
export const TENANT_HOME = "/dashboard";
export const CENTRAL_HOME = "/centralportal/dashboard";

/**
 * Resolve a caller-supplied ?callbackUrl into a safe same-origin app path.
 *
 * `callbackUrl` is attacker-controllable — anyone can hand out
 * /login?callbackUrl=… — and its value is fed to window.location.href after a
 * successful sign-in, so a weak check here is a post-auth open redirect.
 * A bare `startsWith("/")` is NOT sufficient; each rejection below is a way to
 * begin a string with "/" and still land off-origin.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = TENANT_HOME,
): string {
  if (typeof raw !== "string") return fallback;

  // Browsers strip TAB/LF/CR from anywhere in a URL before resolving it, so
  // "/\t/evil.example" becomes "//evil.example". Strip them before inspecting,
  // or the checks below examine a string the browser will never actually use.
  const url = raw.replace(/[\t\n\r]/g, "").trim();

  if (!url.startsWith("/")) return fallback; // absolute, or a scheme like javascript:
  if (url.startsWith("//")) return fallback; // protocol-relative -> off-origin
  if (url.startsWith("/\\")) return fallback; // browsers normalise "\" to "/"
  if (url === "/") return fallback; // bare root: prefer the dashboard
  return url;
}

/** Where a successful sign-in should land. */
export function postLoginDestination(
  mode: LoginMode,
  rawCallback: string | null | undefined,
): string {
  // Central Portal always lands on its own dashboard and ignores ?callbackUrl.
  if (mode === "admin") return CENTRAL_HOME;
  return safeCallbackUrl(rawCallback, TENANT_HOME);
}

// ---------------------------------------------------------------------------
// Credentials sign-in

export type SignInResult =
  | { error?: string; ok?: boolean; status?: number; url?: string | null }
  | undefined;

export type SignInFn = (
  provider: string,
  options: Record<string, unknown>,
) => Promise<SignInResult>;

export type SubmitOutcome =
  | { ok: true; destination: string }
  | { ok: false; code?: string };

/**
 * Submit credentials and report whether the user is signed in, plus where to
 * send them.
 *
 * `redirectTo` is passed EXPLICITLY, and that is the whole fix for unit 0.12.
 * next-auth/react's signIn defaults it to `window.location.href`:
 *
 *   const { redirect = true, redirectTo = callbackUrl ?? window.location.href, ... }
 *
 * It then POSTs that as `callbackUrl`, the server echoes it back as `data.url`
 * on success, and signIn parses the error code back out of it:
 *
 *   const error = new URL(data.url).searchParams.get("error") ?? undefined;
 *
 * So signing in from /login?error=CredentialsSignin — exactly where NextAuth
 * puts a user after one mistyped password — made signIn report
 * error: "CredentialsSignin" on a sign-in that had just SUCCEEDED and set the
 * session cookie. The user saw a failure banner, never navigated, and the
 * account appeared locked. Handing signIn a clean canonical path removes the
 * stale param from the round trip entirely.
 *
 * `res.ok` is deliberately NOT used as the success signal: with the
 * X-Auth-Return-Redirect header @auth/core answers Response.json({url}) with
 * status 200 for genuine credential failures too, so ok is true either way.
 * `res.error` is the only real discriminator — which is precisely why it must
 * not be poisoned by a stale query param.
 */
export async function submitCredentials(
  signInFn: SignInFn,
  args: {
    mode: LoginMode;
    email: string;
    password: string;
    companyCode?: string;
    destination: string;
  },
): Promise<SubmitOutcome> {
  const res = await signInFn("credentials", {
    email: args.email,
    password: args.password,
    ...(args.mode === "tenant" && args.companyCode
      ? { companyCode: args.companyCode }
      : {}),
    scope: args.mode,
    redirect: false,
    redirectTo: args.destination,
  });

  if (!res || res.error) return { ok: false, code: res?.error };
  return { ok: true, destination: args.destination };
}
