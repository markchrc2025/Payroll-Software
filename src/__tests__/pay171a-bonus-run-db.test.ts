/**
 * PAY-171: a bonus pay component in a real regular run (real Postgres).
 *
 *   R1  (T1) the run knows what the employee already used of the year's
 *       ₱90,000 (an earlier finalized run): only the rest is tax-free, and the
 *       excess is taxed at the year's rate.
 *   R2  the Pay Components API saves the Bonus and One-off pay tick boxes;
 *       nothing is seeded (a new company has no bonus component).
 *   R3  the Pay Components page shows both tick boxes.
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
const T = `p171t${sfx}`;
const id = (s: string) => `p171${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p171-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => "203.0.113.9" }));

import { createDraftRun } from "@/lib/payroll/persist";
import { POST as createComponent } from "@/app/api/pay-components/route";

describeDb("PAY-171 bonus in a regular run (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const E = id("emp");

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-20T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P171${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p171-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "needsTimeClock", "updatedAt")
       VALUES ($1, $2, $1, 'P171', $1, '2025-01-06', false, now())`,
      [E, T],
    );
    await q(
      `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
       VALUES ($1, $2, $3, '2025-01-06', 5000000, 'MONTHLY', now())`,
      [`${E}-t`, T, E],
    );
    // An earlier finalized run this year used ₱85,000 of the ₱90,000, on ₱600,000 taxable.
    const prior = id("prior");
    await q(
      `INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt")
       VALUES ($1, $2, '2026-06-01', '2026-06-15', 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', now())`,
      [prior, T],
    );
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxable13MonthAndBenefitsCents", "grossTaxableIncomeCents", "netPayCents",
         "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 5000000, 261, false,
         2500000, 11000000, 8500000, 60000000, 11000000, '[]', '[]', '{}', '{}', now())`,
      [id("psheet"), T, prior, E],
    );
    const pc = id("pc");
    await q(
      `INSERT INTO "PayComponent" (id, "tenantId", code, name, kind, taxability, "isBonus", "updatedAt")
       VALUES ($1, $2, 'XMAS', 'Christmas bonus', 'BONUS', 'TAXABLE', true, now())`,
      [pc, T],
    );
    await q(
      `INSERT INTO "EmployeePayComponent" (id, "tenantId", "employeeId", "payComponentId", "amountCents", "effectiveFrom", "endDate", "updatedAt")
       VALUES ($1, $2, $3, $4, 2000000, '2026-12-01', '2026-12-15', now())`,
      [id("epc"), T, E, pc],
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["EmployeePayComponent", "PayComponent", "EmploymentTerm", "Employee", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("R1 (T1) only what is left of the ₱90,000 is tax-free; the excess is taxed at the year's rate", async () => {
    const book = await createDraftRun({
      tenantId: T, periodStart: new Date("2026-12-01T00:00:00Z"), periodEnd: new Date("2026-12-15T00:00:00Z"), cycle: "SEMI_MONTHLY",
    });
    const s = (await q(
      `SELECT "nontaxable13MonthAndBenefitsCents"::text n, "statutoryBreakdown" sb FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [book.id, E],
    )).rows[0];
    expect(s.n).toBe("500000");
    expect(s.sb.benefits).toMatchObject({ totalCents: "2000000", exemptCents: "500000", excessCents: "1500000", capLeftBeforeCents: "500000" });
    expect(BigInt(s.sb.benefits.excessTaxCents)).toBeGreaterThan(0n);
  });

  it("R2 the API saves both tick boxes; nothing is seeded", async () => {
    const res = await createComponent(new NextRequest("http://test.local/api/pay-components", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "SL_CONV", name: "Sick leave conversion", kind: "OTHER_EARNING", taxability: "TAXABLE", isOneOff: true }),
    }));
    expect(res.status).toBe(201);
    const row = (await q(`SELECT "isBonus", "isOneOff" FROM "PayComponent" WHERE "tenantId" = $1 AND code = 'SL_CONV'`, [T])).rows[0];
    expect(row).toEqual({ isBonus: false, isOneOff: true });
    const seeded = (await q(`SELECT count(*)::int n FROM "PayComponent" WHERE "tenantId" = $1 AND "isBonus"`, [T])).rows[0].n;
    expect(seeded).toBe(1); // only the one this test made
  });

  it("R3 the Pay Components page shows both tick boxes", () => {
    const page = readFileSync("src/app/(dashboard)/pay-components/page.tsx", "utf8");
    expect(page).toMatch(/id="pc-isBonus"/);
    expect(page).toMatch(/id="pc-isOneOff"/);
  });
});
