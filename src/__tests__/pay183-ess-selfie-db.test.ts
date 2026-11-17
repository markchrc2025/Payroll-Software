/**
 * PAY-183 (ESS sandbox test, 18 Nov 2026): Mark, 18 Nov: the selfie is
 * required for ESS time in and time out. In the sandbox the selfie upload
 * answered 503 (no object storage), the app recorded the punch anyway with no
 * photo and still said "selfie verified"; a first punch without consent just
 * failed with "Consent required" and nothing to do about it.
 *
 *   S1  (T1) a punch with no selfie is refused (422, SELFIE_REQUIRED).
 *   S2  a punch with the photo itself (no object storage) is kept with the
 *       photo on the punch; the Attendance Logs detail says it has a selfie.
 *   S3  no consent yet: 403 with code CONSENT_REQUIRED, which the clock
 *       screen turns into an "I agree, record it" button that records the
 *       consent and then the punch.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p183t${sfx}`;
const id = (s: string) => `p183${s}${sfx}`;
const A = id("a");

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { POST as clock } from "@/app/api/ess/clock/route";

/** A few bytes standing in for a JPEG (the route stores what it is sent). */
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

describeDb("PAY-183 ESS clock requires a selfie and keeps it without storage (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const post = (body: unknown) =>
    clock(new NextRequest("http://test.local/api/ess/clock", { method: "POST", body: JSON.stringify(body) }));
  const logs = async () =>
    (await q(`SELECT "punchType", "selfieKey", "selfieData" FROM "AttendanceLog" WHERE "employeeId" = $1`, [A])).rows;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    ess.employeeId = A;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P183${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt")
       VALUES ($1, $2, $3, 'P183', 'Test', '2025-01-06', now())`,
      [A, T, `P183-${sfx}`],
    );
  });

  afterAll(async () => {
    for (const t of ["DTRRecord", "AttendanceLog", "ConsentRecord"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("S1 (T1) a punch with no selfie is refused", async () => {
    const res = await post({ punchType: "IN" });
    expect(res.status).toBe(422);
    expect((await res.json()).details).toEqual({ code: "SELFIE_REQUIRED" });
    expect(await logs()).toEqual([]);
  });

  it("S3 no consent yet: 403 CONSENT_REQUIRED, and the clock screen offers to agree and record", async () => {
    const res = await post({ punchType: "IN", selfieData: PHOTO.toString("base64") });
    expect(res.status).toBe(403);
    expect((await res.json()).details).toEqual({ code: "CONSENT_REQUIRED" });
    const hook = readFileSync("src/components/ess/use-selfie-clock.ts", "utf8");
    expect(hook).toMatch(/CONSENT_REQUIRED/);
    expect(hook).toMatch(/BIOMETRIC_SELFIE", "GEOLOCATION"/);
    for (const f of ["src/components/ess/Clock.tsx", "src/components/ess/EssDesktopApp.tsx"])
      expect(readFileSync(f, "utf8"), f).toMatch(/needsConsent \? agreeAndConfirm : confirm/);
  });

  it("S2 the photo sent with the punch is kept on the punch", async () => {
    await q(
      `INSERT INTO "ConsentRecord" (id, "tenantId", "employeeId", type, granted, "policyVersion")
       VALUES ($1, $2, $3, 'BIOMETRIC_SELFIE', true, 'v2026-01')`,
      [id("c"), T, A],
    );
    const res = await post({ punchType: "IN", selfieData: PHOTO.toString("base64") });
    expect(res.status).toBe(201);
    const rows = await logs();
    expect(rows).toHaveLength(1);
    expect(rows[0].punchType).toBe("IN");
    expect(rows[0].selfieKey).toBeNull();
    expect(Buffer.compare(rows[0].selfieData, PHOTO)).toBe(0);
    // The browser falls back to sending the photo when the upload fails.
    expect(readFileSync("src/components/ess/use-selfie-clock.ts", "utf8")).toMatch(
      /if \(!selfieKey\) selfieData = await blobToBase64\(shot\.blob\)/,
    );
  });
});
