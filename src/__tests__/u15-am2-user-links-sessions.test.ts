/**
 * Unit 0.15 Amendment 2 (rulings B7, B8): HR/admin (tenant) and Central
 * accounts. Real Postgres, real routes and the real Auth.js jwt callback;
 * only email senders are stubbed.
 *
 * B7, invitation and reset are separate engines (PasswordResetToken.purpose):
 *   L1  a Central INVITE activates a never-activated admin, once.
 *   L2  a RESET sent to a DEACTIVATED Central admin does not switch them back
 *       on (before: central-set-password set isActive: true for any token).
 *   L3  a tenant RESET works on an active user and is refused on an inactive one.
 *   L4  one live link per user and purpose: a new one retires the older one.
 *   L5  two requests racing with one link: exactly one succeeds.
 * B8, a password change ends every running session:
 *   S1  a session signed in before the reset is rejected by the jwt callback;
 *       a session signed in after it is accepted.
 *   S2  a deactivated or deleted user's session is rejected at once.
 *   S3  a fresh sign-in stamps signedInAt and is accepted.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";

vi.mock("@/lib/emails", () => ({
  sendTenantAdminResetPassword: vi.fn(async () => {}),
  sendAdminResetPasswordNotice: vi.fn(async () => {}),
  sendAdminResetPassword: vi.fn(async () => {}),
  sendAdminOnboarding: vi.fn(async () => {}),
  sendTenantOnboarding: vi.fn(async () => {}),
}));
vi.mock("@/lib/email", () => ({ sendPasswordChangedEmail: vi.fn(async () => {}) }));
// As in u03: stub only the NextAuth runtime (it reaches for next/server, which
// does not resolve under vitest). jwtCallback is the real exported function.
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn((cfg: unknown) => cfg) }));

import prismaAdmin from "@/lib/prisma-admin";
import { claimUserLink, issueUserLink } from "@/lib/user-credential-links";
import { jwtCallback } from "@/auth";
import { POST as centralSetPassword } from "@/app/api/auth/central-set-password/route";
import { POST as tenantReset } from "@/app/api/auth/reset-password/route";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const sfx = randomBytes(4).toString("hex");
const T = `u15bten${sfx}`;
const U = {
  centralNew: `u15bcn${sfx}`,
  centralOff: `u15bco${sfx}`,
  tenantOn: `u15bto${sfx}`,
  tenantOff: `u15btf${sfx}`,
} as const;

let admin: pg.Client;
const json = (body: unknown) =>
  new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }) as never;
const user = async (id: string) =>
  (await admin.query(`SELECT "isActive", "passwordHash", "sessionsValidAfter" FROM "User" WHERE id = $1`, [id])).rows[0];
const token = (userId: string, signedInAt?: number) =>
  ({ userId, tenantId: null, systemRole: "TENANT_USER", roleId: null, signedInAt }) as never;

describeDb("unit 0.15 Am 2: account links and session cutoff", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `U15B${sfx}`.toUpperCase()]);
    const pw = await bcrypt.hash("Old-Password-1", 4);
    const rows: [string, string | null, boolean, string, string][] = [
      [U.centralNew, null, false, "", "SUPER_ADMIN"],
      [U.centralOff, null, false, pw, "SUPER_ADMIN"],
      [U.tenantOn, T, true, pw, "TENANT_USER"],
      [U.tenantOff, T, false, pw, "TENANT_USER"],
    ];
    for (const [id, tenantId, active, hash, role] of rows) {
      await admin.query(
        `INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "systemRole", "isActive", "updatedAt")
         VALUES ($1, $2, $3, $4, 'U15', 'B', $5, $6, now())`,
        [id, tenantId, `${id}@u15.test`, hash, role, active],
      );
    }
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "PasswordResetToken" WHERE "userId" = ANY($1)`, [Object.values(U)]);
    await admin.query(`DELETE FROM "User" WHERE id = ANY($1)`, [Object.values(U)]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("L1 a Central INVITE activates a never-activated admin, once", async () => {
    const raw = await issueUserLink(prismaAdmin, { userId: U.centralNew, purpose: "INVITE" });
    const res = await centralSetPassword(json({ token: raw, password: "First-Password-1" }));
    expect(res.status).toBe(200);
    const after = await user(U.centralNew);
    expect(after.isActive).toBe(true);
    expect(await bcrypt.compare("First-Password-1", after.passwordHash)).toBe(true);
    expect((await centralSetPassword(json({ token: raw, password: "Second-Pass-1" }))).status).toBe(400);
  });

  it("L2 a RESET sent to a deactivated Central admin does not switch them back on", async () => {
    const raw = await issueUserLink(prismaAdmin, { userId: U.centralOff, purpose: "RESET" });
    const res = await centralSetPassword(json({ token: raw, password: "Sneak-Back-In-1" }));
    expect(res.status).toBe(400);
    const after = await user(U.centralOff);
    expect(after.isActive).toBe(false);
    expect(await bcrypt.compare("Old-Password-1", after.passwordHash)).toBe(true);
  });

  it("L3 a tenant RESET works on an active user and is refused on an inactive one", async () => {
    const on = await issueUserLink(prismaAdmin, { userId: U.tenantOn, purpose: "RESET" });
    const off = await issueUserLink(prismaAdmin, { userId: U.tenantOff, purpose: "RESET" });
    expect((await tenantReset(json({ token: on, password: "Reset-Password-1" }))).status).toBe(200);
    expect((await tenantReset(json({ token: off, password: "Reset-Password-1" }))).status).toBe(400);
    expect((await user(U.tenantOff)).isActive).toBe(false);
    expect((await user(U.tenantOn)).sessionsValidAfter).not.toBeNull();
  });

  it("L4 one live link per user and purpose", async () => {
    const older = await issueUserLink(prismaAdmin, { userId: U.tenantOn, purpose: "RESET" });
    const newer = await issueUserLink(prismaAdmin, { userId: U.tenantOn, purpose: "RESET" });
    expect((await claimUserLink(prismaAdmin, older, "h", { scope: "any" })).ok).toBe(false);
    expect((await claimUserLink(prismaAdmin, newer, "h", { scope: "any" })).ok).toBe(true);
  });

  it("L5 two requests racing with one link: exactly one succeeds", async () => {
    const raw = await issueUserLink(prismaAdmin, { userId: U.tenantOn, purpose: "RESET" });
    const results = await Promise.all([
      claimUserLink(prismaAdmin, raw, "a", { scope: "any" }),
      claimUserLink(prismaAdmin, raw, "b", { scope: "any" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("S1 a session signed in before a reset is rejected; one signed in after is accepted", async () => {
    await admin.query(`UPDATE "User" SET "sessionsValidAfter" = NULL WHERE id = $1`, [U.tenantOn]);
    const before = Date.now() - 60_000;
    expect(await jwtCallback({ token: token(U.tenantOn, before) })).not.toBeNull();
    const raw = await issueUserLink(prismaAdmin, { userId: U.tenantOn, purpose: "RESET" });
    expect((await tenantReset(json({ token: raw, password: "After-Reset-1" }))).status).toBe(200);
    expect(await jwtCallback({ token: token(U.tenantOn, before) })).toBeNull();
    expect(await jwtCallback({ token: token(U.tenantOn, Date.now() + 1000) })).not.toBeNull();
  });

  it("S2 a deactivated or deleted user's session is rejected at once", async () => {
    const now = Date.now() + 1000;
    expect(await jwtCallback({ token: token(U.tenantOff, now) })).toBeNull();
    await admin.query(`UPDATE "User" SET "deletedAt" = now() WHERE id = $1`, [U.centralNew]);
    expect(await jwtCallback({ token: token(U.centralNew, now) })).toBeNull();
    expect(await jwtCallback({ token: token(`u15bnobody${sfx}`, now) })).toBeNull();
  });

  it("S3 a fresh sign-in stamps signedInAt and is accepted", async () => {
    const t = (await jwtCallback({
      token: {} as never,
      user: { id: U.tenantOn, tenantId: T, systemRole: "TENANT_USER", roleId: null },
    }))!;
    expect(typeof t.signedInAt).toBe("number");
    expect(await jwtCallback({ token: t })).not.toBeNull();
  });
});
