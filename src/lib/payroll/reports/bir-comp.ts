/**
 * PAY-71: one payslip's pay, split into the items the BIR forms ask for.
 *
 * 1601-C, 2316 and the 1604-C alphalist all ask for the same split of
 * compensation: what is exempt (the minimum wage and its premiums, the 13th
 * month and other benefits up to 90,000, de minimis, the employee's
 * contributions, other exempt pay) and what is taxable (basic, allowances,
 * commission, the 13th month excess, hazard pay, overtime, other).
 *
 * Two totals are never re-derived here: the payslip's taxable pay and its
 * gross. Total exempt is gross less taxable, so on every form
 * "total compensation less total exempt = total taxable" holds to the centavo.
 * The parts are then fitted to those two totals.
 *
 * Pure functions, no DB access.
 */

export interface BirSheetFacts {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  /** Exempt components plus the employee's contributions (as the payslip stores it). */
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  withholdingTaxCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  basePayCents: bigint;
  lateUndertimeDeductionCents: bigint;
  otPayCents: bigint;
  nsdPayCents: bigint;
  holidayPayCents: bigint;
  hazardPayCents: bigint;
  restDayPayCents: bigint;
  /** De minimis components, the part within the ceiling. */
  deMinimisExemptCents: bigint;
  /** Taxable part of COMMISSION components. */
  commissionTaxableCents: bigint;
  /** Taxable part of ALLOWANCE components. */
  allowanceTaxableCents: bigint;
  /** 13th month and bonuses over the year's 90,000 paid on this payslip. */
  benefitsExcessCents: bigint;
}

export interface BirComp {
  gross: bigint;
  // Exempt
  mweBasic: bigint;
  mweHoliday: bigint;
  mweOvertime: bigint;
  mweNsd: bigint;
  mweHazard: bigint;
  nt13th: bigint;
  deMinimis: bigint;
  contributions: bigint;
  otherNontaxable: bigint;
  totalNontaxable: bigint;
  // Taxable
  taxBasic: bigint;
  taxAllowances: bigint;
  taxCommission: bigint;
  tax13th: bigint;
  taxHazard: bigint;
  taxOvertime: bigint;
  /** Holiday, rest day and night shift pay of an employee who is not an MWE. */
  taxPremiums: bigint;
  taxOther: bigint;
  totalTaxable: bigint;
  withholding: bigint;
}

export const ZERO_COMP: BirComp = {
  gross: 0n, mweBasic: 0n, mweHoliday: 0n, mweOvertime: 0n, mweNsd: 0n, mweHazard: 0n,
  nt13th: 0n, deMinimis: 0n, contributions: 0n, otherNontaxable: 0n, totalNontaxable: 0n,
  taxBasic: 0n, taxAllowances: 0n, taxCommission: 0n, tax13th: 0n, taxHazard: 0n,
  taxOvertime: 0n, taxPremiums: 0n, taxOther: 0n, totalTaxable: 0n, withholding: 0n,
};

const pos = (n: bigint) => (n > 0n ? n : 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

export function addComp(a: BirComp, b: BirComp): BirComp {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof BirComp)[]) out[k] = a[k] + b[k];
  return out;
}

export function sumComp(list: BirComp[]): BirComp {
  return list.reduce(addComp, ZERO_COMP);
}

/** Split one payslip. The parts always add up to the payslip's own totals. */
export function splitSheet(f: BirSheetFacts): BirComp {
  const gross = f.grossCompensationCents;
  const totalTaxable = min(pos(f.grossTaxableIncomeCents), pos(gross));
  const totalNontaxable = gross - totalTaxable;
  const isMwe = f.mweExemptCompensationCents > 0n;

  // ── Exempt side ──────────────────────────────────────────────────────────
  // The MWE's exempt pay is the minimum wage plus four premiums; whatever is
  // not a premium is the wage itself.
  let mweLeft = pos(f.mweExemptCompensationCents);
  const takeMwe = (x: bigint) => {
    const t = min(pos(x), mweLeft);
    mweLeft -= t;
    return t;
  };
  let mweHoliday = isMwe ? takeMwe(f.holidayPayCents) : 0n;
  let mweOvertime = isMwe ? takeMwe(f.otPayCents) : 0n;
  let mweNsd = isMwe ? takeMwe(f.nsdPayCents) : 0n;
  let mweHazard = isMwe ? takeMwe(f.hazardPayCents) : 0n;
  let mweBasic = mweLeft;

  const ee = f.sssEeCents + f.philhealthEeCents + f.pagibigEeCents;
  let contributions = min(pos(ee), pos(f.nontaxableCompensationCents));
  const exemptComponents = pos(f.nontaxableCompensationCents) - contributions;
  let deMinimis = min(pos(f.deMinimisExemptCents), exemptComponents);
  let otherNontaxable = pos(f.nontaxableBasicCents) + (exemptComponents - deMinimis);
  let nt13th = pos(f.nontaxable13MonthAndBenefitsCents);

  // When the exempt parts come to more than gross less taxable (contributions
  // larger than the pay they come out of, or an MWE's wage shown before its
  // contributions), take the difference off in this order: the wage first, so
  // an MWE's wage is shown net of contributions as the alphalist asks.
  let over =
    mweBasic + mweHoliday + mweOvertime + mweNsd + mweHazard +
    contributions + deMinimis + otherNontaxable + nt13th - totalNontaxable;
  const cut = (x: bigint) => {
    const t = min(x, pos(over));
    over -= t;
    return x - t;
  };
  if (over > 0n) {
    mweBasic = cut(mweBasic);
    otherNontaxable = cut(otherNontaxable);
    deMinimis = cut(deMinimis);
    nt13th = cut(nt13th);
    mweHazard = cut(mweHazard);
    mweNsd = cut(mweNsd);
    mweOvertime = cut(mweOvertime);
    mweHoliday = cut(mweHoliday);
    contributions = cut(contributions);
  } else if (over < 0n) {
    // Exempt pay the parts do not name (for example an exempt expense claim).
    otherNontaxable += -over;
  }

  // ── Taxable side ─────────────────────────────────────────────────────────
  let left = totalTaxable;
  const take = (x: bigint) => {
    const t = min(pos(x), left);
    left -= t;
    return t;
  };
  const tax13th = take(f.benefitsExcessCents);
  const taxCommission = take(f.commissionTaxableCents);
  const taxAllowances = take(f.allowanceTaxableCents);
  const taxOvertime = take(isMwe ? 0n : f.otPayCents);
  const taxHazard = take(isMwe ? 0n : f.hazardPayCents);
  const taxPremiums = take(
    isMwe ? f.restDayPayCents : f.holidayPayCents + f.restDayPayCents + f.nsdPayCents,
  );
  // Basic pay is shown net of the employee's contributions, as the forms ask.
  const taxBasic = take(
    isMwe ? 0n : f.basePayCents - f.lateUndertimeDeductionCents - ee - f.nontaxableBasicCents,
  );
  const taxOther = left;

  return {
    gross, mweBasic, mweHoliday, mweOvertime, mweNsd, mweHazard, nt13th, deMinimis,
    contributions, otherNontaxable, totalNontaxable,
    taxBasic, taxAllowances, taxCommission, tax13th, taxHazard, taxOvertime, taxPremiums,
    taxOther, totalTaxable,
    withholding: f.withholdingTaxCents,
  };
}

/**
 * Pay before Sentire by this same employer (a year-to-date opening, PAY-144).
 * Its split was never recorded: taxable pay is shown as basic salary, and
 * exempt pay other than the 13th month and contributions as other exempt pay.
 */
export function splitOpening(o: {
  grossCompensationCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  withholdingTaxCents: bigint;
}): BirComp {
  const ee = o.sssEeCents + o.philhealthEeCents + o.pagibigEeCents;
  return splitSheet({
    grossCompensationCents: o.grossCompensationCents,
    mweExemptCompensationCents: 0n,
    nontaxableBasicCents: 0n,
    nontaxableCompensationCents: o.nontaxableCompensationCents,
    nontaxable13MonthAndBenefitsCents: o.nontaxable13MonthAndBenefitsCents,
    grossTaxableIncomeCents: o.grossTaxableIncomeCents,
    withholdingTaxCents: o.withholdingTaxCents,
    sssEeCents: o.sssEeCents,
    philhealthEeCents: o.philhealthEeCents,
    pagibigEeCents: o.pagibigEeCents,
    basePayCents: o.grossTaxableIncomeCents + ee,
    lateUndertimeDeductionCents: 0n,
    otPayCents: 0n,
    nsdPayCents: 0n,
    holidayPayCents: 0n,
    hazardPayCents: 0n,
    restDayPayCents: 0n,
    deMinimisExemptCents: 0n,
    commissionTaxableCents: 0n,
    allowanceTaxableCents: 0n,
    benefitsExcessCents: 0n,
  });
}

// ---------------------------------------------------------------------------
// Reading a payslip row
// ---------------------------------------------------------------------------

/** The PayrollSheet columns the BIR forms read. */
export const BIR_SHEET_SELECT = {
  employeeId: true,
  grossCompensationCents: true,
  mweExemptCompensationCents: true,
  nontaxableBasicCents: true,
  nontaxableCompensationCents: true,
  nontaxable13MonthAndBenefitsCents: true,
  grossTaxableIncomeCents: true,
  withholdingTaxCents: true,
  sssEeCents: true,
  philhealthEeCents: true,
  pagibigEeCents: true,
  basePayCents: true,
  lateUndertimeDeductionCents: true,
  otPayCents: true,
  nsdPayCents: true,
  holidayPayCents: true,
  hazardPayCents: true,
  restDayPayCents: true,
  payComponentsApplied: true,
  statutoryBreakdown: true,
  thirteenthMonthBreakdown: true,
  finalPayBreakdown: true,
} as const;

export interface BirSheetRow {
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  grossTaxableIncomeCents: bigint;
  withholdingTaxCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  basePayCents: bigint;
  lateUndertimeDeductionCents: bigint;
  otPayCents: bigint;
  nsdPayCents: bigint;
  holidayPayCents: bigint;
  hazardPayCents: bigint;
  restDayPayCents: bigint;
  payComponentsApplied: unknown;
  statutoryBreakdown: unknown;
  thirteenthMonthBreakdown: unknown;
  finalPayBreakdown: unknown;
}

const big = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return 0n;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * 13th month and bonuses over the 90,000 on one payslip. A regular run
 * records it (statutoryBreakdown.benefits). A 13th month run pays only the
 * 13th month, so the excess is what was paid less what was exempt. A final
 * pay records the prorated 13th month; a bonus paid in a final pay over the
 * 90,000 is not recorded apart and stays in other taxable pay.
 */
function benefitsExcess(row: BirSheetRow): bigint {
  const recorded = obj(obj(row.statutoryBreakdown).benefits).excessCents;
  if (recorded !== undefined) return pos(big(recorded));
  const exempt = row.nontaxable13MonthAndBenefitsCents;
  const due = obj(row.thirteenthMonthBreakdown).dueCents;
  if (due !== undefined) return pos(big(due) - exempt);
  const prorated = obj(row.finalPayBreakdown).proratedThirteenthMonthCents;
  if (prorated !== undefined) return pos(big(prorated) - exempt);
  return 0n;
}

export function factsFromSheet(row: BirSheetRow): BirSheetFacts {
  let deMinimisExemptCents = 0n;
  let commissionTaxableCents = 0n;
  let allowanceTaxableCents = 0n;
  const applied = Array.isArray(row.payComponentsApplied) ? row.payComponentsApplied : [];
  for (const raw of applied) {
    const c = obj(raw);
    if (c.taxability === "DE_MINIMIS") deMinimisExemptCents += pos(big(c.nonTaxablePortionCents));
    if (c.kind === "COMMISSION") commissionTaxableCents += pos(big(c.taxablePortionCents));
    if (c.kind === "ALLOWANCE") allowanceTaxableCents += pos(big(c.taxablePortionCents));
  }
  return {
    grossCompensationCents: row.grossCompensationCents,
    mweExemptCompensationCents: row.mweExemptCompensationCents,
    nontaxableBasicCents: row.nontaxableBasicCents,
    nontaxableCompensationCents: row.nontaxableCompensationCents,
    nontaxable13MonthAndBenefitsCents: row.nontaxable13MonthAndBenefitsCents,
    grossTaxableIncomeCents: row.grossTaxableIncomeCents,
    withholdingTaxCents: row.withholdingTaxCents,
    sssEeCents: row.sssEeCents,
    philhealthEeCents: row.philhealthEeCents,
    pagibigEeCents: row.pagibigEeCents,
    basePayCents: row.basePayCents,
    lateUndertimeDeductionCents: row.lateUndertimeDeductionCents,
    otPayCents: row.otPayCents,
    nsdPayCents: row.nsdPayCents,
    holidayPayCents: row.holidayPayCents,
    hazardPayCents: row.hazardPayCents,
    restDayPayCents: row.restDayPayCents,
    deMinimisExemptCents,
    commissionTaxableCents,
    allowanceTaxableCents,
    benefitsExcessCents: benefitsExcess(row),
  };
}
