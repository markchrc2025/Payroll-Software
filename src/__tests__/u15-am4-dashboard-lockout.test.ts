/**
 * Unit 0.15 Amendment 4 (Mark's ruling of 10 Nov 2026: the ESS lockout is
 * added to dashboard sign-in too). Real Postgres, the real authorize(); only
 * the NextAuth runtime is stubbed, as in u03 and u15-am2.
 *
 *   D1  five wrong passwords in a row lock the account; the fifth answer and
 *       the right password both come back as "locked", not as a login.
 *   D2  once the lock passes the right password works and the count is cleared.
 *   D3  a reset link unlocks at once and the new password signs in.
 *   D4  the count is "in a row": a success in between starts it again.
 *   D5  when one email has accounts in two tenants, a wrong password counts
 *       against both (each was a target of the guess).
 *   D6  the lock is 15 minutes ahead, stored as UTC.
 *   D7  the login screen is told "locked" (code), not a generic failure.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";

vi.mock("@/lib/email", () => ({ sendPasswordChangedEmail: vi.fn(async () => {}) }));
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn((cfg: unknown) => cfg) }));

import prismaAdmin from "@/lib/prisma-admin";
import { authorizeCredentials } from "@/auth";
import { claimUserLink, issueUserLink } from "@/lib/user-credential-links";
import { AccountLockedSignin, USER_LOCK_MS } from "@/lib/user-lockout";
import { submitCredentials } from "@/lib/login-redirect";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const sfx = randomBytes(4).toString("hex");
const TA = `u15dA${sfx}`;
const TB = `u15dB${sfx}`;
const CODE_A = `U15DA${sfx}`.toUpperCase();
const U = { a: `u15da${sfx}`, b: `u15db${sfx}` } as const;
const EMAIL = `hr-${sfx}@u15d.test`;
const PW = "Right-Password-1";

let admin: pg.Client;
const signIn = (password: string, companyCode = CODE_A) =>
  authorizeCredentials({ email: EMAIL, password, companyCode, scope: "tenant" });
const anyTenant = (password: string) => authorizeCredentials({ email: EMAIL, password, scope: "tenant" });
const user = async (id: string) =>
  (
    await admin.query(
      `SELECT "failedLoginCount", (EXTRACT(EPOCH FROM "lockedUntil") * 1000)::float8 AS "lockMs" FROM "User" WHERE id = $1`,
      [id],
    )
  ).rows[0];

describeDb("unit 0.15 Am 4: dashboard sign-in lockout", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    for (const [t, code] of [[TA, CODE_A], [TB, `U15DB${sfx}`.toUpperCase()]]) {
      await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [t, code]);
    }
    const hash = await bcrypt.hash(PW, 4);
    for (const [id, t] of [[U.a, TA], [U.b, TB]]) {
      await admin.query(
        `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "isActive", "updatedAt")
         VALUES ($1, $2, $3, $4, 'U15', 'D', 'TENANT_USER', true, now())`,
        [id, t, EMAIL, hash],
      );
    }
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "PasswordResetToken" WHERE "userId" = ANY($1)`, [Object.values(U)]);
    await admin.query(`DELETE FROM "User" WHERE id = ANY($1)`, [Object.values(U)]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[TA, TB]]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await admin.query(
      `UPDATE "User" SET "failedLoginCount" = 0, "lockedUntil" = NULL, "passwordHash" = $2 WHERE id = ANY($1)`,
      [Object.values(U), await bcrypt.hash(PW, 4)],
    );
  });

  it("D1 five wrong passwords lock the account; the right password is then refused as locked", async () => {
    for (let i = 1; i <= 4; i++) expect(await signIn("Wrong-Password-1")).toBeNull();
    await expect(signIn("Wrong-Password-1")).rejects.toBeInstanceOf(AccountLockedSignin);
    await expect(signIn(PW)).rejects.toMatchObject({ code: "locked" });
  });

  it("D2 once the lock passes, the right password works and the count clears", async () => {
    for (let i = 1; i <= 5; i++) await signIn("Wrong-Password-1").catch(() => null);
    await admin.query(`UPDATE "User" SET "lockedUntil" = now() AT TIME ZONE 'UTC' - interval '1 minute' WHERE id = $1`, [U.a]);
    expect(await signIn(PW)).toMatchObject({ id: U.a });
    expect((await user(U.a)).failedLoginCount).toBe(0);
  });

  it("D3 a reset link unlocks at once", async () => {
    for (let i = 1; i <= 5; i++) await signIn("Wrong-Password-1").catch(() => null);
    const raw = await issueUserLink(prismaAdmin, { userId: U.a, purpose: "RESET" });
    const res = await claimUserLink(prismaAdmin, raw, await bcrypt.hash("Fresh-Password-1", 4), { scope: "any" });
    expect(res.ok).toBe(true);
    expect((await user(U.a)).lockMs).toBeNull();
    expect(await signIn("Fresh-Password-1")).toMatchObject({ id: U.a });
  });

  it("D4 the count is in a row: a success in between starts it again", async () => {
    for (let i = 1; i <= 4; i++) await signIn("Wrong-Password-1");
    expect(await signIn(PW)).toMatchObject({ id: U.a });
    expect(await signIn("Wrong-Password-1")).toBeNull();
    expect((await user(U.a)).failedLoginCount).toBe(1);
  });

  it("D5 a wrong password against an email in two tenants counts against both", async () => {
    expect(await anyTenant("Wrong-Password-1")).toBeNull();
    expect((await user(U.a)).failedLoginCount).toBe(1);
    expect((await user(U.b)).failedLoginCount).toBe(1);
  });

  it("D6 the lock is 15 minutes ahead, stored as UTC", async () => {
    for (let i = 1; i <= 5; i++) await signIn("Wrong-Password-1").catch(() => null);
    const ahead = (await user(U.a)).lockMs - Date.now();
    expect(ahead).toBeGreaterThan(USER_LOCK_MS - 60_000);
    expect(ahead).toBeLessThanOrEqual(USER_LOCK_MS + 1_000);
  });

  it("D7 the login screen is told 'locked'", async () => {
    const outcome = await submitCredentials(
      async () => ({ error: "CredentialsSignin", code: "locked", ok: true, status: 200, url: null }),
      { mode: "tenant", email: EMAIL, password: PW, companyCode: CODE_A, destination: "/dashboard" },
    );
    expect(outcome).toEqual({ ok: false, code: "locked" });
    const plain = await submitCredentials(
      async () => ({ error: "CredentialsSignin", code: "credentials", ok: true, status: 200, url: null }),
      { mode: "tenant", email: EMAIL, password: PW, companyCode: CODE_A, destination: "/dashboard" },
    );
    expect(plain).toEqual({ ok: false, code: "CredentialsSignin" });
  });
});
