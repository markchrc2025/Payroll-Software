/**
 * Phase D3 — Pure gross-to-net engine.
 *
 * Implements the 12-step waterfall from §4.2 of the master blueprint. This
 * module has NO database access and NO non-determinism (no `Date.now()`).
 * It is exclusively driven by the `ComputeInput` it is handed.
 *
 * Order of operations (mirrors blueprint §4.2):
 *   1.  Base pay (basicSalary × daysWorked / workingDays).
 *   2.  Subtract tardiness / undertime (hourly / 60 × minutes).
 *   3.  Add premium pay (OT, NSD, rest day, holiday, hazard) per §4.3.
 *   4.  Add allowances / bonuses (per `PayComponent` rules).
 *   5.  Gross Compensation = Σ steps 1–4.
 *   6.  Determine non-taxable comp (MWE §4.5, de minimis ceilings,
 *       statutory contribs, employee.nontaxableBasicAmountCents).
 *   7.  Gross Taxable Income = Gross Comp − non-taxable buckets.
 *   8.  Deduct statutory contributions iff `isStatutoryDeducted` (driven by
 *       tenant's `statutoryCutoffRule` + period's position in the month).
 *   9.  Withholding tax via period-specific BIR table (0 for MWE).
 *  10.  Add back non-taxable additions (reimbursements).
 *  11.  Deduct loans.
 *  12.  Net Take-Home Pay.
 *
 * SIMPLIFYING ASSUMPTIONS DOCUMENTED FOR D3 (will be revisited in later phases):
 *   • Premium hours are treated as EXTRA hours beyond `daysWorked × dailyHours`.
 *     I.e. caller's `daysWorked` should not double-count rest-day / holiday
 *     work. The engine applies the multiplier to the full hour.
 *   • NSD is computed as a flat ×0.10 premium on `nightDiffHours` (not stacked
 *     with day-type). True hour-by-hour stacking is deferred.
 *   • 13th-month-and-benefits residual is 0 in D3 (annualization lives in a
 *     later phase).
 *   • DEDUCTION-kind PayComponents are IGNORED in D3 (loan-only deductions).
 *   • Compensation basis for statutory MSC/MFS = `basicSalaryCents` (treated
 *     as monthly when `salaryType = MONTHLY`). Daily/weekly approximated by
 *     monthlyEquivalent = daily × workingDaysDenominator / 12 or weekly × 52/12.
 */
import type { PayFrequency } from "@prisma/client";
import {
  computePagibig,
  computePhilHealth,
  computeSSS,
  getMinimumWage,
  lookupBIR,
} from "@/lib/statutory/compute";
import type {
  AppliedAdjustment,
  AppliedExpenseClaim,
  AppliedLoanPayment,
  AppliedPayComponent,
  ComputeAdjustment,
  ComputeExpenseClaim,
  ComputeInput,
  ComputeMultiplierConfig,
  ComputePayComponent,
  ComputeResult,
  FinalPayBreakdown,
  StatutoryBreakdown,
} from "./types";

// ---------------------------------------------------------------------------
// Math helpers — duplicated from statutory/compute.ts to keep engine standalone.
// ---------------------------------------------------------------------------
function multiplyHalfUp(amountCentavos: bigint, rate: number): bigint {
  const n = Number(amountCentavos) * rate;
  return BigInt(Math.round(n));
}

/** Multiply BigInt centavos by a `number` hours/days value (HALF-UP). */
function timesUnits(centavos: bigint, units: number): bigint {
  if (units === 0) return 0n;
  return BigInt(Math.round(Number(centavos) * units));
}

/**
 * Pay/deduction for a whole number of minutes at an hourly centavo rate
 * (HALF-UP). Multiplies by minutes *before* dividing by 60 so a non-whole-hour
 * value (e.g. 10 min = 0.1666…h) isn't passed through a pre-divided float.
 */
function timesMinutes(hourlyCentavos: bigint, minutes: number): bigint {
  if (minutes === 0) return 0n;
  return BigInt(Math.round((Number(hourlyCentavos) * minutes) / 60));
}

function clampNonNegative(v: bigint): bigint {
  return v < 0n ? 0n : v;
}

/**
 * Apply loan installments, never deducting more than the outstanding balance.
 *
 * "No negative pay" floor: when `maxDeductibleCents` is a bigint, the TOTAL
 * loan deduction is capped at that amount (the net pay available before loans).
 * Loans are applied in array order; the boundary loan is partially paid and any
 * remaining loans are fully deferred. Deferred amounts are NOT lost — the loan
 * balance is only reduced by what was actually paid (see `balanceAfterCents`),
 * so the unpaid portion carries to the next period when finalize decrements
 * balances by the applied amount.
 *
 * Pass `maxDeductibleCents = null` to disable the floor (unbounded deductions,
 * e.g. FINAL_PAY when negative final pay is allowed).
 */
function applyLoanDeductions(
  loans: ComputeInput["loans"],
  maxDeductibleCents: bigint | null,
): {
  loanPaymentsApplied: AppliedLoanPayment[];
  loanDeductionsCents: bigint;
  loanDeferredCents: bigint;
} {
  const loanPaymentsApplied: AppliedLoanPayment[] = [];
  let loanDeductionsCents = 0n;
  let loanDeferredCents = 0n;
  let remaining = maxDeductibleCents; // null ⇒ unbounded

  for (const loan of loans) {
    // Never deduct more than the outstanding balance.
    const scheduled =
      loan.installmentCents > loan.balanceCents
        ? loan.balanceCents
        : loan.installmentCents;
    if (scheduled <= 0n) continue;

    let amount = scheduled;
    if (remaining !== null && remaining < scheduled) {
      amount = remaining > 0n ? remaining : 0n;
    }

    if (amount > 0n) {
      loanPaymentsApplied.push({
        loanId: loan.id,
        loanType: loan.loanType,
        amountCents: amount.toString(),
        balanceBeforeCents: loan.balanceCents.toString(),
        balanceAfterCents: (loan.balanceCents - amount).toString(),
      });
      loanDeductionsCents += amount;
      if (remaining !== null) remaining -= amount;
    }
    loanDeferredCents += scheduled - amount;
  }

  return { loanPaymentsApplied, loanDeductionsCents, loanDeferredCents };
}

// ---------------------------------------------------------------------------
// Premium multiplier resolution — DOLE floors + tenant overrides
// ---------------------------------------------------------------------------

/** DOLE statutory minimum multipliers (Art. 87–94, Labor Code, as amended). */
const DOLE_DEFAULTS = {
  OT: 1.25,
  NSD: 0.10,
  REST_DAY: 1.30,
  REST_DAY_OT: 1.69,                     // 1.30 × 1.30
  SPECIAL_HOLIDAY: 1.30,
  SPECIAL_HOLIDAY_OT: 1.69,              // 1.30 × 1.30
  SPECIAL_HOLIDAY_REST_DAY: 1.50,        // DOLE explicitly: NOT 1.30²
  SPECIAL_HOLIDAY_REST_DAY_OT: 1.95,     // 1.50 × 1.30
  REGULAR_HOLIDAY: 2.00,
  REGULAR_HOLIDAY_OT: 2.60,              // 2.00 × 1.30
  REGULAR_HOLIDAY_REST_DAY: 2.60,        // 2.00 × 1.30
  REGULAR_HOLIDAY_REST_DAY_OT: 3.38,     // 2.60 × 1.30
  DOUBLE_HOLIDAY: 3.00,
  DOUBLE_HOLIDAY_OT: 3.90,               // 3.00 × 1.30
  DOUBLE_HOLIDAY_REST_DAY: 3.90,         // 3.00 × 1.30
  DOUBLE_HOLIDAY_REST_DAY_OT: 5.07,      // 3.90 × 1.30
  HAZARD: 1.25,
  NO_WORK_REGULAR_HOLIDAY: 1.00,
} as const;

type ResolvedMultipliers = typeof DOLE_DEFAULTS;

function resolveMultipliers(config?: ComputeMultiplierConfig): ResolvedMultipliers {
  if (!config) return DOLE_DEFAULTS;
  return {
    OT:                          config.OT                          ?? DOLE_DEFAULTS.OT,
    NSD:                         config.NSD                         ?? DOLE_DEFAULTS.NSD,
    REST_DAY:                    config.REST_DAY                    ?? DOLE_DEFAULTS.REST_DAY,
    REST_DAY_OT:                 config.REST_DAY_OT                 ?? DOLE_DEFAULTS.REST_DAY_OT,
    SPECIAL_HOLIDAY:             config.SPECIAL_HOLIDAY             ?? DOLE_DEFAULTS.SPECIAL_HOLIDAY,
    SPECIAL_HOLIDAY_OT:          config.SPECIAL_HOLIDAY_OT          ?? DOLE_DEFAULTS.SPECIAL_HOLIDAY_OT,
    SPECIAL_HOLIDAY_REST_DAY:    config.SPECIAL_HOLIDAY_REST_DAY    ?? DOLE_DEFAULTS.SPECIAL_HOLIDAY_REST_DAY,
    SPECIAL_HOLIDAY_REST_DAY_OT: config.SPECIAL_HOLIDAY_REST_DAY_OT ?? DOLE_DEFAULTS.SPECIAL_HOLIDAY_REST_DAY_OT,
    REGULAR_HOLIDAY:             config.REGULAR_HOLIDAY             ?? DOLE_DEFAULTS.REGULAR_HOLIDAY,
    REGULAR_HOLIDAY_OT:          config.REGULAR_HOLIDAY_OT          ?? DOLE_DEFAULTS.REGULAR_HOLIDAY_OT,
    REGULAR_HOLIDAY_REST_DAY:    config.REGULAR_HOLIDAY_REST_DAY    ?? DOLE_DEFAULTS.REGULAR_HOLIDAY_REST_DAY,
    REGULAR_HOLIDAY_REST_DAY_OT: config.REGULAR_HOLIDAY_REST_DAY_OT ?? DOLE_DEFAULTS.REGULAR_HOLIDAY_REST_DAY_OT,
    DOUBLE_HOLIDAY:              config.DOUBLE_HOLIDAY              ?? DOLE_DEFAULTS.DOUBLE_HOLIDAY,
    DOUBLE_HOLIDAY_OT:           config.DOUBLE_HOLIDAY_OT           ?? DOLE_DEFAULTS.DOUBLE_HOLIDAY_OT,
    DOUBLE_HOLIDAY_REST_DAY:     config.DOUBLE_HOLIDAY_REST_DAY     ?? DOLE_DEFAULTS.DOUBLE_HOLIDAY_REST_DAY,
    DOUBLE_HOLIDAY_REST_DAY_OT:  config.DOUBLE_HOLIDAY_REST_DAY_OT  ?? DOLE_DEFAULTS.DOUBLE_HOLIDAY_REST_DAY_OT,
    HAZARD:                      config.HAZARD                      ?? DOLE_DEFAULTS.HAZARD,
    NO_WORK_REGULAR_HOLIDAY:     config.NO_WORK_REGULAR_HOLIDAY     ?? DOLE_DEFAULTS.NO_WORK_REGULAR_HOLIDAY,
  } as ResolvedMultipliers;
}

// ---------------------------------------------------------------------------
// Cutoff helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if statutory contributions should be deducted for this period.
 * MONTHLY-cycle runs always deduct. SEMI_MONTHLY runs deduct on the cutoff
 * designated by tenant's `statutoryCutoffRule`. WEEKLY/DAILY use a month-end
 * anchor: the full monthly contribution is deducted exactly once per calendar
 * month, on the run whose period contains that month's last day (so a weekly
 * employee is no longer charged a full month on every run).
 */
export function isStatutoryDeducted(
  cycle: PayFrequency,
  rule: "FIRST_CUTOFF" | "SECOND_CUTOFF",
  periodEnd: Date,
  periodStart?: Date,
): boolean {
  if (cycle === "MONTHLY") return true;
  if (cycle === "SEMI_MONTHLY") {
    const day = periodEnd.getUTCDate();
    if (rule === "FIRST_CUTOFF") return day <= 15;
    // SECOND_CUTOFF: any period ending on/after the 16th counts.
    return day >= 16;
  }
  // WEEKLY / DAILY: deduct once per calendar month, on the run whose period
  // contains the last day of a month. Period dates are calendar-dates (the
  // company jurisdiction), so month boundaries are taken from them directly.
  const start = periodStart ?? periodEnd;
  const lastDayOf = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const inPeriod = (d: Date) => start <= d && d <= periodEnd;
  return inPeriod(lastDayOf(start)) || inPeriod(lastDayOf(periodEnd));
}

// ---------------------------------------------------------------------------
// Rate derivation
// ---------------------------------------------------------------------------

interface DerivedRates {
  dailyRateCents: bigint;
  hourlyRateCents: bigint;
  /// The monthly equivalent of the employee's basic — used as the MSC/MFS
  /// basis for SSS/PhilHealth/Pag-IBIG.
  monthlyEquivalentCents: bigint;
}

function deriveRates(input: ComputeInput): DerivedRates {
  const { salary, employee, tenant } = input;
  const wdDenom = tenant.workingDaysDenominator;
  const hoursPerDay = employee.standardWorkHours || 8;

  let dailyRateCents: bigint;
  let monthlyEquivalentCents: bigint;

  switch (salary.salaryType) {
    case "MONTHLY": {
      // dailyRate = (monthly × 12) / workingDaysDenominator
      const annual = salary.basicSalaryCents * 12n;
      dailyRateCents = annual / BigInt(wdDenom);
      monthlyEquivalentCents = salary.basicSalaryCents;
      break;
    }
    case "DAILY": {
      dailyRateCents = salary.basicSalaryCents;
      // monthly equivalent = daily × workingDaysDenominator / 12
      monthlyEquivalentCents =
        (salary.basicSalaryCents * BigInt(wdDenom)) / 12n;
      break;
    }
    case "WEEKLY": {
      // assume 5 working days / week
      dailyRateCents = salary.basicSalaryCents / 5n;
      monthlyEquivalentCents = (salary.basicSalaryCents * 52n) / 12n;
      break;
    }
    default: {
      const _exhaustive: never = salary.salaryType;
      throw new Error(`Unsupported salaryType: ${String(_exhaustive)}`);
    }
  }

  const hourlyRateCents = BigInt(
    Math.round(Number(dailyRateCents) / hoursPerDay),
  );
  return { dailyRateCents, hourlyRateCents, monthlyEquivalentCents };
}

// ---------------------------------------------------------------------------
// MWE check
// ---------------------------------------------------------------------------

function checkMwe(input: ComputeInput, dailyRateCents: bigint): boolean {
  if (input.employee.taxClassification !== "MWE") return false;
  if (!input.employee.region) return false;
  if (!input.rules.minWage) return false;
  const minWage = getMinimumWage(input.rules.minWage, input.employee.region);
  // MWE qualifies when basic daily rate is at or below the region's minimum
  // wage (i.e. earning at-or-below the published minimum).
  return dailyRateCents <= minWage;
}

// ---------------------------------------------------------------------------
// Pay-component classification
// ---------------------------------------------------------------------------

interface ComponentBuckets {
  /// Earnings included in gross comp.
  taxableAllowancesCents: bigint;
  nontaxableCompensationCents: bigint;
  /// Reimbursements — added BACK after taxable computation (Step 10).
  nontaxableAdditionsCents: bigint;
  applied: AppliedPayComponent[];
}

function classifyComponents(
  components: ComputePayComponent[],
  deMinimisCeilingByCode: Map<string, bigint>,
): ComponentBuckets {
  let taxableAllowancesCents = 0n;
  let nontaxableCompensationCents = 0n;
  let nontaxableAdditionsCents = 0n;
  const applied: AppliedPayComponent[] = [];

  for (const c of components) {
    let nonTaxablePortion = 0n;
    let taxablePortion = 0n;

    // Reimbursements: out of gross comp; added back as non-taxable additions.
    if (c.kind === "REIMBURSEMENT") {
      nontaxableAdditionsCents += c.amountCents;
      nonTaxablePortion = c.amountCents;
    } else if (c.kind === "DEDUCTION") {
      // D3 SCOPE: deductions other than statutory + loans are deferred.
      // Skip silently but record on payslip so caller can audit.
    } else {
      // ALLOWANCE / BONUS / COMMISSION / OTHER_EARNING.
      switch (c.taxability) {
        case "TAXABLE":
          taxableAllowancesCents += c.amountCents;
          taxablePortion = c.amountCents;
          break;
        case "NON_TAXABLE":
          nontaxableCompensationCents += c.amountCents;
          nonTaxablePortion = c.amountCents;
          break;
        case "DE_MINIMIS": {
          const ceiling = c.deMinimisCode
            ? deMinimisCeilingByCode.get(c.deMinimisCode) ?? null
            : null;
          if (ceiling === null) {
            // No ceiling found → treat entire amount as TAXABLE to be safe.
            taxableAllowancesCents += c.amountCents;
            taxablePortion = c.amountCents;
          } else {
            const nonTaxable =
              c.amountCents > ceiling ? ceiling : c.amountCents;
            const excess = c.amountCents - nonTaxable;
            nontaxableCompensationCents += nonTaxable;
            taxableAllowancesCents += excess;
            nonTaxablePortion = nonTaxable;
            taxablePortion = excess;
          }
          break;
        }
        case "STATUTORY_EXEMPT":
          nontaxableCompensationCents += c.amountCents;
          nonTaxablePortion = c.amountCents;
          break;
      }
    }

    applied.push({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      taxability: c.taxability,
      amountCents: c.amountCents.toString(),
      nonTaxablePortionCents: nonTaxablePortion.toString(),
      taxablePortionCents: taxablePortion.toString(),
    });
  }

  return {
    taxableAllowancesCents,
    nontaxableCompensationCents,
    nontaxableAdditionsCents,
    applied,
  };
}

// ---------------------------------------------------------------------------
// Adjustment helpers
// ---------------------------------------------------------------------------

interface AppliedAdjustmentsResult {
  taxableAdditionsCents: bigint;
  nontaxableAdditionsCents: bigint;
  deductionsCents: bigint;
  applied: AppliedAdjustment[];
}

function applyAdjustments(
  adjustments: ComputeAdjustment[],
): AppliedAdjustmentsResult {
  let taxableAdditionsCents = 0n;
  let nontaxableAdditionsCents = 0n;
  let deductionsCents = 0n;
  const applied: AppliedAdjustment[] = [];
  for (const adj of adjustments) {
    applied.push({
      id: adj.id,
      kind: adj.kind,
      amountCents: adj.amountCents.toString(),
      isTaxable: adj.isTaxable,
      reason: adj.reason,
    });
    if (adj.kind === "ADDITION") {
      if (adj.isTaxable) {
        taxableAdditionsCents += adj.amountCents;
      } else {
        nontaxableAdditionsCents += adj.amountCents;
      }
    } else {
      deductionsCents += adj.amountCents;
    }
  }
  return { taxableAdditionsCents, nontaxableAdditionsCents, deductionsCents, applied };
}

// ---------------------------------------------------------------------------
// Expense claim helpers (Phase K)
// ---------------------------------------------------------------------------

interface AppliedClaimsResult {
  /// TAXABLE claims → flow into gross taxable income.
  taxableAdditionsCents: bigint;
  /// DE_MINIMIS claims → non-taxable compensation bucket.
  nontaxableCompensationCents: bigint;
  /// NONTAXABLE_REIMBURSEMENT claims → added back after WHT (not in gross).
  nontaxableAdditionsCents: bigint;
  applied: AppliedExpenseClaim[];
}

function applyExpenseClaims(
  claims: ComputeExpenseClaim[],
): AppliedClaimsResult {
  let taxableAdditionsCents = 0n;
  let nontaxableCompensationCents = 0n;
  let nontaxableAdditionsCents = 0n;
  const applied: AppliedExpenseClaim[] = [];

  for (const c of claims) {
    let taxable = 0n;
    let nontaxable = 0n;

    if (c.taxTreatment === "TAXABLE") {
      taxableAdditionsCents += c.amountCents;
      taxable = c.amountCents;
    } else if (c.taxTreatment === "DE_MINIMIS") {
      nontaxableCompensationCents += c.amountCents;
      nontaxable = c.amountCents;
    } else {
      // NONTAXABLE_REIMBURSEMENT — added back after WHT
      nontaxableAdditionsCents += c.amountCents;
      nontaxable = c.amountCents;
    }

    applied.push({
      id: c.id,
      category: c.category,
      amountCents: c.amountCents.toString(),
      taxTreatment: c.taxTreatment,
      taxablePortionCents: taxable.toString(),
      nontaxablePortionCents: nontaxable.toString(),
    });
  }

  return {
    taxableAdditionsCents,
    nontaxableCompensationCents,
    nontaxableAdditionsCents,
    applied,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Annual 13th-month / year-end cap per TRAIN (RA 10963 + RR 29-2025 §3):
 * 13th-month pay and other benefits are non-taxable up to ₱90,000 combined.
 */
const ANNUAL_13TH_MONTH_CAP = 9_000_000n; // ₱90,000 in centavos

/**
 * YEAR_END computation path — invoked when `input.thirteenthMonthCents` is
 * set by the persist layer.
 *
 * Rules (§4.4 + TRAIN §3):
 *   • grossCompensation = thirteenthMonthCents.
 *   • Non-taxable: min(thirteenthMonth, ₱90,000).
 *   • Taxable excess → WHT via MONTHLY BIR table.
 *   • No SSS/PhilHealth/Pag-IBIG deductions (contributions are a monthly
 *     obligation already deducted in REGULAR runs).
 *   • Loan installments deducted normally.
 *   • Net = thirteenthMonth − WHT − loanDeductions.
 */
function computeYearEnd(input: ComputeInput): ComputeResult {
  const { employee, salary, tenant, period, periodInput, loans, rules } = input;
  const thirteenthMonth = input.thirteenthMonthCents ?? 0n;

  // Adjustments.
  const adjs = applyAdjustments(input.adjustments);

  const nonTaxable13Month =
    thirteenthMonth < ANNUAL_13TH_MONTH_CAP
      ? thirteenthMonth
      : ANNUAL_13TH_MONTH_CAP;
  const taxableExcess = thirteenthMonth - nonTaxable13Month; // always ≥ 0n

  // WHT on taxable excess + taxable adjustment additions.
  const grossTaxableIncomeCents = taxableExcess + adjs.taxableAdditionsCents;
  let withholdingTaxCents = 0n;
  let birBracket: StatutoryBreakdown["bir"] = null;
  if (grossTaxableIncomeCents > 0n) {
    const bir = lookupBIR(rules.bir, "MONTHLY", grossTaxableIncomeCents);
    withholdingTaxCents = bir.tax;
    birBracket = {
      bracketFloorCents: bir.bracket.floor.toString(),
      bracketFixedTaxCents: bir.bracket.fixedTax.toString(),
      bracketPlusRate: bir.bracket.plusRate,
    };
  }

  const grossCompensationCents = thirteenthMonth + adjs.taxableAdditionsCents;
  const nontaxableAdditionsCents = adjs.nontaxableAdditionsCents;
  const adjustmentDeductionsCents = adjs.deductionsCents;

  // Loans — "no negative pay" floor: cap total loan deductions at the net
  // available before loans so 13th-month net never goes below zero. Deferred
  // installments carry forward in the loan balance (YEAR_END is always floored).
  const preLoanNetCents =
    grossCompensationCents -
    withholdingTaxCents +
    nontaxableAdditionsCents -
    adjustmentDeductionsCents;
  const { loanPaymentsApplied, loanDeductionsCents, loanDeferredCents } =
    applyLoanDeductions(loans, clampNonNegative(preLoanNetCents));

  const netPayCents = preLoanNetCents - loanDeductionsCents;

  const statutoryBreakdown: StatutoryBreakdown = {
    deducted: false,
    bases: { sssMscCents: "0", philHealthMscCents: "0", pagibigMfsCents: "0" },
    sss: { eeRegularCents: "0", erRegularCents: "0", eeMpfCents: "0", erMpfCents: "0", ecCents: "0" },
    bir: birBracket,
  };

  return {
    taxClassificationSnapshot: employee.taxClassification,
    regionSnapshot: employee.region,
    payFrequencySnapshot: employee.payFrequency,
    salaryTypeSnapshot: salary.salaryType,
    basicSalaryCentsSnapshot: salary.basicSalaryCents,
    workingDaysDenominatorSnapshot: tenant.workingDaysDenominator,
    statutoryDeductedSnapshot: false,

    basePayCents: 0n,
    lateUndertimeDeductionCents: 0n,
    otPayCents: 0n,
    nsdPayCents: 0n,
    holidayPayCents: 0n,
    restDayPayCents: 0n,
    hazardPayCents: 0n,
    taxableAllowancesCents: taxableExcess + adjs.taxableAdditionsCents,

    grossCompensationCents,
    mweExemptCompensationCents: 0n,
    nontaxableBasicCents: 0n,
    nontaxableCompensationCents: 0n,
    nontaxable13MonthAndBenefitsCents: nonTaxable13Month,

    grossTaxableIncomeCents,

    sssEeCents: 0n,
    sssErCents: 0n,
    sssEcCents: 0n,
    philhealthEeCents: 0n,
    philhealthErCents: 0n,
    pagibigEeCents: 0n,
    pagibigErCents: 0n,

    withholdingTaxCents,

    nontaxableAdditionsCents,
    loanDeductionsCents,
    loanDeferredCents,
    adjustmentDeductionsCents,

    netPayCents,

    payComponentsApplied: [],
    loanPaymentsApplied,
    adjustmentsApplied: adjs.applied,
    expenseClaimsApplied: [],
    statutoryBreakdown,
    periodInputSnapshot: periodInput,
  };
}

// ---------------------------------------------------------------------------
// FINAL_PAY compute path
// ---------------------------------------------------------------------------

/**
 * FINAL_PAY path — invoked when `input.finalPayInputs` is present.
 *
 * Computes back pay for the final period (steps 1–4 identical to REGULAR),
 * then appends:
 *   • Leave cash-out (taxable — included in grossCompensation)
 *   • Prorated 13th month (non-taxable up to ₱90,000 combined)
 *   • DOLE separation pay (non-taxable for mandated causes; taxable otherwise)
 * WHT is annualised:
 *   annualWHT = lookupBIR(MONTHLY, (cyPriorTaxable + thisRunTaxable) / 12) × 12
 *   thisRunWHT = max(0, annualWHT − cyPriorWHT)
 */
function computeFinalPay(input: ComputeInput): ComputeResult {
  const { employee, salary, tenant, period, periodInput, loans, rules } = input;
  const fp = input.finalPayInputs!;

  // Adjustments (processed early; taxable additions feed into gross + WHT).
  const adjs = applyAdjustments(input.adjustments);

  const rates = deriveRates(input);
  const { dailyRateCents, hourlyRateCents } = rates;

  // -- Steps 1–4: back pay + premiums + pay components (same as REGULAR) ----
  const basePayCents = timesUnits(dailyRateCents, periodInput.daysWorked);

  const lateUndertimeDeductionCents = timesMinutes(
    hourlyRateCents,
    periodInput.lateUndertimeMinutes,
  );

  const mFP = resolveMultipliers(input.multiplierConfig);

  const otPayCents = timesUnits(hourlyRateCents, periodInput.regularOtHours * mFP.OT);
  const nsdPayCents =
    timesUnits(hourlyRateCents, periodInput.nightDiffHours                                               * mFP.NSD) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffOtHours                          ?? 0) * mFP.NSD * mFP.OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRestDayHours                     ?? 0) * mFP.NSD * mFP.REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRestDayOtHours                   ?? 0) * mFP.NSD * mFP.REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayHours              ?? 0) * mFP.NSD * mFP.SPECIAL_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayOtHours            ?? 0) * mFP.NSD * mFP.SPECIAL_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayRestDayHours       ?? 0) * mFP.NSD * mFP.SPECIAL_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayRestDayOtHours     ?? 0) * mFP.NSD * mFP.SPECIAL_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayHours              ?? 0) * mFP.NSD * mFP.REGULAR_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayOtHours            ?? 0) * mFP.NSD * mFP.REGULAR_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayRestDayHours       ?? 0) * mFP.NSD * mFP.REGULAR_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayRestDayOtHours     ?? 0) * mFP.NSD * mFP.REGULAR_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayHours               ?? 0) * mFP.NSD * mFP.DOUBLE_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayOtHours             ?? 0) * mFP.NSD * mFP.DOUBLE_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayRestDayHours        ?? 0) * mFP.NSD * mFP.DOUBLE_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayRestDayOtHours      ?? 0) * mFP.NSD * mFP.DOUBLE_HOLIDAY_REST_DAY_OT);
  const restDayPayCents =
    timesUnits(dailyRateCents,  (periodInput.dayOffDutyDays                            ?? 0) * mFP.REST_DAY) +
    timesUnits(hourlyRateCents, periodInput.restDayHours                                     * mFP.REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayOtHours                            ?? 0) * mFP.REST_DAY_OT);
  const specialHolidayPayCents =
    timesUnits(hourlyRateCents, periodInput.specialHolidayHours                              * mFP.SPECIAL_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.specialHolidayOtHours                     ?? 0) * mFP.SPECIAL_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDaySpecialHolidayHours                ?? 0) * mFP.SPECIAL_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDaySpecialHolidayOtHours              ?? 0) * mFP.SPECIAL_HOLIDAY_REST_DAY_OT);
  const regularHolidayPayCents =
    timesUnits(hourlyRateCents, periodInput.regularHolidayHours                              * mFP.REGULAR_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.regularHolidayOtHours                     ?? 0) * mFP.REGULAR_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDayRegularHolidayHours                ?? 0) * mFP.REGULAR_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayRegularHolidayOtHours              ?? 0) * mFP.REGULAR_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.doubleHolidayHours                        ?? 0) * mFP.DOUBLE_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.doubleHolidayOtHours                      ?? 0) * mFP.DOUBLE_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDayDoubleHolidayHours                 ?? 0) * mFP.DOUBLE_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayDoubleHolidayOtHours               ?? 0) * mFP.DOUBLE_HOLIDAY_REST_DAY_OT) +
    timesUnits(dailyRateCents,  (periodInput.noWorkRegularHolidayDays                  ?? 0) * mFP.NO_WORK_REGULAR_HOLIDAY);
  const holidayPayCents = specialHolidayPayCents + regularHolidayPayCents;
  const hazardPayCents = timesUnits(hourlyRateCents, periodInput.hazardHours * mFP.HAZARD);

  const deMinimisCeilingByCode = new Map<string, bigint>();
  if (rules.deMinimis) {
    for (const item of rules.deMinimis.items) {
      if (item.monthlyCeiling != null) {
        deMinimisCeilingByCode.set(item.code, BigInt(item.monthlyCeiling));
      } else if (item.annualCeiling != null) {
        deMinimisCeilingByCode.set(item.code, BigInt(Math.floor(Number(item.annualCeiling) / 12)));
      }
    }
  }
  const buckets = classifyComponents(input.payComponents, deMinimisCeilingByCode);

  // Leave cash-out: taxable compensation (included in gross).
  const leaveCashOutCents = fp.leaveCashOutCents;

  // Separation pay taxability split.
  const separationPayCents = fp.separationPayCents;
  const separationPayTaxable = fp.isSeparationPayTaxable ? separationPayCents : 0n;
  const separationPayNonTaxable = fp.isSeparationPayTaxable ? 0n : separationPayCents;

  // -- Step 5: gross compensation -------------------------------------------
  const earningsSubtotal =
    basePayCents -
    lateUndertimeDeductionCents +
    otPayCents +
    nsdPayCents +
    holidayPayCents +
    restDayPayCents +
    hazardPayCents;

  const grossCompensationCents =
    earningsSubtotal +
    buckets.taxableAllowancesCents +
    buckets.nontaxableCompensationCents +
    leaveCashOutCents +
    separationPayTaxable +
    adjs.taxableAdditionsCents;

  // -- Step 6: non-taxable buckets ------------------------------------------
  const isMwe = checkMwe(input, dailyRateCents);
  const mweExemptCompensationCents = isMwe
    ? basePayCents + holidayPayCents + otPayCents + nsdPayCents + hazardPayCents
    : 0n;
  const nontaxableBasicCents = employee.nontaxableBasicAmountCents;

  // Prorated 13th month: non-taxable up to ₱90,000.
  const p13th = fp.proratedThirteenthMonthCents;
  const nontaxable13Month = p13th < ANNUAL_13TH_MONTH_CAP ? p13th : ANNUAL_13TH_MONTH_CAP;
  const taxable13thExcess = clampNonNegative(p13th - nontaxable13Month);
  // The excess is added to gross taxable income (accounted for below).

  // -- Step 8: statutory (cutoff rule applies; skipStatutory via override) --
  // Statutory base is CONTRIBUTORY compensation (wages for work) only. Terminal
  // benefits are NOT part of the SSS/PhilHealth/Pag-IBIG base, so a final pay
  // consisting solely of separation pay / leave cash-out / prorated 13th month
  // carries no contributions. grossCompensationCents folds in leaveCashOut and
  // taxable separation pay, so subtract them back out; non-taxable separation
  // pay, p13th and reimbursements were never in gross. Zero contributory gross
  // → skip statutory (both EE and ER).
  const contributoryGrossCents =
    grossCompensationCents - leaveCashOutCents - separationPayTaxable;
  const deducted =
    contributoryGrossCents <= 0n
      ? false
      : input.overrideStatutoryDeducted !== undefined
        ? input.overrideStatutoryDeducted
        : isStatutoryDeducted(period.cycle, tenant.statutoryCutoffRule, period.end, period.start);

  const sss = computeSSS(rules.sss, rates.monthlyEquivalentCents);
  const phic = computePhilHealth(rules.philHealth, rates.monthlyEquivalentCents);
  const hdmf = computePagibig(rules.pagibig, rates.monthlyEquivalentCents);

  const sssEeCents = deducted ? sss.employee : 0n;
  const sssErCents = deducted ? sss.employer : 0n;
  const sssEcCents = deducted ? sss.ec : 0n;
  const philhealthEeCents = deducted ? phic.employee : 0n;
  const philhealthErCents = deducted ? phic.employer : 0n;
  const pagibigEeCents = deducted ? hdmf.employee : 0n;
  const pagibigErCents = deducted ? hdmf.employer : 0n;

  const mandatoryEeContribs = sssEeCents + philhealthEeCents + pagibigEeCents;

  const nontaxableCompensationCents =
    buckets.nontaxableCompensationCents + mandatoryEeContribs;

  // -- Step 7: gross taxable income -----------------------------------------
  const grossTaxableIncomeCents = clampNonNegative(
    grossCompensationCents -
      mweExemptCompensationCents -
      nontaxableBasicCents -
      nontaxableCompensationCents -
      nontaxable13Month +
      taxable13thExcess,
  );

  // -- Step 9: WHT via annualisation ----------------------------------------
  // Annual total taxable = CY prior + this run's taxable.
  const cyTotalTaxable =
    fp.cyPriorTaxableIncomeCents + grossTaxableIncomeCents;
  let withholdingTaxCents = 0n;
  let birBracket: StatutoryBreakdown["bir"] = null;
  let annualizedWht = 0n;
  if (!isMwe && cyTotalTaxable > 0n) {
    // Derive annual WHT from monthly bracket (TRAIN formula: monthly × 12).
    const monthlyEquivalent = cyTotalTaxable / 12n;
    const bir = lookupBIR(rules.bir, "MONTHLY", monthlyEquivalent);
    annualizedWht = bir.tax * 12n;
    withholdingTaxCents = clampNonNegative(
      annualizedWht - fp.cyPriorWithholdingTaxCents,
    );
    birBracket = {
      bracketFloorCents: bir.bracket.floor.toString(),
      bracketFixedTaxCents: bir.bracket.fixedTax.toString(),
      bracketPlusRate: bir.bracket.plusRate,
    };
  }

  // -- Step 10: non-taxable additions ---------------------------------------
  // Separation pay (non-taxable portion) + reimbursements + non-taxable adj additions.
  const nontaxableAdditionsCents =
    buckets.nontaxableAdditionsCents + separationPayNonTaxable + adjs.nontaxableAdditionsCents;

  const adjustmentDeductionsCents = adjs.deductionsCents;

  // -- Step 11: loans -------------------------------------------------------
  // Net available before loans. FINAL_PAY is EXEMPT from the floor by default
  // (allowNegativeFinalPay) — terminal charges against a separating employee's
  // last pay may legitimately make it negative. When the tenant turns the
  // exemption off, the same floor as REGULAR runs applies.
  const preLoanNetCents =
    grossCompensationCents -
    mandatoryEeContribs -
    withholdingTaxCents +
    nontaxableAdditionsCents -
    adjustmentDeductionsCents;
  const { loanPaymentsApplied, loanDeductionsCents, loanDeferredCents } =
    applyLoanDeductions(
      loans,
      tenant.allowNegativeFinalPay ? null : clampNonNegative(preLoanNetCents),
    );

  // -- Step 12: net pay -----------------------------------------------------
  const netPayCents = preLoanNetCents - loanDeductionsCents;

  const statutoryBreakdown: StatutoryBreakdown = {
    deducted,
    bases: {
      sssMscCents: (deducted ? sss.msc : 0n).toString(),
      philHealthMscCents: (deducted ? phic.msc : 0n).toString(),
      pagibigMfsCents: (deducted ? hdmf.mfs : 0n).toString(),
    },
    sss: {
      eeRegularCents: (deducted ? sss.breakdown.eeRegular : 0n).toString(),
      erRegularCents: (deducted ? sss.breakdown.erRegular : 0n).toString(),
      eeMpfCents: (deducted ? sss.breakdown.eeMpf : 0n).toString(),
      erMpfCents: (deducted ? sss.breakdown.erMpf : 0n).toString(),
      ecCents: sssEcCents.toString(),
    },
    bir: birBracket,
  };

  const finalPayBreakdown: FinalPayBreakdown = {
    backPayCents: basePayCents.toString(),
    proratedThirteenthMonthCents: p13th.toString(),
    leaveCashOutCents: leaveCashOutCents.toString(),
    separationPayCents: separationPayCents.toString(),
    isSeparationPayTaxable: fp.isSeparationPayTaxable,
    cyPriorTaxableIncomeCents: fp.cyPriorTaxableIncomeCents.toString(),
    cyPriorWithholdingTaxCents: fp.cyPriorWithholdingTaxCents.toString(),
    annualizedWhtCents: annualizedWht.toString(),
  };

  return {
    taxClassificationSnapshot: employee.taxClassification,
    regionSnapshot: employee.region,
    payFrequencySnapshot: employee.payFrequency,
    salaryTypeSnapshot: salary.salaryType,
    basicSalaryCentsSnapshot: salary.basicSalaryCents,
    workingDaysDenominatorSnapshot: tenant.workingDaysDenominator,
    statutoryDeductedSnapshot: deducted,

    basePayCents,
    lateUndertimeDeductionCents,
    otPayCents,
    nsdPayCents,
    holidayPayCents,
    restDayPayCents,
    hazardPayCents,

    taxableAllowancesCents:
      buckets.taxableAllowancesCents + leaveCashOutCents + separationPayTaxable + taxable13thExcess + adjs.taxableAdditionsCents,

    grossCompensationCents,
    mweExemptCompensationCents,
    nontaxableBasicCents,
    nontaxableCompensationCents,
    nontaxable13MonthAndBenefitsCents: nontaxable13Month,

    grossTaxableIncomeCents,

    sssEeCents,
    sssErCents,
    sssEcCents,
    philhealthEeCents,
    philhealthErCents,
    pagibigEeCents,
    pagibigErCents,

    withholdingTaxCents,

    nontaxableAdditionsCents,
    loanDeductionsCents,
    loanDeferredCents,
    adjustmentDeductionsCents,

    netPayCents,

    payComponentsApplied: buckets.applied,
    loanPaymentsApplied,
    adjustmentsApplied: adjs.applied,
    expenseClaimsApplied: [],
    statutoryBreakdown,
    periodInputSnapshot: periodInput,
    finalPayBreakdown,
  };
}

export function computeSheet(input: ComputeInput): ComputeResult {
  // FINAL_PAY path — triggered when persist layer supplies finalPayInputs.
  if (input.finalPayInputs !== undefined) {
    return computeFinalPay(input);
  }

  // Year-end (13th month) path — triggered when the persist layer supplies
  // the pre-computed thirteenthMonthCents.
  if (input.thirteenthMonthCents !== undefined) {
    return computeYearEnd(input);
  }

  const { employee, salary, tenant, period, periodInput, loans, rules } =
    input;

  // Adjustments (taxable additions feed into gross + WHT).
  const adjs = applyAdjustments(input.adjustments);
  // Expense claims (Phase K).
  const claims = applyExpenseClaims(input.expenseClaims);

  const rates = deriveRates(input);
  const { dailyRateCents, hourlyRateCents } = rates;

  // -- Step 1: base pay ------------------------------------------------------
  // For MONTHLY salaryType on SEMI_MONTHLY/MONTHLY cycles, base = dailyRate × daysWorked.
  // This deliberately follows the blueprint §4.1 derivation.
  const basePayCents = timesUnits(dailyRateCents, periodInput.daysWorked);

  // -- Step 2: late / undertime ---------------------------------------------
  // Deduction = hourlyRate × (minutes / 60), rounded HALF-UP at the end.
  // (Do NOT round the per-minute rate first — that loses the half-centavo.)
  const lateUndertimeDeductionCents = timesMinutes(
    hourlyRateCents,
    periodInput.lateUndertimeMinutes,
  );

  // -- Step 3: premium pay — full §4.3 stacking matrix ---------------------
  // Each typed OT / NSD field carries its FULL composed rate, not just the
  // premium delta. Night-diff fields carry only the NSD PREMIUM (NSD_rate ×
  // base_scenario_rate) so that nsdPayCents is a clean decomposition column.
  const m = resolveMultipliers(input.multiplierConfig);

  const otPayCents = timesUnits(hourlyRateCents, periodInput.regularOtHours * m.OT);

  // NSD premiums: NSD_rate × base_scenario_rate for each compound hour bucket.
  const nsdPayCents =
    timesUnits(hourlyRateCents, periodInput.nightDiffHours                                             * m.NSD) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffOtHours                          ?? 0) * m.NSD * m.OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRestDayHours                     ?? 0) * m.NSD * m.REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRestDayOtHours                   ?? 0) * m.NSD * m.REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayHours              ?? 0) * m.NSD * m.SPECIAL_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayOtHours            ?? 0) * m.NSD * m.SPECIAL_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayRestDayHours       ?? 0) * m.NSD * m.SPECIAL_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffSpecialHolidayRestDayOtHours     ?? 0) * m.NSD * m.SPECIAL_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayHours              ?? 0) * m.NSD * m.REGULAR_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayOtHours            ?? 0) * m.NSD * m.REGULAR_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayRestDayHours       ?? 0) * m.NSD * m.REGULAR_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffRegularHolidayRestDayOtHours     ?? 0) * m.NSD * m.REGULAR_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayHours               ?? 0) * m.NSD * m.DOUBLE_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayOtHours             ?? 0) * m.NSD * m.DOUBLE_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayRestDayHours        ?? 0) * m.NSD * m.DOUBLE_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.nightDiffDoubleHolidayRestDayOtHours      ?? 0) * m.NSD * m.DOUBLE_HOLIDAY_REST_DAY_OT);

  // Rest-day pay (hourly premium + full rest-day = daily-rate basis).
  const restDayPayCents =
    timesUnits(dailyRateCents,  (periodInput.dayOffDutyDays                            ?? 0) * m.REST_DAY) +
    timesUnits(hourlyRateCents, periodInput.restDayHours                                     * m.REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayOtHours                            ?? 0) * m.REST_DAY_OT);

  const specialHolidayPayCents =
    timesUnits(hourlyRateCents, periodInput.specialHolidayHours                              * m.SPECIAL_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.specialHolidayOtHours                     ?? 0) * m.SPECIAL_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDaySpecialHolidayHours                ?? 0) * m.SPECIAL_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDaySpecialHolidayOtHours              ?? 0) * m.SPECIAL_HOLIDAY_REST_DAY_OT);

  const regularHolidayPayCents =
    timesUnits(hourlyRateCents, periodInput.regularHolidayHours                              * m.REGULAR_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.regularHolidayOtHours                     ?? 0) * m.REGULAR_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDayRegularHolidayHours                ?? 0) * m.REGULAR_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayRegularHolidayOtHours              ?? 0) * m.REGULAR_HOLIDAY_REST_DAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.doubleHolidayHours                        ?? 0) * m.DOUBLE_HOLIDAY) +
    timesUnits(hourlyRateCents, (periodInput.doubleHolidayOtHours                      ?? 0) * m.DOUBLE_HOLIDAY_OT) +
    timesUnits(hourlyRateCents, (periodInput.restDayDoubleHolidayHours                 ?? 0) * m.DOUBLE_HOLIDAY_REST_DAY) +
    timesUnits(hourlyRateCents, (periodInput.restDayDoubleHolidayOtHours               ?? 0) * m.DOUBLE_HOLIDAY_REST_DAY_OT) +
    // No-work regular holiday: 1.00 × daily rate per DOLE (daily-rate basis).
    timesUnits(dailyRateCents,  (periodInput.noWorkRegularHolidayDays                  ?? 0) * m.NO_WORK_REGULAR_HOLIDAY);
  const holidayPayCents = specialHolidayPayCents + regularHolidayPayCents;
  const hazardPayCents = timesUnits(hourlyRateCents, periodInput.hazardHours * m.HAZARD);

  // -- Step 4: pay components ------------------------------------------------
  const deMinimisCeilingByCode = new Map<string, bigint>();
  if (rules.deMinimis) {
    for (const item of rules.deMinimis.items) {
      // Use monthly ceiling if present; else annual / 12 (rough); else skip.
      if (item.monthlyCeiling != null) {
        deMinimisCeilingByCode.set(item.code, BigInt(item.monthlyCeiling));
      } else if (item.annualCeiling != null) {
        deMinimisCeilingByCode.set(
          item.code,
          BigInt(Math.floor(Number(item.annualCeiling) / 12)),
        );
      }
    }
  }
  const buckets = classifyComponents(
    input.payComponents,
    deMinimisCeilingByCode,
  );

  // Subtotal of base + premiums + late deduction.
  const earningsSubtotal =
    basePayCents -
    lateUndertimeDeductionCents +
    otPayCents +
    nsdPayCents +
    holidayPayCents +
    restDayPayCents +
    hazardPayCents;

  // -- Step 5: gross compensation --------------------------------------------
  const grossCompensationCents =
    earningsSubtotal +
    buckets.taxableAllowancesCents +
    buckets.nontaxableCompensationCents +
    adjs.taxableAdditionsCents +
    claims.taxableAdditionsCents +
    claims.nontaxableCompensationCents;

  // -- Step 6: non-taxable buckets ------------------------------------------
  const isMwe = checkMwe(input, dailyRateCents);
  const mweExemptCompensationCents = isMwe
    ? basePayCents +
      holidayPayCents +
      otPayCents +
      nsdPayCents +
      hazardPayCents
    : 0n;
  const nontaxableBasicCents = employee.nontaxableBasicAmountCents;

  // -- Step 8: statutory contributions (computed early — needed for non-tax) -
  // Skip statutory entirely when the employee earned nothing this period.
  // Contributions are based on compensation actually earned, so with a zero
  // base there is no EE or ER contribution — prevents negative net pay from
  // deducting contributions when there was no pay to deduct from.
  const periodEarningsCents =
    grossCompensationCents +
    buckets.nontaxableAdditionsCents +
    adjs.nontaxableAdditionsCents +
    claims.nontaxableAdditionsCents;
  const deducted =
    periodEarningsCents <= 0n
      ? false
      : input.overrideStatutoryDeducted !== undefined
        ? input.overrideStatutoryDeducted
        : isStatutoryDeducted(
            period.cycle,
            tenant.statutoryCutoffRule,
            period.end,
            period.start,
          );

  const sss = computeSSS(rules.sss, rates.monthlyEquivalentCents);
  const phic = computePhilHealth(
    rules.philHealth,
    rates.monthlyEquivalentCents,
  );
  const hdmf = computePagibig(rules.pagibig, rates.monthlyEquivalentCents);

  const sssEeCents = deducted ? sss.employee : 0n;
  const sssErCents = deducted ? sss.employer : 0n;
  const sssEcCents = deducted ? sss.ec : 0n;
  const philhealthEeCents = deducted ? phic.employee : 0n;
  const philhealthErCents = deducted ? phic.employer : 0n;
  const pagibigEeCents = deducted ? hdmf.employee : 0n;
  const pagibigErCents = deducted ? hdmf.employer : 0n;

  const mandatoryEeContribs =
    sssEeCents + philhealthEeCents + pagibigEeCents;

  // Total non-taxable comp = MWE-exempt + non-taxable components +
  //                         mandatory contribs (per blueprint §4.5).
  // `nontaxableCompensationCents` reported on the sheet is the bucket
  // EXCLUDING the MWE-exempt and 13th-month columns (those have their own
  // columns per §2.6).
  const nontaxableCompensationCents =
    buckets.nontaxableCompensationCents +
    claims.nontaxableCompensationCents +
    mandatoryEeContribs;

  // 13th-month / benefits residual — deferred to year-end phase.
  const nontaxable13MonthAndBenefitsCents = 0n;

  // -- Step 7: gross taxable income -----------------------------------------
  const grossTaxableIncomeCents = clampNonNegative(
    grossCompensationCents -
      mweExemptCompensationCents -
      nontaxableBasicCents -
      nontaxableCompensationCents -
      nontaxable13MonthAndBenefitsCents,
  );

  // -- Step 9: withholding tax -----------------------------------------------
  // MWE employees are exempt from WHT on their minimum-wage portions, but
  // any taxable allowances or bonuses above the exempt base still generate
  // WHT. The MWE exemption only zeroes GTI for the exempt components; if GTI
  // is still > 0 after the §6 non-taxable buckets are applied (because of
  // taxable pay components), WHT is due on that residual taxable income.
  let withholdingTaxCents = 0n;
  let birBracket: StatutoryBreakdown["bir"] = null;
  if (grossTaxableIncomeCents > 0n) {
    const bir = lookupBIR(
      rules.bir,
      period.cycle,
      grossTaxableIncomeCents,
    );
    withholdingTaxCents = bir.tax;
    birBracket = {
      bracketFloorCents: bir.bracket.floor.toString(),
      bracketFixedTaxCents: bir.bracket.fixedTax.toString(),
      bracketPlusRate: bir.bracket.plusRate,
    };
  }

  // -- Step 10: non-taxable additions ---------------------------------------
  const nontaxableAdditionsCents =
    buckets.nontaxableAdditionsCents +
    adjs.nontaxableAdditionsCents +
    claims.nontaxableAdditionsCents;

  const adjustmentDeductionsCents = adjs.deductionsCents;

  // -- Step 11: loans --------------------------------------------------------
  // "No negative pay" floor: cap total loan deductions at the net available
  // before loans so net pay never goes below zero. Any deferred installment
  // carries forward in the loan balance (REGULAR runs are always floored).
  const preLoanNetCents =
    grossCompensationCents -
    mandatoryEeContribs -
    withholdingTaxCents +
    nontaxableAdditionsCents -
    adjustmentDeductionsCents;
  const { loanPaymentsApplied, loanDeductionsCents, loanDeferredCents } =
    applyLoanDeductions(loans, clampNonNegative(preLoanNetCents));

  // -- Step 12: net pay ------------------------------------------------------
  const netPayCents = preLoanNetCents - loanDeductionsCents;

  const statutoryBreakdown: StatutoryBreakdown = {
    deducted,
    bases: {
      sssMscCents: (deducted ? sss.msc : 0n).toString(),
      philHealthMscCents: (deducted ? phic.msc : 0n).toString(),
      pagibigMfsCents: (deducted ? hdmf.mfs : 0n).toString(),
    },
    sss: {
      eeRegularCents: (deducted ? sss.breakdown.eeRegular : 0n).toString(),
      erRegularCents: (deducted ? sss.breakdown.erRegular : 0n).toString(),
      eeMpfCents: (deducted ? sss.breakdown.eeMpf : 0n).toString(),
      erMpfCents: (deducted ? sss.breakdown.erMpf : 0n).toString(),
      ecCents: sssEcCents.toString(),
    },
    bir: birBracket,
  };

  return {
    taxClassificationSnapshot: employee.taxClassification,
    regionSnapshot: employee.region,
    payFrequencySnapshot: employee.payFrequency,
    salaryTypeSnapshot: salary.salaryType,
    basicSalaryCentsSnapshot: salary.basicSalaryCents,
    workingDaysDenominatorSnapshot: tenant.workingDaysDenominator,
    statutoryDeductedSnapshot: deducted,

    basePayCents,
    lateUndertimeDeductionCents,

    otPayCents,
    nsdPayCents,
    holidayPayCents,
    restDayPayCents,
    hazardPayCents,

    taxableAllowancesCents: buckets.taxableAllowancesCents + adjs.taxableAdditionsCents + claims.taxableAdditionsCents,

    grossCompensationCents,
    mweExemptCompensationCents,
    nontaxableBasicCents,
    nontaxableCompensationCents,
    nontaxable13MonthAndBenefitsCents,

    grossTaxableIncomeCents,

    sssEeCents,
    sssErCents,
    sssEcCents,
    philhealthEeCents,
    philhealthErCents,
    pagibigEeCents,
    pagibigErCents,

    withholdingTaxCents,

    nontaxableAdditionsCents,
    loanDeductionsCents,
    loanDeferredCents,
    adjustmentDeductionsCents,

    netPayCents,

    payComponentsApplied: buckets.applied,
    loanPaymentsApplied,
    adjustmentsApplied: adjs.applied,
    expenseClaimsApplied: claims.applied,
    statutoryBreakdown,
    periodInputSnapshot: periodInput,
  };
}
