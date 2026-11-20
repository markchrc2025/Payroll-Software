/**
 * PAY-150 (Mark, 16 Nov 2026 20:55, HR.my review D2c): guardrails on Other
 * Deductions.
 *  - Every Other Deduction needs the employee's written authorization on file
 *    (date and uploaded copy); the run refuses a deduction without one.
 *  - A loss or damage (inventory) deduction needs an incident record showing
 *    the employee was heard and responsibility shown; it never recovers more
 *    than the actual loss; each run takes at most 20% of the period's wages
 *    and carries the rest to the next payday.
 *
 * Employee: monthly 30,000.00, semi-monthly, second cutoffs (no
 * contributions): basic 15,000.00, tax 687.45, net 14,312.55 before
 * deductions. 20% of the period's wages = 3,000.00.
 *
 *   G1  (T1) a deduction with no authorization on file is refused: nothing is
 *       deducted and the sheet says why (it was deducted before).
 *   G2  with the date and the uploaded copy on file it is deducted.
 *   G3  a loss or damage deduction is refused without an incident record, and
 *       with one where the employee has not been heard.
 *   G4  actual loss 7,000.00: the runs take 3,000.00, 3,000.00 and 1,000.00,
 *       carrying the rest each time, and then nothing more.
 *   G5  the API refuses another company's file, another employee's incident,
 *       and authorization details on an earning.
 *   G6  the Compensation tab has the panel and the run page lists refusals.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p150t${sfx}`;
const id = (s: string) => `p150${s}${sfx}`;
const E = id("emp");
const OTHER = id("other");

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as assign } from "@/app/api/employees/[id]/pay-components/route";
import { PATCH as patchAssignment } from "@/app/api/employees/[id]/pay-components/[assignmentId]/route";
import { createDraftRun, finalizeRun, recomputeRun, NO_AUTHORIZATION, NO_INCIDENT } from "@/lib/payroll/persist";
import { deductionProblem } from "@/components/employees/EmployeePayComponents";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const req = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const FILE = `tenants/${T}/deduction-authorizations/3f0c1a52-1111-4222-8333-444455556666.pdf`;

describeDb("PAY-150 Other Deductions guardrails (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const comp = (key: string, name: string, loss = false) =>
    q(
      `INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "isLossOrDamage", "updatedAt") VALUES ($1, $2, $3, $4, 'DEDUCTION', 'NON_TAXABLE', $5, now())`,
      [id(key), T, key.toUpperCase(), name, loss],
    );
  const post = async (body: Record<string, unknown>, emp = E) => {
    const r = await assign(req(`/api/employees/${emp}/pay-components`, "POST", body), { params: Promise.resolve({ id: emp }) });
    return { status: r.status, json: await r.json() };
  };
  const patch = async (assignmentId: string, body: Record<string, unknown>) =>
    (await patchAssignment(req(`/api/employees/${E}/pay-components/${assignmentId}`, "PATCH", body), { params: Promise.resolve({ id: E, assignmentId }) })).status;
  const sheet = async (book: string) =>
    (await q(`SELECT "netPayCents"::text net, "adjustmentDeductionsCents"::text ded, "payComponentsApplied" applied FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`, [book, E]))
      .rows[0] as { net: string; ded: string; applied: { name: string; amountCents: string; refusedReason?: string; deferredCents?: string }[] };
  const run = async (start: string, end: string) =>
    (await createDraftRun({ tenantId: T, periodStart: d(start), periodEnd: d(end), cycle: "SEMI_MONTHLY", runType: "REGULAR" })).id;

  let uniform = "";
  let inventory = "";
  let oct = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P150${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p150-${cat}`, JSON.stringify(payload)],
      );
    }
    for (const e of [E, OTHER]) {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
         VALUES ($1, $2, $1, 'P150', $1, '2025-01-06', false, now())`,
        [e, T],
      );
    }
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 3000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    await comp("uniform", "Uniform");
    await comp("inv", "Inventory Deduction", true);
    await q(
      `INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "updatedAt") VALUES ($1, $2, 'RICE', 'Rice', 'ALLOWANCE', 'NON_TAXABLE', now())`,
      [id("rice"), T],
    );
    const inc = (key: string, emp: string, heard: boolean) =>
      q(
        `INSERT INTO "IncidentReport" (id, "tenantId", "employeeId", type, subject, description, "incidentDate", "employeeResponse", resolution, "updatedAt")
         VALUES ($1, $2, $3, 'INCIDENT_REPORT', 'Stock shortage', 'Count short by 7,000', '2026-09-05', $4, $5, now())`,
        [id(key), T, emp, heard ? "I accept the count." : null, heard ? "Employee found responsible." : null],
      );
    await inc("heard", E, true);
    await inc("open", E, false);
    await inc("theirs", OTHER, true);
  });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeePayComponent", "IncidentReport", "PayComponent", "AuditLog", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("G1 (T1) a deduction with no authorization on file is refused", async () => {
    const a = await post({ payComponentId: id("uniform"), amount: "500.00", effectiveFrom: "2026-09-01" });
    expect(a.status).toBe(201);
    uniform = a.json.data.id;
    oct = await run("2026-09-16", "2026-09-30"); // the first of three second cutoffs
    const s = await sheet(oct);
    expect(s.net).toBe("1431255");
    expect(s.ded).toBe("0");
    expect(s.applied).toEqual([expect.objectContaining({ name: "Uniform", amountCents: "0", refusedReason: NO_AUTHORIZATION })]);
  });

  it("G2 with the date and the copy on file it is deducted", async () => {
    expect(await patch(uniform, { authorizationDate: "2026-09-01" })).toBe(200);
    await recomputeRun(T, oct);
    expect((await sheet(oct)).ded).toBe("0"); // the date alone is not enough
    expect(await patch(uniform, { authorizationFileKey: FILE })).toBe(200);
    await recomputeRun(T, oct);
    const s = await sheet(oct);
    expect(s.ded).toBe("50000");
    expect(s.net).toBe("1381255");
    await q(`UPDATE "EmployeePayComponent" SET "endDate" = '2026-09-01' WHERE id = $1`, [uniform]); // out of the later tests
  });

  it("G3 loss or damage is refused without an incident record, or before the employee is heard", async () => {
    const a = await post({ payComponentId: id("inv"), amount: "0", effectiveFrom: "2026-09-16", authorizationDate: "2026-09-10", authorizationFileKey: FILE, actualLoss: "7000.00" });
    expect(a.status).toBe(201);
    inventory = a.json.data.id;
    await recomputeRun(T, oct);
    expect((await sheet(oct)).applied).toEqual([expect.objectContaining({ name: "Inventory Deduction", amountCents: "0", refusedReason: NO_INCIDENT })]);
    expect(await patch(inventory, { incidentReportId: id("open") })).toBe(200);
    await recomputeRun(T, oct);
    expect((await sheet(oct)).applied[0].refusedReason).toBe(NO_INCIDENT);
  });

  it("G4 never more than the actual loss, at most 20% of the period's wages, the rest carried", async () => {
    expect(await patch(inventory, { incidentReportId: id("heard") })).toBe(200);
    await recomputeRun(T, oct);
    let s = await sheet(oct);
    expect(s.applied).toEqual([expect.objectContaining({ name: "Inventory Deduction", amountCents: "300000", deferredCents: "400000" })]);
    expect(s.net).toBe("1131255");
    await finalizeRun(T, oct, null);

    const nov = await run("2026-10-16", "2026-10-31");
    s = await sheet(nov);
    expect(s.applied[0]).toMatchObject({ amountCents: "300000", deferredCents: "100000" });
    await finalizeRun(T, nov, null);

    const dec = await run("2026-11-16", "2026-11-30"); // not the year's last run, which carries the year-end tax adjustment
    s = await sheet(dec);
    expect(s.applied[0]).toMatchObject({ amountCents: "100000" });
    expect(s.applied[0].deferredCents).toBeUndefined();
    expect(s.net).toBe("1331255");
    await finalizeRun(T, dec, null);

    const jan = await run("2027-01-16", "2027-01-31");
    s = await sheet(jan);
    expect(s.applied).toEqual([]);
    expect(s.ded).toBe("0");
  });

  it("G5 the API refuses another company's file, another employee's incident, and authorization on an earning", async () => {
    expect(await patch(uniform, { authorizationFileKey: "tenants/someone-else/deduction-authorizations/3f0c1a52-1111-4222-8333-444455556666.pdf" })).toBe(422);
    expect(await patch(inventory, { incidentReportId: id("theirs") })).toBe(422);
    expect(await patch(uniform, { incidentReportId: id("heard") })).toBe(422); // not a loss or damage deduction
    const rice = await post({ payComponentId: id("rice"), amount: "100.00", effectiveFrom: "2027-02-01", authorizationFileKey: FILE });
    expect(rice.status).toBe(422);
    expect((await post({ payComponentId: id("inv"), amount: "0", effectiveFrom: "2027-02-01", actualLoss: "0" })).status).toBe(422);
  });
});

describe("PAY-150 screens", () => {
  it("G6 the Compensation tab has the panel; the run page lists refusals", () => {
    const base = { authorizationDate: null, authorizationFileKey: null, incidentReportId: null, actualLossCents: null };
    expect(deductionProblem({ ...base, payComponent: { kind: "ALLOWANCE", isLossOrDamage: false } })).toBeNull();
    expect(deductionProblem({ ...base, payComponent: { kind: "DEDUCTION", isLossOrDamage: false } })).toMatch(/No written authorization/);
    const authed = { ...base, authorizationDate: "2026-10-01", authorizationFileKey: "k" };
    expect(deductionProblem({ ...authed, payComponent: { kind: "DEDUCTION", isLossOrDamage: false } })).toBeNull();
    expect(deductionProblem({ ...authed, payComponent: { kind: "DEDUCTION", isLossOrDamage: true } })).toMatch(/No incident record/);
    expect(readFileSync("src/app/(dashboard)/employees/[id]/ProfileClient.tsx", "utf8")).toMatch(/<EmployeePayComponents employeeId=\{employee\.id\}/);
    const runPage = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(runPage).toMatch(/Deductions not taken in full/);
    expect(runPage).toMatch(/refusedReason/);
  });
});
