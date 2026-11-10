/**
 * Unit 0.15 (review) and Amendment 1 (rulings B7, B8): ESS invitation and
 * password reset are TWO SEPARATE ENGINES, and a password change ends every
 * session. Real Postgres, real routes; only the email sender is stubbed.
 *
 * Invitation engine (the ONLY way to activate):
 *   I1  a new invitation retires the previous one: only the newest link works.
 *   I2  accepting activates INVITED, sets the password; the link is single-use.
 *   I3  an employee HR has DISABLED cannot re-activate with an old link.
 *   I4  a separated employee is refused.
 *   I5  two requests racing with one link: exactly one succeeds.
 * Reset engine (ACTIVE accounts only, never activates):
 *   R1  forgot-password issues a link ONLY to an ACTIVE, employed account with
 *       a work email (INVITED, NOT_INVITED, DISABLED, separated: nothing sent).
 *   R2  a reset changes the password, ends EVERY session, retires other links,
 *       and leaves the access status exactly as it was.
 *   R3  a reset link never activates: on an INVITED account it is refused and
 *       nothing changes (the 0.15 coupling Mark overruled).
 *   R4  two requests racing with one reset link: exactly one succeeds.
 *   R5  the engines do not cross: a reset link cannot activate, an invitation
 *       cannot reset.
 * Change password (B8):
 *   P1  ends every session of the employee, the requesting one included.
 *   P2  needs the current credential (PIN or password).
 *
 * Amendment 3 (Mark's ruling of 10 Nov): both engines now set the employee's
 * 6-digit PIN instead of a password, and links go to the record's chosen email
 * (personal by default). A reset also removes the optional password. The
 * properties above are unchanged; only the credential they set moved.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";

vi.mock("@/lib/emails", () => ({
  sendEmployeeResetPassword: vi.fn(async () => {}),
  sendEmployeeResetPasswordNotice: vi.fn(async () => {}),
}));

import prismaAdmin from "@/lib/prisma-admin";
import { hashEssToken } from "@/lib/ess-auth";
import { claimInvite, claimReset, issueInvite, issueReset } from "@/lib/ess-credential-links";
import { sendEmployeeResetPassword } from "@/lib/emails";
import { POST as forgotPost } from "@/app/api/ess/forgot-password/route";
import { POST as resetPost } from "@/app/api/ess/reset-password/route";
import { POST as activatePost } from "@/app/api/ess/activate/route";
import { POST as passwordPost } from "@/app/api/ess/password/route";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const sfx = randomBytes(4).toString("hex");
const T = `u15tenant${sfx}`;
const CODE = `U15${sfx}`.toUpperCase();
const E = {
  invited: `u15inv${sfx}`,
  active: `u15act${sfx}`,
  disabled: `u15dis${sfx}`,
  notInvited: `u15non${sfx}`,
  separated: `u15sep${sfx}`,
  noEmail: `u15nom${sfx}`,
} as const;

let admin: pg.Client;
const json = (body: unknown, token?: string) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  }) as never;

async function setEmp(id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await admin.query(
    `UPDATE "Employee" SET ${keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ")} WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])],
  );
}
const emp = async (id: string) =>
  (await admin.query(`SELECT "essAccessStatus", "essPasswordHash", "essPin" FROM "Employee" WHERE id = $1`, [id])).rows[0];
const PIN_A = "480213";
const PIN_B = "591746";
const openSessions = async (id: string) =>
  Number((await admin.query(`SELECT count(*) FROM "EssSession" WHERE "employeeId" = $1 AND "revokedAt" IS NULL`, [id])).rows[0].count);
async function openSession(id: string): Promise<string> {
  const raw = randomBytes(24).toString("hex");
  await admin.query(
    `INSERT INTO "EssSession" (id, "tenantId", "employeeId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval '8 hours')`,
    [`u15s${randomBytes(6).toString("hex")}`, T, id, hashEssToken(raw)],
  );
  return raw;
}
const invite = (id: string) => prismaAdmin.$transaction((tx) => issueInvite(tx, { tenantId: T, employeeId: id }));
const reset = (id: string) => prismaAdmin.$transaction((tx) => issueReset(tx, { tenantId: T, employeeId: id }));

describeDb("unit 0.15 Am 1: ESS invitation and reset are separate engines", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, CODE]);
    const rows: [string, string, string, string | null][] = [
      [E.invited, "INVITED", "REGULAR", "inv@u15.test"],
      [E.active, "ACTIVE", "REGULAR", "act@u15.test"],
      [E.disabled, "DISABLED", "REGULAR", "dis@u15.test"],
      [E.notInvited, "NOT_INVITED", "REGULAR", "non@u15.test"],
      [E.separated, "ACTIVE", "TERMINATED", "sep@u15.test"],
      [E.noEmail, "ACTIVE", "REGULAR", null],
    ];
    for (const [id, ess, status, email] of rows) {
      await admin.query(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt", "essAccessStatus", "employmentStatus", "workEmail", "personalEmail")
         VALUES ($1, $2, $1, 'U15', $1, '2026-01-05', now(), $3, $4, $5, $5)`,
        [id, T, ess, status, email],
      );
    }
  });

  afterAll(async () => {
    for (const t of ["EssSession", "EssInvite", "EssPasswordReset"]) {
      await admin.query(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await admin.query(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
    await prismaAdmin.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await setEmp(E.invited, { essAccessStatus: "INVITED", essPasswordHash: null, essPin: null });
    await setEmp(E.active, {
      essAccessStatus: "ACTIVE",
      essPasswordHash: await bcrypt.hash("Old-Password-1", 4),
      essPin: await bcrypt.hash(PIN_A, 4),
      essFailedAttempts: 0,
      essLockedUntil: null,
    });
  });

  // ── invitation ──
  it("I1 a new invitation retires the previous one", async () => {
    const first = await invite(E.invited);
    const second = await invite(E.invited);
    expect((await claimInvite(prismaAdmin, first.rawToken, PIN_A)).ok).toBe(false);
    expect((await claimInvite(prismaAdmin, second.rawToken, PIN_B)).ok).toBe(true);
  });

  it("I2 accepting activates INVITED, sets the PIN, and is single-use", async () => {
    const { rawToken } = await invite(E.invited);
    const res = await activatePost(json({ token: rawToken, pin: PIN_A }));
    expect(res.status).toBe(200);
    const after = await emp(E.invited);
    expect(after.essAccessStatus).toBe("ACTIVE");
    expect(await bcrypt.compare(PIN_A, after.essPin)).toBe(true);
    expect((await activatePost(json({ token: rawToken, pin: PIN_B }))).status).toBe(400);
  });

  it("I3 a DISABLED employee cannot re-activate with an old invitation", async () => {
    await setEmp(E.disabled, { essAccessStatus: "INVITED" });
    const { rawToken } = await invite(E.disabled);
    await setEmp(E.disabled, { essAccessStatus: "DISABLED" }); // HR disables before it is used
    const res = await activatePost(json({ token: rawToken, pin: PIN_A }));
    expect(res.status).toBe(400);
    expect((await emp(E.disabled)).essAccessStatus).toBe("DISABLED");
    expect(await claimInvite(prismaAdmin, rawToken, PIN_A)).toEqual({ ok: false, reason: "invalid" });
  });

  it("I4 a separated employee is refused", async () => {
    await setEmp(E.separated, { essAccessStatus: "INVITED" });
    const { rawToken } = await invite(E.separated);
    expect(await claimInvite(prismaAdmin, rawToken, PIN_A)).toEqual({ ok: false, reason: "separated" });
    await setEmp(E.separated, { essAccessStatus: "ACTIVE" });
  });

  it("I5 two requests racing with one invitation: exactly one succeeds", async () => {
    const { rawToken } = await invite(E.invited);
    const results = await Promise.all([claimInvite(prismaAdmin, rawToken, PIN_A), claimInvite(prismaAdmin, rawToken, PIN_B)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  // ── reset ──
  it("R1 forgot-password sends a link only to an ACTIVE, employed account with an email", async () => {
    for (const id of [E.invited, E.notInvited, E.disabled, E.separated, E.noEmail, E.active]) {
      const res = await forgotPost(json({ companyCode: CODE, employeeNumber: id }));
      expect(res.status).toBe(200);
    }
    const sentTo = vi.mocked(sendEmployeeResetPassword).mock.calls.map((c) => c[0]);
    expect(sentTo).toEqual(["act@u15.test"]);
  });

  it("R2 a reset sets a new PIN, removes the password, ends every session, retires other links, keeps the status", async () => {
    await openSession(E.active);
    await openSession(E.active);
    const older = (await reset(E.active))!;
    const newest = (await reset(E.active))!;
    expect(older && newest).toBeTruthy();
    const res = await resetPost(json({ token: newest.rawToken, pin: PIN_B }));
    expect(res.status).toBe(200);
    const after = await emp(E.active);
    expect(after.essAccessStatus).toBe("ACTIVE");
    expect(await bcrypt.compare(PIN_B, after.essPin)).toBe(true);
    expect(after.essPasswordHash).toBeNull();
    expect(await openSessions(E.active)).toBe(0);
    expect((await claimReset(prismaAdmin, older.rawToken, PIN_A)).ok).toBe(false);
  });

  it("R3 a reset link never activates an account", async () => {
    await setEmp(E.invited, { essAccessStatus: "ACTIVE" });
    const link = (await reset(E.invited))!;
    await setEmp(E.invited, { essAccessStatus: "INVITED" }); // e.g. HR re-invited
    const res = await resetPost(json({ token: link.rawToken, pin: PIN_B }));
    expect(res.status).toBe(403);
    const after = await emp(E.invited);
    expect(after).toEqual({ essAccessStatus: "INVITED", essPasswordHash: null, essPin: null });
  });

  it("R4 two requests racing with one reset link: exactly one succeeds", async () => {
    const link = (await reset(E.active))!;
    const results = await Promise.all([claimReset(prismaAdmin, link.rawToken, PIN_A), claimReset(prismaAdmin, link.rawToken, PIN_B)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("R5 the engines do not cross", async () => {
    const inv = await invite(E.invited);
    const rst = (await reset(E.active))!;
    expect((await claimReset(prismaAdmin, inv.rawToken, PIN_A)).ok).toBe(false);
    expect((await claimInvite(prismaAdmin, rst.rawToken, PIN_A)).ok).toBe(false);
    expect((await emp(E.invited)).essAccessStatus).toBe("INVITED");
  });

  // ── change password ──
  it("P1 changing the password ends every session, the requesting one included", async () => {
    const mine = await openSession(E.active);
    await openSession(E.active);
    const res = await passwordPost(json({ newPassword: "Changed-Pass-1", current: "Old-Password-1" }, mine));
    expect(res.status).toBe(200);
    expect(await openSessions(E.active)).toBe(0);
    const again = await passwordPost(json({ newPassword: "Changed-Pass-2", current: "Changed-Pass-1" }, mine));
    expect(again.status).toBe(401);
  });

  it("P2 the current PIN or password is required", async () => {
    const mine = await openSession(E.active);
    expect((await passwordPost(json({ newPassword: "Changed-Pass-1" }, mine))).status).toBe(400);
    expect((await passwordPost(json({ newPassword: "Changed-Pass-1", current: "wrong-one" }, mine))).status).toBe(400);
    expect(await bcrypt.compare("Old-Password-1", (await emp(E.active)).essPasswordHash)).toBe(true);
    expect(await openSessions(E.active)).toBe(1);
  });
});
