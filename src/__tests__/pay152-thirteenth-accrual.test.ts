/**
 * PAY-152 (Mark, 16 Nov 2026 21:01): the 13th month accrued on every payroll
 * run, with a projected payout for Finance.
 *
 * Worked by hand, 2026:
 *   Ana, 30,000.00 a month, semi-monthly. Pay before Sentire (Jan to Oct):
 *     300,000.00 basic. Nov 1-15: basic 15,000.00, lates 500.00.
 *     Nov 16-30: basic 15,000.00.
 *     Base 14,500.00 + 15,000.00 + 300,000.00 = 329,500.00;
 *     accrued 329,500.00 / 12 = 27,458.33.
 *     One month left after 30 Nov: 30,000.00 / 12 = 2,500.00;
 *     projected 29,958.33.
 *   Ben (left on 15 Nov): Nov 1-15 basic 10,000.00; accrued 833.33, no
 *     projection; final pay paid a prorated 13th month of 833.33.
 *
 *   T1  a payslip's base is the 13th month's base: lates and undertime out
 *       unless the company opted out; counted allowances in under
 *       INCLUDE_ALLOWANCES (fails on main: no accrual).
 *   T2  accrued to date, projected payout, paid and difference per employee
 *       and for the company.
 *   T3  the journal by month, and the projection for a run that ends
 *       mid-month (1.5 months left after 15 Nov).
 *   T4  the page, its CSV and the sidebar link.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThirteenthAccrualReport, thirteenthBasisOfSheet, type AccrualSheetRow, type ThirteenthPolicy } from "@/lib/payroll/thirteenth-accrual";
import { accrualCsv } from "@/lib/payroll/thirteenth-accrual-view";

const c = (pesos: string) => BigInt(pesos.replace(/[,.]/g, ""));
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STRICT: ThirteenthPolicy = { basis: "STRICT_DOLE", deductLates: true, counted: new Set() };

const sheet = (employeeId: string, end: string, base: string, monthly = "30,000.00"): AccrualSheetRow => ({
  employeeId, periodEnd: d(end), basisCents: c(base), accrualCents: c(base) / 12n,
  basicSalaryCentsSnapshot: c(monthly), salaryTypeSnapshot: "MONTHLY", workingDaysDenominatorSnapshot: 261,
});
const EMPLOYEES = [
  { employeeId: "ana", employeeNumber: "E-1", name: "Santos, Ana", separated: false, openingBasicCents: c("300,000.00"), openingPaidCents: 0n },
  { employeeId: "ben", employeeNumber: "E-2", name: "Cruz, Ben", separated: true, openingBasicCents: 0n, openingPaidCents: 0n },
];
const report = () => buildThirteenthAccrualReport({
  year: 2026,
  employees: EMPLOYEES,
  sheets: [sheet("ana", "2026-11-15", "14,500.00"), sheet("ana", "2026-11-30", "15,000.00"), sheet("ben", "2026-11-15", "10,000.00", "20,000.00")],
  payouts: [{ employeeId: "ben", periodEnd: d("2026-11-15"), paidCents: c("833.33") }],
});

describe("PAY-152 13th month accrual", () => {
  it("T1 the base of one payslip", () => {
    const s = { basePayCents: c("15,000.00"), lateUndertimeDeductionCents: c("500.00"), payComponentsApplied: [{ id: "rice", amountCents: "200000" }, { id: "other", amountCents: "50000" }] };
    expect(thirteenthBasisOfSheet(s, STRICT)).toBe(c("14,500.00"));
    expect(thirteenthBasisOfSheet(s, { ...STRICT, deductLates: false })).toBe(c("15,000.00"));
    expect(thirteenthBasisOfSheet(s, { basis: "INCLUDE_ALLOWANCES", deductLates: true, counted: new Set(["rice"]) })).toBe(c("16,500.00"));
  });

  it("T2 per employee and for the company", () => {
    const r = report();
    expect(r.asOf).toBe("2026-11-30");
    expect(r.monthsLeft).toBe(1);
    const ana = r.rows.find((x) => x.employeeId === "ana")!;
    expect(ana).toMatchObject({
      runs: 2, basisFromRunsCents: c("29,500.00").toString(), basisFromOpeningCents: c("300,000.00").toString(),
      accruedToDateCents: c("27,458.33").toString(), monthlyBasicCents: c("30,000.00").toString(),
      projectedPayoutCents: c("29,958.33").toString(), paidCents: "0", differenceCents: null,
    });
    const ben = r.rows.find((x) => x.employeeId === "ben")!;
    expect(ben).toMatchObject({ accruedToDateCents: c("833.33").toString(), projectedPayoutCents: c("833.33").toString(), paidCents: c("833.33").toString(), differenceCents: "0" });
    expect(r.rows.map((x) => x.name)).toEqual(["Cruz, Ben", "Santos, Ana"]);
    expect(r.totals).toMatchObject({
      accruedToDateCents: c("28,291.66").toString(), projectedPayoutCents: c("30,791.66").toString(),
      paidCents: c("833.33").toString(), differenceCents: (c("833.33") - c("28,291.66")).toString(),
    });
  });

  it("T3 the journal, and a run that ends mid-month", () => {
    const r = report();
    const nov = r.journal.find((j) => j.month === 11)!;
    expect(nov.accrualCents).toBe((c("14,500.00") / 12n + c("15,000.00") / 12n + c("10,000.00") / 12n).toString());
    expect(nov.payoutCents).toBe(c("833.33").toString());
    expect(r.journal.filter((j) => j.accrualCents !== "0")).toHaveLength(1);

    const mid = buildThirteenthAccrualReport({ year: 2026, employees: [EMPLOYEES[0]!], sheets: [sheet("ana", "2026-11-15", "15,000.00")], payouts: [] });
    expect(mid.monthsLeft).toBe(1.5);
    // (15,000.00 + 300,000.00) / 12 = 26,250.00, plus 30,000.00 x 1.5 / 12 = 3,750.00.
    expect(mid.rows[0]!.projectedPayoutCents).toBe(c("30,000.00").toString());
  });

  it("T4 the page, the CSV and the link", () => {
    const csv = accrualCsv(report()).trim().split("\n");
    expect(csv[0]).toBe("employee_number,name,runs,basis_from_runs,basis_from_opening,accrued_to_date,monthly_basic,projected_payout,paid,difference");
    expect(csv[2]).toBe('E-1,"Santos, Ana",2,29500.00,300000.00,27458.33,30000.00,29958.33,0.00,');
    expect(csv[3]).toBe("TOTAL,,,39500.00,300000.00,28291.66,,30791.66,833.33,-27458.33");
    expect(readFileSync("src/components/sidebar-nav.tsx", "utf8")).toContain('{ href: "/payroll/thirteenth-accrual", label: "13th Month Accrual"');
    expect(readFileSync("src/app/(dashboard)/payroll/thirteenth-accrual/page.tsx", "utf8")).toContain("/api/payroll/reports/thirteenth-accrual");
  });
});
