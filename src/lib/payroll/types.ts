/**
 * Phase D3 — Engine input/output types.
 *
 * The engine (`engine.ts`) is a pure function: it takes a fully-resolved
 * `ComputeInput` and returns `ComputeResult`. No DB access; no `Date.now()`.
 * The persist layer (`persist.ts`) is responsible for resolving master data
 * and statutory rules BEFORE calling the engine.
 */
import type {
  AdjustmentKind,
  LoanType,
  PayComponentKind,
  PayComponentTaxability,
  PayFrequency,
  SalaryType,
  StatutoryCutoffRule,
  TaxClassification,
  ThirteenthMonthBasis,
} from "@prisma/client";
import type {
  BirWithholdingPayload,
  DeMinimisCeilingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

export interface ComputeEmployeeSnapshot {
  id: string;
  taxClassification: TaxClassification;
  /// Resolved from branch.workLocation.region; null if employee has no
  /// branch assigned (engine still runs but MWE checks are skipped).
  region: string | null;
  payFrequency: PayFrequency;
  /// Hours in a standard working day (Decimal in DB; passed as number here).
  standardWorkHours: number;
  /// Days in a standard pay period (informational; not used for derivation).
  standardWorkDays: number;
  nontaxableBasicAmountCents: bigint;
}

export interface ComputeSalarySnapshot {
  basicSalaryCents: bigint;
  salaryType: SalaryType;
}

export interface ComputeTenantSnapshot {
  workingDaysDenominator: number;
  statutoryCutoffRule: StatutoryCutoffRule;
  thirteenthMonthBasis: ThirteenthMonthBasis;
}

export interface ComputePeriodInputSnapshot {
  daysWorked: number;
  lateUndertimeMinutes: number;
  regularOtHours: number;
  restDayHours: number;
  specialHolidayHours: number;
  regularHolidayHours: number;
  nightDiffHours: number;
  hazardHours: number;
  unpaidLeaveDays: number;
}

export interface ComputePayComponent {
  id: string;
  code: string;
  name: string;
  kind: PayComponentKind;
  taxability: PayComponentTaxability;
  amountCents: bigint;
  /// Required when taxability = DE_MINIMIS. Matched against the active
  /// `DE_MINIMIS_CEILING` payload by code.
  deMinimisCode: string | null;
}

export interface ComputeLoan {
  id: string;
  loanType: LoanType;
  installmentCents: bigint;
  balanceCents: bigint;
}

export interface ComputeAdjustment {
  id: string;
  kind: AdjustmentKind;
  /** Always positive; kind determines sign direction. */
  amountCents: bigint;
  /** True → in gross (taxable); false → non-taxable add-back after WHT. */
  isTaxable: boolean;
  reason: string;
}

export interface ComputeStatutoryRules {
  sss: SssSchedulePayload;
  philHealth: PhilHealthSchedulePayload;
  pagibig: PagibigSchedulePayload;
  bir: BirWithholdingPayload;
  /// Required when at least one employee has `taxClassification = MWE`.
  minWage: MinimumWagePayload | null;
  deMinimis: DeMinimisCeilingPayload | null;
}

export interface ComputeInput {
  employee: ComputeEmployeeSnapshot;
  salary: ComputeSalarySnapshot;
  tenant: ComputeTenantSnapshot;
  period: {
    start: Date;
    end: Date;
    cycle: PayFrequency;
  };
  periodInput: ComputePeriodInputSnapshot;
  payComponents: ComputePayComponent[];
  loans: ComputeLoan[];
  adjustments: ComputeAdjustment[];
  /// Expense claims attached to this payroll book for this employee.
  expenseClaims: ComputeExpenseClaim[];
  rules: ComputeStatutoryRules;
  /**
   * When present, the engine switches to YEAR_END (13th month) computation
   * mode. The value is the employee's total basic salary earned in the
   * calendar year across all FINALIZED REGULAR runs, divided by 12
   * (computed by the persist layer via `computeThirteenthMonthCents`).
   *
   * In YEAR_END mode: no regular pay is computed; grossCompensation =
   * thirteenthMonthCents; non-taxable capped at ₱90,000 (TRAIN); WHT on
   * any excess via MONTHLY BIR table; no statutory contributions.
   */
  thirteenthMonthCents?: bigint;
  /**
   * When set, overrides the cutoff-rule logic for whether statutory
   * contributions (SSS/PhilHealth/Pag-IBIG) are deducted in this run.
   * `false` → always skip statutory (e.g. bonus-only OFF_CYCLE runs).
   * `true`  → always deduct statutory (rare; use with care).
   * When absent, the standard `isStatutoryDeducted()` cutoff logic applies.
   */
  overrideStatutoryDeducted?: boolean;
  /**
   * When present, the engine switches to FINAL_PAY computation mode.
   * The persist layer pre-computes all separation-related amounts and CY
   * totals; the engine uses them for the annualized WHT true-up.
   */
  finalPayInputs?: FinalPayInputs;
}

/**
 * Pre-computed separation inputs supplied by the persist layer for FINAL_PAY
 * runs.  All centavo fields are BigInt; the engine does not touch the DB.
 */
export interface FinalPayInputs {
  /** Prorated 13th month = sum(basePayCents from CY REGULAR runs) / 12. */
  proratedThirteenthMonthCents: bigint;
  /**
   * Monetised unused leave days (isConvertibleToCash types only).
   * Treated as taxable compensation (included in gross).
   */
  leaveCashOutCents: bigint;
  /**
   * DOLE statutory separation pay.
   * Non-taxable when DOLE-mandated (NIRC §32(B)(6)(b)); taxable otherwise.
   */
  separationPayCents: bigint;
  /**
   * True when `separationPayCents` is taxable compensation (voluntary
   * separation); false for DOLE-mandated causes (exempt from WHT).
   */
  isSeparationPayTaxable: boolean;
  /**
   * Sum of `grossTaxableIncomeCents` from all FINALIZED REGULAR + OFF_CYCLE
   * runs for this employee in the same calendar year, BEFORE this run.
   */
  cyPriorTaxableIncomeCents: bigint;
  /**
   * Sum of `withholdingTaxCents` from the same prior runs.
   * Used for the annualized WHT true-up: `annualWHT − cyPriorWHT`.
   */
  cyPriorWithholdingTaxCents: bigint;
}

/**
 * Applied per-component breakdown — surfaced on PayrollSheet for payslip /
 * audit and stored as JSON in `payComponentsApplied`.
 */
export interface AppliedPayComponent {
  id: string;
  code: string;
  name: string;
  kind: PayComponentKind;
  taxability: PayComponentTaxability;
  amountCents: string; // BigInt as string (JSON)
  /// For DE_MINIMIS: amount accepted as non-taxable (bounded by ceiling).
  nonTaxablePortionCents: string;
  /// For DE_MINIMIS: any excess pushed to taxable.
  taxablePortionCents: string;
}

export interface AppliedLoanPayment {
  loanId: string;
  loanType: LoanType;
  amountCents: string;
  balanceBeforeCents: string;
  /// Projected balance AFTER deduction (engine output). Persist layer asserts
  /// this matches the real decrement at finalize.
  balanceAfterCents: string;
}

export interface AppliedAdjustment {
  id: string;
  kind: AdjustmentKind;
  amountCents: string;
  isTaxable: boolean;
  reason: string;
}

export interface ComputeExpenseClaim {
  id: string;
  category: string;
  amountCents: bigint;
  taxTreatment: "NONTAXABLE_REIMBURSEMENT" | "DE_MINIMIS" | "TAXABLE";
}

export interface AppliedExpenseClaim {
  id: string;
  category: string;
  amountCents: string;
  taxTreatment: "NONTAXABLE_REIMBURSEMENT" | "DE_MINIMIS" | "TAXABLE";
  /// Amount flowing into gross taxable income.
  taxablePortionCents: string;
  /// Amount added back after WHT or included as non-taxable compensation.
  nontaxablePortionCents: string;
}

export interface StatutoryBreakdown {
  /// Whether contributions were actually deducted on this run (driven by
  /// tenant's `statutoryCutoffRule`).
  deducted: boolean;
  /// MSC / MFS bases used.
  bases: {
    sssMscCents: string;
    philHealthMscCents: string;
    pagibigMfsCents: string;
  };
  /// SSS sub-breakdown (regular + MPF + EC).
  sss: {
    eeRegularCents: string;
    erRegularCents: string;
    eeMpfCents: string;
    erMpfCents: string;
    ecCents: string;
  };
  /// BIR bracket matched (for audit).
  bir: {
    bracketFloorCents: string;
    bracketFixedTaxCents: string;
    bracketPlusRate: number;
  } | null;
}

export interface ComputeResult {
  // Snapshots
  taxClassificationSnapshot: TaxClassification;
  regionSnapshot: string | null;
  payFrequencySnapshot: PayFrequency;
  salaryTypeSnapshot: SalaryType;
  basicSalaryCentsSnapshot: bigint;
  workingDaysDenominatorSnapshot: number;
  statutoryDeductedSnapshot: boolean;

  // Step 1–2: base pay (after late/undertime)
  basePayCents: bigint;
  lateUndertimeDeductionCents: bigint;

  // Step 3: premiums
  otPayCents: bigint;
  nsdPayCents: bigint;
  holidayPayCents: bigint;
  restDayPayCents: bigint;
  hazardPayCents: bigint;

  // Step 4: pay components
  taxableAllowancesCents: bigint;

  // Step 5/6: gross + non-taxable buckets
  grossCompensationCents: bigint;
  mweExemptCompensationCents: bigint;
  nontaxableBasicCents: bigint;
  nontaxableCompensationCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;

  // Step 7: taxable
  grossTaxableIncomeCents: bigint;

  // Step 8: statutory
  sssEeCents: bigint;
  sssErCents: bigint;
  sssEcCents: bigint;
  philhealthEeCents: bigint;
  philhealthErCents: bigint;
  pagibigEeCents: bigint;
  pagibigErCents: bigint;

  // Step 9
  withholdingTaxCents: bigint;

  // Step 10/11
  nontaxableAdditionsCents: bigint;
  loanDeductionsCents: bigint;
  adjustmentDeductionsCents: bigint;

  // Step 12
  netPayCents: bigint;

  // Breakdowns (JSON)
  payComponentsApplied: AppliedPayComponent[];
  loanPaymentsApplied: AppliedLoanPayment[];
  adjustmentsApplied: AppliedAdjustment[];
  expenseClaimsApplied: AppliedExpenseClaim[];
  statutoryBreakdown: StatutoryBreakdown;
  periodInputSnapshot: ComputePeriodInputSnapshot;
  /** Present only for FINAL_PAY runs. */
  finalPayBreakdown?: FinalPayBreakdown;
}

/** JSON breakdown stored on PayrollSheet.finalPayBreakdown for FINAL_PAY runs. */
export interface FinalPayBreakdown {
  backPayCents: string;
  proratedThirteenthMonthCents: string;
  leaveCashOutCents: string;
  separationPayCents: string;
  isSeparationPayTaxable: boolean;
  cyPriorTaxableIncomeCents: string;
  cyPriorWithholdingTaxCents: string;
  annualizedWhtCents: string;
}
