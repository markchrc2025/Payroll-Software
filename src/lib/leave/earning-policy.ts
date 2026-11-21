/**
 * Wave E1 (PAY-215): Leave Earning Policies. A policy is a reusable accrual
 * rule for one leave type, assigned to a group of employees (by employment
 * status, level, department or job type; an empty list means any). Applying
 * it writes each employee's LeaveEntitlement rows, which the daily accrual job
 * (src/lib/jobs/handlers/leave-accrual.ts) already turns into dated ACCRUAL
 * transactions, idempotently, without ever editing past ones.
 *
 * Until now nothing in the app created LeaveEntitlement rows; this is the way
 * they are made.
 *
 * - Earning starts at the later of the policy's effective date and the hire
 *   date, or the regularization date when the policy says so.
 * - Service tiers (for example 5 days a year, 10 from the third year) split
 *   the entitlement at each service anniversary counted from the hire date,
 *   so no later job is needed to move an employee up a tier.
 * - Pro-rating applies to partial periods (a joiner's first month), as the
 *   accrual job already does for an entitlement marked proRate.
 * - An open entitlement for the same leave type that started earlier is
 *   ended the day before; one that would start on or after the new start is
 *   removed if nothing has accrued on it, otherwise the employee is skipped.
 * - Applying twice changes nothing.
 *
 * Carry-over cap, expiry and conversion to cash are kept on the policy here
 * and used by the year-end step (Wave E2).
 */
import Decimal from "decimal.js";
import type { AccrualFrequency, EmploymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";

type Tx = Prisma.TransactionClient;

const decimalText = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine((v) => /^\d+(\.\d{1,4})?$/.test(v), "Use a number with up to 4 decimals");
const optDecimal = z.union([decimalText, z.null()]).optional();

export const policySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  leaveTypeId: z.string().min(1, "Choose the leave type"),
  accrualFrequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY", "UPON_REGULARIZATION", "LUMP_SUM"]),
  accrualAmount: decimalText,
  tiers: z.array(z.object({ fromYear: z.number().int().min(1).max(50), accrualAmount: decimalText })).max(10).default([]),
  proRate: z.boolean().default(true),
  earnFrom: z.enum(["HIRE", "REGULARIZATION"]).default("HIRE"),
  carryOverCap: optDecimal,
  expiresAfterMonths: z.number().int().min(1).max(120).nullable().optional(),
  convertUnusedToCash: z.boolean().default(false),
  vacationLeave: z.boolean().default(false),
  assignment: z.object({
    employmentStatuses: z.array(z.string()).default([]),
    levelIds: z.array(z.string()).default([]),
    departmentIds: z.array(z.string()).default([]),
    jobTypeIds: z.array(z.string()).default([]),
  }).default({ employmentStatuses: [], levelIds: [], departmentIds: [], jobTypeIds: [] }),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Effective date as YYYY-MM-DD"),
  isActive: z.boolean().default(true),
}).superRefine((v, ctx) => {
  const years = v.tiers.map((t) => t.fromYear);
  if (new Set(years).size !== years.length) ctx.addIssue({ code: "custom", path: ["tiers"], message: "Each tier needs its own service year" });
  if (v.tiers.length && !["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(v.accrualFrequency)) {
    ctx.addIssue({ code: "custom", path: ["tiers"], message: "Service tiers need a monthly, quarterly or yearly accrual" });
  }
});
export type PolicyInput = z.infer<typeof policySchema>;
export type Assignment = PolicyInput["assignment"];
export type Tier = { fromYear: number; accrualAmount: string };

export class PolicyRefusal extends Error {}

export function parsePolicy(input: unknown) {
  const r = policySchema.safeParse(input);
  if (!r.success) throw new PolicyRefusal(r.error.issues[0]?.message ?? "Check the policy");
  const d = r.data;
  return {
    name: d.name, leaveTypeId: d.leaveTypeId, accrualFrequency: d.accrualFrequency as AccrualFrequency, accrualAmount: d.accrualAmount,
    tiers: [...d.tiers].sort((a, b) => a.fromYear - b.fromYear) as Prisma.InputJsonValue, proRate: d.proRate, earnFrom: d.earnFrom,
    carryOverCap: d.carryOverCap ?? null, expiresAfterMonths: d.expiresAfterMonths ?? null, convertUnusedToCash: d.convertUnusedToCash, vacationLeave: d.vacationLeave,
    assignment: d.assignment as unknown as Prisma.InputJsonValue, effectiveFrom: new Date(`${d.effectiveFrom}T00:00:00.000Z`), isActive: d.isActive,
  };
}

const DAY = 86_400_000;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
function anniversary(hire: Date, years: number): Date {
  const y = hire.getUTCFullYear() + years, m = hire.getUTCMonth(), d = hire.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last)));
}

/** The last day covered by an entitlement's accruals (period keys "2026-02", "2026-Q1", "2026"; one-off grants count at its start). */
export function latestAccruedDay(keys: (string | null)[], start: Date): Date | null {
  let last: Date | null = null;
  for (const k of keys) {
    let end: Date | null = null;
    const m = k?.match(/^(\d{4})(?:-(\d{2})|-Q([1-4]))?$/);
    if (m) {
      const y = Number(m[1]);
      end = m[2] ? new Date(Date.UTC(y, Number(m[2]), 0)) : m[3] ? new Date(Date.UTC(y, Number(m[3]) * 3, 0)) : new Date(Date.UTC(y, 11, 31));
    } else if (k) end = start;
    if (end && (!last || end > last)) last = end;
  }
  return last;
}

export type Segment = { startDate: string; endDate: string | null; accrualAmount: string };

/** The entitlement segments from `start` on, split at each tier's anniversary. */
export function segmentsFor(p: { accrualAmount: string; tiers: Tier[] }, hire: Date, start: Date): Segment[] {
  const steps = [{ from: start, amount: p.accrualAmount }];
  for (const t of [...p.tiers].sort((a, b) => a.fromYear - b.fromYear)) {
    const at = anniversary(hire, t.fromYear);
    // A tier already reached by the start sets the starting amount.
    if (at <= start) steps[0]!.amount = t.accrualAmount;
    else steps.push({ from: at, amount: t.accrualAmount });
  }
  return steps.map((s, i) => ({
    startDate: ymd(s.from)!,
    endDate: steps[i + 1] ? ymd(new Date(steps[i + 1]!.from.getTime() - DAY)) : null,
    accrualAmount: new Decimal(s.amount).toFixed(4),
  }));
}

type PolicyRow = {
  id: string; tenantId: string; leaveTypeId: string; accrualFrequency: AccrualFrequency; accrualAmount: Prisma.Decimal | string;
  tiers: Prisma.JsonValue; proRate: boolean; earnFrom: string; assignment: Prisma.JsonValue; effectiveFrom: Date;
};

export type PlanRow = {
  employeeId: string; employeeNumber: string; employeeName: string;
  action: "CREATE" | "ALREADY" | "SKIP";
  reason: string | null;
  segments: Segment[];
  endsExisting: { id: string; startDate: string; newEndDate: string }[];
  removesExisting: { id: string; startDate: string }[];
};

const SEPARATED: EmploymentStatus[] = ["RESIGNED", "TERMINATED"];

/** What applying the policy would do, employee by employee. */
export async function planPolicy(tx: Tx, policy: PolicyRow): Promise<PlanRow[]> {
  const a = (policy.assignment ?? {}) as Partial<Assignment>;
  const tiers = (Array.isArray(policy.tiers) ? policy.tiers : []) as Tier[];
  const employees = await tx.employee.findMany({
    where: {
      tenantId: policy.tenantId, deletedAt: null,
      employmentStatus: a.employmentStatuses?.length ? { in: a.employmentStatuses as EmploymentStatus[] } : { notIn: SEPARATED },
      ...(a.levelIds?.length ? { levelId: { in: a.levelIds } } : {}),
      ...(a.departmentIds?.length ? { departmentId: { in: a.departmentIds } } : {}),
      ...(a.jobTypeIds?.length ? { jobTypeId: { in: a.jobTypeIds } } : {}),
    },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, hireDate: true, regularizationDate: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const existing = await tx.leaveEntitlement.findMany({
    where: { tenantId: policy.tenantId, leaveTypeId: policy.leaveTypeId, employeeId: { in: employees.map((e) => e.id) }, deletedAt: null },
    include: { transactions: { where: { type: "ACCRUAL" }, select: { periodKey: true } } },
    orderBy: { startDate: "asc" },
  });
  const amount = new Decimal(policy.accrualAmount.toString()).toFixed(4);

  return employees.map((e) => {
    const base = { employeeId: e.id, employeeNumber: e.employeeNumber, employeeName: `${e.lastName}, ${e.firstName}`, segments: [] as Segment[], endsExisting: [] as PlanRow["endsExisting"], removesExisting: [] as PlanRow["removesExisting"] };
    const anchor = policy.earnFrom === "REGULARIZATION" ? e.regularizationDate : e.hireDate;
    if (!anchor) return { ...base, action: "SKIP" as const, reason: "Not yet regularized" };
    const start = day(new Date(Math.max(day(policy.effectiveFrom).getTime(), day(anchor).getTime())));
    const segments = segmentsFor({ accrualAmount: amount, tiers }, day(e.hireDate), start);
    const mine = existing.filter((x) => x.employeeId === e.id);
    const fromThis = mine.filter((x) => x.policyId === policy.id);
    const same = fromThis.length === segments.length && segments.every((s, i) => {
      const x = fromThis[i]!;
      return ymd(x.startDate) === s.startDate && ymd(x.endDate) === s.endDate && new Decimal(x.accrualAmount.toString()).toFixed(4) === s.accrualAmount
        && x.accrualFrequency === policy.accrualFrequency && x.proRate === policy.proRate;
    });
    if (same) return { ...base, segments, action: "ALREADY" as const, reason: null };
    const endsExisting: PlanRow["endsExisting"] = [];
    const removesExisting: PlanRow["removesExisting"] = [];
    for (const x of mine) {
      const xEnd = x.endDate ? day(x.endDate) : null;
      if (xEnd && xEnd < start) continue; // ended before: untouched
      const newEnd = new Date(start.getTime() - DAY);
      if (day(x.startDate) < start) {
        // Never end it before a period it has already accrued for.
        const accruedTo = latestAccruedDay(x.transactions.map((t) => t.periodKey), day(x.startDate));
        if (accruedTo && accruedTo > newEnd) {
          return { ...base, action: "SKIP" as const, reason: `The entitlement from ${ymd(x.startDate)} has already accrued to ${ymd(accruedTo)}; choose an effective date after that` };
        }
        endsExisting.push({ id: x.id, startDate: ymd(x.startDate)!, newEndDate: ymd(newEnd)! });
        continue;
      }
      if (x.transactions.length > 0) {
        return { ...base, action: "SKIP" as const, reason: `An entitlement from ${ymd(x.startDate)} has already accrued; end it by hand or move the policy's effective date` };
      }
      removesExisting.push({ id: x.id, startDate: ymd(x.startDate)! });
    }
    return { ...base, segments, endsExisting, removesExisting, action: "CREATE" as const, reason: null };
  });
}

/** Applies the plan; returns counts. */
export async function applyPolicy(tx: Tx, policy: PolicyRow): Promise<{ created: number; employees: number; already: number; skipped: number }> {
  const plan = await planPolicy(tx, policy);
  let created = 0, employees = 0;
  for (const r of plan.filter((p) => p.action === "CREATE")) {
    for (const x of r.endsExisting) await tx.leaveEntitlement.update({ where: { id: x.id }, data: { endDate: new Date(`${x.newEndDate}T00:00:00.000Z`) } });
    for (const x of r.removesExisting) await tx.leaveEntitlement.update({ where: { id: x.id }, data: { deletedAt: new Date() } });
    for (const s of r.segments) {
      await tx.leaveEntitlement.create({
        data: {
          tenantId: policy.tenantId, employeeId: r.employeeId, leaveTypeId: policy.leaveTypeId, policyId: policy.id,
          startDate: new Date(`${s.startDate}T00:00:00.000Z`), endDate: s.endDate ? new Date(`${s.endDate}T00:00:00.000Z`) : null,
          proRate: policy.proRate, accrualAmount: s.accrualAmount, accrualFrequency: policy.accrualFrequency,
        },
      });
      created++;
    }
    employees++;
  }
  return { created, employees, already: plan.filter((p) => p.action === "ALREADY").length, skipped: plan.filter((p) => p.action === "SKIP").length };
}
