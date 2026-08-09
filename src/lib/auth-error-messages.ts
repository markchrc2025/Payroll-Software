/**
 * Plain-language copy for the `?error=` code NextAuth appends when it redirects
 * to a configured page. Without `pages.error` set, these land on @auth/core's
 * built-in unbranded page ("Server error — There is a problem with the server
 * configuration"), which is the first screen anyone sees when SSO or a sign-in
 * fails. Unit 0.4.
 *
 * Which codes can actually arrive here, and why (all verified against
 * next-auth 5.0.0-beta.31 / @auth/core in node_modules, not assumed):
 *
 *   @auth/core/index.js  ~line 128:
 *     const type = isClientError(error) ? error.type : "Configuration";
 *     const pageKind = (isAuthError && error.kind) || "error";
 *     const pagePath = config.pages?.[pageKind] ?? `${basePath}/${pageKind}`;
 *
 * So the destination is chosen by the error's `kind`, and the visible code is
 * the error's `type` only when it is client-safe — otherwise it collapses to
 * "Configuration". The client-safe set is fixed at @auth/core/errors.js:412.
 *
 *   kind "error"  -> pages.error   : Configuration, AccessDenied, Verification,
 *                                    WebAuthnVerificationError
 *   kind "signIn" -> pages.signIn  : CredentialsSignin, MissingCSRF,
 *                                    OAuthAccountNotLinked, OAuthCallbackError,
 *                                    AccountNotLinked, OAuthSignInError,
 *                                    EmailSignInError
 *
 * We point BOTH pages at /login, so this map covers both sets — otherwise a
 * sign-in-kind error would reach the login screen with a code we render as a
 * generic fallback.
 */

/** Shown when a code arrives that we have no specific copy for. */
export const GENERIC_AUTH_ERROR =
  "We couldn't complete that sign-in. Please try again, and contact your administrator if it keeps happening.";

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // ---- kind "error" -> pages.error --------------------------------------
  // The catch-all: every AuthError that is NOT client-safe collapses to this.
  // Most importantly it covers CallbackRouteError, which is what a throw inside
  // authorize() becomes — see unit 0.3.
  Configuration:
    "Sign-in is temporarily unavailable due to a server problem on our side. Your details were not the issue — please try again in a moment.",
  AccessDenied:
    "That account isn't permitted to sign in here. If you believe this is wrong, contact your administrator.",
  Verification:
    "That sign-in link is no longer valid — it may have expired or already been used. Please request a new one.",
  WebAuthnVerificationError:
    "We couldn't verify your passkey or security key. Please try again, or sign in with your email and password.",

  // ---- kind "signIn" -> pages.signIn (also /login) -----------------------
  CredentialsSignin:
    "We couldn't verify those credentials. Check your company code, email and password, then try again.",
  MissingCSRF:
    "Your sign-in session expired before the form was submitted. Please try again.",
  SessionRequired: "Please sign in to continue.",

  // Not reachable while Credentials is the only provider (Authenticize SSO was
  // removed in b7538eb), but mapped so re-adding a provider cannot regress this
  // screen to a generic message.
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Use the method you signed up with.",
  OAuthCallbackError:
    "The single sign-on provider didn't complete the sign-in. Please try again, or sign in with your email and password.",
  OAuthSignInError:
    "We couldn't start single sign-on. Please try again, or sign in with your email and password.",
  AccountNotLinked:
    "That email is already registered with a different sign-in method. Use the method you signed up with.",
  EmailSignInError:
    "We couldn't send that sign-in email. Please try again in a moment.",
};

/** True when we have specific copy for `code` (i.e. it is not a fallback). */
export function isKnownAuthErrorCode(code?: string | null): boolean {
  return typeof code === "string" && Object.hasOwn(AUTH_ERROR_MESSAGES, code);
}

/**
 * Message for a `?error=` value. Returns null when there is no code, so the
 * caller renders no banner at all rather than an empty one.
 */
export function authErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  // Own-property check, not a bare index: `?error=constructor` would otherwise
  // resolve through Object.prototype and render "[Function Object]" as the
  // banner copy. The code comes straight off the query string.
  return isKnownAuthErrorCode(code) ? AUTH_ERROR_MESSAGES[code] : GENERIC_AUTH_ERROR;
}
