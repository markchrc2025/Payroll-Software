/**
 * PAY-133: SSS is on basic pay actually earned (after unpaid days and lates),
 * not on the contracted monthly salary. Mark's rulings, 15 and 16 Nov 2026:
 *
 *   - "Earned" is basic pay after unpaid days and lates only. Overtime, night
 *     differential, holiday pay, rest day pay and allowances are excluded.
 *   - SSS is ALWAYS based on the PREVIOUS month's basic. The company's
 *     deduction payday (first or second, default first) decides only when it
 *     is deducted. The deduction day is fixed; it never moves for a new hire.
 *   - An employee's first month has no SSS. PhilHealth and Pag-IBIG are still
 *     deducted, on the contracted basic salary (unchanged).
 *
 *   M1  base month: always the month before the deduction month, for the
 *       first payday, the second payday, monthly, weekly and daily runs.
 *   M2  hired after the base month: no SSS (new hire), on either payday.
 *   M3  previous month fully finalized: its basic, summed.
 *   M4  a day of the base month not covered by a finalized run (first month
 *       on Sentire, or last month's last cutoff not finalized): contracted
 *       basic, labelled as such.
 *   M5  hired part-way through the base month: only days from hire need cover.
 *   M7  an OFF_CYCLE run adds its basic but does not prove coverage.
 *   M8  weekly: a week belongs to the month it starts in (no double count).
 *   M9  sssCompensationCents: no basis keeps the contract; new hire and a
 *       zero base mean no SSS; this run's pay never enters the base.
 *   E1  engine: SSS on last month's actual basic; PhilHealth and Pag-IBIG
 *       stay on the contracted basic.
 *   E2  engine: new hire, no SSS (EE, ER, EC all 0); PhilHealth and Pag-IBIG
 *       still deducted.
 *   E3  engine, second payday: this run's unpaid days, lates and overtime do
 *       not change the SSS (it is last month's).
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

describe("PAY-133 M1: the base month is always the previous month", () => {
  const month = (b: ReturnType<typeof sssBaseMonth>) =>
    [b.month, b.monthStart.toISOString().slice(0, 10), b.monthEnd.toISOString().slice(0, 10)];
  it("semi-monthly, first payday (1 to 15 Nov): October", () => {
    expect(month(sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2026-11-01"), d("2026-11-15")))).toEqual(["2026-10", "2026-10-01", "2026-10-31"]);
  });
  it("semi-monthly, second payday (16 to 30 Nov): also October", () => {
    expect(month(sssBaseMonth("SEMI_MONTHLY", "SECOND_CUTOFF", d("2026-11-16"), d("2026-11-30")))).toEqual(["2026-10", "2026-10-01", "2026-10-31"]);
  });
  it("January: December of the year before, on either payday", () => {
    expect(sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2027-01-01"), d("2027-01-15")).month).toBe("2026-12");
    expect(sssBaseMonth("SEMI_MONTHLY", "SECOND_CUTOFF", d("2027-01-16"), d("2027-01-31")).month).toBe("2026-12");
  });
  it("monthly November: October", () => {
    for (const rule of ["FIRST_CUTOFF", "SECOND_CUTOFF"] as const) {
      expect(sssBaseMonth("MONTHLY", rule, d("2026-11-01"), d("2026-11-30")).month).toBe("2026-10");
    }
  });
  it("weekly and daily: the month before the month whose last day is in the run", () => {
    expect(sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-12-26"), d("2027-01-01")).month).toBe("2026-11");
    expect(sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-11-24"), d("2026-11-30")).month).toBe("2026-10");
    expect(sssBaseMonth("DAILY", "FIRST_CUTOFF", d("2026-11-30"), d("2026-11-30")).month).toBe("2026-10");
  });
});

const OCT = sssBaseMonth("SEMI_MONTHLY", "FIRST_CUTOFF", d("2026-11-01"), d("2026-11-15"));
const firstPayday = (o: { hire?: string; sep?: string; sheets: SssHistorySheet[] }) =>
  assessSssBasis({
    base: OCT,
    hireDate: d(o.hire ?? "2025-01-06"),
    separationDate: o.sep ? d(o.sep) : null,
    sheets: o.sheets,
  });

describe("PAY-133 M2 to M5, M7: last month's basic", () => {
  it("M2 hired after last month: new hire, no SSS, on either payday", () => {
    expect(firstPayday({ hire: "2026-11-09", sheets: [] })).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" });
    const secondPayday = sssBaseMonth("SEMI_MONTHLY", "SECOND_CUTOFF", d("2026-11-16"), d("2026-11-30"));
    expect(assessSssBasis({ base: secondPayday, hireDate: d("2026-11-09"), separationDate: null, sheets: [] }))
      .toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" });
  });
  it("M3 both October cutoffs finalized: the two basics summed", () => {
    const b = firstPayday({
      sheets: [sheet("2026-10-01", "2026-10-15", 1_250_000n), sheet("2026-10-16", "2026-10-31", 1_135_057n)],
    });
    expect(b).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n });
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
    expect(b).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 827_586n });
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

describe("PAY-133 M8: weekly, a week counts in the month it starts", () => {
  it("the week of 30 Nov is based on October: weeks starting in October; the week from 26 Sep only covers", () => {
    const b = assessSssBasis({
      base: sssBaseMonth("WEEKLY", "FIRST_CUTOFF", d("2026-11-28"), d("2026-12-04")),
      hireDate: d("2025-01-06"),
      separationDate: null,
      sheets: [
        sheet("2026-09-26", "2026-10-02", 700_000n),
        sheet("2026-10-03", "2026-10-09", 700_000n),
        sheet("2026-10-10", "2026-10-16", 700_000n),
        sheet("2026-10-17", "2026-10-23", 650_000n),
        sheet("2026-10-24", "2026-10-30", 700_000n),
        sheet("2026-10-31", "2026-11-06", 700_000n),
      ],
    });
    expect(b).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 3_450_000n });
  });
});

describe("PAY-133 M9: the compensation looked up in the SSS table", () => {
  it("no basis or fallback: the contracted monthly basic", () => {
    expect(sssCompensationCents(undefined, 2_500_000n)).toBe(2_500_000n);
    expect(sssCompensationCents({ kind: "CONTRACTED_FALLBACK", month: "2026-10" }, 2_500_000n)).toBe(2_500_000n);
  });
  it("new hire: none", () => {
    expect(sssCompensationCents({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" }, 2_500_000n)).toBeNull();
  });
  it("last month's basic, and none when last month paid nothing", () => {
    expect(sssCompensationCents({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n }, 2_500_000n)).toBe(2_385_057n);
    expect(sssCompensationCents({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 0n }, 2_500_000n)).toBeNull();
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

  it("E1 SSS and PhilHealth on October's actual basic; Pag-IBIG on the contract", () => {
    const r = computeSheet(input({
      start: "2026-11-01", end: "2026-11-15",
      basis: { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n },
    }));
    const sss = computeSSS(SSS, 2_385_057n);
    expect(r.sssEeCents).toBe(sss.employee);
    expect(r.sssErCents).toBe(sss.employer);
    expect(r.sssEcCents).toBe(sss.ec);
    expect(r.sssEeCents).not.toBe(computeSSS(SSS, CONTRACT).employee); // ₱1,200, not ₱1,250
    expect(r.statutoryBreakdown.bases.sssMscCents).toBe(sss.msc.toString());
    expect(r.statutoryBreakdown.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" });
    // PAY-202 (ruling 4, 20 Nov): PhilHealth on the same basic less lates: 23,850.57 x 5%, half is 596.27.
    expect(r.philhealthEeCents).toBe(computePhilHealth(PHIC, 2_385_057n).employee);
    expect(r.philhealthEeCents).toBe(59_627n);
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

  it("E3 second payday: this run's unpaid day, lates and overtime do not change the SSS", () => {
    const basis = { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", priorBasicCents: 2_385_057n } as const;
    const plain = computeSheet(input({ start: "2026-11-16", end: "2026-11-30", basis }));
    const busy = computeSheet(input({ start: "2026-11-16", end: "2026-11-30", basis, unpaid: 1, lateMinutes: 90, otHours: 20 }));
    expect(busy.basePayCents).toBe(1_250_000n - 114_943n); // one day at 25,000 x 12 / 261, HALF-UP
    expect(busy.lateUndertimeDeductionCents).toBeGreaterThan(0n);
    expect(busy.otPayCents).toBeGreaterThan(0n);
    for (const r of [plain, busy]) {
      expect(r.statutoryBreakdown.sssBasis).toEqual({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10", compensationCents: "2385057" });
      expect(r.sssEeCents).toBe(computeSSS(SSS, 2_385_057n).employee);
    }
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
