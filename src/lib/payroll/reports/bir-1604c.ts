/**
 * BIR Form 1604-C: Annual Information Return of Income Taxes Withheld on
 * Compensation (January 2018), with its alphalist of employees in the format
 * of RMC 160-2022 Annex A:
 *   Schedule 1: Alphalist of Employees
 *   Schedule 2: Alphalist of Minimum Wage Earners
 *
 * PAY-71: mandated structure, no added columns, footnotes only. The columns
 * and their codes (1, 2a ... 19) are the ones printed on the format. The
 * figures are the same split of each payslip the 2316 uses (bir-comp.ts), so
 * a row of the alphalist and that employee's 2316 always agree.
 *
 * Pure function, no DB access.
 */
import type { BirComp } from "./bir-comp";
import { ZERO_COMP, addComp } from "./bir-comp";
import type { BirWithholdingAgent } from "./bir-1601c";
import { yearCompOf, type Bir2316EmployeeInput } from "./bir-2316";
import {
  formatCentavos, formatMdy, formatTin, textLine,
  type BirFormView, type BirSchedule, type BirScheduleColumn,
} from "./bir-form";

export interface Bir1604cEmployeeInput extends Bir2316EmployeeInput {
  /** Shown for foreigners only. */
  nationality?: string | null;
  /** R, C, CP, S, P or AL, as the format's legend lists them. */
  employmentStatusCode?: string | null;
  /** T, TR, R or D when the employee left in the year. */
  separationReasonCode?: string | null;
  /** Schedule 2: the region the employee is assigned to. */
  region?: string | null;
  /** Schedule 2: working days a year behind the daily rate. */
  daysPerYear?: number | null;
  /** True when the employee left the company in the year. */
  separatedInYear?: boolean;
}

export interface Bir1604cInput {
  year: number;
  tenantId: string;
  tenantName: string;
  agent?: BirWithholdingAgent;
  taxDue?: (annualTaxableCents: bigint) => bigint;
  employees: Bir1604cEmployeeInput[];
}

export interface Bir1604cReport {
  year: number;
  tenantId: string;
  tenantName: string;
  /** Employees in Schedule 1 and in Schedule 2. */
  employeeCount: number;
  mweCount: number;
  /** Tax withheld per month, January first (the 1601-C Item 25 of each month). */
  monthlyWithholdingCents: string[];
  totalWithholdingTaxCents: string;
  form: BirFormView;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = (no: string, label: string, group?: string): BirScheduleColumn => ({ no, label, group, kind: "money" });
const text = (no: string, label: string, group?: string): BirScheduleColumn => ({ no, label, group, kind: "text" });

const PRESENT = "Present Employer";
const PREVIOUS = "Previous Employer";

const TAX_COLUMNS: BirScheduleColumn[] = [
  money("13", "Total Taxable Compensation Income (Present & Previous Employer)"),
  money("14", "Tax Due (January to December)"),
  money("15a", "Tax Withheld (January to November): Previous Employer"),
  money("15b", "Tax Withheld (January to November): Present Employer"),
  money("16", "5% Tax Credit (PERA Act of 2008)"),
  money("17a", "Year-End Adjustment: Amount Withheld and Paid for in December or Last Salary"),
  money("17b", "Year-End Adjustment: Over Withheld Tax Refunded to Employee"),
  money("18", "Amount of Tax Withheld as Adjusted (To be reflected in BIR Form No. 2316 issued by the present employer)"),
  text("19", "Substituted Filing? Yes/No"),
];

export const SCHEDULE_1_COLUMNS: BirScheduleColumn[] = [
  text("1", "Seq. No."),
  text("2a", "Name of Employees: Last Name"),
  text("2b", "Name of Employees: First Name"),
  text("2c", "Name of Employees: Middle Name"),
  text("3", "Nationality/Resident (for foreigners only)"),
  text("4", "Current Employment Status"),
  text("5a", "Period of Employment: From (MM/DD)"),
  text("5b", "Period of Employment: To (MM/DD)"),
  text("6", "Reason of Separation, if applicable"),
  money("7a", "Gross Compensation Income (present employer)", PRESENT),
  money("7b", "Non-Taxable/Exempt: 13th Month Pay & Other Benefits", PRESENT),
  money("7c", "Non-Taxable/Exempt: De Minimis Benefits", PRESENT),
  money("7d", "Non-Taxable/Exempt: SSS, GSIS, PHIC, HDMF Contributions and Union Dues (employee share only)", PRESENT),
  money("7e", "Non-Taxable/Exempt: Salaries (P250,000 & below) & Other Forms of Compensation", PRESENT),
  money("7f", "Total Non-Taxable/Exempt Compensation Income (present employer)", PRESENT),
  money("7g", "Taxable: Basic Salary (net of SSS, GSIS, PHIC, HDMF Contributions & Union Dues)", PRESENT),
  money("7h", "Taxable: 13th Month Pay & Other Benefits (In Excess of Threshold)", PRESENT),
  money("7i", "Taxable: Salaries and Other Forms of Compensation", PRESENT),
  money("7j", "Total Taxable Compensation Income (present employer)", PRESENT),
  text("8", "TIN (Previous Employer)", PREVIOUS),
  text("9", "Employment Status", PREVIOUS),
  text("10a", "Period of Employment: From (MM/DD)", PREVIOUS),
  text("10b", "Period of Employment: To (MM/DD)", PREVIOUS),
  text("11", "Reason of Separation, if applicable", PREVIOUS),
  money("12a", "Gross Compensation Income (previous employer)", PREVIOUS),
  money("12b", "Non-Taxable/Exempt: 13th Month Pay & Other Benefits", PREVIOUS),
  money("12c", "Non-Taxable/Exempt: De Minimis Benefits", PREVIOUS),
  money("12d", "Non-Taxable/Exempt: SSS, GSIS, PHIC, HDMF Contributions & Union Dues (employee share only)", PREVIOUS),
  money("12e", "Non-Taxable/Exempt: Salaries (P250,000 and below) and Other Forms of Compensation", PREVIOUS),
  money("12f", "Total Non-Taxable/Exempt Compensation Income (previous employer)", PREVIOUS),
  money("12g", "Taxable: Basic Salary (net of SSS, GSIS, PHIC, HDMF Contributions & Union Dues)", PREVIOUS),
  money("12h", "Taxable: 13th Month Pay & Other Benefits", PREVIOUS),
  money("12i", "Taxable: Salaries and Other Forms of Compensation", PREVIOUS),
  money("12j", "Total Taxable Compensation Income (previous employer)", PREVIOUS),
  ...TAX_COLUMNS,
];

export const SCHEDULE_2_COLUMNS: BirScheduleColumn[] = [
  text("1", "Seq. No."),
  text("2a", "Name of Employees: Last Name"),
  text("2b", "Name of Employees: First Name"),
  text("2c", "Name of Employees: Middle Name"),
  text("3", "Current Employment Status"),
  text("4", "Region No. Where Assigned"),
  text("5a", "Period of Employment: From (MM/DD)"),
  text("5b", "Period of Employment: To (MM/DD)"),
  text("6", "Reason of Separation, if applicable"),
  money("7a", "Gross Compensation Income (present employer)", PRESENT),
  money("7b", "Non-Taxable: Basic/SMW per Day", PRESENT),
  money("7c", "Non-Taxable: Basic/SMW per Month", PRESENT),
  money("7d", "Non-Taxable: Basic/SMW per Year", PRESENT),
  text("7e", "Non-Taxable: Factor Used (No. of Days/Year)", PRESENT),
  money("7f", "Non-Taxable: Basic/SMW (actual) (net of SSS, GSIS, PHIC, HDMF Contributions & Union Dues)", PRESENT),
  money("7g", "Non-Taxable: Holiday Pay", PRESENT),
  money("7h", "Non-Taxable: Overtime Pay", PRESENT),
  money("7i", "Non-Taxable: Night Shift Differential", PRESENT),
  money("7j", "Non-Taxable: Hazard Pay", PRESENT),
  money("7k", "Non-Taxable: 13th Month Pay & Other Benefits", PRESENT),
  money("7l", "Non-Taxable: De Minimis Benefits", PRESENT),
  money("7m", "Non-Taxable: SSS, GSIS, PHIC, HDMF Contributions & Union Dues (employee share only)", PRESENT),
  money("7n", "Non-Taxable: Salaries and Other Forms of Compensation", PRESENT),
  money("7o", "Total Non-Taxable/Exempt Compensation Income (present employer)", PRESENT),
  money("7p", "Taxable: 13th Month Pay & Other Benefits (In Excess of Threshold)", PRESENT),
  money("7q", "Taxable: Salaries and Other Forms of Compensation", PRESENT),
  money("7r", "Total Taxable Compensation Income (present employer)", PRESENT),
  text("8", "TIN (Previous Employer)", PREVIOUS),
  text("9", "Employment Status", PREVIOUS),
  text("10a", "Period of Employment: From (MM/DD)", PREVIOUS),
  text("10b", "Period of Employment: To (MM/DD)", PREVIOUS),
  text("11", "Reason of Separation, if applicable", PREVIOUS),
  money("12a", "Gross Compensation Income (previous employer)", PREVIOUS),
  money("12b", "Non-Taxable/Exempt: Basic/SMW (actual) (net of SSS, GSIS, PHIC, HDMF Contributions & Union Dues)", PREVIOUS),
  money("12c", "Non-Taxable/Exempt: Holiday Pay", PREVIOUS),
  money("12d", "Non-Taxable/Exempt: Overtime Pay", PREVIOUS),
  money("12e", "Non-Taxable/Exempt: Night Shift Differential", PREVIOUS),
  money("12f", "Non-Taxable/Exempt: Hazard Pay", PREVIOUS),
  money("12g", "Non-Taxable/Exempt: 13th Month Pay & Other Benefits", PREVIOUS),
  money("12h", "Non-Taxable/Exempt: De Minimis Benefits", PREVIOUS),
  money("12i", "Non-Taxable/Exempt: SSS, GSIS, PHIC, HDMF Contributions & Union Dues (employee share only)", PREVIOUS),
  money("12j", "Non-Taxable/Exempt: Salaries and Other Forms of Compensation", PREVIOUS),
  money("12k", "Total Non-Taxable/Exempt Compensation (previous employer)", PREVIOUS),
  money("12l", "Taxable: 13th Month Pay & Other Benefits", PREVIOUS),
  money("12m", "Taxable: Salaries and Other Forms of Compensation", PREVIOUS),
  money("12n", "Total Taxable Compensation Income (previous employer)", PREVIOUS),
  ...TAX_COLUMNS,
];

/** Columns of Schedule 2 that are rates, not amounts to total. */
const NOT_TOTALLED = new Set(["7b", "7c", "7d"]);

const s = (n: bigint | null | undefined) => (n == null ? null : n.toString());
const mmdd = (d: Date | null | undefined) => formatMdy(d)?.slice(0, 5) ?? null;

interface TaxCells {
  cells: (string | null)[];
  withheldPresent: bigint;
  taxDue: bigint | null;
  adjusted: bigint;
}

/** Columns 13 to 19, the same in both schedules. */
function taxCells(emp: Bir1604cEmployeeInput, comp: BirComp, taxDueOf?: (c: bigint) => bigint): TaxCells {
  const prev = emp.previousEmployer ?? null;
  const total13 = comp.totalTaxable + (prev?.taxableCompensationCents ?? 0n);
  const due = taxDueOf ? taxDueOf(total13) : null;

  // "December or last salary": December for an employee still with the
  // company, the month of the last payslip for one who left in the year.
  const months = emp.sheets.map((x) => x.month ?? 0).filter((m) => m > 0);
  const lastMonth = emp.separatedInYear ? (months.length ? Math.max(...months) : 0) : 12;
  let last = 0n;
  for (const x of emp.sheets) if ((x.month ?? 0) === lastMonth) last += x.withholdingTaxCents;

  const col15a = prev?.withholdingTaxCents ?? 0n;
  const col15b = comp.withholding - last;
  const col16 = 0n;
  const col17a = last > 0n ? last : 0n;
  const col17b = last < 0n ? -last : 0n;
  const col18 = col15a + col15b + col16 + col17a - col17b;
  const substituted = !prev && due !== null && due === col18;
  return {
    cells: [
      s(total13), s(due), s(col15a), s(col15b), s(col16), s(col17a), s(col17b), s(col18),
      due === null ? null : substituted ? "Yes" : "No",
    ],
    withheldPresent: comp.withholding,
    taxDue: due,
    adjusted: col18,
  };
}

function identityCells(emp: Bir1604cEmployeeInput, seq: number, schedule: 1 | 2): (string | null)[] {
  const foreign = emp.nationality && !/^filipin[oa]$/i.test(emp.nationality.trim()) ? emp.nationality.trim() : null;
  const name = [emp.lastName, [emp.firstName, emp.suffix].filter(Boolean).join(" "), emp.middleName ?? null];
  const period = [mmdd(emp.person?.periodFrom), mmdd(emp.person?.periodTo), emp.separationReasonCode ?? null];
  return schedule === 1
    ? [`${seq}`, ...name, foreign, emp.employmentStatusCode ?? null, ...period]
    : [`${seq}`, ...name, emp.employmentStatusCode ?? null, emp.region ?? null, ...period];
}

function totalsOf(columns: BirScheduleColumn[], rows: (string | null)[][]): (string | null)[] {
  return columns.map((col, i) => {
    if (col.kind !== "money" || NOT_TOTALLED.has(col.no)) return null;
    let sum = 0n;
    for (const r of rows) sum += BigInt(r[i] ?? "0");
    return sum.toString();
  });
}

export function buildBir1604cReport(input: Bir1604cInput): Bir1604cReport {
  const { year, tenantId, tenantName, agent } = input;
  const people = input.employees
    .filter((e) => e.sheets.length > 0 || e.priorPayrollOpening)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const rows1: (string | null)[][] = [];
  const rows2: (string | null)[][] = [];
  const monthly = Array.from({ length: 12 }, () => 0n);
  let all = ZERO_COMP;
  let openingTax = 0n;
  let notEqual = 0;
  let previousCount = 0;

  for (const emp of people) {
    const c = yearCompOf(emp);
    all = addComp(all, c);
    for (const x of emp.sheets) if (x.month && x.month >= 1 && x.month <= 12) monthly[x.month - 1]! += x.withholdingTaxCents;
    openingTax += emp.priorPayrollOpening?.withholdingTaxCents ?? 0n;

    const prev = emp.previousEmployer ?? null;
    if (prev) previousCount += 1;
    const tax = taxCells(emp, c, input.taxDue);
    if (tax.taxDue !== null && tax.taxDue !== tax.adjusted) notEqual += 1;

    const isMwe = c.mweBasic + c.mweHoliday + c.mweOvertime + c.mweNsd + c.mweHazard > 0n;
    const prevTaxable = prev?.taxableCompensationCents ?? null;
    const prevNt13 = prev ? prev.nontaxable13MonthAndBenefitsCents ?? 0n : null;
    const prevGross = prev ? (prevTaxable ?? 0n) + (prevNt13 ?? 0n) : null;
    const zeroIfPrev = prev ? 0n : null;
    const prevIdentity = [formatTin(prev?.tin), null, null, null, null];

    if (!isMwe) {
      rows1.push([
        ...identityCells(emp, rows1.length + 1, 1),
        s(c.gross), s(c.nt13th), s(c.deMinimis), s(c.contributions), s(c.otherNontaxable), s(c.totalNontaxable),
        s(c.taxBasic), s(c.tax13th), s(c.totalTaxable - c.taxBasic - c.tax13th), s(c.totalTaxable),
        ...prevIdentity,
        s(prevGross), s(prevNt13), s(zeroIfPrev), s(zeroIfPrev), s(zeroIfPrev), s(prevNt13),
        s(zeroIfPrev), s(zeroIfPrev), s(prevTaxable), s(prevTaxable),
        ...tax.cells,
      ]);
    } else {
      const daily = emp.person?.smwDailyCents ?? null;
      const days = emp.daysPerYear ?? null;
      rows2.push([
        ...identityCells(emp, rows2.length + 1, 2),
        s(c.gross),
        s(daily), s(emp.person?.smwMonthlyCents ?? null), s(daily !== null && days ? daily * BigInt(days) : null),
        days ? `${days}` : null,
        s(c.mweBasic), s(c.mweHoliday), s(c.mweOvertime), s(c.mweNsd), s(c.mweHazard),
        s(c.nt13th), s(c.deMinimis), s(c.contributions), s(c.otherNontaxable), s(c.totalNontaxable),
        s(c.tax13th), s(c.totalTaxable - c.tax13th), s(c.totalTaxable),
        ...prevIdentity,
        s(prevGross), s(zeroIfPrev), s(zeroIfPrev), s(zeroIfPrev), s(zeroIfPrev), s(zeroIfPrev),
        s(prevNt13), s(zeroIfPrev), s(zeroIfPrev), s(zeroIfPrev), s(prevNt13),
        s(zeroIfPrev), s(prevTaxable), s(prevTaxable),
        ...tax.cells,
      ]);
    }
  }

  const monthTotal = monthly.reduce((a, b) => a + b, 0n);
  const remittances: BirSchedule = {
    title: "Part II: Summary of Remittances per BIR Form No. 1601-C",
    columns: [
      text("", "Month"),
      text("", "Date of Remittance (MM/DD/YYYY)"),
      text("", "Drawee Bank/Bank Code/Agency"),
      text("", "TRA/eROR/eAR Number"),
      money("", "Taxes Withheld"),
      money("", "Adjustment"),
      money("", "Penalties"),
      money("", "Total Amount Remitted"),
    ],
    rows: MONTHS.map((m, i) => [m, null, null, null, monthly[i]!.toString(), null, null, null]),
    totals: ["TOTAL", null, null, null, monthTotal.toString(), null, null, null],
  };

  const footnotes = [
    `Figures come from the finalized payroll runs of ${year}: ${rows1.length} employee(s) in Schedule 1 and ${rows2.length} minimum wage earner(s) in Schedule 2. Each row agrees with that employee's BIR Form No. 2316.`,
    "Part II: Taxes Withheld is Item 25 of each month's BIR Form No. 1601-C. The date, bank, reference number, adjustment, penalties and total remitted are not payroll figures. Fill them in when filing.",
    "Part I Items 2, 3, 5, 8A and 11 to 13 are not payroll figures. Fill them in when filing.",
    "Current Employment Status: R = Regular, C = Casual, CP = Contractual/Project-Based, S = Seasonal, P = Probationary, AL = Apprentices/Learners. Reason of Separation: T = Terminated/Resigned, TR = Transferred, R = Retirement, D = Death.",
    "Columns 17a and 17b are the tax withheld or refunded in December, or in the month of the last payslip of an employee who left in the year. Column 16 is zero: Sentire Payroll does not record PERA tax credits.",
    "Column 19 is Yes when the employee had no previous employer in the year and tax due (14) equals tax withheld (18).",
  ];
  if (previousCount > 0) footnotes.push("Previous employer: only the TIN, the taxable pay, the exempt 13th month and other benefits and the tax withheld are kept. Taxable pay is shown under Salaries and Other Forms of Compensation; take the rest from that employer's BIR Form No. 2316.");
  if (notEqual > 0) footnotes.push(`${notEqual} employee(s) have tax due (14) different from tax withheld (18). Settle the difference before filing; they do not qualify for substituted filing.`);
  if (openingTax !== 0n) footnotes.push(`Tax withheld before Sentire Payroll (year-to-date openings) of ${formatCentavos(openingTax)} is in the alphalist (15b) but not in a month of Part II.`);
  if (!input.taxDue) footnotes.push("Column 14 is blank: no BIR withholding table is in force for the year.");

  const form: BirFormView = {
    formNo: "1604-C",
    version: "January 2018 (ENCS), alphalist format of RMC 160-2022",
    title: "Annual Information Return of Income Taxes Withheld on Compensation",
    period: `${year}`,
    sections: [
      {
        heading: "Part I: Background Information",
        lines: [
          textLine("1", "For the Year (20YY)", `${year}`),
          textLine("2", "Amended Return?", null),
          textLine("3", "Number of Sheet/s Attached", null),
          textLine("4", "Taxpayer Identification Number (TIN)", formatTin(agent?.tin)),
          textLine("5", "RDO Code", agent?.rdoCode),
          textLine("6", "Withholding Agent's Name", agent?.name ?? tenantName),
          textLine("7", "Registered Address", agent?.address),
          textLine("7A", "ZIP Code", agent?.zipCode),
          textLine("8", "Category of Withholding Agent", "Private"),
          textLine("8A", "If private, top withholding agent?", null),
          textLine("9", "Contact Number", agent?.contactNumber),
          textLine("10", "Email Address", agent?.email),
          textLine("11", "In case of overwithholding/overremittance after the year-end adjustments on compensation, have you released the refund/s to your employee/s?", null),
          textLine("11A", "If Yes, specify the date of refund (MM/DD/YYYY)", null),
          textLine("12", "Total amount of overremittance on Tax withheld under compensation", null),
          textLine("13", "Month of First Crediting of Overremittance (MM)", null),
        ],
      },
    ],
    schedules: [
      remittances,
      {
        title: "Schedule 1: Alphalist of Employees (Declared and Certified using BIR Form No. 2316)",
        columns: SCHEDULE_1_COLUMNS,
        rows: rows1,
        totals: totalsOf(SCHEDULE_1_COLUMNS, rows1),
      },
      {
        title: "Schedule 2: Alphalist of Minimum Wage Earners (Declared and Certified using BIR Form No. 2316)",
        columns: SCHEDULE_2_COLUMNS,
        rows: rows2,
        totals: totalsOf(SCHEDULE_2_COLUMNS, rows2),
      },
    ],
    footnotes,
  };

  return {
    year,
    tenantId,
    tenantName,
    employeeCount: rows1.length,
    mweCount: rows2.length,
    monthlyWithholdingCents: monthly.map((m) => m.toString()),
    totalWithholdingTaxCents: all.withholding.toString(),
    form,
  };
}
