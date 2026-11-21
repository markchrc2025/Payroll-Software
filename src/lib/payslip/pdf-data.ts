/**
 * Everything the payslip PDF shows, built from a finalized sheet (PAY-139).
 *
 * Layout ruled by Mark (16 Nov 2026), after his two reference payslips:
 * PMFTC-style two columns, earnings with units and rate, statutory and other
 * deductions grouped, employer share for information, masked government IDs,
 * a Net Pay box that proves Gross to Net, YTD, an attendance summary and leave
 * balances, A4.
 *
 * Two guarantees the old PDF broke (PAY-138), tested in pay139-payslip-pdf:
 *   - the earnings column adds up to Gross Pay: late/undertime is a minus line
 *     inside earnings (gross already nets it), never a second deduction, and
 *     non-taxable pay that is part of gross gets its own line;
 *   - the Net Pay box adds up to Net Pay: Gross - statutory - other deductions
 *     + additions after tax; anything else the engine moved (final-pay or
 *     13th-month items) appears as an explicit "Other items" line.
 * The employee's own SSS/PhilHealth/Pag-IBIG never appear as earnings.
 */
import type { TenantTx } from "@/lib/with-tenant";
import type {
  AppliedAdjustment,
  AppliedExpenseClaim,
  AppliedLoanPayment,
  ComputePeriodInputSnapshot,
  FinalPayBreakdown,
  StatutoryBreakdown,
} from "@/lib/payroll/types";
import { loadPayslipExtras, type PayslipExtras } from "@/lib/payslip/extras";

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface PdfLine {
  label: string;
  /** e.g. "10 days", "35 min", "6.5 hrs" */
  units?: string;
  /** e.g. "₱30,000.00 / month", "MSC ₱30,000.00" */
  rate?: string;
  /** centavos; negative = reduces the total */
  amount: bigint;
}

export interface PayslipPdfData {
  company: { name: string; address: string | null };
  meta: {
    periodStart: Date;
    periodEnd: Date;
    cycle: string;
    runType: string;
    issuedAt: Date | null;
    reference: string;
  };
  employee: {
    name: string;
    number: string;
    position: string | null;
    department: string | null;
    branch: string | null;
    taxStatus: string;
    payBasis: string;
    ids: { label: string; value: string }[];
  };
  earnings: PdfLine[];
  gross: bigint;
  statutory: PdfLine[];
  statutoryTotal: bigint;
  statutoryNote: string | null;
  other: PdfLine[];
  otherTotal: bigint;
  additions: PdfLine[];
  additionsTotal: bigint;
  employer: PdfLine[];
  employerTotal: bigint;
  net: {
    rows: { label: string; amount: bigint; sign: "" | "-" | "+" }[];
    netPay: bigint;
  };
  bank: string | null;
  ytd: { label: string; amount: bigint }[];
  attendance: { label: string; value: string }[];
  leave: { label: string; value: string }[];
  /** PAY-157: a final pay payslip's summary (null on other runs). */
  finalPay: { rows: { label: string; value: string }[] } | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared with the PDF document)
// ---------------------------------------------------------------------------

export function peso(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = (abs / 100n).toLocaleString("en-PH");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "\u2212" : ""}₱${whole}.${frac}`;
}

/** Last four characters of an ID, the rest hidden: "•••• 4814". */
export function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/[^0-9A-Za-z]/g, "");
  if (clean.length === 0) return null;
  return `•••• ${clean.slice(-4)}`;
}

const CYCLE: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BI_WEEKLY: "Bi-weekly",
  SEMI_MONTHLY: "Semi-monthly",
  MONTHLY: "Monthly",
};
const RUN: Record<string, string> = {
  REGULAR: "Regular",
  OFF_CYCLE: "Off-cycle",
  FINAL_PAY: "Final pay",
  YEAR_END: "Year-end",
};
const LOAN: Record<string, string> = {
  SSS: "SSS loan",
  PAGIBIG: "Pag-IBIG loan",
  CASH_ADVANCE: "Cash advance",
  COMPANY: "Company loan",
};
const PER: Record<string, string> = { MONTHLY: "mo", DAILY: "day", WEEKLY: "wk" };
const PER_LONG: Record<string, string> = { MONTHLY: "month", DAILY: "day", WEEKLY: "week" };

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Pure builder (unit-tested)
// ---------------------------------------------------------------------------

export interface PayslipPdfSource {
  company: { name: string; tradeName?: string | null; address?: string | null; city?: string | null; province?: string | null; zipCode?: string | null };
  book: { periodStart: Date; periodEnd: Date; cycle: string; runType: string; finalizedAt: Date | null; separationReason?: string | null };
  sheet: {
    id: string;
    /** PAY-69: the payslip's control number (PS-YYYY-NNNNNN). */
    controlNumber?: string | null;
    salaryTypeSnapshot: string;
    basicSalaryCentsSnapshot: bigint;
    workingDaysDenominatorSnapshot: number;
    taxClassificationSnapshot: string;
    statutoryDeductedSnapshot: boolean;
    basePayCents: bigint;
    lateUndertimeDeductionCents: bigint;
    otPayCents: bigint;
    nsdPayCents: bigint;
    holidayPayCents: bigint;
    restDayPayCents: bigint;
    hazardPayCents: bigint;
    taxableAllowancesCents: bigint;
    /** PAY-153: the exempt part of a 13th month (YEAR_END, FINAL_PAY). */
    nontaxable13MonthAndBenefitsCents?: bigint;
    grossCompensationCents: bigint;
    grossTaxableIncomeCents: bigint;
    sssEeCents: bigint;
    sssErCents: bigint;
    sssEcCents: bigint;
    philhealthEeCents: bigint;
    philhealthErCents: bigint;
    pagibigEeCents: bigint;
    pagibigErCents: bigint;
    withholdingTaxCents: bigint;
    nontaxableAdditionsCents: bigint;
    loanDeductionsCents: bigint;
    adjustmentDeductionsCents: bigint;
    netPayCents: bigint;
    periodInputSnapshot: unknown;
    statutoryBreakdown: unknown;
    loanPaymentsApplied: unknown;
    adjustmentsApplied: unknown;
    expenseClaimsApplied: unknown;
    /** PAY-171: bonus and one-off lines; the 13th month paid in a regular run. */
    payComponentsApplied?: unknown;
    thirteenthMonthBreakdown?: unknown;
    /** PAY-171: the year-end true-up on the year's last regular run. */
    annualizationData?: unknown;
    /** PAY-194: held cutoffs released on this payslip, with their figures. */
    heldRelease?: unknown;
    /** PAY-157: the final pay items (FINAL_PAY runs). */
    finalPayBreakdown?: unknown;
  };
  employee: {
    employeeNumber: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
    position: string | null;
    department: string | null;
    branch: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    statutoryIds: { type: string; number: string | null }[];
    /** PAY-157: shown on a final pay payslip. */
    lastWorkingDate?: Date | null;
  };
  extras: PayslipExtras;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** PAY-194: "1 to 15 Nov 2026" from two YYYY-MM-DD dates. */
export function fmtRange(start: string, end: string): string {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const tail = `${d2} ${MON[m2 - 1]} ${y2}`;
  if (y1 === y2 && m1 === m2) return `${d1} to ${tail}`;
  if (y1 === y2) return `${d1} ${MON[m1 - 1]} to ${tail}`;
  return `${d1} ${MON[m1 - 1]} ${y1} to ${tail}`;
}

export function buildPayslipPdfData(src: PayslipPdfSource): PayslipPdfData {
  const { sheet, book, employee: emp, extras } = src;
  const snap = (sheet.periodInputSnapshot ?? {}) as Partial<ComputePeriodInputSnapshot>;
  const n = (k: keyof ComputePeriodInputSnapshot) => Number(snap[k] ?? 0) || 0;

  // -- Earnings (adds up to gross) ------------------------------------------
  // PAY-194: a held salary released here is one line per held cutoff; the
  // other earnings lines show this period only.
  const releases = (((sheet.heldRelease ?? null) as { releases?: { periodStart: string; periodEnd: string; amounts: Record<string, string> }[] } | null)?.releases ?? []);
  const heldOf = (k: string) => releases.reduce((t, r) => t + BigInt(r.amounts[k] ?? "0"), 0n);
  const own = (k: keyof PayslipPdfSource["sheet"]) => (sheet[k] as bigint) - heldOf(k as string);
  const per = PER[sheet.salaryTypeSnapshot] ?? "period";
  const earnings: PdfLine[] = [];
  const daysWorked = n("daysWorked");
  const unpaid = n("unpaidLeaveDays");
  // PAY-157: a final pay's items, one line each.
  const fp = book.runType === "FINAL_PAY" ? ((sheet.finalPayBreakdown ?? null) as FinalPayBreakdown | null) : null;
  const basicLabel = fp ? "Salary for the last cutoff" : "Basic pay";
  earnings.push({
    label: unpaid > 0 ? `${basicLabel} (less ${plural(unpaid, "unpaid day", "unpaid days")})` : basicLabel,
    units: daysWorked > 0 ? plural(daysWorked, "day", "days") : undefined,
    rate: `${peso(sheet.basicSalaryCentsSnapshot)}/${per}`,
    amount: own("basePayCents"),
  });
  if (own("lateUndertimeDeductionCents") !== 0n) {
    const mins = n("lateUndertimeMinutes");
    earnings.push({
      label: "Late / undertime",
      units: mins > 0 ? `${num(mins)} min` : undefined,
      amount: -own("lateUndertimeDeductionCents"),
    });
  }
  const otHours = Object.entries(snap)
    .filter(([k]) => /OtHours$/.test(k) && !/^nightDiff/.test(k))
    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
  const add = (label: string, amount: bigint, units?: string) => {
    if (amount !== 0n) earnings.push({ label, amount, units });
  };
  add("Overtime pay", own("otPayCents"), otHours > 0 ? `${num(otHours)} hrs` : undefined);
  add("Night differential", own("nsdPayCents"));
  add("Holiday pay", own("holidayPayCents"));
  add("Rest day pay", own("restDayPayCents"));
  add("Hazard pay", own("hazardPayCents"));
  // PAY-171: on a regular payslip, the 13th month and each bonus and one-off
  // pay get their own line (as on Mark's Smart payslips).
  const applied = (Array.isArray(sheet.payComponentsApplied) ? sheet.payComponentsApplied : []) as {
    name: string; amountCents: string; isBonus?: boolean; isOneOff?: boolean;
  }[];
  const bonusLines = applied.filter((a) => a.isBonus || a.isOneOff);
  const oneOffCents = applied.filter((a) => a.isOneOff).reduce((t, a) => t + BigInt(a.amountCents), 0n);
  const t13 = (sheet.thirteenthMonthBreakdown ?? null) as { dueCents?: string } | null;
  const regular13th = book.runType === "REGULAR" && t13?.dueCents ? BigInt(t13.dueCents) : 0n;
  const fpLeave = fp ? BigInt(fp.leaveCashOutCents) : 0n;
  const fpSep = fp ? BigInt(fp.separationPayCents) : 0n;
  const fpSepTaxable = fp?.isSeparationPayTaxable ? fpSep : 0n;
  const fp13 = fp ? BigInt(fp.proratedThirteenthMonthCents) : 0n;
  if (fp) {
    // The engine folds the leave cash-out, taxable separation pay and the
    // taxable part of the 13th month and bonuses into taxable allowances.
    const bonusCents = applied.filter((a) => a.isBonus && !a.isOneOff).reduce((t, a) => t + BigInt(a.amountCents), 0n);
    const excess = fp13 + bonusCents - (sheet.nontaxable13MonthAndBenefitsCents ?? 0n);
    add("Taxable allowances and additions", own("taxableAllowancesCents") - oneOffCents - fpLeave - fpSepTaxable - excess);
    add("Prorated 13th month pay", fp13);
    for (const l of bonusLines) add(l.name, BigInt(l.amountCents));
    add("Leave converted to cash", fpLeave);
    add("Separation pay (taxable)", fpSepTaxable);
  } else {
    add("Taxable allowances and additions", own("taxableAllowancesCents") - oneOffCents);
    if (regular13th > 0n || bonusLines.length > 0) {
      add("13th month pay", regular13th);
      for (const l of bonusLines) add(l.name, BigInt(l.amountCents));
    } else {
      add("13th month pay (non-taxable)", sheet.nontaxable13MonthAndBenefitsCents ?? 0n); // PAY-153
    }
  }
  for (const r of releases) {
    add(`Held salary released (${fmtRange(r.periodStart, r.periodEnd)})`, BigInt(r.amounts.grossCompensationCents ?? "0"));
  }
  const listed = earnings.reduce((s, l) => s + l.amount, 0n);
  // Whatever else gross holds (non-taxable allowances from pay components, or
  // the 13th-month excess on a final pay) gets its own line so the column adds up.
  const rest = sheet.grossCompensationCents - listed;
  if (rest !== 0n) {
    earnings.push({ label: rest > 0n ? "Non-taxable allowances" : "Amounts reported in other items", amount: rest });
  }

  // -- Statutory deductions ---------------------------------------------------
  const breakdown = (sheet.statutoryBreakdown ?? null) as StatutoryBreakdown | null;
  const bases = breakdown?.bases;
  const basis = (label: string, cents: string | undefined) =>
    cents && BigInt(cents) > 0n ? `${label} ${peso(BigInt(cents))}` : undefined;
  // PAY-133: say which month's basic the SSS is on.
  const sssBasis = breakdown?.sssBasis;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const basisMonth = sssBasis ? MONTHS[Number(sssBasis.month.slice(5, 7)) - 1] ?? sssBasis.month : "";
  const sssRate =
    sssBasis?.kind === "NEW_HIRE_NO_SSS"
      ? "None in first month"
      : sssBasis?.kind === "CONTRACTED_FALLBACK"
        ? (basis("MSC", bases?.sssMscCents) ?? "") + " (contract)"
        : sssBasis
          ? (basis("MSC", bases?.sssMscCents) ?? "MSC none") + ` (${basisMonth} basic)`
          : basis("MSC", bases?.sssMscCents);
  const ann = (sheet.annualizationData ?? null) as { trueUpCents?: string } | null;
  const trueUp = ann?.trueUpCents !== undefined ? BigInt(ann.trueUpCents) : null;
  const statutory: PdfLine[] = [
    { label: "SSS", rate: sssRate, amount: sheet.sssEeCents },
    { label: "PhilHealth", rate: basis("MBS", bases?.philHealthMscCents), amount: sheet.philhealthEeCents },
    { label: "Pag-IBIG", rate: basis("MFS", bases?.pagibigMfsCents), amount: sheet.pagibigEeCents },
    // PAY-171: the year's last regular run shows the year-end adjustment as
    // its own line (as on Mark's Smart payslip: "Withholding Tax Adjustments").
    ...(trueUp !== null && book.runType === "REGULAR"
      ? [
          { label: "Withholding tax", rate: `Taxable ${peso(sheet.grossTaxableIncomeCents)}`, amount: sheet.withholdingTaxCents - trueUp },
          { label: trueUp < 0n ? "Tax refund (year-end adjustment)" : "Withholding tax adjustment (year-end)", amount: trueUp },
        ]
      : [
          // PAY-156: a negative withholding is the year-end adjustment refunding tax
          // withheld above the year's tax due (final pay); it lowers the deductions.
          sheet.withholdingTaxCents < 0n
            ? { label: "Tax refund (year-end adjustment)", rate: `Taxable ${peso(sheet.grossTaxableIncomeCents)}`, amount: sheet.withholdingTaxCents }
            : { label: "Withholding tax", rate: `Taxable ${peso(sheet.grossTaxableIncomeCents)}`, amount: sheet.withholdingTaxCents },
        ]),
  ];
  const statutoryTotal = statutory.reduce((s, l) => s + l.amount, 0n);
  const contributions = sheet.sssEeCents + sheet.philhealthEeCents + sheet.pagibigEeCents;
  const statutoryNote =
    !sheet.statutoryDeductedSnapshot && contributions === 0n && book.runType === "REGULAR"
      ? "SSS, PhilHealth and Pag-IBIG are deducted on the other cutoff of the month."
      : null;

  // -- Other deductions -------------------------------------------------------
  const other: PdfLine[] = [];
  const loans = (Array.isArray(sheet.loanPaymentsApplied) ? sheet.loanPaymentsApplied : []) as AppliedLoanPayment[];
  for (const l of loans) {
    const amt = BigInt(l.amountCents ?? "0");
    if (amt === 0n) continue;
    const after = BigInt(l.balanceAfterCents ?? "0");
    const name = LOAN[l.loanType] ?? "Loan";
    other.push({ label: fp && after === 0n ? `${name} (settled)` : name, rate: `Balance ${peso(after)}`, amount: amt });
  }
  const loansListed = other.reduce((s, l) => s + l.amount, 0n);
  if (sheet.loanDeductionsCents !== loansListed) {
    other.push({ label: "Loans", amount: sheet.loanDeductionsCents - loansListed });
  }
  const adjustments = (Array.isArray(sheet.adjustmentsApplied) ? sheet.adjustmentsApplied : []) as AppliedAdjustment[];
  let adjListed = 0n;
  // PAY-149: each Other Deduction component by its name.
  for (const c of applied as { name: string; amountCents: string; kind?: string }[]) {
    if (c.kind !== "DEDUCTION") continue;
    const amt = BigInt(c.amountCents ?? "0");
    if (amt === 0n) continue;
    adjListed += amt;
    other.push({ label: c.name, amount: amt });
  }
  for (const a of adjustments) {
    if (a.kind !== "DEDUCTION") continue;
    const amt = BigInt(a.amountCents ?? "0");
    adjListed += amt;
    other.push({ label: a.reason?.trim() || "Adjustment", amount: amt });
  }
  if (sheet.adjustmentDeductionsCents !== adjListed) {
    other.push({ label: "Other deductions", amount: sheet.adjustmentDeductionsCents - adjListed });
  }
  const otherTotal = other.reduce((s, l) => s + l.amount, 0n);

  // -- Additions after tax (reimbursements, non-taxable adjustments) ----------
  const additions: PdfLine[] = [];
  if (fp && !fp.isSeparationPayTaxable && fpSep > 0n) additions.push({ label: "Separation pay (not taxable)", amount: fpSep });
  for (const a of adjustments) {
    if (a.kind === "ADDITION" && !a.isTaxable) additions.push({ label: a.reason?.trim() || "Non-taxable addition", amount: BigInt(a.amountCents ?? "0") });
  }
  const claims = (Array.isArray(sheet.expenseClaimsApplied) ? sheet.expenseClaimsApplied : []) as AppliedExpenseClaim[];
  for (const c of claims) {
    const amt = BigInt(c.nontaxablePortionCents ?? "0");
    if (amt !== 0n && c.taxTreatment === "NONTAXABLE_REIMBURSEMENT") additions.push({ label: `Reimbursement: ${c.category}`, amount: amt });
  }
  const addListed = additions.reduce((s, l) => s + l.amount, 0n);
  if (sheet.nontaxableAdditionsCents !== addListed) {
    additions.push({ label: "Other non-taxable additions", amount: sheet.nontaxableAdditionsCents - addListed });
  }
  const additionsTotal = sheet.nontaxableAdditionsCents;

  // -- Net Pay box (always adds up) -------------------------------------------
  const rows: PayslipPdfData["net"]["rows"] = [
    { label: "Gross pay", amount: sheet.grossCompensationCents, sign: "" },
    { label: "Statutory deductions", amount: statutoryTotal, sign: "-" },
  ];
  if (otherTotal !== 0n) rows.push({ label: "Other deductions", amount: otherTotal, sign: "-" });
  if (additionsTotal !== 0n) rows.push({ label: "Additions after tax", amount: additionsTotal, sign: "+" });
  const computed = sheet.grossCompensationCents - statutoryTotal - otherTotal + additionsTotal;
  const gap = sheet.netPayCents - computed;
  if (gap !== 0n) rows.push({ label: "Other items", amount: gap < 0n ? -gap : gap, sign: gap < 0n ? "-" : "+" });

  // -- Employer share (information only) ---------------------------------------
  const employer: PdfLine[] = [
    { label: "SSS", amount: sheet.sssErCents },
    { label: "SSS EC", amount: sheet.sssEcCents },
    { label: "PhilHealth", amount: sheet.philhealthErCents },
    { label: "Pag-IBIG", amount: sheet.pagibigErCents },
  ];
  const employerTotal = employer.reduce((s, l) => s + l.amount, 0n);

  // -- Employee strip ------------------------------------------------------------
  const idOf = (t: string) => maskId(emp.statutoryIds.find((s) => s.type === t)?.number);
  const ids = [
    { label: "TIN", value: idOf("TIN") },
    { label: "SSS", value: idOf("SSS") },
    { label: "PhilHealth", value: idOf("PHILHEALTH") },
    { label: "Pag-IBIG", value: idOf("PAGIBIG") },
  ].map((x) => ({ label: x.label, value: x.value ?? "Not on file" }));
  const mi = emp.middleName ? ` ${emp.middleName.charAt(0).toUpperCase()}.` : "";
  const sfx = emp.suffix ? ` ${emp.suffix}` : "";
  const bankMasked = maskId(emp.bankAccountNumber);

  const companyAddress = [src.company.address, src.company.city, src.company.province, src.company.zipCode]
    .filter((x) => x && String(x).trim())
    .join(", ");

  return {
    company: { name: src.company.tradeName?.trim() || src.company.name, address: companyAddress || null },
    meta: {
      periodStart: book.periodStart,
      periodEnd: book.periodEnd,
      cycle: CYCLE[book.cycle] ?? book.cycle,
      runType: RUN[book.runType] ?? book.runType,
      issuedAt: book.finalizedAt,
      reference: sheet.controlNumber ?? sheet.id.slice(-8).toUpperCase(),
    },
    employee: {
      name: `${emp.firstName}${mi} ${emp.lastName}${sfx}`,
      number: emp.employeeNumber,
      position: emp.position,
      department: emp.department,
      branch: emp.branch,
      taxStatus: sheet.taxClassificationSnapshot === "MWE" ? "Minimum wage earner" : "Regular",
      payBasis: `${peso(sheet.basicSalaryCentsSnapshot)} a ${PER_LONG[sheet.salaryTypeSnapshot] ?? "period"} · ${sheet.workingDaysDenominatorSnapshot}-day year`,
      ids,
    },
    earnings,
    gross: sheet.grossCompensationCents,
    statutory,
    statutoryTotal,
    statutoryNote,
    other,
    otherTotal,
    additions,
    additionsTotal,
    employer,
    employerTotal,
    net: { rows, netPay: sheet.netPayCents },
    bank: emp.bankName || bankMasked ? [emp.bankName, bankMasked].filter(Boolean).join(" ") : null,
    ytd: [
      { label: "Gross pay", amount: BigInt(extras.ytd.grossCents) },
      { label: "Withholding tax", amount: BigInt(extras.ytd.wtaxCents) },
      { label: "SSS", amount: BigInt(extras.ytd.sssEeCents) },
      { label: "PhilHealth", amount: BigInt(extras.ytd.philhealthEeCents) },
      { label: "Pag-IBIG", amount: BigInt(extras.ytd.pagibigEeCents) },
      { label: "13th month accrued", amount: BigInt(extras.ytd.accrued13thMonthCents) },
    ],
    attendance: [
      { label: "Days worked", value: num(daysWorked) },
      { label: "Unpaid leave", value: plural(unpaid, "day", "days") },
      { label: "Late / undertime", value: `${num(n("lateUndertimeMinutes"))} min` },
      { label: "Overtime", value: `${num(otHours)} hrs` },
    ],
    leave: extras.leaveBalances.map((b) => ({ label: b.name, value: `${b.available} days` })),
    finalPay: fp ? { rows: finalPayRows(fp, book.separationReason ?? null, emp.lastWorkingDate ?? null, sheet.nontaxable13MonthAndBenefitsCents ?? 0n, sheet.withholdingTaxCents) } : null,
  };
}

const REASON: Record<string, string> = {
  RESIGNATION: "Resignation",
  MUTUAL_AGREEMENT: "Mutual agreement",
  END_OF_CONTRACT: "End of contract",
  REDUNDANCY: "Redundancy",
  RETRENCHMENT: "Retrenchment",
  CLOSURE_OF_BUSINESS: "Closure of business",
  DISEASE: "Disease",
  JUST_CAUSE: "Dismissal for just cause",
};

/** PAY-157: the final pay summary: separation, the 13th month, and the year's tax. */
function finalPayRows(
  fp: FinalPayBreakdown,
  reason: string | null,
  lastDay: Date | null,
  exempt13th: bigint,
  withheldNow: bigint,
): { label: string; value: string }[] {
  const day = (x: Date) => `${x.getUTCDate()} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
  const p13 = BigInt(fp.proratedThirteenthMonthCents);
  return [
    { label: "Last working day", value: lastDay ? day(lastDay) : "Not on file" },
    { label: "Reason", value: reason ? REASON[reason] ?? reason : "Not on file" },
    { label: "Prorated 13th month", value: p13 > 0n ? `${peso(p13)} (${peso(exempt13th < p13 ? exempt13th : p13)} not taxable)` : peso(0n) },
    { label: "Separation pay", value: BigInt(fp.separationPayCents) > 0n ? `${peso(BigInt(fp.separationPayCents))} (${fp.isSeparationPayTaxable ? "taxable" : "not taxable"})` : "None" },
    { label: "Taxable pay earlier this year", value: peso(BigInt(fp.cyPriorTaxableIncomeCents)) },
    { label: "Tax withheld earlier this year", value: peso(BigInt(fp.cyPriorWithholdingTaxCents)) },
    { label: "Tax due for the year", value: peso(BigInt(fp.annualizedWhtCents)) },
    { label: withheldNow < 0n ? "Tax refunded in this pay" : "Tax withheld in this pay", value: peso(withheldNow < 0n ? -withheldNow : withheldNow) },
  ];
}

// ---------------------------------------------------------------------------
// Loader (one place for admin download, ESS download and the publish job)
// ---------------------------------------------------------------------------

export class PayslipNotAvailableError extends Error {}

// PAY-67: the payslip as it stood when the run was sealed, kept on the sheet
// so a reprint never picks up a later change (a new name, position, bank
// account or company address). Bigints and dates are tagged to survive JSON.
export function encodeSealSnapshot(data: PayslipPdfData): unknown {
  return JSON.parse(JSON.stringify(data, function (this: Record<string, unknown>, key, value) {
    const raw = this[key];
    if (typeof raw === "bigint") return { $bigint: raw.toString() };
    if (raw instanceof Date) return { $date: raw.toISOString() };
    return value;
  }));
}

export function decodeSealSnapshot(json: unknown): PayslipPdfData {
  return JSON.parse(JSON.stringify(json), (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.$bigint === "string" && Object.keys(value).length === 1) return BigInt(value.$bigint);
      if (typeof value.$date === "string" && Object.keys(value).length === 1) return new Date(value.$date);
    }
    return value;
  }) as PayslipPdfData;
}

export async function loadPayslipPdfData(
  tx: TenantTx,
  args: { tenantId: string; bookId: string; employeeId: string },
): Promise<PayslipPdfData> {
  const book = await tx.payrollBook.findFirst({ where: { id: args.bookId, tenantId: args.tenantId } });
  if (!book) throw new PayslipNotAvailableError("Payroll run not found");
  if (book.status !== "FINALIZED") throw new PayslipNotAvailableError("Payslips are only available for finalized runs");
  const sheet = await tx.payrollSheet.findFirst({ where: { payrollBookId: book.id, employeeId: args.employeeId } });
  if (!sheet) throw new PayslipNotAvailableError("No payslip for this employee in this run");
  // PAY-67: a sealed payslip reprints from its seal-time snapshot.
  if (sheet.sealSnapshot != null) return decodeSealSnapshot(sheet.sealSnapshot);
  return buildPayslipFromRecords(tx, args, book, sheet);
}

/**
 * PAY-67: the payslip data from the current records, for the snapshot taken
 * while the run is being sealed (and for payslips sealed before PAY-67).
 */
export async function buildPayslipFromRecords(
  tx: TenantTx,
  args: { tenantId: string; bookId: string; employeeId: string },
  book: PayslipPdfSource["book"] & { periodEnd: Date },
  sheet: PayslipPdfSource["sheet"] & { periodInputSnapshot: unknown },
): Promise<PayslipPdfData> {

  const [emp, tenant, extras] = await Promise.all([
    tx.employee.findFirst({
      where: { id: args.employeeId, tenantId: args.tenantId },
      select: {
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        bankName: true,
        bankAccountNumber: true,
        department: { select: { name: true } },
        branch: { select: { name: true } },
        position: { select: { title: true } },
        statutoryIds: { select: { type: true, number: true } },
        lastWorkingDate: true,
      },
    }),
    tx.tenant.findUniqueOrThrow({
      where: { id: args.tenantId },
      select: { name: true, tradeName: true, address: true, city: true, province: true, zipCode: true },
    }),
    loadPayslipExtras(tx, {
      tenantId: args.tenantId,
      employeeId: args.employeeId,
      periodEnd: book.periodEnd,
      periodInputSnapshot: sheet.periodInputSnapshot,
    }),
  ]);
  if (!emp) throw new PayslipNotAvailableError("Employee not found");

  return buildPayslipPdfData({
    company: tenant,
    book,
    sheet,
    employee: {
      ...emp,
      position: emp.position?.title ?? null,
      department: emp.department?.name ?? null,
      branch: emp.branch?.name ?? null,
    },
    extras,
  });
}
