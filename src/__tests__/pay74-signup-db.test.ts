/**
 * PAY-74 against real Postgres: self-serve sign-up (Mark, 28 Nov 2026).
 *
 *   S1  a sign-up stores the details with the password hashed and emails a
 *       link; no company exists yet (fails on main: no sign-up).
 *   S2  opening the link creates the company, an Administrator holding every
 *       permission, the owner (who can sign in) and the starting rows; the
 *       welcome email carries the company code.
 *   S3  opening it again shows the same company and creates nothing.
 *   S4  an expired or unknown link is refused.
 *   S5  limits: the 6th sign-up in an hour from one IP is refused; the 4th
 *       unconfirmed one for one email is not sent.
 *   S6  seeding is idempotent, and Central's "create tenant" seeds the same rows.
 *   S7  the routes: validation, consent, the same answer either way; public paths.
 *   S8  the setup checklist ticks itself off from the company's data.
 *   S9  the runtime role payroll_app holds the grants but sees no sign-up rows.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const mail = (k: string) => `pay74-${k}-${sfx}@example.test`;

const sent = vi.hoisted(() => ({ verify: [] as { to: string; v: { verifyUrl: string } }[], ready: [] as { to: string; v: { companyCode: string } }[] }));
vi.mock("@/lib/emails", () => ({
  sendSignupVerify: vi.fn(async (to: string, v: { verifyUrl: string }) => { sent.verify.push({ to, v }); }),
  sendSignupReady: vi.fn(async (to: string, v: { companyCode: string }) => { sent.ready.push({ to, v }); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/central-permission", () => ({ requireCentralPermission: vi.fn(async () => ({ userId: null })) }));

import { requestSignup, verifySignup, SignupRefusal } from "@/lib/onboarding/signup";
import { seedTenantDefaults } from "@/lib/onboarding/provision";
import { getSetupChecklist } from "@/lib/onboarding/checklist";
import { NATIONAL_HOLIDAYS } from "@/lib/onboarding/defaults";
import { POST as signupPost } from "@/app/api/signup/route";
import { POST as centralCreate } from "@/app/api/admin/tenants/route";
import prismaAdmin from "@/lib/prisma-admin";

const HOLIDAY_COUNT = Object.values(NATIONAL_HOLIDAYS).flat().length;
const input = (k: string) => ({ companyName: `Tala Foods ${sfx} Inc.`, firstName: "Maria", lastName: "Reyes", email: mail(k), password: "correct horse battery", payrollCycle: "SEMI_MONTHLY" as const });
const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;

describeDb("PAY-74 self-serve sign-up (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const tenants: string[] = [];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500));
    for (const t of tenants) {
      for (const table of ["Holiday", "LeaveType", "ShiftSchedule", "Branch", "Employee", "AuditLog", "SubscriptionEvent", "CentralAuditEvent"]) {
        await q(`DELETE FROM "${table}" WHERE "tenantId" = $1`, [t]).catch(() => {});
      }
      await q(`UPDATE "Tenant" SET "ownerUserId" = NULL WHERE id = $1`, [t]);
      await q(`DELETE FROM "User" WHERE "tenantId" = $1`, [t]);
      await q(`DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE "tenantId" = $1)`, [t]);
      await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [t]);
      await q(`DELETE FROM "Tenant" WHERE id = $1`, [t]);
    }
    await q(`DELETE FROM "TenantSignup" WHERE email LIKE $1`, [`pay74-%-${sfx}@example.test`]);
    await admin.end();
  });

  let token = "";
  let tenantId = "";

  it("S1 a sign-up stores the details and emails a link; nothing else yet", async () => {
    const r = await requestSignup(input("a"), "203.0.113.10");
    expect(r.sent).toBe(true);
    const row = (await q(`SELECT * FROM "TenantSignup" WHERE email = $1`, [mail("a")])).rows[0];
    expect(row.passwordHash).not.toContain("horse");
    expect(await bcrypt.compare("correct horse battery", row.passwordHash)).toBe(true);
    expect(row.tokenHash).not.toBe(r.token);
    expect(row.verifiedAt).toBeNull();
    const msg = sent.verify.find((m) => m.to === mail("a"))!;
    token = tokenOf(msg.v.verifyUrl);
    expect(token).toBe(r.token);
    expect((await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE name = $1`, [input("a").companyName])).rows[0].n).toBe(0);
  });

  it("S2 opening the link creates the company, its admin and the starting rows", async () => {
    const r = await verifySignup(token, "203.0.113.10");
    expect(r).toMatchObject({ companyName: input("a").companyName, email: mail("a"), created: true });
    expect(r.companyCode).toMatch(/^TF[0-9A-F]?\d{3}$/); // initials of "Tala Foods <suffix>", Inc. dropped, then 3 digits
    const t = (await q(`SELECT * FROM "Tenant" WHERE "companyCode" = $1`, [r.companyCode])).rows[0];
    tenantId = t.id;
    tenants.push(t.id);
    expect(t).toMatchObject({ subscriptionStatus: "TRIALING", payrollCycle: "SEMI_MONTHLY", country: "Philippines", contactEmail: mail("a") });
    const owner = (await q(`SELECT u.*, r.name AS role FROM "User" u JOIN "Role" r ON r.id = u."roleId" WHERE u.id = $1`, [t.ownerUserId])).rows[0];
    expect(owner).toMatchObject({ email: mail("a"), firstName: "Maria", isActive: true, systemRole: "TENANT_USER", role: "Administrator" });
    expect(await bcrypt.compare("correct horse battery", owner.passwordHash)).toBe(true);
    const perms = (await q(`SELECT (SELECT count(*) FROM "RolePermission" WHERE "roleId" = $1)::int AS held, (SELECT count(*) FROM "Permission")::int AS total`, [owner.roleId])).rows[0];
    expect(perms.held).toBe(perms.total);

    const count = async (table: string) => (await q(`SELECT count(*)::int AS n FROM "${table}" WHERE "tenantId" = $1`, [t.id])).rows[0].n;
    expect(await count("Branch")).toBe(1);
    expect(await count("ShiftSchedule")).toBe(2);
    expect((await q(`SELECT code FROM "LeaveType" WHERE "tenantId" = $1 ORDER BY code`, [t.id])).rows.map((x) => x.code)).toEqual(["LWOP", "SIL"]);
    expect(await count("Holiday")).toBe(HOLIDAY_COUNT);
    const maundy = (await q(`SELECT category, "proclamationReference" FROM "Holiday" WHERE "tenantId" = $1 AND date = '2027-03-25'`, [t.id])).rows[0];
    expect(maundy).toEqual({ category: "LEGAL", proclamationReference: "Proclamation No. 1427 (2026)" });
    expect(sent.ready.find((m) => m.to === mail("a"))?.v.companyCode).toBe(r.companyCode);
    const signup = (await q(`SELECT "verifiedAt", "provisionedTenantId" FROM "TenantSignup" WHERE email = $1`, [mail("a")])).rows[0];
    expect(signup.provisionedTenantId).toBe(t.id);
    expect(signup.verifiedAt).not.toBeNull();
  });

  it("S3 opening the link again shows the same company and creates nothing", async () => {
    const again = await verifySignup(token);
    expect(again.created).toBe(false);
    expect((await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE name = $1`, [input("a").companyName])).rows[0].n).toBe(1);
    expect(sent.ready.filter((m) => m.to === mail("a"))).toHaveLength(1);
  });

  it("S4 an expired or unknown link is refused", async () => {
    const r = await requestSignup(input("exp"), null);
    await expect(verifySignup(r.token!, null, new Date(Date.now() + 25 * 3600_000))).rejects.toMatchObject({ status: 410 });
    await expect(verifySignup("x".repeat(43))).rejects.toBeInstanceOf(SignupRefusal);
    await expect(verifySignup("x".repeat(43))).rejects.toMatchObject({ status: 400 });
  });

  it("S5 limits per IP and per email", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    await q(`DELETE FROM "TenantSignup" WHERE "ipAddress" = $1`, [ip]);
    for (let i = 0; i < 5; i++) expect((await requestSignup(input(`ip${i}`), ip)).sent).toBe(true);
    await expect(requestSignup(input("ip5"), ip)).rejects.toMatchObject({ status: 429 });
    await q(`DELETE FROM "TenantSignup" WHERE "ipAddress" = $1`, [ip]);

    for (let i = 0; i < 3; i++) expect((await requestSignup(input("same"), null)).sent).toBe(true);
    const before = sent.verify.filter((m) => m.to === mail("same")).length;
    expect((await requestSignup(input("same"), null)).sent).toBe(false);
    expect(sent.verify.filter((m) => m.to === mail("same")).length).toBe(before);
  });

  it("S6 seeding is idempotent; Central's create seeds the same rows", async () => {
    const again = await prismaAdmin.$transaction((tx) => seedTenantDefaults(tx, tenantId));
    expect(again).toEqual({ branches: 0, shifts: 0, leaveTypes: 0, holidays: 0 });

    const res = await centralCreate(new NextRequest("http://x/api/admin/tenants", { method: "POST", body: JSON.stringify({ name: `Central Co ${sfx}` }) }));
    expect(res.status).toBe(201);
    const id = (await res.json()).data.id as string;
    tenants.push(id);
    const n = (await q(`SELECT (SELECT count(*) FROM "Holiday" WHERE "tenantId" = $1)::int AS h, (SELECT count(*) FROM "Branch" WHERE "tenantId" = $1)::int AS b`, [id])).rows[0];
    expect(n).toEqual({ h: HOLIDAY_COUNT, b: 1 });
  });

  it("S7 the route: validation, consent, one answer; public paths and the login link", async () => {
    const post = (body: unknown) => signupPost(new NextRequest("http://x/api/signup", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "192.0.2.77" } }));
    const noConsent = await post({ ...input("route"), acceptTerms: false });
    expect(noConsent.status).toBe(400);
    expect((await noConsent.json()).details.fieldErrors.acceptTerms).toBeDefined();
    const short = await post({ ...input("route"), password: "short", acceptTerms: true });
    expect((await short.json()).details.fieldErrors.password[0]).toBe("Use at least 10 characters");
    const okRes = await post({ ...input("route"), acceptTerms: true });
    expect(okRes.status).toBe(202);
    expect(await okRes.json()).toMatchObject({ data: { email: mail("route") }, message: "Check your email for the confirmation link." });

    const proxy = readFileSync("src/proxy.ts", "utf8");
    for (const p of ["/signup", "/signup/verify", "/api/signup", "/api/signup/verify", "/forgot-password", "/reset-password"]) {
      expect(proxy).toContain(`path === "${p}"`);
    }
    expect(readFileSync("src/components/sentire-login/SentireLoginScreen.tsx", "utf8")).toContain('href="/signup"');
  });

  it("S8 the setup checklist ticks itself off", async () => {
    const first = await getSetupChecklist(tenantId);
    expect(first.map((s) => [s.key, s.done])).toEqual([["company", false], ["employees", false], ["schedules", false], ["run", false], ["publish", false]]);
    expect(first[0].detail).toContain("TIN, RDO code, registered address");
    await q(`UPDATE "Tenant" SET "tinNumber" = $2, "rdoCode" = '044', address = 'Marikina', "sssNumber" = '1', "philhealthNumber" = '2', "pagibigNumber" = '3' WHERE id = $1`, [tenantId, `9${sfx}`.slice(0, 12)]);
    const shift = (await q(`SELECT id FROM "ShiftSchedule" WHERE "tenantId" = $1 LIMIT 1`, [tenantId])).rows[0].id;
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "shiftScheduleId", "updatedAt") VALUES ($1, $2, 'E1', 'Ana', 'Cruz', '2026-11-02', $3, now())`, [`pay74e${sfx}`, tenantId, shift]);
    const next = await getSetupChecklist(tenantId);
    expect(next.map((s) => [s.key, s.done])).toEqual([["company", true], ["employees", true], ["schedules", true], ["run", false], ["publish", false]]);
  });

  it("S9 payroll_app holds the grants but sees no sign-up rows", async () => {
    const total = (await q(`SELECT count(*)::int AS n FROM "TenantSignup"`)).rows[0].n;
    expect(total).toBeGreaterThan(0);
    const grants = (await q(`SELECT has_table_privilege('payroll_app', '"TenantSignup"', 'SELECT') AS s, has_table_privilege('payroll_app', '"TenantSignup"', 'DELETE') AS d`)).rows[0];
    expect(grants).toEqual({ s: true, d: true });
    await q("BEGIN");
    try {
      await q("SET LOCAL ROLE payroll_app");
      expect((await q(`SELECT count(*)::int AS n FROM "TenantSignup"`)).rows[0].n).toBe(0);
      expect((await q(`UPDATE "TenantSignup" SET "verifiedAt" = now()`)).rowCount).toBe(0);
    } finally {
      await q("ROLLBACK");
    }
  });
});
