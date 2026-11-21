/**
 * Wave A1 (PAY-208) against real Postgres: the payout bank comes from the
 * company's Bank list (decision 4); ethnicity and religion sit behind consent
 * and the sensitive-data permission (decision 5).
 *
 *   D1  a role with only EMPLOYEES:READ sees ethnicity and religion blanked;
 *       a role with SENSITIVE_DATA:READ sees them (fails on main: no
 *       SENSITIVE_DATA permission module).
 *   D2  a role without SENSITIVE_DATA:UPDATE cannot record them (403), and the
 *       blanks the edit form echoes back do not wipe what is on file.
 *   D3  recording needs consent noted; a value must be in the company's list;
 *       withdrawing consent clears all four fields.
 *   D4  the bank picked from the list sets bankId and copies its name to
 *       bankName; another company's item is refused; null clears the pick.
 *   D5  an approved ESS request for bankCode sets the bank from the list
 *       (before: Prisma refused the unknown column bankCode).
 *   D6  creating an employee follows the same rules.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wa1t${sfx}`;
const T2 = `wa1o${sfx}`;
const U = `wa1u${sfx}`;
const EMP = `wa1e${sfx}`;
const R = { reader: `wa1r${sfx}`, viewer: `wa1v${sfx}`, writer: `wa1w${sfx}` };

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: null as string | null, employeeId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as getEmp, PUT as putEmp } from "@/app/api/employees/[id]/route";
import { POST as createEmp } from "@/app/api/employees/route";
import { POST as approvePur } from "@/app/api/profile-update-requests/[id]/approve/route";

const ctx = { params: Promise.resolve({ id: EMP }) };
const put = (body: unknown) => putEmp(new NextRequest(`http://localhost/api/employees/${EMP}`, { method: "PUT", body: JSON.stringify(body) }), ctx);
const get = async () => (await (await getEmp(new NextRequest(`http://localhost/api/employees/${EMP}`), ctx)).json()).data;

describeDb("Wave A1 bank and sensitive data (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const row = async () => (await q(`SELECT ethnicity, religion, "spouseReligion", "sensitiveDataConsentAt", "sensitiveDataConsentByUserId", "bankId", "bankName" FROM "Employee" WHERE id = $1`, [EMP])).rows[0];
  const item = async (tenant: string, list: string, code: string, name: string) =>
    (await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, "updatedAt") VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`, [`wa1i${randomBytes(4).toString("hex")}`, tenant, list, code, name])).rows[0].id as string;
  const as = (role: keyof typeof R) => { auth.roleId = R[role]; };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    for (const [id, code] of [[T, "A"], [T2, "B"]]) {
      await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [id, `WA1${code}${sfx}`.toUpperCase()]);
    }
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'HR', now())`, [U, T, `hr${sfx}@t.test`]);
    const perms: Record<keyof typeof R, [string, string][]> = {
      reader: [["EMPLOYEES", "READ"], ["EMPLOYEES", "UPDATE"], ["EMPLOYEES", "CREATE"], ["EMPLOYEES", "APPROVE"]],
      viewer: [["EMPLOYEES", "READ"], ["SENSITIVE_DATA", "READ"]],
      writer: [["EMPLOYEES", "READ"], ["EMPLOYEES", "UPDATE"], ["EMPLOYEES", "CREATE"], ["SENSITIVE_DATA", "UPDATE"]],
    };
    for (const [k, id] of Object.entries(R) as [keyof typeof R, string][]) {
      await q(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, $3, now())`, [id, T, k]);
      for (const [m, a] of perms[k]) {
        await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = $2::"PermissionModule" AND action = $3::"PermissionAction"`, [id, m, a]);
      }
    }
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", ethnicity, religion, "sensitiveDataConsentAt", "updatedAt")
             VALUES ($1, $2, 'E-1', 'Ana', 'Cruz', '2025-01-06', 'Ilocano', 'Islam', '2026-11-01', now())`, [EMP, T]);
    await q(`INSERT INTO "Branch" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Main', now())`, [`wa1b${sfx}`, T]);
    await item(T, "ETHNICITY", "ILO", "Ilocano");
    await item(T, "ETHNICITY", "TAG", "Tagalog");
    await item(T, "RELIGION", "ISL", "Islam");
    await item(T, "RELIGION", "RC", "Roman Catholic");
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "ProfileUpdateRequest" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["Placement", "EmploymentTerm", "StatutoryId"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Branch" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "LookupItem" WHERE "tenantId" = ANY($1)`, [[T, T2]]);
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = ANY($1)`, [Object.values(R)]);
    await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[T, T2]]);
    await admin.end();
  });

  it("D1 hidden without the permission, shown with it", async () => {
    as("reader");
    const hidden = await get();
    expect(hidden).toMatchObject({ ethnicity: null, religion: null, sensitiveHidden: true });
    as("viewer");
    expect(await get()).toMatchObject({ ethnicity: "Ilocano", religion: "Islam", sensitiveHidden: false });
  });

  it("D2 no recording without the permission; echoed blanks keep what is on file", async () => {
    as("reader");
    const refused = await put({ religion: "Roman Catholic" });
    expect(refused.status).toBe(403);
    const echoed = await put({ firstName: "Anna", ethnicity: null, religion: "", spouseReligion: null });
    expect(echoed.status).toBe(200);
    expect((await echoed.json()).data).toMatchObject({ ethnicity: null, religion: null, sensitiveHidden: true });
    expect(await row()).toMatchObject({ ethnicity: "Ilocano", religion: "Islam" });
  });

  it("D3 consent, the list, withdrawal", async () => {
    as("writer");
    await q(`UPDATE "Employee" SET "sensitiveDataConsentAt" = NULL WHERE id = $1`, [EMP]);
    const noConsent = await put({ religion: "Roman Catholic" });
    expect(noConsent.status).toBe(422);
    expect((await noConsent.json()).error).toContain("consent");
    const notInList = await put({ religion: "Jedi", sensitiveDataConsent: true });
    expect(notInList.status).toBe(422);
    expect((await notInList.json()).error).toContain("Religion list");
    expect((await row()).sensitiveDataConsentAt).toBeNull();

    const saved = await put({ religion: "roman catholic", ethnicity: "Ilocano", sensitiveDataConsent: true });
    expect(saved.status).toBe(200);
    const r = await row();
    expect(r).toMatchObject({ religion: "Roman Catholic", ethnicity: "Ilocano", sensitiveDataConsentByUserId: U });
    expect(r.sensitiveDataConsentAt).toBeInstanceOf(Date);

    const withdrawn = await put({ sensitiveDataConsent: false });
    expect(withdrawn.status).toBe(200);
    expect(await row()).toMatchObject({ ethnicity: null, religion: null, spouseReligion: null, sensitiveDataConsentAt: null });
  });

  it("D4 the bank from the list", async () => {
    as("reader");
    const bdo = await item(T, "BANK", "BDO", "BDO Unibank");
    const theirs = await item(T2, "BANK", "BPI", "BPI");
    const res = await put({ bankId: bdo });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ bankId: bdo, bankName: "BDO Unibank" });
    const foreign = await put({ bankId: theirs });
    expect(foreign.status).toBe(422);
    expect(await row()).toMatchObject({ bankId: bdo });
    await put({ bankId: null });
    expect(await row()).toMatchObject({ bankId: null, bankName: "BDO Unibank" });
  });

  it("D5 an approved ESS bankCode request sets the bank", async () => {
    as("reader");
    const gcash = await item(T, "BANK", "GCASH", "GCash");
    const id = `wa1p${sfx}`;
    await q(`INSERT INTO "ProfileUpdateRequest" (id, "tenantId", "employeeId", field, "newValue", "updatedAt") VALUES ($1, $2, $3, 'bankCode', 'gcash', now())`, [id, T, EMP]);
    const res = await approvePur(new NextRequest(`http://localhost/api/profile-update-requests/${id}/approve`, { method: "POST" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ bankId: gcash, bankName: "GCash" });
  });

  it("D6 creating follows the same rules", async () => {
    const body = { firstName: "Ben", lastName: "Reyes", hireDate: "2026-11-02", basicSalary: 20000, branchId: `wa1b${sfx}`, religion: "Islam" };
    as("reader");
    const refused = await createEmp(new NextRequest("http://localhost/api/employees", { method: "POST", body: JSON.stringify(body) }));
    expect(refused.status).toBe(403);
    as("writer");
    const noConsent = await createEmp(new NextRequest("http://localhost/api/employees", { method: "POST", body: JSON.stringify(body) }));
    expect(noConsent.status).toBe(422);
    const ok = await createEmp(new NextRequest("http://localhost/api/employees", { method: "POST", body: JSON.stringify({ ...body, sensitiveDataConsent: true }) }));
    expect(ok.status).toBe(201);
    const id = (await ok.json()).data.id;
    const r = (await q(`SELECT religion, "sensitiveDataConsentAt" FROM "Employee" WHERE id = $1`, [id])).rows[0];
    expect(r.religion).toBe("Islam");
    expect(r.sensitiveDataConsentAt).toBeInstanceOf(Date);
  });
});
