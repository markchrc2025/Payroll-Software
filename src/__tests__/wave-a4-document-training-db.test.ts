/**
 * Wave A4 (PAY-211) against real Postgres: documents take their category
 * from Document Categories; trainings their course and trainer from Courses
 * and Trainers.
 *
 *   D1  a document filed under a category links its item and keeps the enum
 *       for a built-in one, OTHER for a company-added one; a category's
 *       "confidential by default" applies when the upload does not say
 *       (fails on main: no categoryId column).
 *   D2  a category with an expiry date refuses an upload without one.
 *   D3  a training picked from a course takes its name, provider and hours,
 *       and expires the course's validity after the training date; values
 *       the form gives win.
 *   D4  another company's course or trainer is refused.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wa4t${sfx}`;
const T2 = `wa4o${sfx}`;
const U = `wa4u${sfx}`;
const EMP = `wa4e${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as addDoc } from "@/app/api/employees/[id]/documents/route";
import { POST as addTraining } from "@/app/api/employees/[id]/training/route";

const ctx = { params: Promise.resolve({ id: EMP }) };
const doc = (body: Record<string, unknown>) =>
  addDoc(new NextRequest(`http://localhost/api/employees/${EMP}/documents`, { method: "POST", body: JSON.stringify({
    title: "File", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 100,
    storageKey: `tenants/${T}/employees/${EMP}/documents/a.pdf`, ...body,
  }) }), ctx);
const training = (body: Record<string, unknown>) =>
  addTraining(new NextRequest(`http://localhost/api/employees/${EMP}/training`, { method: "POST", body: JSON.stringify(body) }), ctx);

describeDb("Wave A4 document categories, courses and trainers (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};
  const item = async (tenant: string, list: string, code: string, name: string, attributes: Record<string, unknown> = {}) => {
    const id = `wa4i${randomBytes(4).toString("hex")}`;
    await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, attributes, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())`, [id, tenant, list, code, name, JSON.stringify(attributes)]);
    return id;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    for (const [id, c] of [[T, "A"], [T2, "B"]]) await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [id, `WA4${c}${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-1', 'Ana', 'Cruz', '2025-01-06', now())`, [EMP, T]);
    ids.contract = await item(T, "DOCUMENT_CATEGORY", "CONTRACT", "Employment contract", { isConfidentialByDefault: true });
    ids.nbi = await item(T, "DOCUMENT_CATEGORY", "NBI_CLEARANCE", "NBI clearance", { requiresExpiry: true });
    ids.osh = await item(T, "COURSE", "OSH40", "Basic OSH (40 hours)", { provider: "DOLE-accredited STO", defaultHours: 40, certificateValidityMonths: 24 });
    ids.trainer = await item(T, "TRAINER", "RG", "Rosa Garcia", { kind: "EXTERNAL" });
    ids.theirCourse = await item(T2, "COURSE", "X", "Theirs");
    ids.theirTrainer = await item(T2, "TRAINER", "Y", "Theirs");
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500)); // the audit rows are written without waiting
    await q(`DELETE FROM "EmployeeDocument" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "EmployeeTraining" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "LookupItem" WHERE "tenantId" = ANY($1)`, [[T, T2]]);
    await q(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[T, T2]]);
    await admin.end();
  });

  it("D1 the category from the list, with its confidential default", async () => {
    const res = await doc({ categoryId: ids.contract });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ category: "CONTRACT", categoryId: ids.contract, isConfidential: true });
    const open = await doc({ categoryId: ids.contract, isConfidential: false });
    expect((await open.json()).data.isConfidential).toBe(false);
    const custom = await doc({ categoryId: ids.nbi, expiresAt: "2027-05-31" });
    const c = (await custom.json()).data;
    expect(c).toMatchObject({ category: "OTHER", categoryId: ids.nbi, isConfidential: false });
    expect(new Date(c.expiresAt).toISOString().slice(0, 10)).toBe("2027-05-31");
  });

  it("D2 an expiry date where the category needs one", async () => {
    const res = await doc({ categoryId: ids.nbi });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("NBI clearance documents need an expiry date");
  });

  it("D3 a course fills the training", async () => {
    const res = await training({ courseId: ids.osh, trainerId: ids.trainer, trainingDate: "2026-01-31" });
    expect(res.status).toBe(201);
    const t = (await res.json()).data;
    expect(t).toMatchObject({ title: "Basic OSH (40 hours)", provider: "DOLE-accredited STO", hours: 40, courseId: ids.osh, trainerId: ids.trainer });
    expect(new Date(t.expiresAt).toISOString().slice(0, 10)).toBe("2028-01-31");
    const own = await training({ courseId: ids.osh, title: "OSH refresher", hours: 8, trainingDate: "2026-02-28", expiresAt: "2026-12-31" });
    const o = (await own.json()).data;
    expect(o).toMatchObject({ title: "OSH refresher", hours: 8 });
    expect(new Date(o.expiresAt).toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("D4 another company's course or trainer is refused", async () => {
    expect((await training({ courseId: ids.theirCourse })).status).toBe(422);
    const res = await training({ title: "X", trainerId: ids.theirTrainer });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Trainers");
  });
});
