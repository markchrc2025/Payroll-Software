/**
 * PAY-180 part 3 (Mark's ruling of 19 Nov 2026: "Yes, staging-only tool"):
 * the QA connector can give a seeded employee an ESS login and act as them,
 * with no credential passing through chat.
 *
 *   E1  (T1) create_ess_login takes a never-invited employee to ACTIVE through
 *       the real /api/ess/activate route, and the derived PIN signs in through
 *       the real /api/ess/auth route. The answer carries no PIN and no token.
 *   E2  a second call changes nothing (already active with the QA PIN).
 *   E3  an employee active with some other PIN is refused, and reset: true
 *       re-invites them and sets the QA PIN; the old link is retired.
 *       Times are UTC wall time like every Prisma DateTime (E1 checks the
 *       link's expiry; CI caught it stored 8 hours off in a Manila process).
 *   E4  every derived PIN passes the app's own PIN rules (pinProblem), for
 *       many employee numbers and birth dates, and depends on the secret.
 *   E5  ess_request refuses sign-in, activation and credential routes and
 *       anything outside /api/ess/; tokens and PINs are hidden in answers.
 *   E6  ess_request sends the session as a Bearer token, signs in again once
 *       on a 401, and keeps the session for later calls.
 *   E7  the connector lists both tools.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { pinProblem } from "@/lib/ess-pin-policy";
import { hashEssPin } from "@/lib/ess-auth";
import { POST as activateRoute } from "@/app/api/ess/activate/route";
import { POST as authRoute } from "@/app/api/ess/auth/route";
import {
  createEssClient,
  createEssLogin,
  deriveQaPin,
  essPathAllowed,
  redact,
} from "../../scripts/staging/ess-login.mjs";
import { TOOLS } from "../../scripts/staging/qa-mcp.mjs";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p180e${sfx}`;
const CODE = `P180E${sfx}`.toUpperCase();
const SECRET = "s".repeat(40);
const ENV = { DATABASE_URL: DB, QA_MCP_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const A = `p180ea${sfx}`;
const B = `p180eb${sfx}`;
const NUM_A = `QAE-${sfx}-1`;
const NUM_B = `QAE-${sfx}-2`;

const callRoute = async (route: (r: NextRequest) => Promise<Response>, path: string, body: unknown) => {
  const res = await route(new NextRequest(`http://test.local${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, ok: res.ok, body: await res.json() };
};
const postJson = (path: string, body: unknown) =>
  callRoute(path === "/api/ess/activate" ? activateRoute : authRoute, path, body);
const essSignIn = async (employeeNumber: string, pin: string, companyCode: string) => {
  const r = await callRoute(authRoute, "/api/ess/auth", { companyCode, employeeNumber, pin });
  if (!r.ok) throw new Error(`sign-in failed ${r.status}`);
  return r.body.data.token as string;
};
const deps = { postJson, essSignIn, companyCode: CODE };

describeDb("PAY-180 QA connector ESS logins (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const status = async (id: string) => (await q(`SELECT "essAccessStatus" s FROM "Employee" WHERE id = $1`, [id])).rows[0].s;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, CODE]);
    for (const [id, num] of [[A, NUM_A], [B, NUM_B]]) {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "birthDate", "updatedAt")
         VALUES ($1, $2, $3, 'QA', 'Ess', '2025-01-06', '1990-04-12', now())`,
        [id, T, num],
      );
    }
    // B already uses ESS with a PIN the tool did not set.
    await q(`UPDATE "Employee" SET "essAccessStatus" = 'ACTIVE', "essPin" = $2 WHERE id = $1`, [B, await hashEssPin("482916")]);
  });

  afterAll(async () => {
    await q(`DELETE FROM "EssSession" WHERE "employeeId" IN ($1, $2)`, [A, B]).catch(() => {});
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => {});
    await q(`DELETE FROM "EssInvite" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("E1 (T1) takes a never-invited employee to ACTIVE through the real routes, and returns no secret", async () => {
    expect(await status(A)).toBe("NOT_INVITED");
    const out = await createEssLogin({ employeeNumber: NUM_A }, ENV, deps);
    expect(out).toMatchObject({ employeeNumber: NUM_A, status: "ACTIVE", created: true });
    expect(await status(A)).toBe("ACTIVE");
    const used = await q(
      `SELECT "usedAt", extract(epoch FROM "expiresAt" - (now() AT TIME ZONE 'UTC')) AS secs FROM "EssInvite" WHERE "employeeId" = $1`,
      [A],
    );
    expect(used.rows.length).toBe(1);
    expect(used.rows[0].usedAt).not.toBeNull();
    // Stored as UTC wall time like every Prisma DateTime: about an hour ahead, whatever the process time zone.
    expect(Number(used.rows[0].secs)).toBeGreaterThan(3500);
    expect(Number(used.rows[0].secs)).toBeLessThanOrEqual(3600);
    const pin = deriveQaPin(SECRET, NUM_A, new Date("1990-04-12"));
    expect(await essSignIn(NUM_A, pin, CODE)).toMatch(/.{20,}/);
    expect(JSON.stringify(out)).not.toContain(pin);
  });

  it("E2 a second call changes nothing", async () => {
    const out = await createEssLogin({ employeeNumber: NUM_A }, ENV, deps);
    expect(out).toMatchObject({ status: "ACTIVE", created: false });
    expect((await q(`SELECT count(*)::int n FROM "EssInvite" WHERE "employeeId" = $1`, [A])).rows[0].n).toBe(1);
  });

  it("E3 an employee with another PIN is refused, and reset re-invites with the QA PIN", async () => {
    await expect(createEssLogin({ employeeNumber: NUM_B }, ENV, deps)).rejects.toThrow(/reset: true/);
    expect(await status(B)).toBe("ACTIVE");
    // An unused link from earlier must not survive the reset.
    await q(`INSERT INTO "EssInvite" (id, "tenantId", "employeeId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'UTC') + interval '1 day')`, [`old${sfx}`, T, B, `h${sfx}`]);
    const out = await createEssLogin({ employeeNumber: NUM_B, reset: true }, ENV, deps);
    expect(out).toMatchObject({ status: "ACTIVE", created: true });
    const old = await q(`SELECT "expiresAt" <= (now() AT TIME ZONE 'UTC') AS retired FROM "EssInvite" WHERE id = $1`, [`old${sfx}`]);
    expect(old.rows[0].retired).toBe(true);
    await expect(essSignIn(NUM_B, "482916", CODE)).rejects.toThrow();
  });

  it("E4 every derived PIN passes the app's PIN rules and depends on the secret", () => {
    for (let i = 0; i < 2000; i++) {
      const num = i % 3 === 0 ? String(100000 + i * 7) : `QA-${String(i).padStart(3, "0")}`;
      const birth = new Date(Date.UTC(1960 + (i % 45), i % 12, 1 + (i % 28)));
      const pin = deriveQaPin(SECRET, num, birth);
      expect(pinProblem(pin, { birthDate: birth, employeeNumber: num }), `${num} ${pin}`).toBeNull();
      expect(deriveQaPin(SECRET, num, birth)).toBe(pin);
    }
    expect(deriveQaPin("t".repeat(40), "QA-001")).not.toBe(deriveQaPin(SECRET, "QA-001"));
    expect(() => deriveQaPin("short", "QA-001")).toThrow();
  });

  it("E5 ess_request refuses credential routes and hides tokens", () => {
    for (const p of ["/api/ess/auth", "/api/ess/activate", "/api/ess/pin", "/api/ess/password", "/api/ess/reset-password",
      "/api/ess/forgot-password", "/api/ess/kiosk-pin", "/api/ess/webauthn/register", "/api/employees", "/api/ess/../auth/x", "/api/ess/auth?x=1"])
      expect(essPathAllowed(p), p).toBe(false);
    for (const p of ["/api/ess/dtr", "/api/ess/clock", "/api/ess/leaves?status=PENDING", "/api/ess/payslips/abc"])
      expect(essPathAllowed(p), p).toBe(true);
    expect(redact({ data: { token: "abc", items: [{ pin: "1", shipping: "kept", hasEssPin: true }] } }))
      .toEqual({ data: { token: "[hidden]", items: [{ pin: "[hidden]", shipping: "kept", hasEssPin: true }] } });
  });

  it("E6 sends a Bearer session, signs in again once on 401, and reuses the session", async () => {
    const calls: { url: string; auth: string }[] = [];
    let signIns = 0;
    let first = true;
    const request = createEssClient(ENV, {
      companyCode: CODE,
      essSignIn: async () => `tok${++signIns}`,
      fetch: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ url, auth: init.headers.authorization });
        if (first) { first = false; return new Response("{}", { status: 401 }); }
        return new Response(JSON.stringify({ data: { token: "leak", ok: 1 } }), { status: 200 });
      },
    });
    const r = await request({ employeeNumber: NUM_A, method: "GET", path: "/api/ess/dtr" });
    expect(r).toEqual({ status: 200, ok: true, body: { data: { token: "[hidden]", ok: 1 } } });
    expect(calls.map((c) => c.auth)).toEqual(["Bearer tok1", "Bearer tok2"]);
    await request({ employeeNumber: NUM_A, method: "GET", path: "/api/ess/clock" });
    expect(signIns).toBe(2);
    await expect(request({ employeeNumber: NUM_A, method: "POST", path: "/api/ess/auth" })).rejects.toThrow(/not sign-in/);
  });

  it("E7 the connector lists both tools", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("create_ess_login");
    expect(names).toContain("ess_request");
  });
});
