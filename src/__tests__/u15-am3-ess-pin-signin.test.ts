/**
 * Unit 0.15 Amendment 3 (Mark's ruling of 10 Nov 2026): ESS sign-in is
 * employee number + a 6-digit PIN the EMPLOYEE chooses. Real Postgres, real
 * routes; only the email sender is stubbed.
 *
 *   A1  birth-date sign-in is gone.
 *   A2  an INVITED employee cannot sign in, even with a PIN HR typed, and is
 *       not activated (the invitation is the only way in, ruling B7).
 *   A3  HR can no longer set an employee's PIN (the route is gone).
 *   A4  the invitation refuses easy PINs (repeated, sequences, patterns, the
 *       birth date, the employee number, not 6 digits) without burning the
 *       link; a good PIN then activates.
 *   A5  five wrong PINs lock sign-in for 15 minutes; the right PIN is refused
 *       while locked; once the lock passes it works and the count is cleared.
 *   A6  Forgot PIN unlocks at once: the reset link sets a new PIN, lifts the
 *       lock, and the new PIN signs in.
 *   A7  changing the PIN needs the current PIN or password, ends every
 *       session, and wrong answers count toward the lock.
 *   A8  the password is optional and second: refused until set, set only with
 *       the current PIN, then both work.
 *   A9  passkey sign-in and registration are off.
 *   A10 links go to the personal email by default, the work email once the
 *       record says WORK, and nowhere when the chosen one is missing.
 *   A11 the lock is written in UTC: 15 minutes ahead, not shifted by the
 *       Manila timezone.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";

vi.mock("@/lib/emails", () => ({
  sendEmployeeResetPassword: vi.fn(async () => {}),
  sendEmployeeResetPasswordNotice: vi.fn(async () => {}),
  sendEmployeeOnboarding: vi.fn(async () => {}),
}));

import prismaAdmin from "@/lib/prisma-admin";
import { hashEssToken } from "@/lib/ess-auth";
import { essLinkEmail, issueInvite, issueReset } from "@/lib/ess-credential-links";
import { ESS_LOCK_MS } from "@/lib/ess-lockout";
import { pinProblem } from "@/lib/ess-pin-policy";
import { sendEmployeeResetPassword } from "@/lib/emails";
import { POST as authPost } from "@/app/api/ess/auth/route";
import { POST as activatePost } from "@/app/api/ess/activate/route";
import { POST as resetPost } from "@/app/api/ess/reset-password/route";
import { POST as forgotPost } from "@/app/api/ess/forgot-password/route";
import { POST as pinPost } from "@/app/api/ess/pin/route";
import { POST as passwordPost } from "@/app/api/ess/password/route";
import { POST as passkeyStart } from "@/app/api/ess/webauthn/authenticate/route";
import { POST as passkeyRegister } from "@/app/api/ess/webauthn/register/route";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

const sfx = randomBytes(4).toString("hex");
const T = `u15c${sfx}`;
const CODE = `U15C${sfx}`.toUpperCase();
const E = { inv: `c3inv${sfx}`, act: `c3act${sfx}`, lock: `c3lck${sfx}` } as const;
const PIN = "480213";
const PIN2 = "591746";
const HR_PIN = "735190";

let admin: pg.Client;
const req = (body: unknown, token?: string) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  }) as never;
const signIn = (employeeNumber: string, cred: Record<string, string>) =>
  authPost(req({ companyCode: CODE, employeeNumber, ...cred }));

async function setEmp(id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await admin.query(
    `UPDATE "Employee" SET ${keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ")} WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])],
  );
}
const row = async (id: string) =>
  (
    await admin.query(
      `SELECT "essAccessStatus", "essPin", "essPasswordHash", "essFailedAttempts",
              (EXTRACT(EPOCH FROM "essLockedUntil") * 1000)::float8 AS "lockMs"
         FROM "Employee" WHERE id = $1`,
      [id],
    )
  ).rows[0];
const openSessions = async (id: string) =>
  Number((await admin.query(`SELECT count(*) FROM "EssSession" WHERE "employeeId" = $1 AND "revokedAt" IS NULL`, [id])).rows[0].count);
async function openSession(id: string): Promise<string> {
  const raw = randomBytes(24).toString("hex");
  await admin.query(
    `INSERT INTO "EssSession" (id, "tenantId", "employeeId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval '8 hours')`,
    [`c3s${randomBytes(6).toString("hex")}`, T, id, hashEssToken(raw)],
  );
  return raw;
}

describeDb("unit 0.15 Am 3: ESS employee number + PIN", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, CODE]);
    for (const id of [E.inv, E.act, E.lock]) {
      await admin.query(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt",
                                 "birthDate", "personalEmail", "workEmail")
         VALUES ($1, $2, $3, 'C3', $1, '2026-01-05', now(), '1990-04-07', $4, $5)`,
        [id, T, id, `${id}@personal.test`, `${id}@work.test`],
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
    const active = {
      essAccessStatus: "ACTIVE",
      essPin: await bcrypt.hash(PIN, 4),
      essPasswordHash: null,
      essFailedAttempts: 0,
      essLockedUntil: null,
      essEmailChoice: "PERSONAL",
    };
    await setEmp(E.act, active);
    await setEmp(E.lock, active);
    await setEmp(E.inv, { ...active, essAccessStatus: "INVITED", essPin: await bcrypt.hash(HR_PIN, 4) });
    await admin.query(`UPDATE "EssSession" SET "revokedAt" = now() WHERE "tenantId" = $1 AND "revokedAt" IS NULL`, [T]);
  });

  it("A1 birth-date sign-in is gone", async () => {
    const res = await signIn(E.act, { birthDate: "1990-04-07" });
    expect(res.status).toBe(400);
    expect(await openSessions(E.act)).toBe(0);
  });

  it("A2 an INVITED employee cannot sign in with a PIN HR typed, and stays INVITED", async () => {
    const res = await signIn(E.inv, { pin: HR_PIN });
    expect(res.status).toBe(403);
    expect((await row(E.inv)).essAccessStatus).toBe("INVITED");
    expect(await openSessions(E.inv)).toBe(0);
  });

  it("A3 HR can no longer set an employee's PIN", () => {
    expect(existsSync("src/app/api/employees/[id]/ess-pin/route.ts")).toBe(false);
  });

  it("A4 the invitation refuses easy PINs without burning the link, then a good PIN activates", async () => {
    const { rawToken } = await prismaAdmin.$transaction((tx) => issueInvite(tx, { tenantId: T, employeeId: E.inv }));
    for (const bad of ["111111", "123456", "654321", "121212", "123123", "040790", "070490", "900407", "1234", "12345678"]) {
      const res = await activatePost(req({ token: rawToken, pin: bad }));
      expect([400, 422], `PIN ${bad} must be refused`).toContain(res.status);
    }
    expect((await row(E.inv)).essAccessStatus).toBe("INVITED");
    const ok = await activatePost(req({ token: rawToken, pin: PIN2 }));
    expect(ok.status).toBe(200);
    const after = await row(E.inv);
    expect(after.essAccessStatus).toBe("ACTIVE");
    expect(await bcrypt.compare(PIN2, after.essPin)).toBe(true);
    expect((await signIn(E.inv, { pin: PIN2 })).status).toBe(200);
    expect((await signIn(E.inv, { pin: HR_PIN })).status).toBe(401);
    // The employee-number check (policy level, so any number shape is covered).
    expect(pinProblem("000021", { employeeNumber: "EMP-00021" })).not.toBeNull();
  });

  it("A5 five wrong PINs lock sign-in; the lock passes; the count clears", async () => {
    for (let i = 1; i <= 4; i++) expect((await signIn(E.lock, { pin: "902713" })).status).toBe(401);
    expect((await signIn(E.lock, { pin: "902713" })).status).toBe(423);
    expect((await signIn(E.lock, { pin: PIN })).status).toBe(423);
    expect(await openSessions(E.lock)).toBe(0);
    await admin.query(`UPDATE "Employee" SET "essLockedUntil" = now() AT TIME ZONE 'UTC' - interval '1 minute' WHERE id = $1`, [E.lock]);
    expect((await signIn(E.lock, { pin: PIN })).status).toBe(200);
    expect((await row(E.lock)).essFailedAttempts).toBe(0);
    // The count is "in a row": a success in between starts it again.
    for (let i = 1; i <= 4; i++) await signIn(E.lock, { pin: "902713" });
    expect((await signIn(E.lock, { pin: PIN })).status).toBe(200);
    expect((await signIn(E.lock, { pin: "902713" })).status).toBe(401);
  });

  it("A6 Forgot PIN unlocks at once", async () => {
    for (let i = 1; i <= 5; i++) await signIn(E.lock, { pin: "902713" });
    expect((await signIn(E.lock, { pin: PIN })).status).toBe(423);
    expect((await forgotPost(req({ companyCode: CODE, employeeNumber: E.lock }))).status).toBe(200);
    const sent = vi.mocked(sendEmployeeResetPassword).mock.calls[0];
    expect(sent[0]).toBe(`${E.lock}@personal.test`);
    const token = new URL((sent[1] as { resetUrl: string }).resetUrl).searchParams.get("token")!;
    expect((await resetPost(req({ token, pin: PIN2 }))).status).toBe(200);
    const after = await row(E.lock);
    expect(after.lockMs).toBeNull();
    expect(after.essFailedAttempts).toBe(0);
    expect((await signIn(E.lock, { pin: PIN2 })).status).toBe(200);
    expect((await signIn(E.lock, { pin: PIN })).status).toBe(401);
  });

  it("A7 changing the PIN needs the current credential, ends every session, and counts wrong answers", async () => {
    const mine = await openSession(E.act);
    await openSession(E.act);
    expect((await pinPost(req({ current: "902713", newPin: PIN2 }, mine))).status).toBe(400);
    expect((await row(E.act)).essFailedAttempts).toBe(1);
    expect((await pinPost(req({ current: PIN, newPin: "222222" }, mine))).status).toBe(422);
    expect((await pinPost(req({ current: PIN, newPin: PIN2 }, mine))).status).toBe(200);
    expect(await openSessions(E.act)).toBe(0);
    expect((await signIn(E.act, { pin: PIN2 })).status).toBe(200);
    expect((await signIn(E.act, { pin: PIN })).status).toBe(401);
  });

  it("A8 the password is optional and second", async () => {
    expect((await signIn(E.act, { password: "My-Own-Pass-1" })).status).toBe(400);
    const mine = await openSession(E.act);
    expect((await passwordPost(req({ newPassword: "My-Own-Pass-1" }, mine))).status).toBe(400);
    expect((await passwordPost(req({ newPassword: "My-Own-Pass-1", current: PIN }, mine))).status).toBe(200);
    expect(await openSessions(E.act)).toBe(0);
    expect((await signIn(E.act, { password: "My-Own-Pass-1" })).status).toBe(200);
    expect((await signIn(E.act, { pin: PIN })).status).toBe(200);
  });

  it("A9 passkey sign-in and registration are off", async () => {
    const mine = await openSession(E.act);
    expect((await passkeyStart(req({ companyCode: CODE, employeeNumber: E.act }))).status).toBe(404);
    expect((await passkeyRegister(req({}, mine))).status).toBe(404);
  });

  it("A10 links go to the personal email, then the work email once chosen, never to a missing one", async () => {
    const reset = () => prismaAdmin.$transaction((tx) => issueReset(tx, { tenantId: T, employeeId: E.act }));
    expect((await reset())!.email).toBe(`${E.act}@personal.test`);
    await setEmp(E.act, { essEmailChoice: "WORK" });
    expect((await reset())!.email).toBe(`${E.act}@work.test`);
    await setEmp(E.act, { workEmail: null });
    expect(await reset()).toBeNull();
    expect(essLinkEmail({ essEmailChoice: "PERSONAL", personalEmail: null, workEmail: "w@x.test" })).toBeNull();
    await setEmp(E.act, { workEmail: `${E.act}@work.test`, essEmailChoice: "PERSONAL" });
  });

  it("A11 the lock is written in UTC, 15 minutes ahead", async () => {
    for (let i = 1; i <= 5; i++) await signIn(E.lock, { pin: "902713" });
    const { lockMs } = await row(E.lock);
    const ahead = lockMs - Date.now();
    expect(ahead).toBeGreaterThan(ESS_LOCK_MS - 60_000);
    expect(ahead).toBeLessThanOrEqual(ESS_LOCK_MS + 1_000);
  });
});
