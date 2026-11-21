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
import { issueRunControlNumbers } from "./control-numbers";
import type {
  Loan,
  PayComponent,
  PayFrequency,
  Prisma,
  SalaryType,
  StatutoryCategory,
  SeparationReason,
  PayrollSheet,
} from "@prisma/client";
import { Prisma as PrismaValues } from "@prisma/client";
import { computeSheet, isStatutoryDeducted } from "./engine";
import { aggregateApprovedDtr } from "./dtr-aggregate";
import { periodsElapsedBefore, periodsPerYear } from "./annual-tax";
import {
  benefitsExemptUsedCents,
  loadYtdOpenings,
  ytdOpeningSnapshot,
  ytdOpeningTotals,
  type YtdOpening,
} from "./ytd-openings";
import { employedWholePeriod } from "./rates";
import {
  assessSssBasis,
  sssBaseMonth,
  type SssBasis,
  type ContributionExtras,
  type SssHistorySheet,
} from "./sss-basis";
import { deriveSalaryRates, effectiveDivisor } from "./rates";
import { multiply } from "@/lib/money";
import type {
  ComputeInput,
  ComputeLoan,
  ComputeMultiplierConfig,
  ComputePayComponent,
  ComputePeriodInputSnapshot,
  ComputeResult,
  ComputeStatutoryRules,
  StatutoryRuleVersions,
  FinalPayInputs,
} from "./types";
import { getActiveRule } from "@/lib/statutory/resolver";
import { withTenant, type TenantTx } from "@/lib/with-tenant";
import { getOrSet } from "@/lib/cache/cache";
import { CacheKeys, TTL } from "@/lib/cache/keys";
import { annualizeInTx, isLastRegularOfYear, staleAnnualizations } from "./annualize";
import { runCrossFoot, type CrossFootCheck, type RegisterTotals } from "./reports/cross-foot";

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
  /**
   * PAY-141: set when the run is created from a scheduled payday. The run's
   * attendance (PeriodInput) is read for cutoffStart..cutoffEnd; without a
   * cutoff it is read for periodStart..periodEnd, as before.
   */
  payDate?: Date | null;
  cutoffStart?: Date | null;
  cutoffEnd?: Date | null;
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
  /** PAY-171: a REGULAR run that also pays the 13th month. */
  includeThirteenthMonth?: boolean;
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
  assn: { id?: string; amountCents: bigint; payComponent: PayComponent },
): ComputePayComponent {
  const c = assn.payComponent;
  return {
    assignmentId: assn.id, // PAY-150
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    taxability: c.taxability,
    amountCents: assn.amountCents,
    deMinimisCode: c.deMinimisCode,
    isBonus: c.isBonus, // PAY-171
    isOneOff: c.isOneOff, // PAY-171
  };
}

// ---------------------------------------------------------------------------
// PAY-150 (Mark, 16 Nov 2026): guardrails on Other Deductions.
//  - Every Other Deduction needs the employee's written authorization on file
//    (date and uploaded copy); without it the run refuses the deduction
//    (Labor Code Art. 113; IRR Book III Rule VIII).
//  - A loss or damage deduction (Art. 114, 115) also needs an incident record
//    of the same employee showing they were heard (their response) and that
//    responsibility was shown (a resolution), and the actual loss. What has
//    been recovered on finalized runs never exceeds the actual loss; the 20%
//    cap is applied by the engine and the rest carries to the next payday.
// ---------------------------------------------------------------------------
export const NO_AUTHORIZATION = "No written authorization on file";
export const NO_INCIDENT = "No incident record showing the employee was heard and found responsible";
export const NO_ACTUAL_LOSS = "The actual loss is not recorded";

type AssignmentRow = Prisma.EmployeePayComponentGetPayload<{ include: { payComponent: true } }>;

async function guardedComponents(tx: TenantTx, employeeId: string, rows: AssignmentRow[]): Promise<ComputePayComponent[]> {
  const out: ComputePayComponent[] = [];
  const loss = rows.filter((r) => r.payComponent.kind === "DEDUCTION" && r.payComponent.isLossOrDamage);
  const incidents = loss.some((r) => r.incidentReportId)
    ? await tx.incidentReport.findMany({
        where: { id: { in: loss.map((r) => r.incidentReportId).filter((x): x is string => !!x) }, employeeId, deletedAt: null },
        select: { id: true, employeeResponse: true, resolution: true },
      })
    : [];
  const heard = new Set(incidents.filter((i) => i.employeeResponse?.trim() && i.resolution?.trim()).map((i) => i.id));
  const recovered = new Map<string, bigint>();
  if (loss.length > 0) {
    const sheets = await tx.payrollSheet.findMany({
      where: { employeeId, payrollBook: { status: "FINALIZED" } },
      select: { payComponentsApplied: true },
    });
    for (const sh of sheets) {
      for (const a of (Array.isArray(sh.payComponentsApplied) ? sh.payComponentsApplied : []) as { assignmentId?: string; amountCents?: string }[]) {
        if (a?.assignmentId) recovered.set(a.assignmentId, (recovered.get(a.assignmentId) ?? 0n) + BigInt(a.amountCents ?? "0"));
      }
    }
  }
  for (const r of rows) {
    const c = toComputeComponent(r);
    if (r.payComponent.kind !== "DEDUCTION") { out.push(c); continue; }
    if (!r.authorizationDate || !r.authorizationFileKey) { out.push({ ...c, refusedReason: NO_AUTHORIZATION }); continue; }
    if (!r.payComponent.isLossOrDamage) { out.push(c); continue; }
    if (!r.incidentReportId || !heard.has(r.incidentReportId)) { out.push({ ...c, refusedReason: NO_INCIDENT }); continue; }
    if (r.actualLossCents == null || r.actualLossCents <= 0n) { out.push({ ...c, refusedReason: NO_ACTUAL_LOSS }); continue; }
    const left = r.actualLossCents - (recovered.get(r.id) ?? 0n);
    if (left <= 0n) continue; // fully recovered: nothing more is taken
    // Due this payday: the installment HR set, or all that is left when none
    // is set or less is left. The engine takes at most 20% of the period's
    // wages and carries the rest.
    const due = r.amountCents > 0n && r.amountCents < left ? r.amountCents : left;
    out.push({ ...c, lossOrDamage: true, amountCents: due });
  }
  return out;
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

/**
 * Resolve every statutory rule a payroll computation needs, as of one date.
 *
 * THE CONVENTION (unit 1.2 — previously undocumented): callers pass the period's
 * **`periodEnd`**, never `now()`. Two consequences worth stating, because both
 * are choices rather than laws:
 *
 *  1. Re-running a historical period uses THAT PERIOD's rates, not today's. That
 *     is what makes a recomputed payslip match the one originally issued, and it
 *     is the property this unit exists to protect.
 *  2. A rate change effective MID-PERIOD applies to the WHOLE period, because
 *     selection happens once, at `periodEnd`. A rule taking effect on the 20th is
 *     therefore used for the entire period containing the 20th. If a statute ever
 *     requires splitting a period at a rate boundary, this is the line to change.
 *
 * The result is cached under a DATE-scoped key, so one period's rates can never
 * be served to another from cache.
 */
export async function resolveAllRules(
  tx: TenantTx,
  tenantId: string,
  asOf: Date,
): Promise<ComputeStatutoryRules> {
  const asOfKey = asOf.toISOString().split("T")[0]; // date-only string for stable cache key
  return getOrSet(
    // ":v2" since PAY-59: entries cached before it carry no rule versions.
    CacheKeys.statutory(tenantId, `${asOfKey}:v2`),
    TTL.STATUTORY,
    async () => {
      // ALL SIX categories are required (unit 1.2). MINIMUM_WAGE_RATE and
      // DE_MINIMIS_CEILING were previously try/catch'd into `null`, which meant a
      // period with no seeded minimum wage computed silently — an MWE employee's
      // exemption simply would not apply, and the payslip would look plausible.
      // A missing statutory rule is a configuration failure, and the resolver
      // already throws rather than falling back to hardcoded math; swallowing
      // that here defeated the point.
      const cats: StatutoryCategory[] = [
        "SSS_SCHEDULE",
        "PHILHEALTH_SCHEDULE",
        "PAGIBIG_SCHEDULE",
        "BIR_WITHHOLDING_TABLE",
        "MINIMUM_WAGE_RATE",
        "DE_MINIMIS_CEILING",
      ];
      const resolved = await Promise.all(cats.map((c) => getActiveRule(tx, tenantId, c, asOf)));
      const [sss, phic, hdmf, bir, minWageRule, deMinimisRule] = resolved;
      // PAY-59 (R59): the version of each table, to be stored on the payslips.
      const ruleVersions: StatutoryRuleVersions = {};
      resolved.forEach((r, i) => {
        ruleVersions[cats[i]!] = {
          id: r!.id,
          version: r!.version,
          effectiveFrom: r!.effectiveFrom instanceof Date ? r!.effectiveFrom.toISOString().slice(0, 10) : String(r!.effectiveFrom ?? "").slice(0, 10),
          legalBasis: r!.legalBasis,
        };
      });

      const minWage = minWageRule!.payload as ComputeStatutoryRules["minWage"];
      const deMinimis = deMinimisRule!.payload as ComputeStatutoryRules["deMinimis"];

      return {
        sss: sss!.payload as ComputeStatutoryRules["sss"],
        philHealth: phic!.payload as ComputeStatutoryRules["philHealth"],
        pagibig: hdmf!.payload as ComputeStatutoryRules["pagibig"],
        bir: bir!.payload as ComputeStatutoryRules["bir"],
        minWage,
        deMinimis,
        ruleVersions,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Active-employee selection
// ---------------------------------------------------------------------------

/**
 * PAY-135: the employees a run computes. A run created for a subset (OFF_CYCLE
 * bonus, FINAL_PAY leaver, YEAR_END) stores it on the book as
 * targetEmployeeIds; createDraftRun, processRun and recomputeRun all select
 * through here so the subset survives the background job and every recompute.
 * An empty or missing list keeps every loaded employee.
 */
export function selectRunEmployees<T extends { id: string }>(
  employees: readonly T[],
  targetEmployeeIds: readonly string[] | null | undefined,
): T[] {
  if (!targetEmployeeIds || targetEmployeeIds.length === 0) return [...employees];
  const wanted = new Set(targetEmployeeIds);
  return employees.filter((e) => wanted.has(e.id));
}

/** De-duplicated subset to store on a new book ([] = everyone). */
function targetIdsFor(input: CreateDraftRunInput): string[] {
  return [...new Set(input.employeeIds ?? [])];
}

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
      // Salary lives on EmploymentTerm (merged). Take the latest effective row
      // that actually carries a salary — every term row is a complete snapshot,
      // so this is the in-force compensation as of the period.
      employmentTerms: {
        where: { effectiveDate: { lte: periodEnd }, basicSalaryCents: { not: null } },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// PER-EMPLOYEE COMPUTE — gathers inputs and calls engine
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PAY-142: a run's attendance. Approved DTR for the window wins when there is
// any; else the run input typed for the window (PeriodInput); else nothing.
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

async function runAttendance(
  tx: TenantTx,
  tenantId: string,
  employee: { id: string; attendanceExempt: boolean; needsTimeClock?: boolean },
  windowStart: Date,
  windowEnd: Date,
  periodInputRow: Prisma.PeriodInputGetPayload<true> | null,
  /**
   * PAY-172 (Mark, 19 Nov 2026), REGULAR runs only: an employee who needs a
   * time clock is paid only for days with an approved DTR. Days without one
   * (no row, a row not yet approved, or no approved submission when the
   * company requires one) count as absent, and `onGap` hears how many.
   * Typed run input (PeriodInput) still wins when there is no approved DTR.
   */
  dtrPolicy?: { onGap: (days: number) => void },
): Promise<ComputePeriodInputSnapshot> {
  const approvedRecords = await tx.dTRRecord.count({
    where: { employeeId: employee.id, approvalStatus: "APPROVED", date: { gte: windowStart, lte: endOfDay(windowEnd) } },
  });
  const dtrRequired = !!dtrPolicy && employee.needsTimeClock !== false && !employee.attendanceExempt;
  if (approvedRecords > 0 || (employee.attendanceExempt && !periodInputRow) || (dtrRequired && !periodInputRow)) {
    const base = { tenantId, employeeId: employee.id, periodStartDate: windowStart, periodEndDate: endOfDay(windowEnd) };
    let agg = await aggregateApprovedDtr(tx, { ...base, requireApproved: dtrRequired });
    if (agg.status === "NOT_APPROVED" && dtrRequired && !periodInputRow) {
      agg = await aggregateApprovedDtr(tx, { ...base, noApprovedSubmission: true });
    }
    if (agg.status === "OK") {
      if (dtrRequired && agg.gapDays > 0) dtrPolicy!.onGap(agg.gapDays);
      return {
        ...periodInputSnapshot(agg.data as unknown as Prisma.PeriodInputGetPayload<true>),
        attendanceSource: "DTR",
      };
    }
    if (agg.status === "NOT_APPROVED") {
      return {
        ...periodInputSnapshot(periodInputRow),
        attendanceSource: "DTR_NOT_APPROVED",
      };
    }
  }
  return {
    ...periodInputSnapshot(periodInputRow),
    attendanceSource: periodInputRow ? "MANUAL" : "NONE",
  };
}

/**
 * PAY-172: collects, for one REGULAR run, the employees who lacked an approved
 * DTR for days of the cutoff. Under the strict DTR policy they are held out of
 * the run. `notifiedAt` from the previous compute is kept, so a recompute does
 * not email HR and the supervisor again about the same employee.
 */
export type DtrGap = { employeeId: string; days: number; held: boolean; notifiedAt?: string };

export function dtrGapCollector(runType: string, strict: boolean) {
  const gaps: DtrGap[] = [];
  return {
    policyFor(employeeId: string) {
      if (runType !== "REGULAR") return undefined;
      return { onGap: (days: number) => { gaps.push({ employeeId, days, held: strict }); } };
    },
    isHeld(employeeId: string) {
      return strict && gaps.some((g) => g.employeeId === employeeId);
    },
    toJson(previous: Prisma.JsonValue | null): DtrGap[] | null {
      if (gaps.length === 0) return null;
      const before = new Map(
        (Array.isArray(previous) ? (previous as DtrGap[]) : []).map((g) => [g.employeeId, g.notifiedAt]),
      );
      return gaps.map((g) => (before.get(g.employeeId) ? { ...g, notifiedAt: before.get(g.employeeId) } : g));
    },
  };
}

type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * PAY-141 (ruling 2a): scheduled workdays employed inside the pay period, for
 * an employee who joins or leaves inside it, on a run whose DTR cutoff is not
 * the pay period. Undefined otherwise (unit 1.8 rules apply unchanged).
 * Holidays on workdays count: a salaried rate already covers them.
 */
async function employedPeriodDaysFor(
  tx: TenantTx,
  tenantId: string,
  employee: {
    id: string;
    hireDate: Date | null;
    lastWorkingDate: Date | null;
    resignationDate: Date | null;
    workingDaysDenominator: number | null;
  },
  period: { start: Date; end: Date },
  window: { start: Date; end: Date },
  tenantDivisor: number,
): Promise<number | undefined> {
  const same = (a: Date, b: Date) => a.getTime() === b.getTime();
  if (same(period.start, window.start) && same(period.end, window.end)) return undefined;
  const separationDate = employee.lastWorkingDate ?? employee.resignationDate ?? null;
  if (employedWholePeriod({ hireDate: employee.hireDate, separationDate, periodStart: period.start, periodEnd: period.end })) {
    return undefined;
  }
  const assignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      effectiveFrom: { lte: period.end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.start } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { shiftSchedule: { select: { workDays: true } } },
  });
  const divisor = effectiveDivisor(employee.workingDaysDenominator, tenantDivisor);
  const workDays: Weekday[] = Array.isArray(assignment?.shiftSchedule?.workDays)
    ? (assignment!.shiftSchedule!.workDays as Weekday[])
    : divisor >= 300
      ? ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
      : ["MON", "TUE", "WED", "THU", "FRI"];
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const from = Math.max(day(period.start), employee.hireDate ? day(employee.hireDate) : -Infinity);
  const to = Math.min(day(period.end), separationDate ? day(separationDate) : Infinity);
  let n = 0;
  for (let t = from; t <= to; t += DAY_MS) {
    if (workDays.includes(WEEKDAYS[new Date(t).getUTCDay()])) n++;
  }
  return n;
}

/** The last instant of a date stored as UTC midnight. */
function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

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
  /** PAY-141: the run's DTR cutoff window; attendance is read for it. */
  attendanceWindow?: { start: Date | null; end: Date | null },
  /** PAY-172: REGULAR runs only (see runAttendance). */
  dtrPolicy?: { onGap: (days: number) => void },
): Promise<ComputeInput | null> {
  const term = employee.employmentTerms[0];
  if (!term || term.basicSalaryCents == null || term.salaryType == null) {
    return null; // No effective salary → skip
  }
  const salary = {
    basicSalaryCents: term.basicSalaryCents,
    salaryType: term.salaryType,
  };

  const region =
    employee.branch?.workLocation?.region ?? employee.region ?? null;

  // PAY-141: a run created from a payday reads its DTR cutoff window (e.g.
  // 26 Oct to 10 Nov for the 15 Nov payday); other runs read their period.
  const windowStart = attendanceWindow?.start ?? periodStart;
  const windowEnd = attendanceWindow?.end ?? periodEnd;

  const [periodInputRow, payCompAssignments, activeLoans] = await Promise.all([
    tx.periodInput.findFirst({
      where: {
        employeeId: employee.id,
        periodStart: windowStart,
        periodEnd: windowEnd,
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
    // PAY-174: a loan is deducted only from runs whose period has reached its
    // start date (a loan starting 1 Dec is not deducted in October).
    tx.loan.findMany({
      where: { employeeId: employee.id, status: "ACTIVE", startDate: { lte: endOfDayUtc(periodEnd) } },
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
      // Unit 1.8: the employee's divisor (null: tenant's) and the days employed.
      workingDaysDenominator: employee.workingDaysDenominator,
      hireDate: employee.hireDate,
      separationDate: employee.lastWorkingDate ?? employee.resignationDate ?? null,
    },
    salary: {
      basicSalaryCents: salary.basicSalaryCents,
      salaryType: salary.salaryType,
    },
    tenant: tenantSettings,
    period: { start: periodStart, end: periodEnd, cycle },
    periodInput: await runAttendance(tx, tenantId, employee, windowStart, windowEnd, periodInputRow, dtrPolicy),
    employedPeriodDays: await employedPeriodDaysFor(
      tx,
      tenantId,
      employee,
      { start: periodStart, end: periodEnd },
      { start: windowStart, end: windowEnd },
      tenantSettings.workingDaysDenominator,
    ),
    payComponents: await guardedComponents(tx, employee.id, payCompAssignments), // PAY-150
    loans: activeLoans.map(toComputeLoan),
    adjustments: [], // Injected by caller after bookId is known
    expenseClaims: [], // Injected by caller after bookId is known
    rules,
    multiplierConfig,
    // tenantId not in ComputeInput — used by caller only
  } as ComputeInput;
}

// ---------------------------------------------------------------------------
// PAY-133: SSS basis per employee (which month's actual basic)
// ---------------------------------------------------------------------------

/**
 * For a REGULAR run that deducts contributions, loads each employee's
 * finalized runs overlapping the SSS base month and decides the basis
 * (sss-basis.ts). Returns null when the run does not deduct (or is not
 * REGULAR): the engine then needs no basis.
 */
async function loadSssBases(
  tx: TenantTx,
  args: {
    employees: {
      id: string;
      hireDate: Date | null;
      lastWorkingDate: Date | null;
      resignationDate: Date | null;
    }[];
    runType: string;
    cycle: ComputeInput["period"]["cycle"];
    rule: "FIRST_CUTOFF" | "SECOND_CUTOFF";
    periodStart: Date;
    periodEnd: Date;
    skipStatutory: boolean;
  },
): Promise<Map<string, SssBasis> | null> {
  if (args.runType !== "REGULAR" || args.skipStatutory) return null;
  if (!isStatutoryDeducted(args.cycle, args.rule, args.periodEnd, args.periodStart)) {
    return null;
  }
  const out = new Map<string, SssBasis>();
  if (args.employees.length === 0) return out;

  const base = sssBaseMonth(args.cycle, args.rule, args.periodStart, args.periodEnd);
  const rows = await tx.payrollSheet.findMany({
    where: {
      employeeId: { in: args.employees.map((e) => e.id) },
      payrollBook: {
        status: "FINALIZED",
        runType: { in: ["REGULAR", "OFF_CYCLE"] },
        periodStart: { lte: base.monthEnd },
        periodEnd: { gte: base.monthStart },
      },
    },
    select: {
      employeeId: true,
      basePayCents: true,
      lateUndertimeDeductionCents: true,
      otPayCents: true, nsdPayCents: true, holidayPayCents: true, restDayPayCents: true,
      payComponentsApplied: true,
      payrollBook: { select: { periodStart: true, periodEnd: true, runType: true } },
    },
  });
  // PAY-143: other earnings of the base month a company chose to add to each
  // contribution's base: earnings whose pay component is ticked for that base
  // (never deductions or reimbursements), and attendance premiums.
  // The run's company, from the transaction's own tenant setting (withTenant).
  const [{ tid }] = await tx.$queryRaw<{ tid: string }[]>`SELECT current_setting('app.current_tenant_id', true) AS tid`;
  const opt = !tid ? null : await tx.tenant.findUnique({
    where: { id: tid },
    select: {
      sssIncludeEarnings: true, sssIncludePremiums: true, philhealthIncludeEarnings: true,
      philhealthIncludePremiums: true, pagibigIncludeEarnings: true, pagibigIncludePremiums: true,
    },
  });
  const anyEarnings = !!opt && (opt.sssIncludeEarnings || opt.philhealthIncludeEarnings || opt.pagibigIncludeEarnings);
  const flagged = anyEarnings
    ? await tx.payComponent.findMany({
        where: { tenantId: tid, kind: { notIn: ["DEDUCTION", "REIMBURSEMENT"] }, OR: [{ includeInSssBase: true }, { includeInPhilHealthBase: true }, { includeInPagibigBase: true }] },
        select: { id: true, includeInSssBase: true, includeInPhilHealthBase: true, includeInPagibigBase: true },
      })
    : [];
  const flagOf = new Map(flagged.map((c) => [c.id, c]));
  const extrasBy = new Map<string, ContributionExtras>();
  if (opt) {
    for (const r of rows) {
      const x = extrasBy.get(r.employeeId) ?? { sssCents: 0n, philHealthCents: 0n, pagibigCents: 0n };
      const premiums = r.otPayCents + r.nsdPayCents + r.holidayPayCents + r.restDayPayCents;
      if (opt.sssIncludePremiums) x.sssCents += premiums;
      if (opt.philhealthIncludePremiums) x.philHealthCents += premiums;
      if (opt.pagibigIncludePremiums) x.pagibigCents += premiums;
      for (const a of (Array.isArray(r.payComponentsApplied) ? r.payComponentsApplied : []) as { id?: string; amountCents?: string }[]) {
        const f = a?.id ? flagOf.get(a.id) : undefined;
        if (!f) continue;
        const amt = BigInt(a.amountCents ?? "0");
        if (opt.sssIncludeEarnings && f.includeInSssBase) x.sssCents += amt;
        if (opt.philhealthIncludeEarnings && f.includeInPhilHealthBase) x.philHealthCents += amt;
        if (opt.pagibigIncludeEarnings && f.includeInPagibigBase) x.pagibigCents += amt;
      }
      extrasBy.set(r.employeeId, x);
    }
  }
  const byEmployee = new Map<string, SssHistorySheet[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push({
      periodStart: r.payrollBook.periodStart,
      periodEnd: r.payrollBook.periodEnd,
      basicCents: r.basePayCents - r.lateUndertimeDeductionCents,
      runType: r.payrollBook.runType === "OFF_CYCLE" ? "OFF_CYCLE" : "REGULAR",
    });
    byEmployee.set(r.employeeId, list);
  }
  for (const e of args.employees) {
    const basis = assessSssBasis({
      base,
      hireDate: e.hireDate,
      separationDate: e.lastWorkingDate ?? e.resignationDate ?? null,
      sheets: byEmployee.get(e.id) ?? [],
    });
    const x = extrasBy.get(e.id);
    out.set(e.id, x && x.sssCents + x.philHealthCents + x.pagibigCents > 0n ? { ...basis, otherEarnings: x } : basis);
  }
  return out;
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
    loanDeferredCents: r.loanDeferredCents,
    adjustmentDeductionsCents: r.adjustmentDeductionsCents,
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
// PAY-194 (Mark, 20 Nov 2026, ruling A): a salary held under the strict DTR
// policy is released in the next regular run. When a regular run computes an
// employee who was held out of an earlier FINALIZED regular run of the same
// cycle, and every workday of that held cutoff now has an approved DTR, the
// held cutoff is computed as it would have been (its own salary, attendance,
// contributions and tax table) and its amounts are added to this run's sheet.
// The sheet's heldRelease records each released cutoff and its figures. Loans
// and adjustments are not recomputed for the held cutoff: loan installments
// continue on their own schedule in each run.
// ---------------------------------------------------------------------------

/** Money amounts of a compute result that a held release adds to. */
const HELD_MONEY_KEYS = [
  "basePayCents", "lateUndertimeDeductionCents", "otPayCents", "nsdPayCents", "holidayPayCents",
  "restDayPayCents", "hazardPayCents", "taxableAllowancesCents", "grossCompensationCents",
  "mweExemptCompensationCents", "nontaxableBasicCents", "nontaxableCompensationCents",
  "nontaxable13MonthAndBenefitsCents", "grossTaxableIncomeCents", "sssEeCents", "sssErCents",
  "sssEcCents", "philhealthEeCents", "philhealthErCents", "pagibigEeCents", "pagibigErCents",
  "withholdingTaxCents", "nontaxableAdditionsCents", "netPayCents",
] as const satisfies readonly (keyof ComputeResult)[];

export interface HeldReleaseEntry {
  fromBookId: string;
  periodStart: string;
  periodEnd: string;
  /** The held cutoff's own figures, in centavos, as strings. */
  amounts: Record<(typeof HELD_MONEY_KEYS)[number], string>;
  unpaidLeaveDays: number;
  lateUndertimeMinutes: number;
}

/** Each held entry's amounts added to `current` (a new result; inputs untouched). */
export function mergeHeldRelease(current: ComputeResult, held: ComputeResult[]): ComputeResult {
  const out: ComputeResult = { ...current };
  for (const h of held) {
    for (const k of HELD_MONEY_KEYS) (out[k] as bigint) = (out[k] as bigint) + (h[k] as bigint);
  }
  return out;
}

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

async function releaseHeldPay(
  tx: TenantTx,
  tenantId: string,
  employeeId: string,
  run: { bookId: string; periodStart: Date; cycle: ComputeInput["period"]["cycle"]; runType: string },
  tenant: ComputeInput["tenant"] & { statutoryCutoffRule: "FIRST_CUTOFF" | "SECOND_CUTOFF" },
  multiplierConfig: ComputeMultiplierConfig,
  result: ComputeResult,
): Promise<{ result: ComputeResult; heldRelease?: Prisma.InputJsonValue }> {
  if (run.runType !== "REGULAR") return { result };
  const books = await tx.payrollBook.findMany({
    where: {
      tenantId, runType: "REGULAR", status: "FINALIZED", cycle: run.cycle,
      periodEnd: { lt: run.periodStart }, id: { not: run.bookId },
    },
    select: { id: true, periodStart: true, periodEnd: true, cycle: true, cutoffStart: true, cutoffEnd: true, dtrGaps: true },
    orderBy: { periodStart: "asc" },
  });
  const heldIn = books.filter((b) =>
    Array.isArray(b.dtrGaps) &&
    (b.dtrGaps as { employeeId?: string; held?: boolean }[]).some((g) => g?.employeeId === employeeId && g?.held === true),
  );
  if (heldIn.length === 0) return { result };

  const releasedElsewhere = await tx.payrollSheet.findMany({
    where: {
      tenantId, employeeId, heldRelease: { not: PrismaValues.DbNull },
      payrollBook: { status: "FINALIZED", id: { not: run.bookId } },
    },
    select: { heldRelease: true },
  });
  const done = new Set(
    releasedElsewhere.flatMap((r) => ((r.heldRelease as { releases?: HeldReleaseEntry[] } | null)?.releases ?? []).map((x) => x.fromBookId)),
  );

  const results: ComputeResult[] = [];
  const entries: HeldReleaseEntry[] = [];
  for (const b of heldIn) {
    if (done.has(b.id)) continue;
    const emp = (await loadActiveEmployees(tx, b.periodStart, b.periodEnd)).find((x) => x.id === employeeId);
    if (!emp) continue;
    const rules = await resolveAllRules(tx, tenantId, b.periodEnd);
    let gaps = 0;
    const ci = await buildComputeInputForEmployee(
      tx, tenantId, emp, b.periodStart, b.periodEnd, b.cycle, tenant, rules, multiplierConfig,
      { start: b.cutoffStart, end: b.cutoffEnd }, { onGap: (d) => { gaps += d; } },
    );
    if (!ci || gaps > 0) continue; // the held cutoff's DTR is still not fully approved
    ci.runType = "REGULAR";
    const bases = await loadSssBases(tx, {
      employees: [emp], runType: "REGULAR", cycle: b.cycle, rule: tenant.statutoryCutoffRule,
      periodStart: b.periodStart, periodEnd: b.periodEnd, skipStatutory: false,
    });
    ci.sssBasis = bases?.get(employeeId);
    await applyBenefitsContext(tx, tenantId, employeeId, b.periodEnd, ci);
    ci.loans = [];
    ci.adjustments = [];
    ci.expenseClaims = [];
    const r = computeSheet(ci);
    results.push(r);
    entries.push({
      fromBookId: b.id,
      periodStart: ymdOf(b.periodStart),
      periodEnd: ymdOf(b.periodEnd),
      amounts: Object.fromEntries(HELD_MONEY_KEYS.map((k) => [k, (r[k] as bigint).toString()])) as HeldReleaseEntry["amounts"],
      unpaidLeaveDays: Number(r.periodInputSnapshot.unpaidLeaveDays ?? 0),
      lateUndertimeMinutes: Number(r.periodInputSnapshot.lateUndertimeMinutes ?? 0),
    });
  }
  if (entries.length === 0) return { result };
  return {
    result: mergeHeldRelease(result, results),
    heldRelease: { releases: entries } as unknown as Prisma.InputJsonValue,
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
 *
 * PAY-144: basic pay earned before Sentire (a PRIOR_PAYROLL opening) joins
 * the base, and 13th month already paid this year before Sentire is
 * subtracted (never below zero). A previous employer's pay never counts.
 */
/** PAY-168: how a 13th month was worked out (all amounts in centavos, as strings). */
export interface ThirteenthMonthBreakdown {
  year: number;
  /** PAY-60: the company's 13th-month basis (Pay Rules) when this was worked out. */
  basis: "STRICT_DOLE" | "INCLUDE_ALLOWANCES";
  /**
   * PAY-60, INCLUDE_ALLOWANCES only: pay components marked "13th-Month Pay
   * basis" paid on this year's finalized regular runs (and, for a 13th month
   * paid in a regular run, on this run and its projection). Inside totalBasic.
   */
  allowancesCents?: string;
  /**
   * PAY-198: lates and undertime taken out of the base (already out of
   * basicFromRuns and basicProjected). Absent when none, or when the company
   * opted not to deduct them.
   */
  latesDeductedCents?: string;
  /** Basic pay on this year's finalized regular runs. */
  basicFromRunsCents: string;
  runSheetCount: number;
  /** Basic pay earned before Sentire (PAY-144 opening). */
  basicFromOpeningsCents: string;
  totalBasicCents: string;
  /**
   * PAY-171: a 13th month paid on a regular run before the year ends: this
   * run's basic for this and each later pay period of the year.
   */
  basicProjectedCents?: string;
  periodsProjected?: number;
  /** totalBasic / 12, rounded down to the centavo. */
  thirteenthForYearCents: string;
  /** 13th month already paid this year before Sentire (PAY-144 opening). */
  alreadyPaidCents: string;
  /** What this run pays: thirteenthForYear less alreadyPaid, never below zero. */
  dueCents: string;
}

async function computeThirteenthMonth(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  periodEnd: Date,
  openings: YtdOpening[] = [],
  /**
   * PAY-171: paid on a REGULAR run before the year ends: that run's basic and
   * the same basic for each later pay period of the year count as earned.
   * A later run (or the Year-End run) trues it up, since what was paid is
   * subtracted.
   */
  inRun?: { thisRunBasicCents: bigint; periodsAfter: bigint; thisRunApplied?: { id: string; amountCents: string }[]; thisRunLateCents?: bigint },
): Promise<{ dueCents: bigint; breakdown: ThirteenthMonthBreakdown }> {
  const year = periodEnd.getUTCFullYear();
  // PAY-60: the company's basis setting was read by no computation. STRICT_DOLE
  // is basic pay only. INCLUDE_ALLOWANCES adds the earnings whose pay
  // component is marked "13th-Month Pay basis" (never bonuses, reimbursements
  // or deductions).
  const policy = await tx.tenant.findUnique({ where: { id: tenantId }, select: { thirteenthMonthBasis: true, thirteenthMonthDeductLates: true } });
  const basis = policy?.thirteenthMonthBasis ?? "STRICT_DOLE";
  // PAY-198 (Mark, 20 Nov 2026): lates and undertime reduce the 13th month
  // base ("basic pay actually earned"); a company may opt not to deduct them.
  const deductLates = policy?.thirteenthMonthDeductLates ?? true;
  const counted = basis === "INCLUDE_ALLOWANCES"
    ? new Set((await tx.payComponent.findMany({
        where: { tenantId, includeIn13thMonth: true, isBonus: false, kind: { notIn: ["DEDUCTION", "REIMBURSEMENT"] } },
        select: { id: true },
      })).map((c) => c.id))
    : new Set<string>();
  const countedIn = (applied: unknown): bigint =>
    ((Array.isArray(applied) ? applied : []) as { id?: string; amountCents?: string }[])
      .reduce((t, a) => (a?.id && counted.has(a.id) ? t + BigInt(a.amountCents ?? "0") : t), 0n);
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
    select: { basePayCents: true, lateUndertimeDeductionCents: true, payComponentsApplied: true },
  });
  // PAY-171: 13th month already paid this year by Sentire, on regular runs
  // that included it and on Year-End runs.
  const paidSheets = await tx.payrollSheet.findMany({
    where: {
      employeeId,
      tenantId,
      thirteenthMonthBreakdown: { not: PrismaValues.DbNull },
      payrollBook: { status: "FINALIZED", runType: { in: ["REGULAR", "YEAR_END"] }, periodEnd: { gte: yearStart, lte: yearEnd } },
    },
    select: { thirteenthMonthBreakdown: true },
  });
  const paidBySentire = paidSheets.reduce(
    (acc, s) => acc + BigInt(((s.thirteenthMonthBreakdown ?? {}) as { dueCents?: string }).dueCents ?? "0"),
    0n,
  );

  const opening = ytdOpeningTotals(openings);
  const latesFromRuns = deductLates ? priorSheets.reduce((acc, s) => acc + s.lateUndertimeDeductionCents, 0n) : 0n;
  const fromRuns = priorSheets.reduce((acc, s) => acc + s.basePayCents, 0n) - latesFromRuns;
  // This run's lates come off once; the projected later periods assume none.
  const lateThisRun = deductLates && inRun ? inRun.thisRunLateCents ?? 0n : 0n;
  const projected = inRun ? inRun.thisRunBasicCents * (1n + inRun.periodsAfter) - lateThisRun : 0n;
  const allowances =
    priorSheets.reduce((acc, s) => acc + countedIn(s.payComponentsApplied), 0n) +
    (inRun ? countedIn(inRun.thisRunApplied) * (1n + inRun.periodsAfter) : 0n);
  const totalBasic = fromRuns + opening.basicPayEarnedCents + projected + allowances;
  const forYear = totalBasic / 12n;
  const alreadyPaid = opening.thirteenthMonthPaidCents + paidBySentire;
  const raw = forYear - alreadyPaid;
  const due = raw > 0n ? raw : 0n;
  return {
    dueCents: due,
    breakdown: {
      year,
      basis,
      ...(basis === "INCLUDE_ALLOWANCES" ? { allowancesCents: allowances.toString() } : {}),
      ...(deductLates && latesFromRuns + lateThisRun > 0n ? { latesDeductedCents: (latesFromRuns + lateThisRun).toString() } : {}),
      basicFromRunsCents: fromRuns.toString(),
      runSheetCount: priorSheets.length,
      basicFromOpeningsCents: opening.basicPayEarnedCents.toString(),
      ...(inRun ? { basicProjectedCents: projected.toString(), periodsProjected: Number(1n + inRun.periodsAfter) } : {}),
      totalBasicCents: totalBasic.toString(),
      thirteenthForYearCents: forYear.toString(),
      alreadyPaidCents: alreadyPaid.toString(),
      dueCents: due.toString(),
    },
  };
}

/**
 * PAY-154/PAY-156: taxable pay and tax withheld so far this year on FINALIZED
 * REGULAR, OFF_CYCLE and YEAR_END runs (a draft run's own sheets are never
 * finalized, so they are not counted).
 */
async function priorYearTaxSums(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  periodEnd: Date,
): Promise<{ taxable: bigint; withholding: bigint }> {
  const year = periodEnd.getUTCFullYear();
  const agg = await tx.payrollSheet.aggregate({
    where: {
      tenantId,
      employeeId,
      payrollBook: {
        status: "FINALIZED",
        runType: { in: ["REGULAR", "OFF_CYCLE", "YEAR_END"] },
        periodEnd: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lte: new Date(`${year}-12-31T23:59:59.999Z`),
        },
      },
    },
    _sum: { grossTaxableIncomeCents: true, withholdingTaxCents: true },
  });
  return {
    taxable: agg._sum.grossTaxableIncomeCents ?? 0n,
    withholding: agg._sum.withholdingTaxCents ?? 0n,
  };
}

/**
 * PAY-144: load the employee's year-to-date openings for a YEAR_END or
 * FINAL_PAY run, set how much of the 90,000 exemption is already used, and
 * keep a copy of the openings on the run's input snapshot.
 */
async function applyYtdOpenings(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  periodEnd: Date,
  ci: ComputeInput,
): Promise<YtdOpening[]> {
  const year = periodEnd.getUTCFullYear();
  const openings = await loadYtdOpenings(tx, tenantId, employeeId, year);
  ci.benefitsExemptUsedCents = await benefitsExemptUsedCents(tx, tenantId, employeeId, year, openings);
  const snapshot = ytdOpeningSnapshot(year, openings);
  if (snapshot) ci.periodInput = { ...ci.periodInput, ytdOpening: snapshot };
  return openings;
}

/**
 * PAY-171: a REGULAR run that includes the 13th month: compute the sheet once
 * for this run's basic, then pay 1/12 of the year's basic (earned so far plus
 * this run's basic for this and each later period) less what was already
 * paid, and compute again with it.
 */
async function withThirteenthMonthInRun(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  period: { start: Date; end: Date; cycle: string },
  ci: ComputeInput,
): Promise<{ result: ReturnType<typeof computeSheet>; breakdown: ThirteenthMonthBreakdown }> {
  const first = computeSheet(ci);
  const year = period.end.getUTCFullYear();
  const openings = await loadYtdOpenings(tx, tenantId, employeeId, year);
  const after = periodsPerYear(period.cycle) - periodsElapsedBefore(period.cycle, period.start) - 1n;
  const t = await computeThirteenthMonth(tx, tenantId, employeeId, period.end, openings, {
    thisRunBasicCents: first.basePayCents,
    periodsAfter: after > 0n ? after : 0n,
    thisRunApplied: first.payComponentsApplied, // PAY-60
    thisRunLateCents: first.lateUndertimeDeductionCents, // PAY-198
  });
  ci.thirteenthMonthInRunCents = t.dueCents;
  await applyBenefitsContext(tx, tenantId, employeeId, period.end, ci);
  return { result: computeSheet(ci), breakdown: t.breakdown };
}

/**
 * PAY-171: a REGULAR run needs the year's taxable pay and tax so far (the
 * cumulative average method, and the rate for the year on a bonus excess)
 * and, when it pays a bonus or a 13th month, what is left of the 90,000.
 */
async function applyBenefitsContext(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  employeeId: string,
  periodEnd: Date,
  ci: ComputeInput,
): Promise<void> {
  if ((ci.runType ?? "REGULAR") !== "REGULAR") return;
  const year = periodEnd.getUTCFullYear();
  const openings = await loadYtdOpenings(tx, tenantId, employeeId, year);
  const opening = ytdOpeningTotals(openings);
  const sums = await priorYearTaxSums(tx, tenantId, employeeId, periodEnd);
  ci.ytdTaxableCents = sums.taxable + opening.taxableCompensationCents;
  // PAY-171: cumulative average method (kept for the rest of the year once used).
  const used = await tx.payrollSheet.count({
    where: {
      tenantId,
      employeeId,
      statutoryBreakdown: { path: ["bir", "method"], equals: "CUMULATIVE_AVERAGE" },
      payrollBook: {
        status: "FINALIZED",
        runType: "REGULAR",
        periodEnd: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T23:59:59.999Z`) },
      },
    },
  });
  ci.cumulativeAverage = {
    priorTaxableCents: ci.ytdTaxableCents,
    priorWithheldCents: sums.withholding + opening.withholdingTaxCents,
    usedThisYear: used > 0,
  };
  const paysBenefits = ci.payComponents.some((c) => c.isBonus || c.isOneOff) || (ci.thirteenthMonthInRunCents ?? 0n) > 0n;
  if (paysBenefits) ci.benefitsExemptUsedCents = await benefitsExemptUsedCents(tx, tenantId, employeeId, year, openings);
}

// ---------------------------------------------------------------------------
// Private: separation pay helpers (FINAL_PAY runs)
// ---------------------------------------------------------------------------

/**
 * Daily rate for final-pay inputs (leave cash-out, separation pay). Unit 1.8
 * (R89): delegates to the single implementation in rates.ts, with the
 * employee's divisor (else the tenant's); the old copy here divided WEEKLY by a
 * fixed 5 and used only the tenant's divisor.
 */
function deriveRateForPersist(
  basicSalaryCents: bigint,
  salaryType: SalaryType,
  employeeDivisor: number | null,
  tenantDivisor: number,
): bigint {
  return deriveSalaryRates({
    basicSalaryCents,
    salaryType,
    divisor: effectiveDivisor(employeeDivisor, tenantDivisor),
    hoursPerDay: 8, // the daily rate does not depend on hours
  }).dailyRateCents;
}

/**
 * Unit 1.8 (G3, 15 Nov 2026): a REGULAR run pays the employees whose pay cycle
 * is the run's. Before, every active employee was computed in every run, so a
 * semi-monthly employee was also paid in a weekly run of overlapping dates.
 * OFF_CYCLE, FINAL_PAY and YEAR_END keep their own selection.
 */
export function onRunCycle<E extends { payFrequency: PayFrequency }>(
  employees: E[],
  runType: string,
  cycle: PayFrequency,
): E[] {
  return runType === "REGULAR" ? employees.filter((e) => e.payFrequency === cycle) : employees;
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
  openings: YtdOpening[] = [],
): Promise<FinalPayInputs> {
  const year = periodEnd.getUTCFullYear();

  // 1. Prorated 13th month (same helper as YEAR_END).
  const proratedThirteenthMonthCents = (
    await computeThirteenthMonth(tx, tenantId, employee.id, periodEnd, openings)
  ).dueCents;

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
      // HALF-UP BigInt arithmetic — never multiply money through JS floats.
      leaveCashOutCents += multiply(dailyRateCents, available);
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
      const rawPay = multiply(monthlySalaryCents, yearsOfService * rate);
      // DOLE minimum: not less than 1 month salary.
      separationPayCents =
        rawPay < monthlySalaryCents ? monthlySalaryCents : rawPay;
      isSeparationPayTaxable = false; // DOLE-mandated = tax-exempt
    }
  }

  // 4. CY prior taxable income + withholding tax from FINALIZED REGULAR,
  //    OFF_CYCLE and (PAY-154) YEAR_END runs, plus (PAY-144) pay before
  //    Sentire and a previous employer's 2316.
  const prior = await priorYearTaxSums(tx, tenantId, employee.id, periodEnd);
  const opening = ytdOpeningTotals(openings);
  const cyPriorTaxableIncomeCents = prior.taxable + opening.taxableCompensationCents;
  const cyPriorWithholdingTaxCents = prior.withholding + opening.withholdingTaxCents;

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

/** True when a Prisma error is a unique-constraint (P2002) violation. */
function isDuplicatePeriod(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

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
        allowNegativeFinalPay: true,
        maxDeductionPctOfGross: true,
        strictDtrPolicy: true, // PAY-172
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

    // 3. Create the book. The unique index is the real race guard — two
    //    concurrent creates can both pass the findUnique check above, so map
    //    the resulting P2002 to a 409 conflict.
    const book = await tx.payrollBook
      .create({
        data: {
          tenantId: input.tenantId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          cycle: input.cycle,
          runType: input.runType ?? "REGULAR",
          notes: input.notes ?? null,
          createdByUserId: input.createdByUserId ?? null,
          skipStatutory: input.skipStatutory ?? false,
          includeThirteenthMonth: (input.runType ?? "REGULAR") === "REGULAR" && (input.includeThirteenthMonth ?? false),
          separationReason: input.separationReason ?? null,
          targetEmployeeIds: targetIdsFor(input),
          payDate: input.payDate ?? null,
          cutoffStart: input.cutoffStart ?? null,
          cutoffEnd: input.cutoffEnd ?? null,
        },
      })
      .catch((e) => {
        if (isDuplicatePeriod(e))
          throw new PayrollRunConflictError(
            "A payroll run already exists for this period.",
          );
        throw e;
      });

    // 4. Fan out engine across active employees.
    const allEmployees = await loadActiveEmployees(
      tx,
      input.periodStart,
      input.periodEnd,
    );
    const employees = onRunCycle(
      selectRunEmployees(allEmployees, targetIdsFor(input)),
      input.runType ?? "REGULAR",
      input.cycle,
    );

    const sssBases = await loadSssBases(tx, {
      employees,
      runType: input.runType ?? "REGULAR",
      cycle: input.cycle,
      rule: tenant.statutoryCutoffRule,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      skipStatutory: input.skipStatutory ?? false,
    });

    const dtr = dtrGapCollector(input.runType ?? "REGULAR", tenant.strictDtrPolicy); // PAY-172
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
        { start: input.cutoffStart ?? null, end: input.cutoffEnd ?? null },
        dtr.policyFor(e.id),
      );
      if (!ci) continue;
      if (dtr.isHeld(e.id)) continue; // PAY-172: strict DTR policy
      let thirteenthBreakdown: ThirteenthMonthBreakdown | null = null; // PAY-168
      ci.runType = input.runType ?? "REGULAR"; // unit 1.8 (G1)
      ci.sssBasis = sssBases?.get(e.id); // PAY-133
      await applyBenefitsContext(tx, input.tenantId, e.id, input.periodEnd, ci); // PAY-171

      // YEAR_END: inject thirteenthMonthCents computed from prior REGULAR runs.
      if ((input.runType ?? "REGULAR") === "YEAR_END") {
        const ytdOpenings = await applyYtdOpenings(tx, input.tenantId, e.id, input.periodEnd, ci); // PAY-144
        ci.ytdTaxableCents = (await priorYearTaxSums(tx, input.tenantId, e.id, input.periodEnd)).taxable + ytdOpeningTotals(ytdOpenings).taxableCompensationCents; // PAY-154
        {
          const t = await computeThirteenthMonth(tx, input.tenantId, e.id, input.periodEnd, ytdOpenings);
          ci.thirteenthMonthCents = t.dueCents;
          thirteenthBreakdown = t.breakdown; // PAY-168
        }
      }

      // FINAL_PAY: inject leave cash-out, prorated 13th, separation pay, CY priors.
      if ((input.runType ?? "REGULAR") === "FINAL_PAY") {
        const term = e.employmentTerms[0]!;
        const salary = { basicSalaryCents: term.basicSalaryCents!, salaryType: term.salaryType! };
        const dailyRate = deriveRateForPersist(
          salary.basicSalaryCents,
          salary.salaryType,
          e.workingDaysDenominator,
          tenant.workingDaysDenominator,
        );
        const ytdOpenings = await applyYtdOpenings(tx, input.tenantId, e.id, input.periodEnd, ci); // PAY-144
        ci.finalPayInputs = await computeFinalPayInputsForEmployee(
          tx,
          input.tenantId,
          e,
          input.periodEnd,
          input.separationReason,
          dailyRate,
          salary.basicSalaryCents,
          ytdOpenings,
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

      let result = computeSheet(ci);
      // PAY-171: the 13th month on this regular run's payslip.
      if ((input.runType ?? "REGULAR") === "REGULAR" && input.includeThirteenthMonth) {
        const r13 = await withThirteenthMonthInRun(tx, input.tenantId, e.id, { start: input.periodStart, end: input.periodEnd, cycle: input.cycle }, ci);
        result = r13.result;
        thirteenthBreakdown = r13.breakdown;
      }
      // PAY-194: release a salary held in an earlier regular run.
      const held = await releaseHeldPay(tx, input.tenantId, e.id, { bookId: book.id, periodStart: input.periodStart, cycle: input.cycle, runType: input.runType ?? "REGULAR" }, tenant, multiplierConfig, result);
      result = held.result;
      sheets.push({
        ...resultToSheetCreate(input.tenantId, book.id, e.id, result),
        statutoryRuleVersions: rules.ruleVersions,
        ...(thirteenthBreakdown ? { thirteenthMonthBreakdown: thirteenthBreakdown as unknown as Prisma.InputJsonValue } : {}),
        ...(held.heldRelease ? { heldRelease: held.heldRelease } : {}),
      });
    }

    if (sheets.length > 0) {
      await tx.payrollSheet.createMany({ data: sheets });
    }
    // PAY-171: the year's last regular run carries the year-end tax adjustment.
    if (isLastRegularOfYear({ runType: input.runType ?? "REGULAR", periodEnd: input.periodEnd })) {
      await annualizeInTx(tx, input.tenantId, { id: book.id, periodEnd: input.periodEnd });
    }
    // PAY-172: who lacked an approved DTR for days of this cutoff.
    await tx.payrollBook.update({
      where: { id: book.id },
      data: { dtrGaps: dtr.toJson(null) ?? PrismaValues.DbNull },
    });

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
    // Lock the book row for the duration of the tx so concurrent
    // recompute/finalize calls serialize instead of racing.
    await tx.$queryRaw`SELECT id FROM "PayrollBook" WHERE id = ${bookId} AND "tenantId" = ${tenantId} FOR UPDATE`;
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
        allowNegativeFinalPay: true,
        maxDeductionPctOfGross: true,
        strictDtrPolicy: true, // PAY-172
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

    // PAY-135: keep the run's own subset (it used to widen to everyone).
    const employees = onRunCycle(
      selectRunEmployees(
        await loadActiveEmployees(tx, book.periodStart, book.periodEnd),
        book.targetEmployeeIds,
      ),
      book.runType,
      book.cycle,
    );
    const sssBases = await loadSssBases(tx, {
      employees,
      runType: book.runType,
      cycle: book.cycle,
      rule: tenant.statutoryCutoffRule,
      periodStart: book.periodStart,
      periodEnd: book.periodEnd,
      skipStatutory: book.skipStatutory,
    });
    const dtr = dtrGapCollector(book.runType, tenant.strictDtrPolicy); // PAY-172
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
        { start: book.cutoffStart, end: book.cutoffEnd },
        dtr.policyFor(e.id),
      );
      if (!ci) continue;
      if (dtr.isHeld(e.id)) continue; // PAY-172: strict DTR policy
      let thirteenthBreakdown: ThirteenthMonthBreakdown | null = null; // PAY-168
      ci.runType = book.runType; // unit 1.8 (G1)
      ci.sssBasis = sssBases?.get(e.id); // PAY-133
      await applyBenefitsContext(tx, tenantId, e.id, book.periodEnd, ci); // PAY-171

      // YEAR_END: re-inject thirteenthMonthCents from prior REGULAR runs.
      if (book.runType === "YEAR_END") {
        const ytdOpenings = await applyYtdOpenings(tx, tenantId, e.id, book.periodEnd, ci); // PAY-144
        ci.ytdTaxableCents = (await priorYearTaxSums(tx, tenantId, e.id, book.periodEnd)).taxable + ytdOpeningTotals(ytdOpenings).taxableCompensationCents; // PAY-154
        {
          const t = await computeThirteenthMonth(tx, tenantId, e.id, book.periodEnd, ytdOpenings);
          ci.thirteenthMonthCents = t.dueCents;
          thirteenthBreakdown = t.breakdown; // PAY-168
        }
      }

      // FINAL_PAY: re-inject from stored separationReason.
      if (book.runType === "FINAL_PAY") {
        const term = e.employmentTerms[0]!;
        const salary = { basicSalaryCents: term.basicSalaryCents!, salaryType: term.salaryType! };
        const dailyRate = deriveRateForPersist(
          salary.basicSalaryCents,
          salary.salaryType,
          e.workingDaysDenominator,
          tenant.workingDaysDenominator,
        );
        const ytdOpenings = await applyYtdOpenings(tx, tenantId, e.id, book.periodEnd, ci); // PAY-144
        ci.finalPayInputs = await computeFinalPayInputsForEmployee(
          tx,
          tenantId,
          e,
          book.periodEnd,
          book.separationReason ?? undefined,
          dailyRate,
          salary.basicSalaryCents,
          ytdOpenings,
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

      let result = computeSheet(ci);
      // PAY-171: the 13th month on this regular run's payslip.
      if ((book.runType) === "REGULAR" && book.includeThirteenthMonth) {
        const r13 = await withThirteenthMonthInRun(tx, tenantId, e.id, { start: book.periodStart, end: book.periodEnd, cycle: book.cycle }, ci);
        result = r13.result;
        thirteenthBreakdown = r13.breakdown;
      }
      // PAY-194: release a salary held in an earlier regular run.
      const held = await releaseHeldPay(tx, tenantId, e.id, { bookId, periodStart: book.periodStart, cycle: book.cycle, runType: book.runType }, tenant, multiplierConfigR, result);
      result = held.result;
      sheets.push({
        ...resultToSheetCreate(tenantId, bookId, e.id, result),
        statutoryRuleVersions: rules.ruleVersions,
        ...(thirteenthBreakdown ? { thirteenthMonthBreakdown: thirteenthBreakdown as unknown as Prisma.InputJsonValue } : {}),
        ...(held.heldRelease ? { heldRelease: held.heldRelease } : {}),
      });
    }
    if (sheets.length > 0) {
      await tx.payrollSheet.createMany({ data: sheets });
    }
    // PAY-171: the year's last regular run carries the year-end tax adjustment.
    if (isLastRegularOfYear(book)) {
      await annualizeInTx(tx, tenantId, { id: bookId, periodEnd: book.periodEnd });
    }
    // PAY-172: who lacked an approved DTR for days of this cutoff.
    await tx.payrollBook.update({
      where: { id: bookId },
      data: { dtrGaps: dtr.toJson(book.dtrGaps) ?? PrismaValues.DbNull },
    });

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
    // Lock the book row for the duration of the tx so two concurrent finalize
    // calls cannot both read DRAFT and double-debit loan balances.
    await tx.$queryRaw`SELECT id FROM "PayrollBook" WHERE id = ${bookId} AND "tenantId" = ${tenantId} FOR UPDATE`;
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

    // PAY-155: a 13th month run is annualized while it is a draft, and the
    // finalized run is never changed afterwards. If the year's figures moved
    // since the true-up was worked out (another run finalized, an opening or
    // the tax table changed), sealing it would lock in a wrong true-up.
    if (book.runType === "YEAR_END") {
      const stale = await staleAnnualizations(tx, tenantId, book);
      if (stale.length > 0) {
        throw new PayrollRunConflictError(
          `The year's figures changed since this 13th month run was annualized ` +
            `(${stale.length} employee${stale.length === 1 ? "" : "s"}). ` +
            `Annualize again, then finalize.`,
        );
      }
    }
    // PAY-171: the year's last regular run carries the year-end adjustment.
    if (isLastRegularOfYear(book)) {
      const stale = await staleAnnualizations(tx, tenantId, book);
      if (stale.length > 0) {
        throw new PayrollRunConflictError(
          `The year's figures changed since this run's year-end tax adjustment was worked out ` +
            `(${stale.length} employee${stale.length === 1 ? "" : "s"}). Recompute the run, then finalize.`,
        );
      }
    }

    // PAY-194: a held salary is released once. If another run released the
    // same held cutoff and was finalized first, this draft would pay it again.
    const releasing = book.sheets.flatMap((sh) =>
      ((sh.heldRelease as { releases?: HeldReleaseEntry[] } | null)?.releases ?? []).map((r) => ({ employeeId: sh.employeeId, fromBookId: r.fromBookId })),
    );
    if (releasing.length > 0) {
      const others = await tx.payrollSheet.findMany({
        where: {
          tenantId, employeeId: { in: releasing.map((r) => r.employeeId) }, heldRelease: { not: PrismaValues.DbNull },
          payrollBook: { status: "FINALIZED", id: { not: book.id } },
        },
        select: { employeeId: true, heldRelease: true },
      });
      const paid = new Set(others.flatMap((o) =>
        ((o.heldRelease as { releases?: HeldReleaseEntry[] } | null)?.releases ?? []).map((r) => `${o.employeeId}|${r.fromBookId}`)));
      const twice = releasing.filter((r) => paid.has(`${r.employeeId}|${r.fromBookId}`));
      if (twice.length > 0) {
        throw new PayrollRunConflictError(
          `A held salary in this run was already released by another finalized run ` +
            `(${twice.length} employee${twice.length === 1 ? "" : "s"}). Recompute the run, then finalize.`,
        );
      }
    }

    // PAY-203 (Mark, 20 Nov 2026, ruling 3): a run whose payslips do not add
    // up (cross-foot check 1) or whose register does not equal its payslips
    // (check 2) cannot be finalized. The register's totals are added by the
    // database, apart from the payslips loaded above.
    await assertRunTiesOut(tx, tenantId, book.id, book.sheets);

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

    // 4. Lock the DTR records that fed this run so they can no longer be
    //    edited or re-punched (closes the isLocked placeholder).
    const sheetEmployeeIds = book.sheets.map((s) => s.employeeId);
    if (sheetEmployeeIds.length > 0) {
      await tx.dTRRecord.updateMany({
        where: {
          tenantId,
          employeeId: { in: sheetEmployeeIds },
          date: { gte: book.periodStart, lte: book.periodEnd },
          isLocked: false,
        },
        data: { isLocked: true },
      });
    }

    // PAY-69: control numbers, gapless, in this transaction.
    const control = await issueRunControlNumbers(tx, tenantId, bookId, book.periodEnd);

    // 5. Transition the book + audit log.
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
          after: { status: "FINALIZED", controlNumber: control.run },
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

// ---------------------------------------------------------------------------
// Async / queued payroll run (PROCESSING lifecycle)
// ---------------------------------------------------------------------------

/**
 * Create a minimal PayrollBook in PROCESSING status without computing sheets.
 * The caller is responsible for enqueuing a `payroll.run` job immediately
 * after this returns.
 */
export async function queueRun(input: CreateDraftRunInput) {
  return withTenant(input.tenantId, async (tx) => {
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

    return tx.payrollBook
      .create({
        data: {
          tenantId: input.tenantId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          cycle: input.cycle,
          runType: input.runType ?? "REGULAR",
          notes: input.notes ?? null,
          createdByUserId: input.createdByUserId ?? null,
          skipStatutory: input.skipStatutory ?? false,
          includeThirteenthMonth: (input.runType ?? "REGULAR") === "REGULAR" && (input.includeThirteenthMonth ?? false),
          separationReason: input.separationReason ?? null,
          targetEmployeeIds: targetIdsFor(input),
          payDate: input.payDate ?? null,
          cutoffStart: input.cutoffStart ?? null,
          cutoffEnd: input.cutoffEnd ?? null,
          status: "PROCESSING",
        },
      })
      .catch((e) => {
        if (isDuplicatePeriod(e))
          throw new PayrollRunConflictError(
            "A payroll run already exists for this period.",
          );
        throw e;
      });
  });
}

/**
 * Compute sheets for a PROCESSING PayrollBook, then transition it to DRAFT.
 * Called exclusively from the `payroll.run` background job handler.
 */
export async function processRun(tenantId: string, bookId: string) {
  return withTenant(tenantId, async (tx) => {
    const book = await tx.payrollBook.findUnique({ where: { id: bookId } });
    if (!book) throw new PayrollRunNotFoundError(bookId);
    if (book.status !== "PROCESSING") {
      throw new PayrollRunConflictError(
        `processRun expects PROCESSING status, got ${book.status}.`,
      );
    }

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        workingDaysDenominator: true,
        statutoryCutoffRule: true,
        thirteenthMonthBasis: true,
        allowNegativeFinalPay: true,
        maxDeductionPctOfGross: true,
        strictDtrPolicy: true, // PAY-172
      },
    });
    const rules = await resolveAllRules(tx, tenantId, book.periodEnd);

    const premiumRateRows = await tx.premiumRateConfig.findMany({
      where: { tenantId },
      select: { multiplierKey: true, rate: true },
    });
    const multiplierConfig: ComputeMultiplierConfig =
      premiumRateRows.length > 0
        ? Object.fromEntries(premiumRateRows.map((r) => [r.multiplierKey, Number(r.rate)]))
        : {};

    const allEmployees = await loadActiveEmployees(
      tx,
      book.periodStart,
      book.periodEnd,
    );

    // PAY-135: the queued run computes only the employees it was created for.
    const runEmployees = onRunCycle(
      selectRunEmployees(allEmployees, book.targetEmployeeIds),
      book.runType,
      book.cycle,
    );
    const sssBases = await loadSssBases(tx, {
      employees: runEmployees,
      runType: book.runType,
      cycle: book.cycle,
      rule: tenant.statutoryCutoffRule,
      periodStart: book.periodStart,
      periodEnd: book.periodEnd,
      skipStatutory: book.skipStatutory,
    });
    const dtr = dtrGapCollector(book.runType, tenant.strictDtrPolicy); // PAY-172
    const sheets: Prisma.PayrollSheetCreateManyInput[] = [];
    for (const e of runEmployees) {
      const ci = await buildComputeInputForEmployee(
        tx,
        tenantId,
        e,
        book.periodStart,
        book.periodEnd,
        book.cycle,
        tenant,
        rules,
        multiplierConfig,
        { start: book.cutoffStart, end: book.cutoffEnd },
        dtr.policyFor(e.id),
      );
      if (!ci) continue;
      if (dtr.isHeld(e.id)) continue; // PAY-172: strict DTR policy
      let thirteenthBreakdown: ThirteenthMonthBreakdown | null = null; // PAY-168
      ci.runType = book.runType; // unit 1.8 (G1)
      ci.sssBasis = sssBases?.get(e.id); // PAY-133
      await applyBenefitsContext(tx, tenantId, e.id, book.periodEnd, ci); // PAY-171

      if (book.runType === "YEAR_END") {
        const ytdOpenings = await applyYtdOpenings(tx, tenantId, e.id, book.periodEnd, ci); // PAY-144
        ci.ytdTaxableCents = (await priorYearTaxSums(tx, tenantId, e.id, book.periodEnd)).taxable + ytdOpeningTotals(ytdOpenings).taxableCompensationCents; // PAY-154
        {
          const t = await computeThirteenthMonth(tx, tenantId, e.id, book.periodEnd, ytdOpenings);
          ci.thirteenthMonthCents = t.dueCents;
          thirteenthBreakdown = t.breakdown; // PAY-168
        }
      }

      if (book.runType === "FINAL_PAY") {
        const term = e.employmentTerms[0]!;
        const salary = { basicSalaryCents: term.basicSalaryCents!, salaryType: term.salaryType! };
        const dailyRate = deriveRateForPersist(
          salary.basicSalaryCents,
          salary.salaryType,
          e.workingDaysDenominator,
          tenant.workingDaysDenominator,
        );
        const ytdOpenings = await applyYtdOpenings(tx, tenantId, e.id, book.periodEnd, ci); // PAY-144
        ci.finalPayInputs = await computeFinalPayInputsForEmployee(
          tx,
          tenantId,
          e,
          book.periodEnd,
          book.separationReason ?? undefined,
          dailyRate,
          salary.basicSalaryCents,
          ytdOpenings,
        );
      }

      if (book.skipStatutory) {
        ci.overrideStatutoryDeducted = false;
      }

      ci.adjustments = (
        await tx.payrollAdjustment.findMany({
          where: { payrollBookId: bookId, employeeId: e.id },
        })
      ).map((a) => ({
        id: a.id,
        kind: a.kind,
        amountCents: a.amountCents,
        isTaxable: a.isTaxable,
        reason: a.reason,
      }));

      ci.expenseClaims = (
        await tx.expenseClaim.findMany({
          where: { payrollBookId: bookId, employeeId: e.id, status: "ATTACHED" },
        })
      ).map((c) => ({
        id: c.id,
        category: c.category,
        amountCents: c.amountCents,
        taxTreatment: c.taxTreatment!,
      }));

      let result = computeSheet(ci);
      // PAY-171: the 13th month on this regular run's payslip.
      if ((book.runType) === "REGULAR" && book.includeThirteenthMonth) {
        const r13 = await withThirteenthMonthInRun(tx, tenantId, e.id, { start: book.periodStart, end: book.periodEnd, cycle: book.cycle }, ci);
        result = r13.result;
        thirteenthBreakdown = r13.breakdown;
      }
      // PAY-194: release a salary held in an earlier regular run.
      const held = await releaseHeldPay(tx, tenantId, e.id, { bookId, periodStart: book.periodStart, cycle: book.cycle, runType: book.runType }, tenant, multiplierConfig, result);
      result = held.result;
      sheets.push({
        ...resultToSheetCreate(tenantId, bookId, e.id, result),
        statutoryRuleVersions: rules.ruleVersions,
        ...(thirteenthBreakdown ? { thirteenthMonthBreakdown: thirteenthBreakdown as unknown as Prisma.InputJsonValue } : {}),
        ...(held.heldRelease ? { heldRelease: held.heldRelease } : {}),
      });
    }

    if (sheets.length > 0) {
      await tx.payrollSheet.createMany({ data: sheets });
    }
    // PAY-171: the year's last regular run carries the year-end tax adjustment.
    if (isLastRegularOfYear(book)) {
      await annualizeInTx(tx, tenantId, { id: bookId, periodEnd: book.periodEnd });
    }
    // PAY-172: who lacked an approved DTR for days of this cutoff.
    await tx.payrollBook.update({
      where: { id: bookId },
      data: { dtrGaps: dtr.toJson(book.dtrGaps) ?? PrismaValues.DbNull },
    });

    return tx.payrollBook.update({
      where: { id: bookId },
      data: { status: "DRAFT", updatedAt: new Date() },
    });
  });
}

// ---------------------------------------------------------------------------
// PAY-203: cross-foot checks 1 and 2 at finalize
// ---------------------------------------------------------------------------

type CrossFootSheet = Pick<
  PayrollSheet,
  | "employeeId" | "grossCompensationCents" | "sssEeCents" | "philhealthEeCents" | "pagibigEeCents"
  | "withholdingTaxCents" | "loanDeductionsCents" | "adjustmentDeductionsCents" | "nontaxableAdditionsCents" | "netPayCents"
>;

export class PayrollRunDoesNotTieOutError extends PayrollRunConflictError {
  constructor(public readonly checks: CrossFootCheck[]) {
    super(
      `This run does not tie out, so it cannot be finalized: ` +
        checks.map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ""}`).join("; ") +
        `. Recompute the run, then finalize.`,
    );
  }
}

async function assertRunTiesOut(tx: TenantTx, tenantId: string, bookId: string, sheets: CrossFootSheet[]): Promise<void> {
  const z = (n: bigint | null | undefined) => n ?? 0n;
  const sums = await tx.payrollSheet.aggregate({
    where: { tenantId, payrollBookId: bookId },
    _count: true,
    _sum: {
      grossCompensationCents: true, sssEeCents: true, philhealthEeCents: true, pagibigEeCents: true,
      withholdingTaxCents: true, loanDeductionsCents: true, adjustmentDeductionsCents: true,
      nontaxableAdditionsCents: true, netPayCents: true,
    },
  });
  const s = sums._sum;
  const register: RegisterTotals = {
    payslips: sums._count,
    grossCents: z(s.grossCompensationCents), sssEeCents: z(s.sssEeCents), philhealthEeCents: z(s.philhealthEeCents),
    pagibigEeCents: z(s.pagibigEeCents), withholdingTaxCents: z(s.withholdingTaxCents),
    loanDeductionsCents: z(s.loanDeductionsCents), otherDeductionsCents: z(s.adjustmentDeductionsCents),
    additionsCents: z(s.nontaxableAdditionsCents), netPayCents: z(s.netPayCents),
  };
  const failed = runCrossFoot({ sheets: sheets.map((x) => ({ ...x, employeeLabel: x.employeeId })), register, bankFileTotalCents: null })
    .filter((c) => !c.ok);
  if (failed.length > 0) throw new PayrollRunDoesNotTieOutError(failed);
}
