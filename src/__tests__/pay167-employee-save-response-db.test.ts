/**
 * PAY-167 (staging, 17 Nov 2026): saving an employee answered 500 although the
 * change was saved: the response held a BigInt (nontaxableBasicAmountCents)
 * that JSON cannot serialize. The same response would also have sent the
 * bcrypt hashes of the ESS and kiosk PINs back to the browser.
 *
 *   S1  (T1) PUT answers 200 and the change is saved.
 *   S2  the response has no PIN hashes (booleans instead) and the centavos
 *       field is a string, the same shape as GET.
 *   S3  a save that sends one field changes only that field. The update
 *       schema used to fill in the defaults of 23 others: tax classification,
 *       non-taxable basic, standard work days and hours, Attendance Exempt,
 *       Time Clock Needed, number of children, ...
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p167t${sfx}`;
const A = `p167a${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p167-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({
  requirePermission: vi.fn(async () => ({ ctx: auth })),
  checkPermission: vi.fn(async () => true),
}));

import { PUT } from "@/app/api/employees/[id]/route";

describeDb("PAY-167 saving an employee answers 200 with a safe body (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let res: Response;
  let body: { data: Record<string, unknown> };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P167${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "essPin", "kioskPinHash", "nontaxableBasicAmountCents",
                               "taxClassification", "standardWorkDays", "standardWorkHours", "attendanceExempt", "needsTimeClock", "numberOfChildren", "updatedAt")
       VALUES ($1, $2, $3, 'P167', 'Test', '2025-01-06', '$2b$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWX', '$2b$10$zyxwvutsrqponmlkjihgfeedcbaZYXWVUTSRQPONMLKJIHGFEDCB', 250000,
               'MWE', 26, 7, true, false, 2, now())`,
      [A, T, `P167-${sfx}`],
    );
    res = await PUT(
      new NextRequest(`http://test.local/api/employees/${A}`, { method: "PUT", body: JSON.stringify({ payFrequency: "BI_WEEKLY" }) }),
      { params: Promise.resolve({ id: A }) },
    );
    body = await res.json();
  });

  afterAll(async () => {
    // The audit entry is written after the response, so give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("S1 (T1) answers 200 and the change is saved", async () => {
    expect(res.status).toBe(200);
    const row = (await q(`SELECT "payFrequency" FROM "Employee" WHERE id = $1`, [A])).rows[0];
    expect(row.payFrequency).toBe("BI_WEEKLY");
  });

  it("S2 no PIN hashes in the response; centavos as a string", () => {
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/\$2b\$10\$/);
    expect(body.data).not.toHaveProperty("essPin");
    expect(body.data).not.toHaveProperty("kioskPinHash");
    expect(body.data.hasEssPin).toBe(true);
    expect(body.data.hasKioskPin).toBe(true);
    expect(body.data.nontaxableBasicAmountCents).toBe("250000");
  });

  it("S3 a one-field save leaves every other field as it was", async () => {
    const row = (await q(
      `SELECT "taxClassification", "standardWorkDays"::float AS days, "standardWorkHours"::float AS hours,
              "attendanceExempt", "needsTimeClock", "numberOfChildren", "nontaxableBasicAmountCents"::text AS nontax
         FROM "Employee" WHERE id = $1`,
      [A],
    )).rows[0];
    expect(row).toEqual({
      taxClassification: "MWE", days: 26, hours: 7, attendanceExempt: true, needsTimeClock: false, numberOfChildren: 2, nontax: "250000",
    });
  });
});
