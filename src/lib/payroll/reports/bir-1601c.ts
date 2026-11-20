/**
 * BIR Form 1601-C — Monthly Remittance Return of Income Taxes Withheld on
 * Compensation.
 *
 * Employers must file and remit withheld compensation income tax monthly
 * (due 10th–15th of the following month, depending on industry group) via
 * BIR eFPS / eBIRForms.
 *
 * This module produces a structured data object aggregating the required
 * compensation and withholding tax figures from FINALIZED PayrollSheets
 * whose PayrollBook `periodEnd` falls within the requested calendar
 * month/year.
 *
 * PAY-71: `form` is the return itself, written out item by item in the
 * mandated structure (January 2018 ENCS): Part I, then Part II Items 14 to
 * 36. No added columns; what Sentire has to say is in the footnotes.
 *
 * Pure function — no DB access.  The route layer performs the query and
 * passes pre-loaded data here.
 */

import type { TaxClassification } from "@prisma/client";
import { ZERO_COMP, addComp, splitSheet, type BirComp } from "./bir-comp";
import { formatTin, moneyLine, textLine, type BirFormView } from "./bir-form";

// ---------------------------------------------------------------------------
// Input shape (provided by route layer)
// ---------------------------------------------------------------------------

export interface Bir1601cSheetInput {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  withholdingTaxCents: bigint;
  /** PAY-71: the payslip split into the form's items (the route supplies it). */
  comp?: BirComp;
}

/** PAY-71: the withholding agent, for Part I of the return. */
export interface BirWithholdingAgent {
  tin: string | null;
  rdoCode: string | null;
  name: string;
  address: string | null;
  zipCode: string | null;
  contactNumber: string | null;
  email: string | null;
}

export interface Bir1601cEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  /** PAY-71: the employee's TIN, already decrypted by the route. */
  tin?: string | null;
  sheets: Bir1601cSheetInput[];
}

export interface Bir1601cInput {
  year: number;
  month: number; // 1–12
  tenantId: string;
  tenantName: string;
  /** PAY-71: Part I of the return. Without it Part I shows the name only. */
  agent?: BirWithholdingAgent;
  employees: Bir1601cEmployeeInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface Bir1601cEntry {
  employeeId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  suffix: string | null;
  /// Taxpayer Identification Number, null when the employee has none on file.
  tin: string | null;
  taxClassification: TaxClassification;
  payPeriodCount: number;
  /// Sum of grossCompensationCents across all sheets for the month.
  totalGrossCompensationCents: string;
  /// Sum of all non-taxable buckets (MWE-exempt + nontaxableBasic +
  /// nontaxableComp + 13th-month/benefits).
  totalNonTaxableCompensationCents: string;
  /// Sum of grossTaxableIncomeCents.
  totalTaxableCompensationCents: string;
  /// Sum of withholdingTaxCents — amount to remit for this employee.
  totalWithholdingTaxCents: string;
}

export interface Bir1601cReport {
  /** Calendar year. */
  year: number;
  /** Calendar month (1 = January … 12 = December). */
  month: number;
  tenantId: string;
  tenantName: string;
  /** ISO date of the first day of the remittance month, e.g. "2026-06-01". */
  periodFrom: string;
  /** ISO date of the last day of the remittance month, e.g. "2026-06-30". */
  periodTo: string;
  /** Total gross compensation across all employees. */
  totalGrossCompensationCents: string;
  /** Total non-taxable compensation across all employees. */
  totalNonTaxableCompensationCents: string;
  /** Total taxable compensation across all employees. */
  totalTaxableCompensationCents: string;
  /** Total withholding tax to remit — the headline figure for BIR 1601-C. */
  totalWithholdingTaxCents: string;
  /** Number of distinct employees who received compensation in the month. */
  payeeCount: number;
  /** Per-employee detail rows (sorted by lastName, firstName). */
  entries: Bir1601cEntry[];
  /** PAY-71: the return in its mandated structure. */
  form: BirFormView;
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildBir1601cReport(input: Bir1601cInput): Bir1601cReport {
  const { year, month, tenantId, tenantName, employees } = input;

  const mm = String(month).padStart(2, "0");
  const periodFrom = `${year}-${mm}-01`;
  const periodTo = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  let grandGross = 0n;
  let grandNonTaxable = 0n;
  let grandTaxable = 0n;
  let grandWht = 0n;
  let payeeCount = 0;

  const entries: Bir1601cEntry[] = [];
  let all = ZERO_COMP;
  let notSubjectToWithholding = 0n;

  for (const emp of employees) {
    if (emp.sheets.length === 0) continue; // no sheets this month → skip

    // PAY-71: the month's pay of this employee in the form's items.
    const comp = emp.sheets.map(compOfSheet).reduce(addComp, ZERO_COMP);
    all = addComp(all, comp);
    // Item 23: taxable pay of an employee who is not an MWE and had no tax
    // withheld in the month (within the 250,000 a year that is not taxed).
    const mwePay = comp.mweBasic + comp.mweHoliday + comp.mweOvertime + comp.mweNsd + comp.mweHazard;
    if (mwePay === 0n && comp.withholding === 0n) notSubjectToWithholding += comp.totalTaxable;

    let totalGross = 0n;
    let totalNonTaxable = 0n;
    let totalTaxable = 0n;
    let totalWht = 0n;

    for (const s of emp.sheets) {
      totalGross += s.grossCompensationCents;
      totalNonTaxable +=
        s.mweExemptCompensationCents +
        s.nontaxableBasicCents +
        s.nontaxableCompensationCents +
        s.nontaxable13MonthAndBenefitsCents;
      totalTaxable += s.grossTaxableIncomeCents;
      totalWht += s.withholdingTaxCents;
    }

    grandGross += totalGross;
    grandNonTaxable += totalNonTaxable;
    grandTaxable += totalTaxable;
    grandWht += totalWht;
    payeeCount += 1;

    entries.push({
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      lastName: emp.lastName,
      firstName: emp.firstName,
      middleName: emp.middleName,
      suffix: emp.suffix,
      tin: formatTin(emp.tin),
      taxClassification: emp.taxClassification,
      payPeriodCount: emp.sheets.length,
      totalGrossCompensationCents: totalGross.toString(),
      totalNonTaxableCompensationCents: totalNonTaxable.toString(),
      totalTaxableCompensationCents: totalTaxable.toString(),
      totalWithholdingTaxCents: totalWht.toString(),
    });
  }

  // Sort by lastName then firstName (ascending).
  entries.sort((a, b) => {
    const lc = a.lastName.localeCompare(b.lastName);
    return lc !== 0 ? lc : a.firstName.localeCompare(b.firstName);
  });

  return {
    year,
    month,
    tenantId,
    tenantName,
    periodFrom,
    periodTo,
    totalGrossCompensationCents: grandGross.toString(),
    totalNonTaxableCompensationCents: grandNonTaxable.toString(),
    totalTaxableCompensationCents: grandTaxable.toString(),
    totalWithholdingTaxCents: grandWht.toString(),
    payeeCount,
    entries,
    form: form1601c({ year, month, tenantName, agent: input.agent, all, notSubjectToWithholding, payeeCount }),
  };
}

/** A payslip in the form's items; older callers pass the totals only. */
function compOfSheet(s: Bir1601cSheetInput): BirComp {
  if (s.comp) return s.comp;
  return splitSheet({
    ...s,
    sssEeCents: 0n, philhealthEeCents: 0n, pagibigEeCents: 0n,
    basePayCents: 0n, lateUndertimeDeductionCents: 0n, otPayCents: 0n, nsdPayCents: 0n,
    holidayPayCents: 0n, hazardPayCents: 0n, restDayPayCents: 0n,
    deMinimisExemptCents: 0n, commissionTaxableCents: 0n, allowanceTaxableCents: 0n,
    benefitsExcessCents: 0n,
  });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** BIR Form No. 1601-C, January 2018 (ENCS): Part I and Part II. */
function form1601c(a: {
  year: number;
  month: number;
  tenantName: string;
  agent?: BirWithholdingAgent;
  all: BirComp;
  notSubjectToWithholding: bigint;
  payeeCount: number;
}): BirFormView {
  const c = a.all;
  const item15 = c.mweBasic;
  const item16 = c.mweHoliday + c.mweOvertime + c.mweNsd + c.mweHazard;
  const item21 = c.totalNontaxable;
  const item22 = c.gross - item21;
  const item24 = item22 - a.notSubjectToWithholding;
  const footnotes = [
    `Figures come from the finalized payroll runs whose pay period ends in ${MONTH_NAMES[a.month - 1]} ${a.year}: ${a.payeeCount} employee(s).`,
    "Contributions of a minimum wage earner are in Item 19. They are taken from taxable pay when the employee has any, otherwise from the wage in Item 15, so Item 21 never counts them twice.",
    "Item 23 is the taxable pay of employees who are not minimum wage earners and had no tax withheld in the month.",
    "Items 2, 4, 13 and 26 to 36 (amendment, attachments, tax relief, adjustments, earlier remittances and penalties) are not payroll figures. Fill them in when filing.",
  ];
  if (!a.agent?.rdoCode) footnotes.push("Item 7: the RDO Code is not kept in Sentire Payroll. Fill it in when filing.");
  if (c.withholding < 0n) footnotes.push("Item 25 is negative: tax refunded to employees in the month was more than tax withheld.");
  return {
    formNo: "1601-C",
    version: "January 2018 (ENCS)",
    title: "Monthly Remittance Return of Income Taxes Withheld on Compensation",
    period: `${MONTH_NAMES[a.month - 1]} ${a.year}`,
    sections: [
      {
        heading: "Part I: Background Information",
        lines: [
          textLine("1", "For the Month (MM/YYYY)", `${String(a.month).padStart(2, "0")}/${a.year}`),
          textLine("2", "Amended Return?", null),
          textLine("3", "Any Taxes Withheld?", c.withholding !== 0n ? "Yes" : "No"),
          textLine("4", "Number of Sheet/s Attached", null),
          textLine("5", "ATC", "WW010"),
          textLine("6", "Taxpayer Identification Number (TIN)", formatTin(a.agent?.tin)),
          textLine("7", "RDO Code", a.agent?.rdoCode),
          textLine("8", "Withholding Agent's Name", a.agent?.name ?? a.tenantName),
          textLine("9", "Registered Address", a.agent?.address),
          textLine("9A", "ZIP Code", a.agent?.zipCode),
          textLine("10", "Contact Number", a.agent?.contactNumber),
          textLine("11", "Category of Withholding Agent", "Private"),
          textLine("12", "Email Address", a.agent?.email),
          textLine("13", "Are there payees availing of tax relief under Special Law or International Tax Treaty?", null),
        ],
      },
      {
        heading: "Part II: Computation of Tax",
        lines: [
          moneyLine("14", "Total Amount of Compensation", c.gross),
          moneyLine("15", "Statutory Minimum Wage for Minimum Wage Earners (MWEs)", item15),
          moneyLine("16", "Holiday Pay, Overtime Pay, Night Shift Differential Pay, Hazard Pay (for MWEs only)", item16),
          moneyLine("17", "13th Month Pay and Other Benefits", c.nt13th),
          moneyLine("18", "De Minimis Benefits", c.deMinimis),
          moneyLine("19", "SSS, GSIS, PHIC, HDMF Mandatory Contributions & Union Dues (employee's share only)", c.contributions),
          moneyLine("20", "Other Non-Taxable Compensation (specify)", c.otherNontaxable),
          moneyLine("21", "Total Non-Taxable Compensation (Sum of Items 15 to 20)", item21),
          moneyLine("22", "Total Taxable Compensation (Item 14 Less Item 21)", item22),
          moneyLine("23", "Less: Taxable compensation not subject to withholding tax (for employees, other than MWEs, receiving P250,000 & below for the year)", a.notSubjectToWithholding),
          moneyLine("24", "Net Taxable Compensation (Item 22 Less Item 23)", item24),
          moneyLine("25", "Total Taxes Withheld", c.withholding),
          moneyLine("26", "Add/(Less): Adjustment of Taxes Withheld from Previous Month/s (From Part IV-Schedule 1, Item 4)", null),
          moneyLine("27", "Taxes Withheld for Remittance (Sum of Items 25 and 26)", null),
          moneyLine("28", "Less: Tax Remitted in Return Previously Filed, if this is an amended return", null),
          moneyLine("29", "Other Remittances Made (specify)", null),
          moneyLine("30", "Total Tax Remittances Made (Sum of Items 28 and 29)", null),
          moneyLine("31", "Tax Still Due/(Over-remittance) (Item 27 Less Item 30)", null),
          moneyLine("32", "Add: Penalties: Surcharge", null),
          moneyLine("33", "Interest", null),
          moneyLine("34", "Compromise", null),
          moneyLine("35", "Total Penalties (Sum of Items 32 to 34)", null),
          moneyLine("36", "Total Amount Still Due/(Over-remittance) (Sum of Items 31 and 35)", null),
        ],
      },
    ],
    schedules: [],
    footnotes,
  };
}
