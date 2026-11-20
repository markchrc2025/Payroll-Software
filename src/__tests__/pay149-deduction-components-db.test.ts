/**
 * PAY-149 (Mark, 16 Nov 2026, HR.my review D2, D2a, D2b): Pay Components
 * splits into Earning Components and Deduction Components. Mandatory
 * Deductions (SSS, PhilHealth, Pag-IBIG, Withholding Tax) are locked; Other
 * Deductions are loans, the seeded Inventory Deduction and company-added ones.
 *
 * Found while building: the payroll engine ignored every DEDUCTION component,
 * so a uniform or canteen deduction assigned to an employee was never taken.
 *
 *   D1  (T1) a DEDUCTION component is deducted from net pay after tax; gross,
 *       taxable pay and tax are unchanged (it used to be ignored).
 *   D2  the payslip lists it by name under Other deductions, and the net box
 *       adds up.
 *   D3  reading the list seeds Inventory Deduction once (built in, loss or
 *       damage); reading again adds nothing.
 *   D4  a built-in component cannot be deleted, and keeps its kind; it can be
 *       renamed or made inactive. A company deduction can be deleted.
 *   D5  only a deduction can be a loss or damage deduction.
 *   D6  components fall into the two groups; the screen has both tabs, the
 *       locked Mandatory Deductions and the loan types.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { computeSheet } from "@/lib/payroll/engine";
import type { ComputeInput } from "@/lib/payroll/types";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";
import { buildPayslipPdfData, type PayslipPdfSource } from "@/lib/payslip/pdf-data";
import { groupPayComponents, LOAN_DEDUCTIONS, MANDATORY_DEDUCTIONS } from "@/lib/payroll/deduction-components";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p149t${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as list, POST as create } from "@/app/api/pay-components/route";
import { PATCH as patch, DELETE as del } from "@/app/api/pay-components/[id]/route";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const P = (id: string) => ({ params: Promise.resolve({ id }) });

/** Monthly 30,000.00, second cutoff (no contributions): half 15,000.00; tax (15,000 - 10,417) x 15% = 687.45. */
function input(extra: Partial<ComputeInput> = {}): ComputeInput {
  return {
    employee: {
      id: "p149", taxClassification: "REGULAR", region: "NCR", payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8, standardWorkDays: 5, nontaxableBasicAmountCents: 0n, workingDaysDenominator: null,
      hireDate: d("2025-01-06"), separationDate: null,
    },
    salary: { basicSalaryCents: 3_000_000n, salaryType: "MONTHLY" },
    tenant: { workingDaysDenominator: 261, statutoryCutoffRule: "FIRST_CUTOFF", thirteenthMonthBasis: "STRICT_DOLE", allowNegativeFinalPay: true },
    period: { start: d("2026-10-16"), end: d("2026-10-31"), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: 11, lateUndertimeMinutes: 0, regularOtHours: 0, restDayHours: 0, specialHolidayHours: 0,
      regularHolidayHours: 0, nightDiffHours: 0, hazardHours: 0, unpaidLeaveDays: 0,
    },
    payComponents: [], loans: [], adjustments: [], expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    runType: "REGULAR",
    ...extra,
  };
}
const UNIFORM = { id: "c-uni", code: "UNIFORM", name: "Uniform", kind: "DEDUCTION" as const, taxability: "NON_TAXABLE" as const, amountCents: 50_000n, deMinimisCode: null };

describe("PAY-149 Other Deductions are deducted", () => {
  it("D1 (T1) a DEDUCTION component comes off net pay after tax", () => {
    const base = computeSheet(input());
    expect(base.grossCompensationCents).toBe(1_500_000n);
    expect(base.withholdingTaxCents).toBe(68_745n);
    expect(base.netPayCents).toBe(1_431_255n);
    const r = computeSheet(input({ payComponents: [UNIFORM] }));
    expect(r.grossCompensationCents).toBe(1_500_000n);
    expect(r.grossTaxableIncomeCents).toBe(base.grossTaxableIncomeCents);
    expect(r.withholdingTaxCents).toBe(68_745n);
    expect(r.adjustmentDeductionsCents).toBe(50_000n);
    expect(r.netPayCents).toBe(1_381_255n);
  });

  it("D2 the payslip lists it by name and adds up", () => {
    const r = computeSheet(input({ payComponents: [UNIFORM] }));
    const src: PayslipPdfSource = {
      company: { name: "Sentire QA Co." },
      book: { periodStart: d("2026-10-16"), periodEnd: d("2026-10-31"), cycle: "SEMI_MONTHLY", runType: "REGULAR", finalizedAt: d("2026-10-30") },
      sheet: { ...r, id: "p149-sheet", statutoryBreakdown: r.statutoryBreakdown, loanPaymentsApplied: [], adjustmentsApplied: [], expenseClaimsApplied: [], payComponentsApplied: r.payComponentsApplied },
      employee: { employeeNumber: "EMP-149", firstName: "Ana", lastName: "Santos", position: null, department: null, branch: null, statutoryIds: [] },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0, leaveBalances: [],
      },
    };
    const data = buildPayslipPdfData(src);
    expect(data.other).toEqual([{ label: "Uniform", amount: 50_000n }]);
    expect(data.net.rows.map((x) => x.label)).not.toContain("Other items");
    expect(data.net.netPay).toBe(1_381_255n);
  });

  it("D6 components fall into two groups; the screen shows both, with the locked rows", () => {
    const g = groupPayComponents([
      { code: "ZED", kind: "DEDUCTION" }, { code: "RICE", kind: "ALLOWANCE" },
      { code: "INVENTORY_DEDUCTION", kind: "DEDUCTION", isSystem: true }, { code: "MEAL", kind: "REIMBURSEMENT" },
    ]);
    expect(g.earnings.map((x) => x.code)).toEqual(["RICE", "MEAL"]);
    expect(g.deductions.map((x) => x.code)).toEqual(["INVENTORY_DEDUCTION", "ZED"]);
    expect(MANDATORY_DEDUCTIONS.map((m) => m.code)).toEqual(["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX"]);
    expect(LOAN_DEDUCTIONS.filter((l) => l.locked).map((l) => l.loanType)).toEqual(["SSS", "PAGIBIG"]);
    const page = readFileSync("src/app/(dashboard)/pay-components/page.tsx", "utf8");
    for (const text of ["Earning Components", "Deduction Components", "Mandatory Deductions", "Other Deductions: Loan Deduction", "Loss or damage deduction"])
      expect(page).toContain(text);
  });
});

describeDb("PAY-149 Deduction Components catalog (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P149${sfx}`.toUpperCase()]);
  });
  afterAll(async () => {
    await q(`DELETE FROM "PayComponent" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  let invId = "";
  it("D3 reading the list seeds Inventory Deduction once", async () => {
    const one = (await (await list(req("/api/pay-components?limit=200"))).json()).data as { id: string; code: string; kind: string; isSystem: boolean; isLossOrDamage: boolean }[];
    expect(one.map((c) => [c.code, c.kind, c.isSystem, c.isLossOrDamage])).toEqual([["INVENTORY_DEDUCTION", "DEDUCTION", true, true]]);
    invId = one[0].id;
    await list(req("/api/pay-components?limit=200"));
    expect((await q(`SELECT count(*)::int n FROM "PayComponent" WHERE "tenantId" = $1`, [T])).rows[0].n).toBe(1);
  });

  it("D4 a built-in component cannot be deleted and keeps its kind; a company deduction can be deleted", async () => {
    expect((await del(req(`/api/pay-components/${invId}`, "DELETE"), P(invId))).status).toBe(409);
    expect((await patch(req(`/api/pay-components/${invId}`, "PATCH", { kind: "ALLOWANCE" }), P(invId))).status).toBe(409);
    expect((await patch(req(`/api/pay-components/${invId}`, "PATCH", { name: "Stock shortage", isActive: false }), P(invId))).status).toBe(200);
    const made = await create(req("/api/pay-components", "POST", { code: "CANTEEN", name: "Canteen", kind: "DEDUCTION", taxability: "NON_TAXABLE" }));
    expect(made.status).toBe(201);
    const id = (await made.json()).data.id;
    expect((await del(req(`/api/pay-components/${id}`, "DELETE"), P(id))).status).toBe(200);
  });

  it("D5 only a deduction can be a loss or damage deduction", async () => {
    expect((await create(req("/api/pay-components", "POST", { code: "RICE", name: "Rice", kind: "ALLOWANCE", isLossOrDamage: true }))).status).toBe(422);
    const ok = await create(req("/api/pay-components", "POST", { code: "TOOLS", name: "Lost tools", kind: "DEDUCTION", taxability: "NON_TAXABLE", isLossOrDamage: true }));
    expect(ok.status).toBe(201);
    const id = (await ok.json()).data.id;
    expect((await patch(req(`/api/pay-components/${id}`, "PATCH", { kind: "ALLOWANCE" }), P(id))).status).toBe(422);
  });
});
