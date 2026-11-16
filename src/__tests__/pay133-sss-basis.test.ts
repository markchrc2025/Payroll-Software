/**
 * PAY-133: SSS is on basic pay actually earned (after unpaid days and lates),
 * not on the contracted monthly salary. Mark's rulings, 15 and 16 Nov 2026:
 *
 *   - "Earned" is basic pay after unpaid days and lates only. Overtime, night
 *     differential, holiday pay, rest day pay and allowances are excluded.
 *   - Contributions are deducted on the payday the company picks (first or
 *     second of the month). New companies default to the FIRST payday.
 *   - On the first payday the base is the PREVIOUS month's actual basic.
 *   - An employee's first month has no SSS. PhilHealth and Pag-IBIG are still
 *     deducted, on the contracted basic salary (unchanged).
 *
 *   M1  base month per cycle and rule (first payday: last month; second
 *       payday, monthly, weekly and daily: the month being closed).
 *   M2  hired after the base month: no SSS (new hire).
 *   M3  previous month fully finalized: its basic, summed.
 *   M4  a day of the base month not covered by a finalized run (first month
 *       on Sentire, or last month's second cutoff not finalized): contracted
 *       basic, labelled as such.
 *   M5  hired part-way through the base month: only days from hire need cover.
 *   M6  second payday: this month's finalized runs plus this run.
 *   M7  an OFF_CYCLE run adds its basic but does not prove coverage.
 *   M8  weekly: a week belongs to the month it starts in (no double count).
 *   M9  sssCompensationCents: no basis keeps the contract; new hire and a
 *       zero base mean no SSS.
 *   E1  engine: SSS on last month's actual basic; PhilHealth and Pag-IBIG
 *       stay on the contracted basic.
 *   E2  engine: new hire, no SSS (EE, ER, EC all 0); PhilHealth and Pag-IBIG
 *       still deducted.
 *   E3  engine: second payday adds this run's basic after unpaid days and
 *       lates; overtime does not raise the base.
 *   E4  engine: no basis (older callers, non-REGULAR runs) is unchanged.
 *   P1  the payslip says which month's basic the SSS is on, "None in first
 *       month" for a new hire, and "(contract)" on the fallback.
 */
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/payroll/engine";
import {
  assessSssBasis,
  sssBaseMonth,
  sssCompensationCents,
  type SssHistorySheet,
} from "@/lib/payroll/sss-basis";
import { computePagibig, computePhilHealth, computeSSS } from "@/lib/statutory/compute";
import type { ComputeInput, StatutoryBreakdown } from "@/lib/payroll/types";
import { buildPayslipPdfData, type PayslipPdfSource } from "@/lib/payslip/pdf-data";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function sheet(start: string, end: string, basic: bigint, runType: SssHistorySheet["runType"] = "REGULAR"): SssHistorySheet {
  return { periodStart: d(start), periodEnd: d(end), basicCents: basic, runType };
}

describe("PAY-133 M1: the base month", () => {
  it("semi-monthly, first payday: last month, this run not included", () => {
    const b = sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2026-11-01"), d("2026-11-15"));
    expect(b).toMatchObject({ month: "2026-10", includeThisRun: false });
    expect(b.monthStart.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(b.monthEnd.toISOString().slice(0, 10)).toBe("2026-10-31");
  });
  it("semi-monthly January, first payday: December of the year before", () => {
    expect(sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2027-01-01"), d("2027-01-15")).month).toBe("2026-12");
  });
  it("semi-monthly, second payday: this month, this run included", () => {
    expect(sssBaseMonth("SEMI_MONTHLY", "SECOND_CUTOFF", d("2026-11-16"), d("2026-11-30"))).toMatchObject({
      month: "2026-11",
      includeThisRun: true,
    });
  });
  it("monthly: this month, whatever the rule", () => {
    for (const rule of ["FIRST_CUTOFF", "SECOND_CUTOFF"] as const) {
      expect(sssBaseMonth("MONTHLY", rule, d("2026-11-01"), d("2026-11-30"))).toMatchObject({
        month: "2026-11",
        includeThisRun: true,
      });
    }
  });
  it("weekly: the month whose last day is in the week", () => {
    expect(sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-12-26"), d("2027-01-01")).month).toBe("2026-12");
    expect(sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-11-24"), d("2026-11-30")).month).toBe("2026-11");
    expect(sssBaseMonth("DAILY", "FIRST_CUTOFF", d("2026-11-30"), d("2026-11-30")).month).toBe("2026-11");
  });
});

const OCT = sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2026-11-01"), d("2026-11-15"));
const NOV_2ND = sssBaseMonth("SEMI_MONTHLY", "SECOND_CUTOFF", d("2026-11-16"), d("2026-11-30"));
const firstPayday = (o: { hire?: string; sep?: string; sheets: SssHistorySheet[] }) =>
  assessSssBasis({
    base: OCT,
    thisPeriodStart: d("2026-11-01"),
    thisPeriodEnd: d("2026-11-15"),
    hireDate: d(o.hire ?? "2025-01-06"),
    separationDate: o.sep ? d(o.sep) : null,
    sheets: o.sheets,
  });

describe("PAY-133 M2 to M5, M7: first payday (last month's basic)", () => {
  it("M2 hired after last month: new hire, no SSS", () => {
    expect(firstPayday({ hire: "2026-11-09", sheets: [] })).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" });
  });
  it("M3 both October cutoffs finalized: the two basics summed", () => {
    const b = firstPayday({
      sheets: [sheet("2026-10-01", "2026-10-15", 1_250_000n), sheet("2026-10-16", "2026-10-31", 1_135_057n)],
    });
    expect(b).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n, includeThisRun: false });
  });
  it("M4 only one October cutoff in Sentire: contracted basic, labelled", () => {
    expect(firstPayday({ sheets: [sheet("2026-10-16", "2026-10-31", 1_250_000n)] })).toEqual({
      kind: "CONTRACTED_FALLBACK",
      month: "2026-10",
    });
    expect(firstPayday({ sheets: [] }).kind).toBe("CONTRACTED_FALLBACK");
  });
  it("M5 hired 20 October: only 20 to 31 October must be covered", () => {
    const b = firstPayday({ hire: "2026-10-20", sheets: [sheet("2026-10-16", "2026-10-31", 827_586n)] });
    expect(b).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 827_586n, includeThisRun: false });
  });
  it("M7 an off-cycle run adds basic but does not cover days", () => {
    const covered = firstPayday({
      sheets: [
        sheet("2026-10-01", "2026-10-15", 1_250_000n),
        sheet("2026-10-16", "2026-10-31", 1_135_057n),
        sheet("2026-10-20", "2026-10-20", 114_943n, "OFF_CYCLE"),
      ],
    });
    expect(covered).toMatchObject({ kind: "PREVIOUS_MONTH_ACTUAL", priorBasicCents: 2_500_000n });
    const offCycleOnly = firstPayday({
      sheets: [sheet("2026-10-01", "2026-10-15", 1_250_000n), sheet("2026-10-16", "2026-10-31", 0n, "OFF_CYCLE")],
    });
    expect(offCycleOnly.kind).toBe("CONTRACTED_FALLBACK");
  });
});

describe("PAY-133 M6: second payday (this month's basic, this run included)", () => {
  const secondPayday = (o: { hire?: string; sheets: SssHistorySheet[] }) =>
    assessSssBasis({
      base: NOV_2ND,
      thisPeriodStart: d("2026-11-16"),
      thisPeriodEnd: d("2026-11-30"),
      hireDate: d(o.hire ?? "2025-01-06"),
      separationDate: null,
      sheets: o.sheets,
    });
  it("first cutoff finalized: its basic, plus this run later", () => {
    expect(secondPayday({ sheets: [sheet("2026-11-01", "2026-11-15", 1_250_000n)] })).toEqual({
      kind: "THIS_MONTH_ACTUAL",
      month: "2026-11",
      priorBasicCents: 1_250_000n,
      includeThisRun: true,
    });
  });
  it("first cutoff not finalized: contracted basic", () => {
    expect(secondPayday({ sheets: [] }).kind).toBe("CONTRACTED_FALLBACK");
  });
  it("hired 20 November: this run covers the whole employment", () => {
    expect(secondPayday({ hire: "2026-11-20", sheets: [] })).toMatchObject({
      kind: "THIS_MONTH_ACTUAL",
      priorBasicCents: 0n,
    });
  });
});

describe("PAY-133 M8: weekly, a week counts in the month it starts", () => {
  it("December: weeks starting in December plus this run; the week from 28 Nov only covers", () => {
    const b = assessSssBasis({
      base: sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-12-26"), d("2027-01-01")),
      thisPeriodStart: d("2026-12-26"),
      thisPeriodEnd: d("2027-01-01"),
      hireDate: d("2025-01-06"),
      separationDate: null,
      sheets: [
        sheet("2026-11-28", "2026-12-04", 700_000n),
        sheet("2026-12-05", "2026-12-11", 700_000n),
        sheet("2026-12-12", "2026-12-18", 700_000n),
        sheet("2026-12-19", "2026-12-25", 650_000n),
      ],
    });
    expect(b).toEqual({ kind: "THIS_MONTH_ACTUAL", month: "2026-12", priorBasicCents: 2_050_000n, includeThisRun: true });
  });
});

describe("PAY-133 M9: the compensation looked up in the SSS table", () => {
  it("no basis: the contracted monthly basic", () => {
    expect(sssCompensationCents(undefined, 1_000n, 2_500_000n)).toBe(2_500_000n);
    expect(sssCompensationCents({ kind: "CONTRACTED_FALLBACK", month: "2026-10" }, 1_000n, 2_500_000n)).toBe(2_500_000n);
  });
  it("new hire: none", () => {
    expect(sssCompensationCents({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" }, 1_000_000n, 2_500_000n)).toBeNull();
  });
  it("last month: this run is not added", () => {
    const basis = { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n, includeThisRun: false } as const;
    expect(sssCompensationCents(basis, 1_250_000n, 2_500_000n)).toBe(2_385_057n);
  });
  it("this month: this run is added; a whole month unpaid means no SSS", () => {
    const basis = { kind: "THIS_MONTH_ACTUAL", month: "2026-11", priorBasicCents: 1_250_000n, includeThisRun: true } as const;
    expect(sssCompensationCents(basis, 1_135_057n, 2_500_000n)).toBe(2_385_057n);
    expect(sssCompensationCents({ ...basis, priorBasicCents: 0n }, 0n, 2_500_000n)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Engine (E1 to E4). Fixtures: ./fixtures/statutory-test-rules.
// ---------------------------------------------------------------------------

function input(o: {
  start: string;
  end: string;
  basis?: ComputeInput["sssBasis"];
  unpaid?: number;
  lateMinutes?: number;
  otHours?: number;
  hireDate?: string;
  daysWorked?: number;
}): ComputeInput {
  return {
    employee: {
      id: "p133-emp",
      taxClassification: "REGULAR",
      region: "NCR",
      payFrequency: "SEMI_MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 5,
      nontaxableBasicAmountCents: 0n,
      workingDaysDenominator: null,
      hireDate: d(o.hireDate ?? "2025-01-06"),
      separationDate: null,
    },
    salary: { basicSalaryCents: 2_500_000n, salaryType: "MONTHLY" },
    tenant: {
      workingDaysDenominator: 261,
      statutoryCutoffRule: "FIRST_CUTOFF",
      thirteenthMonthBasis: "STRICT_DOLE",
      allowNegativeFinalPay: true,
    },
    period: { start: d(o.start), end: d(o.end), cycle: "SEMI_MONTHLY" },
    periodInput: {
      daysWorked: o.daysWorked ?? 0,
      lateUndertimeMinutes: o.lateMinutes ?? 0,
      regularOtHours: o.otHours ?? 0,
      restDayHours: 0,
      specialHolidayHours: 0,
      regularHolidayHours: 0,
      nightDiffHours: 0,
      hazardHours: 0,
      unpaidLeaveDays: o.unpaid ?? 0,
    },
    payComponents: [],
    loans: [],
    adjustments: [],
    expenseClaims: [],
    rules: { sss: SSS, philHealth: PHIC, pagibig: PAGIBIG, bir: BIR, minWage: MIN_WAGE, deMinimis: DE_MINIMIS },
    overrideStatutoryDeducted: true,
    runType: "REGULAR",
    sssBasis: o.basis,
  };
}

describe("PAY-133 E1 to E4: the engine", () => {
  const CONTRACT = 2_500_000n; // ₱25,000.00 a month
  const phic = computePhilHealth(PHIC, CONTRACT);
  const hdmf = computePagibig(PAGIBIG, CONTRACT);

  it("E1 SSS on October's actual basic; PhilHealth and Pag-IBIG on the contract", () => {
    const r = computeSheet(input({
      start: "2026-11-01", end: "2026-11-15",
      basis: { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n, includeThisRun: false },
    }));
    const sss = computeSSS(SSS, 2_385_057n);
    expect(r.sssEeCents).toBe(sss.employee);
    expect(r.sssErCents).toBe(sss.employer);
    expect(r.sssEcCents).toBe(sss.ec);
    expect(r.sssEeCents).not.toBe(computeSSS(SSS, CONTRACT).employee); // ₱1,200, not ₱1,250
    expect(r.statutoryBreakdown.bases.sssMscCents).toBe(sss.msc.toString());
    expect(r.statutoryBreakdown.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" });
    expect(r.philhealthEeCents).toBe(phic.employee);
    expect(r.pagibigEeCents).toBe(hdmf.employee);
  });

  it("E2 new hire: no SSS at all, PhilHealth and Pag-IBIG still deducted", () => {
    const r = computeSheet(input({
      start: "2026-11-01", end: "2026-11-15", hireDate: "2026-11-09", daysWorked: 5,
      basis: { kind: "NEW_HIRE_NO_SSS", month: "2026-10" },
    }));
    expect(r.basePayCents).toBeGreaterThan(0n);
    expect([r.sssEeCents, r.sssErCents, r.sssEcCents]).toEqual([0n, 0n, 0n]);
    expect(r.statutoryBreakdown.bases.sssMscCents).toBe("0");
    expect(r.statutoryBreakdown.sssBasis).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10", compensationCents: "0" });
    expect(r.philhealthEeCents).toBe(phic.employee);
    expect(r.pagibigEeCents).toBe(hdmf.employee);
    expect(r.philhealthEeCents).toBeGreaterThan(0n);
  });

  it("E3 second payday: this run's basic after an unpaid day and lates is added; overtime is not", () => {
    const basis = { kind: "THIS_MONTH_ACTUAL", month: "2026-11", priorBasicCents: 1_250_000n, includeThisRun: true } as const;
    const plain = computeSheet(input({ start: "2026-11-16", end: "2026-11-30", basis, unpaid: 1, lateMinutes: 90 }));
    const thisRunBasic = plain.basePayCents - plain.lateUndertimeDeductionCents;
    expect(plain.basePayCents).toBe(1_250_000n - 114_943n); // one day at 25,000 x 12 / 261, HALF-UP
    expect(plain.lateUndertimeDeductionCents).toBeGreaterThan(0n);
    expect(plain.statutoryBreakdown.sssBasis?.compensationCents).toBe((1_250_000n + thisRunBasic).toString());
    expect(plain.sssEeCents).toBe(computeSSS(SSS, 1_250_000n + thisRunBasic).employee);

    const withOt = computeSheet(input({ start: "2026-11-16", end: "2026-11-30", basis, unpaid: 1, lateMinutes: 90, otHours: 20 }));
    expect(withOt.otPayCents).toBeGreaterThan(0n);
    expect(withOt.statutoryBreakdown.sssBasis?.compensationCents).toBe(plain.statutoryBreakdown.sssBasis?.compensationCents);
    expect(withOt.sssEeCents).toBe(plain.sssEeCents);
  });

  it("E4 no basis: SSS stays on the contracted monthly basic, no basis recorded", () => {
    const r = computeSheet(input({ start: "2026-11-01", end: "2026-11-15", unpaid: 3 }));
    expect(r.sssEeCents).toBe(computeSSS(SSS, CONTRACT).employee);
    expect(r.statutoryBreakdown.sssBasis).toBeUndefined();
  });
});

describe("PAY-133 P1: the payslip names the SSS basis", () => {
  function slip(sssBasis: StatutoryBreakdown["sssBasis"], sssMscCents: string, sssEeCents: bigint): PayslipPdfSource {
    return {
      company: { name: "Sentire QA Co.", address: null, city: null, province: null, zipCode: null },
      book: { periodStart: d("2026-11-01"), periodEnd: d("2026-11-15"), cycle: "SEMI_MONTHLY", runType: "REGULAR", finalizedAt: d("2026-11-14") },
      sheet: {
        id: "p133-sheet", salaryTypeSnapshot: "MONTHLY", basicSalaryCentsSnapshot: 2_500_000n, workingDaysDenominatorSnapshot: 261,
        taxClassificationSnapshot: "REGULAR", statutoryDeductedSnapshot: true,
        basePayCents: 1_250_000n, lateUndertimeDeductionCents: 0n, otPayCents: 0n, nsdPayCents: 0n, holidayPayCents: 0n,
        restDayPayCents: 0n, hazardPayCents: 0n, taxableAllowancesCents: 0n, grossCompensationCents: 1_250_000n,
        grossTaxableIncomeCents: 1_000_000n, sssEeCents, sssErCents: 0n, sssEcCents: 0n,
        philhealthEeCents: 62_500n, philhealthErCents: 62_500n, pagibigEeCents: 20_000n, pagibigErCents: 20_000n,
        withholdingTaxCents: 0n, nontaxableAdditionsCents: 0n, loanDeductionsCents: 0n, adjustmentDeductionsCents: 0n,
        netPayCents: 1_250_000n - sssEeCents - 62_500n - 20_000n,
        periodInputSnapshot: { daysWorked: 11 },
        statutoryBreakdown: {
          deducted: true,
          bases: { sssMscCents, philHealthMscCents: "2500000", pagibigMfsCents: "1000000" },
          ...(sssBasis ? { sssBasis } : {}),
        },
        loanPaymentsApplied: [], adjustmentsApplied: [], expenseClaimsApplied: [],
      },
      employee: {
        employeeNumber: "EMP-0001", firstName: "Ana", middleName: null, lastName: "Santos", position: null, department: null, branch: null,
        bankName: null, bankAccountNumber: null, statutoryIds: [],
      },
      extras: {
        ytd: { grossCents: "0", wtaxCents: "0", basicCents: "0", released13thMonthCents: "0", accrued13thMonthCents: "0", sssEeCents: "0", philhealthEeCents: "0", pagibigEeCents: "0" },
        tardinessMinutes: 0,
        leaveBalances: [],
      },
    } as unknown as PayslipPdfSource;
  }
  const sssLine = (src: PayslipPdfSource) => buildPayslipPdfData(src).statutory.find((l) => l.label === "SSS")!;

  it("last month's actual basic", () => {
    const line = sssLine(slip({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" }, "2400000", 120_000n));
    expect(line.rate).toBe("MSC \u20B124,000.00 (Oct basic)");
    expect(line.amount).toBe(120_000n);
  });
  it("new hire", () => {
    const line = sssLine(slip({ kind: "NEW_HIRE_NO_SSS", month: "2026-10", compensationCents: "0" }, "0", 0n));
    expect(line.rate).toBe("None in first month");
    expect(line.amount).toBe(0n);
  });
  it("fallback to the contract", () => {
    expect(sssLine(slip({ kind: "CONTRACTED_FALLBACK", month: "2026-10", compensationCents: "2500000" }, "2500000", 125_000n)).rate)
      .toBe("MSC \u20B125,000.00 (contract)");
  });
  it("older sheets without a basis read as before", () => {
    expect(sssLine(slip(undefined, "2500000", 125_000n)).rate).toBe("MSC \u20B125,000.00");
  });
});
