/**
 * Wave G1 (PAY-217): Salary Adjustment, a bulk change of basic salary.
 *
 * Rules: PERCENT (hundredths of a percent, rounded half-up to the centavo),
 * FIXED (centavos added in the salary's own unit: per month for monthly-paid,
 * per day for daily-paid), MIN_WAGE (bring an employee below the regional
 * daily minimum of the MINIMUM_WAGE_RATE rule in force on the effective date
 * up to it; monthly-paid: daily x the employee's working-days divisor / 12,
 * rounded up to the centavo; weekly-paid is skipped).
 *
 * A batch is a preview saved as PENDING. A second person approves it: one
 * SALARY_ADJUSTMENT movement per line, applied at once (a new EmploymentTerm
 * from the effective date, which the engine reads). Back pay for finalized
 * regular payslips on or after the effective date is a PAY-166 retroactive
 * batch (re-priced for the days from the effective date only), approved on the
 * Corrections page into a later draft run; a sealed run is never reopened.
 * A run whose period straddles the effective date is paid by the engine at
 * the old rate for the days before it and the new rate after (ruling 1, Mark,
 * 21 Nov 2026; the G1 "Split" deduction it replaced is gone).
 */
import type { Prisma, SalaryAdjustmentRule, SalaryType } from "@prisma/client";
import { applyMovementEffects } from "@/lib/movements/apply";
import { getActiveRule } from "@/lib/statutory/resolver";
import { createRetroPay, previewRetroPay, retroPaySchema } from "@/lib/payroll/retro-pay";

type Tx = Prisma.TransactionClient;

export class SalaryAdjustmentError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export interface RuleInput {
  rule: SalaryAdjustmentRule;
  percentBasisPoints?: number | null;
  fixedCents?: bigint | null;
}

/** The new basic for one employee, or a reason to skip them. */
export function newBasic(
  r: RuleInput,
  from: bigint,
  salaryType: SalaryType,
  ctx: { minDailyCents?: bigint | null; denominator: number },
): { to: bigint } | { skip: string } {
  if (r.rule === "PERCENT") {
    const bp = BigInt(r.percentBasisPoints ?? 0);
    return { to: from + (from * bp * 2n + 10000n) / 20000n };
  }
  if (r.rule === "FIXED") return { to: from + (r.fixedCents ?? 0n) };
  if (salaryType === "WEEKLY") return { skip: "Weekly-paid: set by hand" };
  if (ctx.minDailyCents == null) return { skip: "No minimum wage for the employee's region" };
  const target = salaryType === "DAILY"
    ? ctx.minDailyCents
    : (ctx.minDailyCents * BigInt(ctx.denominator) + 11n) / 12n;
  if (from >= target) return { skip: "Already at or above the minimum" };
  return { to: target };
}

type Emp = Prisma.EmployeeGetPayload<{ include: { branch: { include: { workLocation: true } }; employmentTerms: true } }>;

async function loadEmployees(tx: Tx, tenantId: string, ids?: string[]): Promise<Emp[]> {
  return tx.employee.findMany({
    where: { tenantId, deletedAt: null, ...(ids ? { id: { in: ids } } : { resignationDate: null }) },
    include: {
      branch: { include: { workLocation: true } },
      employmentTerms: { where: { basicSalaryCents: { not: null } }, orderBy: { effectiveDate: "desc" }, take: 1 },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

async function minWages(tx: Tx, tenantId: string, asOf: Date): Promise<Record<string, bigint>> {
  try {
    const rule = await getActiveRule(tx, tenantId, "MINIMUM_WAGE_RATE", asOf);
    const out: Record<string, bigint> = {};
    for (const [code, v] of Object.entries(rule.payload.regions)) out[code] = BigInt(v.dailyRate);
    return out;
  } catch {
    return {};
  }
}

const regionOf = (e: Emp) => e.branch?.workLocation?.region ?? e.region ?? null;
const nameOf = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`;

export interface PreviewLine {
  employeeId: string; employeeNumber: string; name: string; salaryType: SalaryType;
  fromCents: string; toCents: string; diffCents: string;
}
export interface Preview { lines: PreviewLine[]; skipped: { employeeId: string; name: string; reason: string }[] }

export async function preview(tx: Tx, tenantId: string, r: RuleInput, employeeIds: string[], effectiveDate: Date): Promise<Preview> {
  const [emps, tenant, mins] = await Promise.all([
    loadEmployees(tx, tenantId, employeeIds),
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { workingDaysDenominator: true } }),
    r.rule === "MIN_WAGE" ? minWages(tx, tenantId, effectiveDate) : Promise.resolve({} as Record<string, bigint>),
  ]);
  const out: Preview = { lines: [], skipped: [] };
  for (const e of emps) {
    const term = e.employmentTerms[0];
    if (!term?.basicSalaryCents || !term.salaryType) { out.skipped.push({ employeeId: e.id, name: nameOf(e), reason: "No salary on file" }); continue; }
    const region = regionOf(e);
    const res = newBasic(r, term.basicSalaryCents, term.salaryType, {
      minDailyCents: region ? mins[region] ?? null : null,
      denominator: e.workingDaysDenominator ?? tenant.workingDaysDenominator,
    });
    if ("skip" in res) { out.skipped.push({ employeeId: e.id, name: nameOf(e), reason: res.skip }); continue; }
    out.lines.push({
      employeeId: e.id, employeeNumber: e.employeeNumber, name: nameOf(e), salaryType: term.salaryType,
      fromCents: term.basicSalaryCents.toString(), toCents: res.to.toString(), diffCents: (res.to - term.basicSalaryCents).toString(),
    });
  }
  return out;
}

/** Wage order: everyone whose daily rate (monthly x 12 / divisor) is below the region's minimum on `asOf`. */
export async function wageOrderProposal(tx: Tx, tenantId: string, asOf: Date) {
  const [emps, tenant, mins] = await Promise.all([
    loadEmployees(tx, tenantId),
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { workingDaysDenominator: true } }),
    minWages(tx, tenantId, asOf),
  ]);
  const rows = [];
  for (const e of emps) {
    const term = e.employmentTerms[0];
    const region = regionOf(e);
    if (!term?.basicSalaryCents || !term.salaryType || term.salaryType === "WEEKLY" || !region || mins[region] == null) continue;
    const denom = e.workingDaysDenominator ?? tenant.workingDaysDenominator;
    const daily = term.salaryType === "DAILY" ? term.basicSalaryCents : (term.basicSalaryCents * 12n) / BigInt(denom);
    if (daily >= mins[region]!) continue;
    rows.push({
      employeeId: e.id, employeeNumber: e.employeeNumber, name: nameOf(e), region, taxClassification: e.taxClassification,
      salaryType: term.salaryType, basicCents: term.basicSalaryCents.toString(), dailyCents: daily.toString(), minimumDailyCents: mins[region]!.toString(),
    });
  }
  return { asOf: asOf.toISOString().slice(0, 10), employees: rows };
}

export interface CreateInput extends RuleInput { name: string; effectiveDate: Date; reason: string; employeeIds: string[] }

export async function createBatch(tx: Tx, tenantId: string, userId: string | null, input: CreateInput) {
  const p = await preview(tx, tenantId, input, input.employeeIds, input.effectiveDate);
  if (!p.lines.length) throw new SalaryAdjustmentError("No employee would change under this rule.");
  const busy = await tx.salaryAdjustmentLine.findMany({
    where: { tenantId, employeeId: { in: p.lines.map((l) => l.employeeId) }, batch: { status: "PENDING" } },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (busy.length) throw new SalaryAdjustmentError(`Already in a pending adjustment: ${busy.map((b) => nameOf(b.employee)).join("; ")}.`, 409);
  return tx.salaryAdjustmentBatch.create({
    data: {
      tenantId, name: input.name, rule: input.rule, percentBasisPoints: input.percentBasisPoints ?? null, fixedCents: input.fixedCents ?? null,
      effectiveDate: input.effectiveDate, reason: input.reason, createdByUserId: userId,
      lines: { create: p.lines.map((l) => ({ tenantId, employeeId: l.employeeId, salaryType: l.salaryType, fromCents: BigInt(l.fromCents), toCents: BigInt(l.toCents) })) },
    },
    include: { lines: true },
  });
}

async function pendingBatch(tx: Tx, tenantId: string, id: string) {
  const b = await tx.salaryAdjustmentBatch.findFirst({ where: { id, tenantId }, include: { lines: { include: { employee: true } } } });
  if (!b) throw new SalaryAdjustmentError("Salary adjustment not found", 404);
  if (b.status !== "PENDING") throw new SalaryAdjustmentError("This adjustment has already been decided.", 409);
  return b;
}

export async function approveBatch(tx: Tx, tenantId: string, userId: string | null, id: string) {
  const b = await pendingBatch(tx, tenantId, id);
  if (b.createdByUserId && b.createdByUserId === userId) throw new SalaryAdjustmentError("A second person approves a salary adjustment.", 403);
  const terms = await tx.employmentTerm.findMany({
    where: { tenantId, employeeId: { in: b.lines.map((l) => l.employeeId) }, basicSalaryCents: { not: null } },
    orderBy: { effectiveDate: "desc" },
  });
  const current = new Map<string, (typeof terms)[number]>();
  for (const t of terms) if (!current.has(t.employeeId)) current.set(t.employeeId, t);
  const stale = b.lines.filter((l) => { const t = current.get(l.employeeId); return !t || t.basicSalaryCents !== l.fromCents || t.salaryType !== l.salaryType; });
  if (stale.length) throw new SalaryAdjustmentError(`The salary changed since the preview for: ${stale.map((l) => nameOf(l.employee)).join("; ")}. Make a new adjustment.`, 409);

  const now = new Date();
  for (const l of b.lines) {
    const m = await tx.employeeMovement.create({
      data: {
        tenantId, employeeId: l.employeeId, movementType: "SALARY_ADJUSTMENT",
        fromBasicSalaryCents: l.fromCents, toBasicSalaryCents: l.toCents, fromSalaryType: l.salaryType, toSalaryType: l.salaryType,
        effectiveDate: b.effectiveDate, reason: `${b.name}: ${b.reason}`, approvalStatus: "APPROVED",
        approvedByUserId: userId, approvedAt: now, createdByUserId: b.createdByUserId,
      },
    });
    await applyMovementEffects(tx, m);
    await tx.salaryAdjustmentLine.update({ where: { id: l.id }, data: { movementId: m.id } });
  }

  // Back pay for payslips already finalized on or after the effective date.
  let retro: { batchId: string; payslips: number; totalCents: string } | null = null;
  const input = retroPaySchema.parse({
    employees: b.lines.filter((l) => l.toCents > l.fromCents).map((l) => ({ employeeId: l.employeeId, newBasicSalaryCents: l.toCents.toString() })),
    from: b.effectiveDate.toISOString().slice(0, 10),
    to: "9999-12-31",
    reason: `Back pay, salary adjustment "${b.name}"`,
    prorateFrom: true,
  });
  if (input.employees.length && (await previewRetroPay(tx, tenantId, input)).length) {
    retro = await createRetroPay(tx, tenantId, userId, input);
  }
  await tx.salaryAdjustmentBatch.update({
    where: { id: b.id },
    data: { status: "APPROVED", approvedByUserId: userId, approvedAt: now, retroBatchId: retro?.batchId ?? null },
  });
  return { id: b.id, movements: b.lines.length, backPay: retro };
}

export async function rejectBatch(tx: Tx, tenantId: string, userId: string | null, id: string, reason: string) {
  await pendingBatch(tx, tenantId, id);
  return tx.salaryAdjustmentBatch.update({ where: { id }, data: { status: "REJECTED", approvedByUserId: userId, approvedAt: new Date(), rejectionReason: reason } });
}

export function serializeBatch(b: Prisma.SalaryAdjustmentBatchGetPayload<{ include: { lines: { include: { employee: { select: { firstName: true; lastName: true; employeeNumber: true } } } } } }>) {
  return {
    id: b.id, name: b.name, rule: b.rule, percentBasisPoints: b.percentBasisPoints, fixedCents: b.fixedCents?.toString() ?? null,
    effectiveDate: b.effectiveDate.toISOString().slice(0, 10), reason: b.reason, status: b.status,
    createdByUserId: b.createdByUserId, approvedAt: b.approvedAt?.toISOString() ?? null, rejectionReason: b.rejectionReason, retroBatchId: b.retroBatchId,
    lines: b.lines.map((l) => ({
      id: l.id, employeeId: l.employeeId, name: nameOf(l.employee), employeeNumber: l.employee.employeeNumber, salaryType: l.salaryType,
      fromCents: l.fromCents.toString(), toCents: l.toCents.toString(), diffCents: (l.toCents - l.fromCents).toString(),
      movementId: l.movementId,
    })),
  };
}
