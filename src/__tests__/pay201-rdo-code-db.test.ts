/**
 * PAY-201 against real Postgres: the RDO Code is stored on the company and on
 * the employee, in BIR's spelling, and the BIR loaders hand it to the forms.
 *
 *   D1  Settings: "43a" is stored as 43A; a code BIR does not list is
 *       refused (422) and the stored code is unchanged; "" clears it
 *       (fails on main: no column).
 *   D2  the withholding agent the 1601-C and 1604-C are built from carries
 *       the company's code.
 *   D3  the employee row the 2316 is built from carries the employee's code.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p201t${sfx}`;
const EMP = `p201e${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));

import { PATCH as patchTenant } from "@/app/api/settings/tenant/route";
import { withTenant } from "@/lib/with-tenant";
import { BIR_EMPLOYEE_SELECT, loadWithholdingAgent, personOf } from "@/lib/payroll/reports/bir-data";

const patch = (body: unknown) =>
  patchTenant(new NextRequest("http://localhost/api/settings/tenant", {
    method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));

describeDb("PAY-201 RDO Code (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const stored = async () => (await q(`SELECT "rdoCode" FROM "Tenant" WHERE id = $1`, [T])).rows[0].rdoCode;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala Trading Inc.', $2, now())`, [T, `P201${sfx}`.toUpperCase()]);
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "rdoCode", "updatedAt")
       VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2026-01-05', '043', now())`,
      [EMP, T],
    );
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "Employee" WHERE id = $1`, [EMP]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 Settings stores BIR's spelling and refuses a code BIR does not list", async () => {
    const ok = await patch({ rdoCode: "43a" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.rdoCode).toBe("43A");
    expect(await stored()).toBe("43A");

    const bad = await patch({ rdoCode: "999" });
    expect(bad.status).toBe(422);
    expect(await stored()).toBe("43A");

    expect((await patch({ name: "Tala Trading Inc." })).status).toBe(200);
    expect(await stored()).toBe("43A");

    expect((await patch({ rdoCode: "" })).status).toBe(200);
    expect(await stored()).toBeNull();
  });

  it("D2 the withholding agent carries the company's code", async () => {
    await patch({ rdoCode: "17A" });
    const agent = await withTenant(T, (tx) => loadWithholdingAgent(tx, T));
    expect(agent.rdoCode).toBe("17A");
  });

  it("D3 the 2316 person carries the employee's code", async () => {
    const e = await withTenant(T, (tx) => tx.employee.findUniqueOrThrow({ where: { id: EMP }, select: BIR_EMPLOYEE_SELECT }));
    expect(personOf(e, 2026, null, new Map(), null).rdoCode).toBe("043");
  });
});
