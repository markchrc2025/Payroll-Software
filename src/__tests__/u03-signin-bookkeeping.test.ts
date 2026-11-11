/**
 * Unit 0.3 — sign-in must not fail on bookkeeping.
 *
 * `authorizeCredentials` records `lastLoginAt` after the password verifies.
 * That write is bookkeeping: it tells us when someone last signed in, and
 * nothing about whether they MAY sign in. If it throws, @auth/core wraps the
 * throw in a CallbackRouteError (node_modules/@auth/core/lib/actions/callback/
 * index.js:388), which is not in the client-safe set, so the user is bounced to
 * `?error=Configuration` — a transient DB blip turns a valid credential into a
 * server error.
 *
 * These tests drive the real exported production function, not a copy.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

// Importing @/auth would otherwise pull in the NextAuth runtime, which reaches
// for `next/server` and cannot resolve under vitest's node environment. Stubbing
// the runtime keeps the module importable; the function under test is the real
// exported one, not a copy.
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((cfg: unknown) => cfg),
}));

vi.mock("@/lib/prisma-admin", () => ({
  default: {
    user: { findMany: vi.fn(), update: vi.fn() },
    tenant: { findFirst: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

import { authorizeCredentials } from "@/auth";
import prismaAdmin from "@/lib/prisma-admin";
import bcrypt from "bcryptjs";

const db = prismaAdmin as unknown as {
  user: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tenant: { findFirst: ReturnType<typeof vi.fn> };
};
const crypt = bcrypt as unknown as { compare: ReturnType<typeof vi.fn> };

const USER = {
  id: "usr_1",
  email: "hr@example.test",
  passwordHash: "$2a$10$hash",
  firstName: "Ada",
  lastName: "Lovelace",
  tenantId: "ten_1",
  systemRole: "TENANT_ADMIN",
  roleId: "role_1",
};

const CREDS = { email: "hr@example.test", password: "correct-horse", scope: "tenant" };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([USER]);
  db.user.update.mockResolvedValue({});
  crypt.compare.mockResolvedValue(true);
});

describe("unit 0.3 — authorizeCredentials bookkeeping is fail-soft", () => {
  it("returns the authenticated user when credentials are valid", async () => {
    const result = await authorizeCredentials(CREDS);
    expect(result).toMatchObject({
      id: "usr_1",
      email: "hr@example.test",
      tenantId: "ten_1",
      systemRole: "TENANT_ADMIN",
      roleId: "role_1",
    });
  });

  it("records lastLoginAt on a successful sign-in", async () => {
    await authorizeCredentials(CREDS);
    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({ where: { id: "usr_1" } });
    expect(db.user.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });

  // T1 — the one that matters. Must fail against the unguarded code.
  it("T1: still returns an authenticated user when the lastLoginAt write throws", async () => {
    db.user.update.mockRejectedValue(new Error("db unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await authorizeCredentials(CREDS);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({ id: "usr_1", email: "hr@example.test" });
  });

  it("T1b: does not throw when the lastLoginAt write rejects", async () => {
    db.user.update.mockRejectedValue(new Error("db unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(authorizeCredentials(CREDS)).resolves.not.toThrow();
  });

  // T2 — a guard that hides the error just trades one invisible failure for another.
  it("T2: logs the bookkeeping failure rather than swallowing it", async () => {
    const boom = new Error("db unavailable");
    db.user.update.mockRejectedValue(boom);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await authorizeCredentials(CREDS);

    expect(spy).toHaveBeenCalled();
    const logged = spy.mock.calls.flat();
    expect(logged.some((a) => a === boom || String(a).includes("lastLoginAt"))).toBe(true);
  });

  it("returns null (does not throw) when no candidate password verifies", async () => {
    crypt.compare.mockResolvedValue(false);
    await expect(authorizeCredentials(CREDS)).resolves.toBeNull();
    // Unit 0.15 Am 4: a wrong password now counts toward the 5-attempt lock,
    // so one write happens; bookkeeping (lastLoginAt) still never does.
    for (const c of db.user.update.mock.calls) {
      expect(c[0].data).not.toHaveProperty("lastLoginAt");
    }
  });
});
