/**
 * BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld.
 *
 * Employers must furnish each employee on or before 31 January of the
 * following year (or on termination / last day of employment).  It
 * summarises annual compensation, non-taxable income, statutory
 * deductions, and total income tax withheld during the calendar year.
 *
 * PAY-71: each certificate carries `form`, the certificate written out item
 * by item in the mandated structure (September 2021 ENCS, RMC 34-2022):
 * Parts I to III, Part IV-A Items 19 to 28 and Part IV-B Items 29 to 52. No
 * added lines; what Sentire has to say is in the footnotes. The older summary
 * fields are kept for the callers that read them.
 *
 * Pure function — no DB access.
 */

import type { TaxClassification } from "@prisma/client";
import { ZERO_COMP, addComp, splitOpening, splitSheet, type BirComp } from "./bir-comp";
import {
  formatCentavos, formatMdy, formatTin, moneyLine, textLine, type BirFormView,
} from "./bir-form";
import type { BirWithholdingAgent } from "./bir-1601c";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface Bir2316SheetInput {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  withholdingTaxCents: bigint;
  /** PAY-71: the payslip split into the form's items (the route supplies it). */
  comp?: BirComp;
}

/** PAY-71: what Part I of the certificate says about the employee. */
export interface Bir2316Person {
  tin: string | null;
  address: string | null;
  zipCode: string | null;
  birthDate: Date | null;
  contactNumber: string | null;
  /** First and last day of employment inside the year. */
  periodFrom: Date | null;
  periodTo: Date | null;
  /** The region's minimum wage per day and per month, for an MWE. */
  smwDailyCents: bigint | null;
  smwMonthlyCents: bigint | null;
}

export interface Bir2316EmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  sheets: Bir2316SheetInput[];
  /** PAY-71: Part I details (the route supplies them). */
  person?: Bir2316Person;
  /**
   * PAY-144: this company's pay to the employee earlier in the year, before
   * it used Sentire. It is this employer's compensation, so it is added to
   * every box; it is not a pay period.
   */
  priorPayrollOpening?: Bir2316SheetInput;
  /** PAY-144: a previous employer's 2316 for the same year (a transferee). */
  previousEmployer?: Bir2316PreviousEmployerInput | null;
}

export interface Bir2316PreviousEmployerInput {
  name: string;
  tin: string | null;
  taxableCompensationCents: bigint;
  withholdingTaxCents: bigint;
}

export interface Bir2316Input {
  year: number;
  tenantId: string;
  tenantName: string;
  /** PAY-71: Part II of the certificate (the present employer). */
  employer?: BirWithholdingAgent;
  /** PAY-71: the year's tax on a taxable amount (the BIR annual table). */
  taxDue?: (annualTaxableCents: bigint) => bigint;
  employees: Bir2316EmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface Bir2316Certificate {
  year: number;
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /// Taxpayer Identification Number, null when the employee has none on file.
  tin: string | null;
  taxClassification: TaxClassification;
  /** Number of finalized payroll sheets covering this employee in the year. */
  payPeriodCount: number;

  // ── Compensation (Box 13) ────────────────────────────────────────────────
  /** Sum of grossCompensationCents across all run types for the year. */
  totalGrossCompensationCents: string;

  // ── Non-taxable buckets ─────────────────────────────────────────────────
  /** Box 21 — MWE-exempt compensation and non-taxable basic amount. */
  totalMweAndNontaxableBasicCents: string;
  /** Box 22 — 13th month pay and other benefits (TRAIN ₱90,000 cap). */
  totalNontaxable13MonthAndBenefitsCents: string;
  /** Box 23 — Other non-taxable compensation (de minimis, etc.).
   *  This is nontaxableCompensationCents net of mandatory EE contributions
   *  (which are reported separately in Box 24). */
  totalOtherNontaxableCents: string;

  // ── Mandatory EE contributions (Box 24) ─────────────────────────────────
  totalSssEeCents: string;
  totalPhilhealthEeCents: string;
  totalPagibigEeCents: string;
  /** Convenience sum: SSS EE + PhilHealth EE + Pag-IBIG EE. */
  totalMandatoryEeCents: string;

  // ── Taxable income (Box 25) ──────────────────────────────────────────────
  /** Sum of grossTaxableIncomeCents across all runs. */
  totalGrossTaxableIncomeCents: string;

  // ── Withholding tax (Box 27) ─────────────────────────────────────────────
  /** Total income tax withheld and remitted for the year. */
  totalWithholdingTaxCents: string;

  // ── PAY-144: year-to-date openings ──────────────────────────────────────
  /** True when the totals above include pay before Sentire (same employer). */
  includesPriorPayrollOpening: boolean;
  /** A previous employer's figures for the year, or null. */
  previousEmployer: {
    name: string;
    tin: string | null;
    taxableCompensationCents: string;
    withholdingTaxCents: string;
  } | null;
  /** Taxable compensation from this employer plus the previous employer. */
  totalGrossTaxableAllEmployersCents: string;
  /** Tax withheld by this employer plus the previous employer. */
  totalWithholdingAllEmployersCents: string;
  /** PAY-71: the certificate in its mandated structure. */
  form: BirFormView;
}

export interface Bir2316Report {
  year: number;
  tenantId: string;
  tenantName: string;
  /** Number of employees with at least one finalized sheet in the year. */
  employeeCount: number;
  /** Per-employee certificates, sorted by lastName then firstName. */
  certificates: Bir2316Certificate[];
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

export function buildBir2316Report(input: Bir2316Input): Bir2316Report {
  const { year, tenantId, tenantName, employees } = input;

  const certificates: Bir2316Certificate[] = [];

  for (const emp of employees) {
    if (emp.sheets.length === 0 && !emp.priorPayrollOpening) continue;

    let totalGross = 0n;
    let totalMweBasic = 0n;
    let totalNt13Month = 0n;
    let totalNtComp = 0n;
    let totalSss = 0n;
    let totalPhic = 0n;
    let totalPagibig = 0n;
    let totalTaxable = 0n;
    let totalWht = 0n;

    const rows = emp.priorPayrollOpening
      ? [...emp.sheets, emp.priorPayrollOpening]
      : emp.sheets;
    for (const s of rows) {
      totalGross += s.grossCompensationCents;
      totalMweBasic += s.mweExemptCompensationCents + s.nontaxableBasicCents;
      totalNt13Month += s.nontaxable13MonthAndBenefitsCents;
      totalNtComp += s.nontaxableCompensationCents;
      totalSss += s.sssEeCents;
      totalPhic += s.philhealthEeCents;
      totalPagibig += s.pagibigEeCents;
      totalTaxable += s.grossTaxableIncomeCents;
      totalWht += s.withholdingTaxCents;
    }

    // Box 23: nontaxableCompensation already includes mandatory EE contribs
    // (they were added to the non-taxable bucket inside the engine).  Remove
    // them so Box 23 shows only "other" non-taxable items (de minimis, etc.)
    // and Box 24 shows the contributions separately.
    const mandatoryEe = totalSss + totalPhic + totalPagibig;
    const prev = emp.previousEmployer ?? null;
    const otherNontaxable =
      totalNtComp > mandatoryEe ? totalNtComp - mandatoryEe : 0n;

    certificates.push({
      year,
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      tin: formatTin(emp.person?.tin),
      taxClassification: emp.taxClassification,
      payPeriodCount: emp.sheets.length,
      totalGrossCompensationCents: totalGross.toString(),
      totalMweAndNontaxableBasicCents: totalMweBasic.toString(),
      totalNontaxable13MonthAndBenefitsCents: totalNt13Month.toString(),
      totalOtherNontaxableCents: otherNontaxable.toString(),
      totalSssEeCents: totalSss.toString(),
      totalPhilhealthEeCents: totalPhic.toString(),
      totalPagibigEeCents: totalPagibig.toString(),
      totalMandatoryEeCents: mandatoryEe.toString(),
      totalGrossTaxableIncomeCents: totalTaxable.toString(),
      totalWithholdingTaxCents: totalWht.toString(),
      includesPriorPayrollOpening: !!emp.priorPayrollOpening,
      previousEmployer: prev
        ? {
            name: prev.name,
            tin: prev.tin,
            taxableCompensationCents: prev.taxableCompensationCents.toString(),
            withholdingTaxCents: prev.withholdingTaxCents.toString(),
          }
        : null,
      totalGrossTaxableAllEmployersCents: (totalTaxable + (prev?.taxableCompensationCents ?? 0n)).toString(),
      totalWithholdingAllEmployersCents: (totalWht + (prev?.withholdingTaxCents ?? 0n)).toString(),
      form: form2316({ year, tenantName, employer: input.employer, taxDue: input.taxDue, emp }),
    });
  }

  certificates.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });

  return {
    year,
    tenantId,
    tenantName,
    employeeCount: certificates.length,
    certificates,
  };
}

// ---------------------------------------------------------------------------
// PAY-71: the certificate in its mandated structure
// ---------------------------------------------------------------------------

/** A payslip in the form's items; older callers pass the totals only. */
function compOfSheet(s: Bir2316SheetInput): BirComp {
  if (s.comp) return s.comp;
  return splitSheet({
    ...s,
    basePayCents: 0n, lateUndertimeDeductionCents: 0n, otPayCents: 0n, nsdPayCents: 0n,
    holidayPayCents: 0n, hazardPayCents: 0n, restDayPayCents: 0n,
    deMinimisExemptCents: 0n, commissionTaxableCents: 0n, allowanceTaxableCents: 0n,
    benefitsExcessCents: 0n,
  });
}

/** The year's pay of one employee from this employer, in the form's items. */
export function yearCompOf(emp: Bir2316EmployeeInput): BirComp {
  let comp = emp.sheets.map(compOfSheet).reduce(addComp, ZERO_COMP);
  if (emp.priorPayrollOpening) comp = addComp(comp, splitOpening(emp.priorPayrollOpening));
  return comp;
}

const mmdd = (d: Date | null | undefined) => {
  const full = formatMdy(d);
  return full ? full.slice(0, 5) : null;
};

/** BIR Form No. 2316, September 2021 (ENCS). */
function form2316(a: {
  year: number;
  tenantName: string;
  employer?: BirWithholdingAgent;
  taxDue?: (annualTaxableCents: bigint) => bigint;
  emp: Bir2316EmployeeInput;
}): BirFormView {
  const { emp } = a;
  const c = yearCompOf(emp);
  const p = emp.person;
  const prev = emp.previousEmployer ?? null;
  const isMwe = c.mweBasic + c.mweHoliday + c.mweOvertime + c.mweNsd + c.mweHazard > 0n;

  const item21 = c.totalTaxable;
  const item22 = prev?.taxableCompensationCents ?? 0n;
  const item23 = item21 + item22;
  const item24 = a.taxDue ? a.taxDue(item23) : null;
  const item25A = c.withholding;
  const item25B = prev?.withholdingTaxCents ?? 0n;
  const item26 = item25A + item25B;

  const name = [emp.lastName, [emp.firstName, emp.suffix].filter(Boolean).join(" "), emp.middleName]
    .filter(Boolean)
    .join(", ");
  const period =
    p?.periodFrom && p?.periodTo ? `${mmdd(p.periodFrom)} to ${mmdd(p.periodTo)}` : null;

  const footnotes = [
    `Figures come from the finalized payroll runs of ${a.year}: ${emp.sheets.length} payslip(s).`,
    "Item 39 is basic salary net of the employee's SSS, PhilHealth and Pag-IBIG contributions; the contributions are in Item 36.",
    "Item 27: Sentire Payroll does not record PERA tax credits. It is shown as zero; change it if the employee gave a PERA tax credit certificate.",
  ];
  if (isMwe) footnotes.push("The contributions in Item 36 are taken from taxable pay when the employee has any, otherwise from the wage in Item 29, so Item 38 never counts them twice.");
  if (c.taxAllowances > 0n) footnotes.push("Item 44A: taxable allowances. Sentire Payroll does not classify allowances as representation, transportation, cost of living or housing (Items 40 to 43).");
  if (c.taxPremiums > 0n) footnotes.push("Item 51A: holiday, rest day and night shift pay.");
  if (c.taxOther > 0n) footnotes.push("Item 51B: other taxable pay (for example taxable leave conversion, taxable separation pay, taxable adjustments and other earnings).");
  if (emp.priorPayrollOpening) footnotes.push("Includes this employer's pay earlier in the year, before Sentire Payroll (a year-to-date opening). Its taxable pay is shown as basic salary (Item 39) because its split was not recorded.");
  if (prev) footnotes.push("Items 16 to 18 and 22: the previous employer's address is not kept; take it from that employer's certificate.");
  if (!p) footnotes.push("Part I details (TIN, address, date of birth) were not supplied.");
  else {
    if (!p.tin) footnotes.push("Item 3: the employee has no TIN on file.");
    footnotes.push("Item 5: the RDO Code is not kept in Sentire Payroll. Fill it in.");
  }
  if (item24 !== null && item24 !== item26) {
    const diff = item24 - item26;
    footnotes.push(
      diff > 0n
        ? `Tax due (Item 24) is more than tax withheld (Item 26) by ${formatCentavos(diff)}.`
        : `Tax withheld (Item 26) is more than tax due (Item 24) by ${formatCentavos(-diff)}.`,
    );
  }

  return {
    formNo: "2316",
    version: "September 2021 (ENCS)",
    title: "Certificate of Compensation Payment/Tax Withheld",
    period: `${a.year}`,
    sections: [
      {
        heading: "Part I: Employee Information",
        lines: [
          textLine("1", "For the Year (YYYY)", `${a.year}`),
          textLine("2", "For the Period From (MM/DD) To (MM/DD)", period),
          textLine("3", "TIN", formatTin(p?.tin)),
          textLine("4", "Employee's Name (Last Name, First Name, Middle Name)", name),
          textLine("5", "RDO Code", null),
          textLine("6", "Registered Address", p?.address),
          textLine("6A", "ZIP Code", p?.zipCode),
          textLine("6B", "Local Home Address", null),
          textLine("6C", "ZIP Code", null),
          textLine("6D", "Foreign Address", null),
          textLine("7", "Date of Birth (MM/DD/YYYY)", formatMdy(p?.birthDate)),
          textLine("8", "Contact Number", p?.contactNumber),
          moneyLine("9", "Statutory Minimum Wage rate per day", isMwe ? p?.smwDailyCents ?? null : null),
          moneyLine("10", "Statutory Minimum Wage rate per month", isMwe ? p?.smwMonthlyCents ?? null : null),
          textLine("11", "Minimum Wage Earner (MWE) whose compensation is exempt from withholding tax and not subject to income tax", isMwe ? "X" : null),
        ],
      },
      {
        heading: "Part II: Employer Information (Present)",
        lines: [
          textLine("12", "TIN", formatTin(a.employer?.tin)),
          textLine("13", "Employer's Name", a.employer?.name ?? a.tenantName),
          textLine("14", "Registered Address", a.employer?.address),
          textLine("14A", "ZIP Code", a.employer?.zipCode),
          textLine("15", "Type of Employer", "Main Employer"),
        ],
      },
      {
        heading: "Part III: Employer Information (Previous)",
        lines: [
          textLine("16", "TIN", formatTin(prev?.tin)),
          textLine("17", "Employer's Name", prev?.name),
          textLine("18", "Registered Address", null),
          textLine("18A", "ZIP Code", null),
        ],
      },
      {
        heading: "Part IV-A: Summary",
        lines: [
          moneyLine("19", "Gross Compensation Income from Present Employer (Sum of Items 38 and 52)", c.gross),
          moneyLine("20", "Less: Total Non-Taxable/Exempt Compensation Income from Present Employer (From Item 38)", c.totalNontaxable),
          moneyLine("21", "Taxable Compensation Income from Present Employer (Item 19 Less Item 20) (From Item 52)", item21),
          moneyLine("22", "Add: Taxable Compensation Income from Previous Employer, if applicable", item22),
          moneyLine("23", "Gross Taxable Compensation Income (Sum of Items 21 and 22)", item23),
          moneyLine("24", "Tax Due", item24),
          moneyLine("25A", "Amount of Taxes Withheld: Present Employer", item25A),
          moneyLine("25B", "Amount of Taxes Withheld: Previous Employer, if applicable", item25B),
          moneyLine("26", "Total Amount of Taxes Withheld as adjusted (Sum of Items 25A and 25B)", item26),
          moneyLine("27", "5% Tax Credit (PERA Act of 2008)", 0n),
          moneyLine("28", "Total Taxes Withheld (Sum of Items 26 and 27)", item26),
        ],
      },
      {
        heading: "Part IV-B: Details of Compensation Income and Tax Withheld from Present Employer. A. Non-Taxable/Exempt Compensation Income",
        lines: [
          moneyLine("29", "Basic Salary (including the exempt P250,000 & below) or the Statutory Minimum Wage of the MWE", c.mweBasic),
          moneyLine("30", "Holiday Pay (MWE)", c.mweHoliday),
          moneyLine("31", "Overtime Pay (MWE)", c.mweOvertime),
          moneyLine("32", "Night Shift Differential (MWE)", c.mweNsd),
          moneyLine("33", "Hazard Pay (MWE)", c.mweHazard),
          moneyLine("34", "13th Month Pay and Other Benefits (maximum of P90,000)", c.nt13th),
          moneyLine("35", "De Minimis Benefits", c.deMinimis),
          moneyLine("36", "SSS, GSIS, PHIC & PAG-IBIG Contributions and Union Dues (Employee share only)", c.contributions),
          moneyLine("37", "Salaries and Other Forms of Compensation", c.otherNontaxable),
          moneyLine("38", "Total Non-Taxable/Exempt Compensation Income (Sum of Items 29 to 37)", c.totalNontaxable),
        ],
      },
      {
        heading: "B. Taxable Compensation Income: Regular",
        lines: [
          moneyLine("39", "Basic Salary", c.taxBasic),
          moneyLine("40", "Representation", 0n),
          moneyLine("41", "Transportation", 0n),
          moneyLine("42", "Cost of Living Allowance (COLA)", 0n),
          moneyLine("43", "Fixed Housing Allowance", 0n),
          moneyLine("44A", "Others (specify)", c.taxAllowances),
          moneyLine("44B", "Others (specify)", 0n),
        ],
      },
      {
        heading: "Taxable Compensation Income: Supplementary",
        lines: [
          moneyLine("45", "Commission", c.taxCommission),
          moneyLine("46", "Profit Sharing", 0n),
          moneyLine("47", "Fees Including Director's Fees", 0n),
          moneyLine("48", "Taxable 13th Month Benefits", c.tax13th),
          moneyLine("49", "Hazard Pay", c.taxHazard),
          moneyLine("50", "Overtime Pay", c.taxOvertime),
          moneyLine("51A", "Others (specify)", c.taxPremiums),
          moneyLine("51B", "Others (specify)", c.taxOther),
          moneyLine("52", "Total Taxable Compensation Income (Sum of Items 39 to 51B)", c.totalTaxable),
        ],
      },
    ],
    schedules: [],
    footnotes,
  };
}
