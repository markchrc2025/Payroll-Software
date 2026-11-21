/**
 * Wave B (PAY-212) against real Postgres: the company-wide background pages,
 * and ESS self-entry through Profile Requests (decision 7).
 *
 *   D1  Training lists current employees' trainings with Expired, Expiring
 *       (within the window), Valid and No expiry; a separated employee is
 *       left out (fails on main: no /api/background route).
 *   D2  Legal Documents lists documents with their expiry status, hides a
 *       confidential document's title, and adds a Missing row for every
 *       required category an employee has no document for.
 *   D3  Education and Experience list the records with the employee.
 *   D4  an employee files their own education in ESS; it is a pending Profile
 *       Request, not a record, until HR approves; approval creates it; a bad
 *       entry is refused when filed; HR cannot approve their own request.
 *   D5  an approved birth date request is saved as a date (it failed before).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wbt${sfx}`;
const U = `wbu${sfx}`;
const E = { ana: `wba${sfx}`, ben: `wbb${sfx}`, gone: `wbg${sfx}`, hr: `wbh${sfx}` };

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { GET as background } from "@/app/api/background/[kind]/route";
import { POST as essFile } from "@/app/api/ess/background/[kind]/route";
import { POST as approve } from "@/app/api/profile-update-requests/[id]/approve/route";

const table = async (kind: string, qs = "asOf=2026-11-21&withinDays=60") =>
  (await (await background(new NextRequest(`http://localhost/api/background/${kind}?${qs}`), { params: Promise.resolve({ kind }) })).json()).data;
const doApprove = (id: string) => approve(new NextRequest(`http://localhost/x/${id}/approve`, { method: "POST" }), { params: Promise.resolve({ id }) });

describeDb("Wave B background pages and ESS self-entry (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = U; ess.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WB${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    for (const [id, num, last, status, user] of [[E.ana, "A-1", "Abad", "REGULAR", null], [E.ben, "B-2", "Bautista", "PROBATIONARY", null], [E.gone, "G-3", "Gomez", "RESIGNED", null], [E.hr, "H-9", "Herrera", "REGULAR", U]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "userId", "updatedAt") VALUES ($1, $2, $3, 'X', $4, '2025-01-06', $5::"EmploymentStatus", $6, now())`, [id, T, num, last, status, user]);
    }
    const tr = (id: string, emp: string, title: string, exp: string | null) =>
      q(`INSERT INTO "EmployeeTraining" (id, "tenantId", "employeeId", title, "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())`, [id, T, emp, title, exp]);
    await tr(`wbt1${sfx}`, E.ana, "First aid", "2026-11-20");
    await tr(`wbt2${sfx}`, E.ana, "Fire safety", "2027-01-20");
    await tr(`wbt3${sfx}`, E.ben, "OSH", "2027-06-30");
    await tr(`wbt4${sfx}`, E.ben, "Excel", null);
    await tr(`wbt5${sfx}`, E.gone, "Forklift", "2026-01-01");
    await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, attributes, "updatedAt") VALUES
      ($1, $2, 'DOCUMENT_CATEGORY', 'CONTRACT', 'Employment contract', '{"requiredForNewHires": true, "isConfidentialByDefault": true}', now()),
      ($3, $2, 'DOCUMENT_CATEGORY', 'NBI', 'NBI clearance', '{"requiredForNewHires": true, "requiresExpiry": true}', now())`, [`wbc1${sfx}`, T, `wbc2${sfx}`]);
    const doc = (id: string, emp: string, cat: string, catId: string, title: string, exp: string | null, conf: boolean) =>
      q(`INSERT INTO "EmployeeDocument" (id, "tenantId", "employeeId", category, "categoryId", title, "storageKey", "fileName", "mimeType", "fileSize", "expiresAt", "isConfidential", "updatedAt")
         VALUES ($1, $2, $3, $4::"DocumentCategory", $5, $6, 'k', 'f.pdf', 'application/pdf', 1, $7, $8, now())`, [id, T, emp, cat, catId, title, exp, conf]);
    await doc(`wbd1${sfx}`, E.ana, "CONTRACT", `wbc1${sfx}`, "Contract 2025", null, true);
    await doc(`wbd2${sfx}`, E.ana, "OTHER", `wbc2${sfx}`, "NBI 2026", "2026-12-15", false);
    await q(`INSERT INTO "EmployeeEducation" (id, "tenantId", "employeeId", school, degree, "startYear", "endYear", "updatedAt") VALUES ($1, $2, $3, 'UP Diliman', 'BS Accountancy', 2014, 2018, now())`, [`wbe1${sfx}`, T, E.ben]);
    await q(`INSERT INTO "EmployeeWorkExperience" (id, "tenantId", "employeeId", "companyName", position, "startDate", "updatedAt") VALUES ($1, $2, $3, 'SGV', 'Auditor', '2018-06-01', now())`, [`wbx1${sfx}`, T, E.ana]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["ProfileUpdateRequest", "EmployeeTraining", "EmployeeDocument", "EmployeeEducation", "EmployeeWorkExperience"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "LookupItem" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 training with expiry status, current employees only", async () => {
    const t = await table("training");
    expect(t.rows.map((r: Record<string, string>) => [r.employeeNumber, r.title, r.status])).toEqual([
      ["A-1", "First aid", "Expired"], ["A-1", "Fire safety", "Expiring"],
      ["B-2", "OSH", "Valid"], ["B-2", "Excel", "No expiry"],
    ]);
    expect(t.counts).toEqual({ Expired: 1, Expiring: 1, Valid: 1, "No expiry": 1 });
    const narrow = await table("training", "asOf=2026-11-21&withinDays=30");
    expect(narrow.rows.find((r: Record<string, string>) => r.title === "Fire safety").status).toBe("Valid");
  });

  it("D2 legal documents and what is missing", async () => {
    const t = await table("legal-documents");
    const rows = t.rows.map((r: Record<string, string | null>) => [r.employeeNumber, r.category, r.title, r.status]);
    expect(rows).toEqual(expect.arrayContaining([
      ["A-1", "Employment contract", "Confidential", "On file"],
      ["A-1", "NBI clearance", "NBI 2026", "Expiring"],
      ["B-2", "Employment contract", null, "Missing"],
      ["B-2", "NBI clearance", null, "Missing"],
      ["H-9", "Employment contract", null, "Missing"],
    ]));
    expect(rows.some((r: (string | null)[]) => r[0] === "G-3")).toBe(false);
    expect(t.counts.Missing).toBe(4);
  });

  it("D3 education and experience", async () => {
    const edu = await table("education");
    expect(edu.rows).toEqual([expect.objectContaining({ employeeNumber: "B-2", school: "UP Diliman", degree: "BS Accountancy", years: "2014 to 2018" })]);
    const exp = await table("experience");
    expect(exp.rows).toEqual([expect.objectContaining({ employeeNumber: "A-1", companyName: "SGV", position: "Auditor", startDate: "2018-06-01", endDate: "present" })]);
  });

  it("D4 ESS self-entry through Profile Requests", async () => {
    ess.employeeId = E.ben;
    const bad = await essFile(new NextRequest("http://localhost/api/ess/background/education", { method: "POST", body: JSON.stringify({ degree: "MBA" }) }), { params: Promise.resolve({ kind: "education" }) });
    expect(bad.status).toBe(422);
    const res = await essFile(new NextRequest("http://localhost/api/ess/background/education", { method: "POST", body: JSON.stringify({ school: "Ateneo GSB", degree: "MBA", startYear: "2022", endYear: "2024" }) }), { params: Promise.resolve({ kind: "education" }) });
    expect(res.status).toBe(201);
    const pur = (await res.json()).data;
    expect(pur).toMatchObject({ field: "background.education", status: "PENDING" });
    expect((await table("education")).rows).toHaveLength(1);
    const ap = await doApprove(pur.id);
    expect(ap.status).toBe(200);
    const edu = (await table("education")).rows.map((r: Record<string, string>) => r.school).sort();
    expect(edu).toEqual(["Ateneo GSB", "UP Diliman"]);

    ess.employeeId = E.hr;
    const own = (await (await essFile(new NextRequest("http://localhost/api/ess/background/training", { method: "POST", body: JSON.stringify({ title: "CPA review" }) }), { params: Promise.resolve({ kind: "training" }) })).json()).data;
    const self = await doApprove(own.id);
    expect(self.status).toBe(403);
  });

  it("D5 an approved birth date is saved", async () => {
    const id = `wbp${sfx}`;
    await q(`INSERT INTO "ProfileUpdateRequest" (id, "tenantId", "employeeId", field, "newValue", "updatedAt") VALUES ($1, $2, $3, 'birthDate', '1994-03-07', now())`, [id, T, E.ana]);
    expect((await doApprove(id)).status).toBe(200);
    expect((await q(`SELECT "birthDate"::date::text d FROM "Employee" WHERE id = $1`, [E.ana])).rows[0].d).toBe("1994-03-07");
  });
});
