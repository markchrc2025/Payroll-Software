/**
 * Wave E3 (PAY-215, decision 9, Mark 21 Nov 2026: Leave Schedule is company
 * shutdowns plus blackout dates) and the Leave Planner.
 *
 * Shutdown: the company closes on given dates (for example 26 to 31
 * December) and files leave for everyone in the chosen departments (all when
 * none is chosen), charged to the chosen leave type (an unpaid type for
 * unpaid days). Each employee's working days in the range are counted from
 * their work schedule (Monday to Friday when none) less holidays. The leave
 * is filed approved, debited and written to the DTR like any approved leave;
 * an employee already on leave on any of those dates is skipped. Applying
 * twice changes nothing.
 *
 * Blackout: dates when leave is not taken. BLOCK refuses a request that
 * touches them (ESS filing); FLAG lets it through and the approver sees it as
 * an exception in Leave Review.
 *
 * Planner: approved and pending leave per day by department, with a warning
 * on any day more people are off than the department allows (maxOnLeave).
 */
import type { Prisma } from "@prisma/client";
import { expandHolidays } from "@/lib/holidays/recurrence";
import { holidayAppliesToBranch } from "@/lib/holidays/scope";
import { finalizeLeaveApproval } from "./apply-to-dtr";
import { resolveOrCreateBalance, splitLeaveUnits } from "./filing";

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const SCHED_KEY = (id: string) => `SCHED-${id}`;

export class ScheduleRefusal extends Error {}

/** The employee's working days in [from, to]: their schedule's weekdays less holidays. */
export async function workingDays(tx: Tx, tenantId: string, emp: { id: string; branchId: string | null }, from: Date, to: Date): Promise<string[]> {
  const a = await tx.employeeShiftAssignment.findFirst({
    where: { tenantId, employeeId: emp.id, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
    orderBy: { effectiveFrom: "desc" }, include: { shiftSchedule: { select: { workDays: true } } },
  });
  const days = Array.isArray(a?.shiftSchedule?.workDays) ? (a!.shiftSchedule!.workDays as string[]) : ["MON", "TUE", "WED", "THU", "FRI"];
  const masters = await tx.holiday.findMany({
    where: { tenantId, deletedAt: null, OR: [{ recurringAnnually: true }, { date: { gte: from, lte: to } }] },
    select: { date: true, recurringAnnually: true, skippedDates: true, scope: true, branchIds: true },
  });
  const hol = new Set(expandHolidays(masters, from, to).filter((h) => holidayAppliesToBranch(h, emp.branchId)).map((h) => ymd(h.date)));
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    if (days.includes(WD[d.getUTCDay()]!) && !hol.has(ymd(d))) out.push(ymd(d));
  }
  return out;
}

type Schedule = { id: string; tenantId: string; kind: string; name: string; startDate: Date; endDate: Date; departmentIds: Prisma.JsonValue; leaveTypeId: string | null; blackoutMode: string | null };
const depts = (s: Schedule) => (Array.isArray(s.departmentIds) ? (s.departmentIds as string[]) : []);

export type ShutdownRow = { employeeId: string; employeeNumber: string; employeeName: string; days: string[]; action: "FILE" | "ALREADY" | "SKIP"; reason: string | null };

export async function planShutdown(tx: Tx, s: Schedule): Promise<ShutdownRow[]> {
  if (s.kind !== "SHUTDOWN" || !s.leaveTypeId) throw new ScheduleRefusal("Only a shutdown with a leave type files leave");
  const ids = depts(s);
  const employees = await tx.employee.findMany({
    where: { tenantId: s.tenantId, deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] }, hireDate: { lte: s.endDate }, ...(ids.length ? { departmentId: { in: ids } } : {}) },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, branchId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const rows: ShutdownRow[] = [];
  for (const e of employees) {
    const base = { employeeId: e.id, employeeNumber: e.employeeNumber, employeeName: `${e.lastName}, ${e.firstName}` };
    if (await tx.leaveTransaction.count({ where: { tenantId: s.tenantId, employeeId: e.id, periodKey: SCHED_KEY(s.id) } })) { rows.push({ ...base, days: [], action: "ALREADY", reason: null }); continue; }
    const overlap = await tx.leaveTransaction.count({ where: { tenantId: s.tenantId, employeeId: e.id, type: "USAGE", approvalStatus: { in: ["APPROVED", "PENDING"] }, startDate: { lte: s.endDate }, endDate: { gte: s.startDate } } });
    const days = await workingDays(tx, s.tenantId, e, s.startDate, s.endDate);
    if (overlap) rows.push({ ...base, days, action: "SKIP", reason: "Already on leave on some of these dates" });
    else if (!days.length) rows.push({ ...base, days, action: "SKIP", reason: "No working days in the shutdown" });
    else rows.push({ ...base, days, action: "FILE", reason: null });
  }
  return rows;
}

export async function applyShutdown(tx: Tx, s: Schedule, actorUserId: string | null) {
  const plan = await planShutdown(tx, s);
  const lt = await tx.leaveType.findFirstOrThrow({ where: { id: s.leaveTypeId!, tenantId: s.tenantId } });
  let filed = 0;
  for (const r of plan.filter((p) => p.action === "FILE")) {
    const amount = r.days.length;
    const bal = await resolveOrCreateBalance(tx, s.tenantId, r.employeeId, lt.id, s.startDate.getUTCFullYear());
    const { paidUnits, unpaidUnits } = lt.isPaid ? splitLeaveUnits(bal.available, amount) : { paidUnits: 0, unpaidUnits: amount };
    const t = await tx.leaveTransaction.create({
      data: {
        tenantId: s.tenantId, employeeId: r.employeeId, leaveTypeId: lt.id, leaveBalanceId: bal.id, type: "USAGE", amount, paidUnits, unpaidUnits,
        startDate: s.startDate, endDate: s.endDate, reason: `Company shutdown: ${s.name}`, approvalStatus: "APPROVED",
        approvedByUserId: actorUserId, approvedAt: new Date(), periodKey: SCHED_KEY(s.id),
      },
    });
    await finalizeLeaveApproval(tx, t.id);
    filed++;
  }
  await tx.leaveSchedule.update({ where: { id: s.id }, data: { appliedAt: new Date() } });
  return { filed, already: plan.filter((p) => p.action === "ALREADY").length, skipped: plan.filter((p) => p.action === "SKIP").length };
}

/** The blackout that a request from `start` to `end` touches, for this employee's department. */
export async function blackoutFor(tx: Tx, tenantId: string, employeeId: string, start: Date, end: Date) {
  const e = await tx.employee.findFirst({ where: { id: employeeId, tenantId }, select: { departmentId: true } });
  const hits = await tx.leaveSchedule.findMany({ where: { tenantId, kind: "BLACKOUT", deletedAt: null, startDate: { lte: end }, endDate: { gte: start } }, orderBy: { startDate: "asc" } });
  return hits.find((h) => !depts(h).length || (e?.departmentId && depts(h).includes(e.departmentId))) ?? null;
}

export type PlannerDay = { date: string; off: { employeeId: string; name: string; status: string; leaveType: string }[]; over: boolean };
export type PlannerDept = { departmentId: string | null; department: string; maxOnLeave: number | null; days: PlannerDay[] };

/** Leave per day and department in [from, to] (at most 62 days). */
export async function planner(tx: Tx, tenantId: string, from: Date, to: Date, departmentId?: string | null): Promise<PlannerDept[]> {
  const leave = await tx.leaveTransaction.findMany({
    where: { tenantId, type: "USAGE", approvalStatus: { in: ["APPROVED", "PENDING"] }, startDate: { lte: to }, endDate: { gte: from }, ...(departmentId ? { employee: { departmentId } } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, departmentId: true, department: { select: { name: true, maxOnLeave: true } } } }, leaveType: { select: { name: true } } },
  });
  const byDept = new Map<string, PlannerDept>();
  for (const l of leave) {
    const k = l.employee.departmentId ?? "";
    let d = byDept.get(k);
    if (!d) {
      d = { departmentId: l.employee.departmentId, department: l.employee.department?.name ?? "No department", maxOnLeave: l.employee.department?.maxOnLeave ?? null, days: [] };
      for (let t = from.getTime(); t <= to.getTime(); t += DAY) d.days.push({ date: ymd(new Date(t)), off: [], over: false });
      byDept.set(k, d);
    }
    for (const day of d.days) {
      if (day.date < ymd(l.startDate!) || day.date > ymd(l.endDate ?? l.startDate!)) continue;
      if (day.off.some((o) => o.employeeId === l.employeeId)) continue;
      day.off.push({ employeeId: l.employeeId, name: `${l.employee.firstName} ${l.employee.lastName}`, status: l.approvalStatus, leaveType: l.leaveType.name });
    }
  }
  for (const d of byDept.values()) for (const day of d.days) day.over = d.maxOnLeave != null && day.off.length > d.maxOnLeave;
  return [...byDept.values()].sort((a, b) => a.department.localeCompare(b.department));
}
