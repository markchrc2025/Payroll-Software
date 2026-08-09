/**
 * Unit 0.4 — no raw NextAuth error page should ever be reachable.
 *
 * With `pages.error` unset, @auth/core falls back to `${basePath}/error`
 * (/api/auth/error) and renders its own unbranded page — "Server error: There
 * is a problem with the server configuration" — which is what a user saw when a
 * sign-in failed server-side.
 *
 * T3 asserts against the config object actually passed to NextAuth(), not
 * against a constant that might not be wired in.
 */
import { describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above module scope, so these have to be created
// inside vi.hoisted() to exist by the time the factory runs. The config handed
// to NextAuth() is captured so T3 can assert on what was actually passed rather
// than on a constant that might not be wired in.
const { nextAuthSpy, captured } = vi.hoisted(() => {
  const captured: { config?: { pages?: { error?: string; signIn?: string } } } = {};
  return {
    captured,
    nextAuthSpy: vi.fn((config: { pages?: { error?: string; signIn?: string } }) => {
      captured.config = config;
      return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
    }),
  };
});

vi.mock("next-auth", () => ({ default: nextAuthSpy }));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((cfg: unknown) => cfg),
}));
vi.mock("@/lib/prisma-admin", () => ({
  default: { user: { findMany: vi.fn(), update: vi.fn() }, tenant: { findFirst: vi.fn() } },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

import { AUTH_PAGES } from "@/auth";
import {
  authErrorMessage,
  isKnownAuthErrorCode,
  GENERIC_AUTH_ERROR,
  AUTH_ERROR_MESSAGES,
} from "@/lib/auth-error-messages";

/** Codes that reach pages.error (kind "error"), per @auth/core/errors.js. */
const ERROR_KIND_CODES = [
  "Configuration",
  "AccessDenied",
  "Verification",
  "WebAuthnVerificationError",
];

/** Codes that reach pages.signIn (kind "signIn"). Both point at /login. */
const SIGNIN_KIND_CODES = [
  "CredentialsSignin",
  "MissingCSRF",
  "OAuthAccountNotLinked",
  "OAuthCallbackError",
  "OAuthSignInError",
  "AccountNotLinked",
  "EmailSignInError",
];

describe("unit 0.4 — pages.error routes to our branded login screen (T3)", () => {
  it("T3: pages.error is configured", () => {
    expect(AUTH_PAGES.error).toBeTruthy();
  });

  it("T3: pages.error is NOT the built-in /api/auth/error page", () => {
    expect(AUTH_PAGES.error).not.toBe("/api/auth/error");
    expect(AUTH_PAGES.error).not.toContain("/api/auth");
  });

  it("T3: pages.error resolves to our branded login route", () => {
    expect(AUTH_PAGES.error).toBe("/login");
  });

  it("T3: the pages object is actually passed to NextAuth(), not just exported", () => {
    expect(nextAuthSpy).toHaveBeenCalled();
    expect(captured.config?.pages?.error).toBe("/login");
    expect(captured.config?.pages?.signIn).toBe("/login");
  });
});

describe("unit 0.4 — every reachable error code gets specific copy (T4)", () => {
  it.each(ERROR_KIND_CODES)(
    "T4: kind=error code %s renders a specific message, not the fallback",
    (code) => {
      expect(isKnownAuthErrorCode(code)).toBe(true);
      const msg = authErrorMessage(code);
      expect(msg).toBeTruthy();
      expect(msg).not.toBe(GENERIC_AUTH_ERROR);
    },
  );

  it.each(SIGNIN_KIND_CODES)(
    "T4: kind=signIn code %s renders a specific message, not the fallback",
    (code) => {
      expect(isKnownAuthErrorCode(code)).toBe(true);
      const msg = authErrorMessage(code);
      expect(msg).toBeTruthy();
      expect(msg).not.toBe(GENERIC_AUTH_ERROR);
    },
  );

  it("T4: no two codes share the same copy (each failure is distinguishable)", () => {
    const forErrorKind = ERROR_KIND_CODES.map((c) => AUTH_ERROR_MESSAGES[c]);
    expect(new Set(forErrorKind).size).toBe(forErrorKind.length);
  });

  it("renders no banner when there is no error code", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("falls back to the generic message only for an unrecognised code", () => {
    expect(isKnownAuthErrorCode("SomethingNextAuthAddedLater")).toBe(false);
    expect(authErrorMessage("SomethingNextAuthAddedLater")).toBe(GENERIC_AUTH_ERROR);
  });

  it("does not inherit copy from Object.prototype for a crafted code", () => {
    // Guards the lookup against `?error=constructor` rendering junk.
    expect(isKnownAuthErrorCode("constructor")).toBe(false);
    expect(authErrorMessage("constructor")).toBe(GENERIC_AUTH_ERROR);
  });
});
