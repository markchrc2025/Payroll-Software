/**
 * Preflight env-var validation — catches the "works locally, 500s in prod"
 * class (e.g. a missing ENCRYPTION_KEY that only fails on the first encrypted
 * write).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { checkCriticalEnv, checkEnvWarnings } from "@/lib/env-check";

const SAVED = { ...process.env };

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://u:p@h:6543/db";
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.EMAIL_ASSET_BASE_URL = "https://cdn.example.com/email-assets";
  delete process.env.DIRECT_DATABASE_URL;
});
afterEach(() => {
  process.env = { ...SAVED };
});

describe("checkCriticalEnv", () => {
  it("reports no problems when env is valid", () => {
    expect(checkCriticalEnv()).toEqual([]);
  });

  it("flags a missing ENCRYPTION_KEY", () => {
    delete process.env.ENCRYPTION_KEY;
    const problems = checkCriticalEnv();
    expect(problems.some((p) => p.name === "ENCRYPTION_KEY")).toBe(true);
  });

  it("flags an ENCRYPTION_KEY that isn't 32 bytes", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64"); // too short
    const problems = checkCriticalEnv();
    expect(problems.some((p) => p.name === "ENCRYPTION_KEY")).toBe(true);
  });

  it("flags a missing database url", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;
    const problems = checkCriticalEnv();
    expect(problems.some((p) => p.name === "DATABASE_URL")).toBe(true);
  });

  it("accepts DIRECT_DATABASE_URL as the database url", () => {
    delete process.env.DATABASE_URL;
    process.env.DIRECT_DATABASE_URL = "postgresql://u:p@h:5432/db";
    expect(checkCriticalEnv().some((p) => p.name === "DATABASE_URL")).toBe(false);
  });
});

describe("checkEnvWarnings", () => {
  it("warns (non-blocking) when RESEND_API_KEY is missing", () => {
    delete process.env.RESEND_API_KEY;
    const warnings = checkEnvWarnings();
    expect(warnings.some((w) => w.name === "RESEND_API_KEY")).toBe(true);
    // A missing email key is NOT a critical problem (app still boots).
    expect(checkCriticalEnv().some((p) => p.name === "RESEND_API_KEY")).toBe(false);
  });

  it("no warning when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(checkEnvWarnings()).toEqual([]);
  });

  it("warns (non-blocking) when no email-asset base is resolvable", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_ASSET_BASE_URL;
    delete process.env.R2_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const warnings = checkEnvWarnings();
    expect(warnings.some((w) => w.name === "EMAIL_ASSET_BASE_URL")).toBe(true);
    expect(checkCriticalEnv().some((p) => p.name === "EMAIL_ASSET_BASE_URL")).toBe(false);
  });

  it("no asset warning when R2_PUBLIC_URL is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_ASSET_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.R2_PUBLIC_URL = "https://r2.example.com";
    expect(checkEnvWarnings().some((w) => w.name === "EMAIL_ASSET_BASE_URL")).toBe(false);
  });

  it("no asset warning when NEXT_PUBLIC_APP_URL is set (assets served from the app)", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_ASSET_BASE_URL;
    delete process.env.R2_PUBLIC_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://payroll.example.com";
    expect(checkEnvWarnings().some((w) => w.name === "EMAIL_ASSET_BASE_URL")).toBe(false);
  });
});
