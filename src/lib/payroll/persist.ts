/**
 * Phase D3 — Persist layer for PayrollBook + PayrollSheet.
 *
 * Three top-level operations, all wrapped in `withTenant` (so RLS sees the
 * right tenant):
 *
 *   • `createDraftRun(...)`   — creates a DRAFT book, fans out the engine
 *                               across all active employees, writes sheets.
 *                               409 on duplicate (tenantId, period, runType).
 *   • `recomputeRun(...)`     — DRAFT only; deletes existing sheets and
 *                               re-runs the engine.
 *   • `finalizeRun(...)`      — DRAFT → FINALIZED in one tx. Decrements
 *                               loan balances exactly once and writes an
 *                               `AuditLog` entry. Re-finalize on a FINALIZED
 *                               book is a no-op (returns existing row).
 */
import type {
  Loan,
  PayComponent,
  Prisma,
  StatutoryCategory,
  SeparationReason,
} from "@prisma/client";
import { computeSheet } from "./engine";
import type {
  ComputeInput,
  ComputeLoan,
  ComputeMultiplierConfig,
  ComputePayComponent,
  ComputePeriodInputSnapshot,
  ComputeResult,
  ComputeStatutoryRules,
  FinalPayInputs,
} from "./types";
import { getActiveRule } from "@/lib/statutory/resolver";
import { withTenant, type TenantTx } from "@/lib/with-tenant";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PayrollRunConflictError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "PayrollRunConflictError";
  }
}

export class PayrollRunNotFoundError extends Error {
  status = 404;
  constructor(id: string) {
    super(`PayrollBook ${id} not found`);
    this.name = "PayrollRunNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface CreateDraftRunInput {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  cycle: Prisma.PayrollBookCreateInput["cycle"];
  runType?: Prisma.PayrollBookCreateInput["runType"];
  notes?: string | null;
  createdByUserId?: string | null;
  /**
   * When provided, only these employee IDs receive a PayrollSheet.
   * Primarily used for OFF_CYCLE runs targeting a subset of employees.
   */
  employeeIds?: string[];
  /**
   * When true, SSS/PhilHealth/Pag-IBIG contributions are skipped for every
   * sheet in this book (WHT is still computed).  Stored on the book so that
   * `recomputeRun` preserves the behaviour.
   */
  skipStatutory?: boolean;
  /**
   * Reason for separation — required for FINAL_PAY runs to compute DOLE
   * separation pay and its taxability.
   */
  separationReason?: SeparationReason;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPeriodInput(): ComputePeriodInputSnapshot {
  return {
    daysWorked: 0,
    lateUndertimeMinutes: 0,
    regularOtHours: 0,
    restDayHours: 0,
    specialHolidayHours: 0,
    regularHolidayHours: 0,
    nightDiffHours: 0,
    hazardHours: 0,
    unpaidLeaveDays: 0,
  };
}

function periodInputSnapshot(
  row: Prisma.PeriodInputGetPayload<true> | null,
): ComputePeriodInputSnapshot {
  if (!row) return emptyPeriodInput();
  // Decimal fields arrive as Prisma.Decimal — coerce via Number for engine.
  const n = (v: unknown): number => Number(v as unknown as string);
  return {
    daysWorked: n(row.daysWorked),
    lateUndertimeMinutes: (row as { lateUndertimeMinutes: number })
      .lateUndertimeMinutes,
    regularOtHours: n((row as { regularOtHours: unknown }).regularOtHours),
    restDayHours: n((row as { restDayHours: unknown }).restDayHours),
    dayOffDutyDays: n((row as { dayOffDutyDays: unknown }).dayOffDutyDays),
    restDayOtHours: n((row as { restDayOtHours: unknown }).restDayOtHours),
    specialHolidayHours: n((row as { specialHolidayHours: unknown }).specialHolidayHours),
    specialHolidayOtHours: n((row as { specialHolidayOtHours: unknown }).specialHolidayOtHours),
    restDaySpecialHolidayHours: n((row as { restDaySpecialHolidayHours: unknown }).restDaySpecialHolidayHours),
    restDaySpecialHolidayOtHours: n((row as { restDaySpecialHolidayOtHours: unknown }).restDaySpecialHolidayOtHours),
    regularHolidayHours: n((row as { regularHolidayHours: unknown }).regularHolidayHours),
    regularHolidayOtHours: n((row as { regularHolidayOtHours: unknown }).regularHolidayOtHours),
    restDayRegularHolidayHours: n((row as { restDayRegularHolidayHours: unknown }).restDayRegularHolidayHours),
    restDayRegularHolidayOtHours: n((row as { restDayRegularHolidayOtHours: unknown }).restDayRegularHolidayOtHours),
    doubleHolidayHours: n((row as { doubleHolidayHours: unknown }).doubleHolidayHours),
    doubleHolidayOtHours: n((row as { doubleHolidayOtHours: unknown }).doubleHolidayOtHours),
    restDayDoubleHolidayHours: n((row as { restDayDoubleHolidayHours: unknown }).restDayDoubleHolidayHours),
    restDayDoubleHolidayOtHours: n((row as { restDayDoubleHolidayOtHours: unknown }).restDayDoubleHolidayOtHours),
    noWorkRegularHolidayDays: n((row as { noWorkRegularHolidayDays: unknown }).noWorkRegularHolidayDays),
    nightDiffHours: n((row as { nightDiffHours: unknown }).nightDiffHours),
    nightDiffOtHours: n((row as { nightDiffOtHours: unknown }).nightDiffOtHours),
    nightDiffRestDayHours: n((row as { nightDiffRestDayHours: unknown }).nightDiffRestDayHours),
    nightDiffRestDayOtHours: n((row as { nightDiffRestDayOtHours: unknown }).nightDiffRestDayOtHours),
    nightDiffSpecialHolidayHours: n((row as { nightDiffSpecialHolidayHours: unknown }).nightDiffSpecialHolidayHours),
    nightDiffSpecialHolidayOtHours: n((row as { nightDiffSpecialHolidayOtHours: unknown }).nightDiffSpecialHolidayOtHours),
    nightDiffSpecialHolidayRestDayHours: n((row as { nightDiffSpecialHolidayRestDayHours: unknown }).nightDiffSpecialHolidayRestDayHours),
    nightDiffSpecialHolidayRestDayOtHours: n((row as { nightDiffSpecialHolidayRestDayOtHours: unknown }).nightDiffSpecialHolidayRestDayOtHours),
    nightDiffRegularHolidayHours: n((row as { nightDiffRegularHolidayHours: unknown }).nightDiffRegularHolidayHours),
    nightDiffRegularHolidayOtHours: n((row as { nightDiffRegularHolidayOtHours: unknown }).nightDiffRegularHolidayOtHours),
    nightDiffRegularHolidayRestDayHours: n((row as { nightDiffRegularHolidayRestDayHours: unknown }).nightDiffRegularHolidayRestDayHours),
    nightDiffRegularHolidayRestDayOtHours: n((row as { nightDiffRegularHolidayRestDayOtHours: unknown }).nightDiffRegularHolidayRestDayOtHours),
    nightDiffDoubleHolidayHours: n((row as { nightDiffDoubleHolidayHours: unknown }).nightDiffDoubleHolidayHours),
    nightDiffDoubleHolidayOtHours: n((row as { nightDiffDoubleHolidayOtHours: unknown }).nightDiffDoubleHolidayOtHours),
    nightDiffDoubleHolidayRestDayHours: n((row as { nightDiffDoubleHolidayRestDayHours: unknown }).nightDiffDoubleHolidayRestDayHours),
    nightDiffDoubleHolidayRestDayOtHours: n((row as { nightDiffDoubleHolidayRestDayOtHours: unknown }).nightDiffDoubleHolidayRestDayOtHours),
    hazardHours: n((row as { hazardHours: unknown }).hazardHours),
    unpaidLeaveDays: n((row as { unpaidLeaveDays: unknown }).unpaidLeaveDays),
  };
}

function toComputeComponent(
  assn: { amountCents: bigint; payComponent: PayComponent },
): ComputePayComponent {
  const c = assn.payComponent;
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    taxability: c.taxability,
    amountCents: assn.amountCents,
    deMinimisCode: c.deMinimisCode,
  };
}

function toComputeLoan(l: Loan): ComputeLoan {
  return {
    id: l.id,
    loanType: l.loanType,
    installmentCents: l.installmentCents,
    balanceCents: l.balanceCents,
  };
}

// ---------------------------------------------------------------------------
// Statutory rule resolution (cached per call)
// ---------------------------------------------------------------------------

async function resolveAllRules(
  tx: TenantTx,
  tenantId: string,
  asOf: Date,
): Promise<ComputeStatutoryRules> {
  const cats: StatutoryCategory[] = [
    "SSS_SCHEDULE",
    "PHILHEALTH_SCHEDULE",
    "PAGIBIG_SCHEDULE",
    "BIR_WITHHOLDING_TABLE",
  ];
  const [sss, phic, hdmf, bir] = await Promise.all(
    cats.map((c) => getActiveRule(tx, tenantId, c, asOf)),
  );

  // Optional rules — don't fail if not seeded.
  let minWage: ComputeStatutoryRules["minWage"] = null;
  try {
    const r = await getActiveRule(tx, tenantId, "MINIMUM_WAGE_RATE", asOf);
    minWage = r.payload;
  } catch {
    /* ignore — only required when MWE employees exist */
  }
  let deMinimis: ComputeStatutoryRules["deMinimis"] = null;
  try {
    const r = await getActiveRule(tx, tenantId, "DE_MINIMIS_CEILING", asOf);
    deMinimis = r.payload;
  } catch {
    /* ignore */
  }

  return {
    sss: sss!.payload as ComputeStatutoryRules["sss"],
    philHealth: phic!.payload as ComputeStatutoryRules["philHealth"],
    pagibig: hdmf!.payload as ComputeStatutoryRules["pagibig"],
    bir: bir!.payload as ComputeStatutoryRules["bir"],
    minWage,
    deMinimis,
  };
}

// ---------------------------------------------------------------------------
// Active-employee selection
// ---------------------------------------------------------------------------

async function loadActiveEmployees(
  tx: TenantTx,
  periodStart: Date,
  periodEnd: Date,
) {
  return tx.employee.findMany({
    where: {
      deletedAt: null,
      hireDate: { lte: periodEnd },
      OR: [
        { resignationDate: null },
        { resignationDate: { gte: periodStart } },
      ],
    },
    include: {
      branch: { include: { workLocation: true } },
      salaryHistory: {
        where: { effectiveDate: { lte: periodEnd } },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// PER-EMPLOYEE COMPUTE — gathers inputs and calls engine
// ---------------------------------------------------------------------------

async function buildComputeInputForEmployee(
  tx: TenantTx,
  tenantId: string,
  employee: Awaited<ReturnType<typeof loadActiveEmployees>>[number],
  periodStart: Date,
  periodEnd: Date,
  cycle: ComputeInput["period"]["cycle"],
  tenantSettings: ComputeInput["tenant"],
  rules: ComputeStatutoryRules,
  multiplierConfig?: ComputeMultiplierConfig,
): Promise<ComputeInput | null> {
  const salary = employee.salaryHistory[0];
  if (!salary) return null; // No effective salary → skip

  const region =
    employee.branch?.workLocation?.region ?? employee.region ?? null;

  const [periodInputRow, payCompAssignments, activeLoans] = await Promise.all([
    tx.periodInput.findFirst({
      where: {
        employeeId: employee.id,
        periodStart,
        periodEnd,
      },
    }),
    tx.employeePayComponent.findMany({
      where: {
        employeeId: employee.id,
        effectiveFrom: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
      },
      include: { payComponent: true },
    }),
    tx.loan.findMany({
      where: { employeeId: employee.id, status: "ACTIVE" },
    }),
  ]);

  return {
    employee: {
      id: employee.id,
      taxClassification: employee.taxClassification,
      region,
      payFrequency: employee.payFrequency,
      standardWorkHours: Number(employee.standardWorkHours),
      standardWorkDays: Number(employee.standardWorkDays),
      nontaxableBasicAmountCents: employee.nontaxableBasicAmountCents,
    },
    salary: {
      basicSalaryCents: salary.basicSalaryCents,
      salaryType: salary.salaryType,
    },
    tenant: tenantSettings,
    period: { start: periodStart, end: periodEnd, cycle },
    periodInput: periodInputSnapshot(periodInputRow),
    payComponents: payCompAssignments.map(toComputeComponent),
    loans: activeLoans.map(toComputeLoan),
    adjustments: [], // Injected by caller after bookId is known
    expenseClaims: [], // Injected by caller after bookId is known
    rules,
    multiplierConfig,
    // tenantId not in ComputeInput — used by caller only
  } as ComputeInput;
}

function resultToSheetCreate(
  tenantId: string,
  payrollBookId: string,
  employeeId: string,
  r: ComputeResult,
): Prisma.PayrollSheetCreateManyInput {
  return {
    tenantId,
    payrollBookId,
    employeeId,
    taxClassificationSnapshot: r.taxClassificationSnapshot,
    regionSnapshot: r.regionSnapshot,
    payFrequencySnapshot: r.payFrequencySnapshot,
    salaryTypeSnapshot: r.salaryTypeSnapshot,
    basicSalaryCentsSnapshot: r.basicSalaryCentsSnapshot,
    workingDaysDenominatorSnapshot: r.workingDaysDenominatorSnapshot,
    statutoryDeductedSnapshot: r.statutoryDeductedSnapshot,
    basePayCents: r.basePayCents,
    lateUndertimeDeductionCents: r.lateUndertimeDeductionCents,
    otPayCents: r.otPayCents,
    nsdPayCents: r.nsdPayCents,
    holidayPayCents: r.holidayPayCents,
    restDayPayCents: r.restDayPayCents,
    hazardPayCents: r.hazardPayCents,
    taxableAllowancesCents: r.taxableAllowancesCents,
    grossCompensationCents: r.grossCompensationCents,
    mweExemptCompensationCents: r.mweExemptCompensationCents,
    nontaxableBasicCents: r.nontaxableBasicCents,
    nontaxableCompensationCents: r.nontaxableCompensationCents,
    nontaxable13MonthAndBenefitsCents: r.nontaxable13MonthAndBenefitsCents,
    grossTaxableIncomeCents: r.grossTaxableIncomeCents,
    sssEeCents: r.sssEeCents,
    sssErCents: r.sssErCents,
    sssEcCents: r.sssEcCents,
    philhealthEeCents: r.philhealthEeCents,
    philhealthErCents: r.philhealthErCents,
    pagibigEeCents: r.pagibigEeCents,
    pagibigErCents: r.pagibigErCents,
    withholdingTaxCents: r.withholdingTaxCents,
    nontaxableAdditionsCents: r.nontaxableAdditionsCents,
    loanDeductionsCents: r.loanDeductionsCents,
    netPayCents: r.netPayCents,
    payComponentsApplied:
      r.payComponentsApplied as unknown as Prisma.InputJsonValue,
    loanPaymentsApplied:
      r.loanPaymentsApplied as unknown as Prisma.InputJsonValue,
    adjustmentsApplied:
      r.adjustmentsApplied as unknown as Prisma.InputJsonValue,
    expenseClaimsApplied: r.expenseClaimsApplied.length > 0
      ? (r.expenseClaimsApplied as unknown as Prisma.InputJsonValue)
      : undefined,
    periodInputSnapshot:
      r.periodInputSnapshot as unknown as Prisma.InputJsonValue,
    statutoryBreakdown:
      r.statutoryBreakdown as unknown as Prisma.InputJsonValue,
    finalPayBreakdown: r.finalPayBreakdown
      ? (r.finalPayBreakdown as unknown as Prisma.InputJsonValue)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Private: 13th month helper (YEAR_END runs)
// ---------------------------------------------------------------------------

/**
 * Sums `basePayCents` from all FINALIZED REGULAR PayrollSheets for this
 * employee in the calendar year of `periodEnd`, then divides by 12 (floor).
 *
 * Basis: STRICT_DOLE (default) — uses `basePayCents` which already reflects
 * absences / undertimes.  Other bases are deferred to a future sub-phase.
 */
async function computeThirteenthMonthCents(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  periodEnd: Date,
): Promise<bigint> {
  const year = periodEnd.getUTCFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd   = new Date(`${year}-12-31T23:59:59.999Z`);

  const priorSheets = await tx.payrollSheet.findMany({
    where: {
      employeeId,
      tenantId,
      payrollBook: {
        status: "FINALIZED",
        runType: "REGULAR",
        periodEnd: { gte: yearStart, lte: yearEnd },
      },
    },
    select: { basePayCents: true },
  });

  const totalBasic = priorSheets.reduce(
    (acc, s) => acc + s.basePayCents,
    0n,
  );
  return totalBasic / 12n;
}

// ---------------------------------------------------------------------------
// Private: separation pay helpers (FINAL_PAY runs)
// ---------------------------------------------------------------------------

/**
 * Minimal daily-rate derivation for the persist layer.
 * Mirrors engine.ts `deriveRates` (MONTHLY branch only — the common case).
 */
function deriveRateForPersist(
  basicSalaryCents: bigint,
  salaryType: string,
  workingDaysDenominator: number,
): bigint {
  switch (salaryType) {
    case "MONTHLY":
      return (basicSalaryCents * 12n) / BigInt(workingDaysDenominator);
    case "DAILY":
      return basicSalaryCents;
    case "WEEKLY":
      return basicSalaryCents / 5n;
    default:
      return (basicSalaryCents * 12n) / BigInt(workingDaysDenominator);
  }
}

/** DOLE-mandated separation pay rates by reason (0 = none). */
function separationPayRate(reason: SeparationReason): number {
  switch (reason) {
    case "REDUNDANCY":
    case "CLOSURE_OF_BUSINESS":
    case "DISEASE":
      return 1.0; // 1 month per year of service
    case "RETRENCHMENT":
      return 0.5; // ½ month per year of service
    default:
      return 0;
  }
}

/** Years of service; fraction ≥ 0.5 rounds up (RA 7641). Minimum 1 year. */
function computeYearsOfService(hireDate: Date, lastDay: Date): number {
  const ms = lastDay.getTime() - hireDate.getTime();
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  const floored = Math.floor(years);
  const fraction = years - floored;
  const rounded = fraction >= 0.5 ? floored + 1 : floored;
  return Math.max(1, rounded);
}

/**
 * Computes all FINAL_PAY input values for one employee.
 * dailyRateCents is passed in so we re-use the already-derived rate.
 */
async function computeFinalPayInputsForEmployee(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employee: Awaited<ReturnType<typeof loadActiveEmployees>>[number],
  periodEnd: Date,
  separationReason: SeparationReason | undefined,
  dailyRateCents: bigint,
  monthlySalaryCents: bigint,
): Promise<FinalPayInputs> {
  const year = periodEnd.getUTCFullYear();

  // 1. Prorated 13th month (same helper as YEAR_END).
  const proratedThirteenthMonthCents = await computeThirteenthMonthCents(
    tx,
    tenantId,
    employee.id,
    periodEnd,
  );

  // 2. Leave cash-out: sum available balances for convertible leave types.
  const leaveBalances = await tx.leaveBalance.findMany({
    where: {
      employeeId: employee.id,
      year,
      leaveType: { isConvertibleToCash: true },
    },
    include: { leaveType: true },
  });
  let leaveCashOutCents = 0n;
  for (const lb of leaveBalances) {
    const available =
      Number(lb.openingBalance) +
      Number(lb.earned) -
      Number(lb.used) -
      Number(lb.forfeited) -
      Number(lb.convertedToCash);
    if (available > 0) {
      leaveCashOutCents += BigInt(Math.round(available * Number(dailyRateCents)));
    }
  }

  // 3. Separation pay (DOLE mandated).
  let separationPayCents = 0n;
  let isSeparationPayTaxable = true; // taxable by default (voluntary)
  if (separationReason) {
    const rate = separationPayRate(separationReason);
    if (rate > 0) {
      const lastDay = employee.lastWorkingDate ?? periodEnd;
      const yearsOfService = computeYearsOfService(employee.hireDate, lastDay);
      const rawPay = BigInt(Math.round(yearsOfService * rate * Number(monthlySalaryCents)));
      // DOLE minimum: not less than 1 month salary.
      separationPayCents =
        rawPay < monthlySalaryCents ? monthlySalaryCents : rawPay;
      isSeparationPayTaxable = false; // DOLE-mandated = tax-exempt
    }
  }

  // 4. CY prior taxable income + withholding tax from FINALIZED REGULAR/OFF_CYCLE runs.
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
  const priorSheets = await tx.payrollSheet.findMany({
    where: {
      employeeId: employee.id,
      tenantId,
      payrollBook: {
        status: "FINALIZED",
        runType: { in: ["REGULAR", "OFF_CYCLE"] },
        periodEnd: { gte: yearStart, lte: yearEnd },
      },
    },
    select: { grossTaxableIncomeCents: true, withholdingTaxCents: true },
  });
  const cyPriorTaxableIncomeCents = priorSheets.reduce(
    (acc, s) => acc + s.grossTaxableIncomeCents,
    0n,
  );
  const cyPriorWithholdingTaxCents = priorSheets.reduce(
    (acc, s) => acc + s.withholdingTaxCents,
    0n,
  );

  return {
    proratedThirteenthMonthCents,
    leaveCashOutCents,
    separationPayCents,
    isSeparationPayTaxable,
    cyPriorTaxableIncomeCents,
    cyPriorWithholdingTaxCents,
  };
}

// ---------------------------------------------------------------------------
// Public: create draft run
// ---------------------------------------------------------------------------

export async function createDraftRun(input: CreateDraftRunInput) {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Verify no duplicate.
    const existing = await tx.payrollBook.findUnique({
      where: {
        tenantId_periodStart_periodEnd_runType: {
          tenantId: input.tenantId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          runType: input.runType ?? "REGULAR",
        },
      },
    });
    if (existing) {
      throw new PayrollRunConflictError(
        `A payroll run already exists for this period (${existing.id}).`,
      );
    }

    // 2. Load tenant settings + resolve rules.
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: input.tenantId },
      select: {
        workingDaysDenominator: true,
        statutoryCutoffRule: true,
        thirteenthMonthBasis: true,
      },
    });
    const rules = await resolveAllRules(tx, input.tenantId, input.periodEnd);

    // Load tenant-configured premium multipliers (if any).
    const premiumRateRows = await tx.premiumRateConfig.findMany({
      where: { tenantId: input.tenantId },
      select: { multiplierKey: true, rate: true },
    });
    const multiplierConfig: ComputeMultiplierConfig =
      premiumRateRows.length > 0
        ? Object.fromEntries(premiumRateRows.map((r) => [r.multiplierKey, Number(r.rate)]))
        : {};

    // 3. Create the book.
    const book = await tx.payrollBook.create({
      data: {
        tenantId: input.tenantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        cycle: input.cycle,
        runType: input.runType ?? "REGULAR",
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
        skipStatutory: input.skipStatutory ?? false,
        separationReason: input.separationReason ?? null,
      },
    });

    // 4. Fan out engine across active employees.
    const allEmployees = await loadActiveEmployees(
      tx,
      input.periodStart,
      input.periodEnd,
    );
    const employees =
      input.employeeIds && input.employeeIds.length > 0
        ? allEmployees.filter((e) => input.employeeIds!.includes(e.id))
        : allEmployees;

    const sheets: Prisma.PayrollSheetCreateManyInput[] = [];
    for (const e of employees) {
      const ci = await buildComputeInputForEmployee(
        tx,
        input.tenantId,
        e,
        input.periodStart,
        input.periodEnd,
        input.cycle,
        tenant,
        rules,
        multiplierConfig,
      );
      if (!ci) continue;

      // YEAR_END: inject thirteenthMonthCents computed from prior REGULAR runs.
      if ((input.runType ?? "REGULAR") === "YEAR_END") {
        ci.thirteenthMonthCents = await computeThirteenthMonthCents(
          tx,
          input.tenantId,
          e.id,
          input.periodEnd,
        );
      }

      // FINAL_PAY: inject leave cash-out, prorated 13th, separation pay, CY priors.
      if ((input.runType ?? "REGULAR") === "FINAL_PAY") {
        const salary = e.salaryHistory[0]!;
        const dailyRate = deriveRateForPersist(
          salary.basicSalaryCents,
          salary.salaryType,
          tenant.workingDaysDenominator,
        );
        ci.finalPayInputs = await computeFinalPayInputsForEmployee(
          tx,
          input.tenantId,
          e,
          input.periodEnd,
          input.separationReason,
          dailyRate,
          salary.basicSalaryCents,
        );
      }

      // OFF_CYCLE / skipStatutory: override cutoff logic for this book.
      if (input.skipStatutory) {
        ci.overrideStatutoryDeducted = false;
      }

      // Inject any manual adjustments recorded for this employee in this book.
      ci.adjustments = (await tx.payrollAdjustment.findMany({
        where: { payrollBookId: book.id, employeeId: e.id },
      })).map((a) => ({
        id: a.id,
        kind: a.kind,
        amountCents: a.amountCents,
        isTaxable: a.isTaxable,
        reason: a.reason,
      }));

      ci.expenseClaims = (await tx.expenseClaim.findMany({
        where: { payrollBookId: book.id, employeeId: e.id, status: "ATTACHED" },
      })).map((c) => ({
        id: c.id,
        category: c.category,
        amountCents: c.amountCents,
        taxTreatment: c.taxTreatment!,
      }));

      const result = computeSheet(ci);
      sheets.push(resultToSheetCreate(input.tenantId, book.id, e.id, result));
    }

    if (sheets.length > 0) {
      await tx.payrollSheet.createMany({ data: sheets });
    }

    return tx.payrollBook.findUniqueOrThrow({
      where: { id: book.id },
      include: { sheets: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Public: recompute (DRAFT only)
// ---------------------------------------------------------------------------

export async function recomputeRun(tenantId: string, bookId: string) {
  return withTenant(tenantId, async (tx) => {
    const book = await tx.payrollBook.findUnique({ where: { id: bookId } });
    if (!book) throw new PayrollRunNotFoundError(bookId);
    if (book.status !== "DRAFT") {
      throw new PayrollRunConflictError(
        `Cannot recompute a ${book.status} run. Only DRAFT runs may be recomputed.`,
      );
    }

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        workingDaysDenominator: true,
        statutoryCutoffRule: true,
        thirteenthMonthBasis: true,
      },
    });
    const rules = await resolveAllRules(tx, tenantId, book.periodEnd);

    // Load tenant-configured premium multipliers (if any).
    const premiumRateRowsR = await tx.premiumRateConfig.findMany({
      where: { tenantId },
      select: { multiplierKey: true, rate: true },
    });
    const multiplierConfigR: ComputeMultiplierConfig =
      premiumRateRowsR.length > 0
        ? Object.fromEntries(premiumRateRowsR.map((r) => [r.multiplierKey, Number(r.rate)]))
        : {};

    // Wipe + recompute.
    await tx.payrollSheet.deleteMany({ where: { payrollBookId: bookId } });

    const employees = await loadActiveEmployees(
      tx,
      book.periodStart,
      book.periodEnd,
    );
    const sheets: Prisma.PayrollSheetCreateManyInput[] = [];
    for (const e of employees) {
      const ci = await buildComputeInputForEmployee(
        tx,
        tenantId,
        e,
        book.periodStart,
        book.periodEnd,
        book.cycle,
        tenant,
        rules,
        multiplierConfigR,
      );
      if (!ci) continue;

      // YEAR_END: re-inject thirteenthMonthCents from prior REGULAR runs.
      if (book.runType === "YEAR_END") {
        ci.thirteenthMonthCents = await computeThirteenthMonthCents(
          tx,
          tenantId,
          e.id,
          book.periodEnd,
        );
      }

      // FINAL_PAY: re-inject from stored separationReason.
      if (book.runType === "FINAL_PAY") {
        const salary = e.salaryHistory[0]!;
        const dailyRate = deriveRateForPersist(
          salary.basicSalaryCents,
          salary.salaryType,
          tenant.workingDaysDenominator,
        );
        ci.finalPayInputs = await computeFinalPayInputsForEmployee(
          tx,
          tenantId,
          e,
          book.periodEnd,
          book.separationReason ?? undefined,
          dailyRate,
          salary.basicSalaryCents,
        );
      }

      // Preserve skipStatutory behaviour set at creation time.
      if (book.skipStatutory) {
        ci.overrideStatutoryDeducted = false;
      }

      // Inject any manual adjustments recorded for this employee in this book.
      ci.adjustments = (await tx.payrollAdjustment.findMany({
        where: { payrollBookId: bookId, employeeId: e.id },
      })).map((a) => ({
        id: a.id,
        kind: a.kind,
        amountCents: a.amountCents,
        isTaxable: a.isTaxable,
        reason: a.reason,
      }));

      ci.expenseClaims = (await tx.expenseClaim.findMany({
        where: { payrollBookId: bookId, employeeId: e.id, status: "ATTACHED" },
      })).map((c) => ({
        id: c.id,
        category: c.category,
        amountCents: c.amountCents,
        taxTreatment: c.taxTreatment!,
      }));

      const result = computeSheet(ci);
      sheets.push(resultToSheetCreate(tenantId, bookId, e.id, result));
    }
    if (sheets.length > 0) {
      await tx.payrollSheet.createMany({ data: sheets });
    }

    await tx.payrollBook.update({
      where: { id: bookId },
      data: { updatedAt: new Date() },
    });

    return tx.payrollBook.findUniqueOrThrow({
      where: { id: bookId },
      include: { sheets: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Public: finalize (DRAFT → FINALIZED, decrement loans, audit)
// ---------------------------------------------------------------------------

interface LoanPaymentEntry {
  loanId: string;
  amountCents: string;
}

export async function finalizeRun(
  tenantId: string,
  bookId: string,
  userId: string | null,
) {
  return withTenant(tenantId, async (tx) => {
    const book = await tx.payrollBook.findUnique({
      where: { id: bookId },
      include: { sheets: true },
    });
    if (!book) throw new PayrollRunNotFoundError(bookId);

    // Idempotency: re-finalize on an already-FINALIZED book is a no-op.
    if (book.status === "FINALIZED") return book;
    if (book.status !== "DRAFT") {
      throw new PayrollRunConflictError(
        `Cannot finalize a ${book.status} run.`,
      );
    }

    // 1. Aggregate loan payments from all sheets.
    const loanPayments = new Map<string, bigint>(); // loanId → totalAmount
    for (const sheet of book.sheets) {
      const arr = sheet.loanPaymentsApplied as unknown as LoanPaymentEntry[];
      if (!Array.isArray(arr)) continue;
      for (const lp of arr) {
        const cur = loanPayments.get(lp.loanId) ?? 0n;
        loanPayments.set(lp.loanId, cur + BigInt(lp.amountCents));
      }
    }

    // 2. Decrement each loan's balance (clamped at 0); mark PAID when zeroed.
    for (const [loanId, amount] of loanPayments.entries()) {
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan) continue;
      const newBalance =
        loan.balanceCents > amount ? loan.balanceCents - amount : 0n;
      await tx.loan.update({
        where: { id: loanId },
        data: {
          balanceCents: newBalance,
          ...(newBalance === 0n
            ? { status: "PAID", closedDate: new Date() }
            : {}),
        },
      });
    }

    // 3. Mark ATTACHED expense claims as PAID.
    await tx.expenseClaim.updateMany({
      where: { payrollBookId: bookId, status: "ATTACHED" },
      data: { status: "PAID", paidInBookId: bookId },
    });

    // 4. Transition the book + audit log.
    const finalized = await tx.payrollBook.update({
      where: { id: bookId },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedByUserId: userId,
      },
      include: { sheets: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: "APPROVE",
        entity: "PayrollBook",
        entityId: bookId,
        changes: {
          before: { status: "DRAFT" },
          after: { status: "FINALIZED" },
          loanPaymentsApplied: Array.from(loanPayments.entries()).map(
            ([loanId, amount]) => ({
              loanId,
              amountCents: amount.toString(),
            }),
          ),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return finalized;
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRun(tenantId: string, bookId: string) {
  return withTenant(tenantId, async (tx) => {
    const book = await tx.payrollBook.findUnique({
      where: { id: bookId },
      include: { sheets: true },
    });
    if (!book) throw new PayrollRunNotFoundError(bookId);
    return book;
  });
}

export interface ListRunsInput {
  tenantId: string;
  page: number;
  limit: number;
  status?: Prisma.PayrollBookWhereInput["status"];
  runType?: Prisma.PayrollBookWhereInput["runType"];
}

export async function listRuns(input: ListRunsInput) {
  return withTenant(input.tenantId, async (tx) => {
    const where: Prisma.PayrollBookWhereInput = {};
    if (input.status) where.status = input.status;
    if (input.runType) where.runType = input.runType;

    const [total, rows] = await Promise.all([
      tx.payrollBook.count({ where }),
      tx.payrollBook.findMany({
        where,
        orderBy: { periodEnd: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
    ]);
    return { total, rows };
  });
}
