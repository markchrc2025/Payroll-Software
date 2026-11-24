/**
 * PAY-219, Analytics stage 1 (Mark, 25 Nov 2026 00:15 and 01:11): drill-down
 * analytics. One engine for seven topics. Every topic answers at three levels:
 *
 *   company     one row per department (click a department)
 *   department  one row per employee in it (click an employee)
 *   employee    that employee's payslips or attendance days
 *
 * Page-wide filters: a period range (months), branch, department and
 * employment type. Pay figures come from FINALIZED payroll books whose period
 * ends in the range; attendance figures from DTR days in the range that were
 * not rejected; leave balances from the leave ledger for the year the range
 * ends in.
 *
 * Readings taken without a ruling (flagged to Mark): the branch, department
 * and employment type filters use each employee's CURRENT assignment, not the
 * one on the day of each payslip; a separation date is the offboarding case's
 * last working day, else the resignation date, else (for a separated status)
 * the end-of-contract date.
 */
import type { Prisma } from "@prisma/client";
import { EmploymentType } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";

export const TOPICS = ["payroll", "statutory", "overtime", "attendance", "leave", "headcount", "thirteenth"] as const;
export type Topic = (typeof TOPICS)[number];

export type ColumnKind = "money" | "count" | "days" | "minutes" | "pct";
export type Column = { key: string; label: string; kind: ColumnKind };
/** Money is centavos as a string; minutes, counts and days are numbers; pct is a number (12.5 = 12.5%) or null. */
export type Value = string | number | null;

export type DrillFilters = {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  branchId?: string | null;
  departmentId?: string | null; // "none" = employees with no department
  employmentType?: EmploymentType | null;
  employeeId?: string | null;
};

export type DrillRow = { id: string; name: string; sub?: string; values: Record<string, Value> };
export type DetailRow = { id: string; label: string; sub?: string; href?: string; values: Record<string, Value> };

export type DrillResult = {
  topic: Topic;
  level: "company" | "department" | "employee";
  window: { start: string; end: string };
  columns: Column[];
  totals: Record<string, Value>;
  rows: DrillRow[];
  detail?: { kind: "payslips" | "days" | "facts" | "balances"; columns: Column[]; rows: DetailRow[] };
  /** Extra detail, used by leave: the employee's balances per leave type. */
  detail2?: { kind: "balances"; columns: Column[]; rows: DetailRow[] };
  /** Topics that show pay per employee need PAYROLL READ below the company level. */
  payTopic: boolean;
};

export class DrillRefusal extends Error {}

export const PAY_TOPICS: readonly Topic[] = ["payroll", "statutory", "thirteenth"];

export const TOPIC_LABELS: Record<Topic, string> = {
  payroll: "Payroll cost",
  statutory: "Contributions and tax",
  overtime: "Overtime",
  attendance: "Lates, absences and undertime",
  leave: "Leave",
  headcount: "Hires and separations",
  thirteenth: "13th month accrual",
};

const COLUMNS: Record<Topic, Column[]> = {
  payroll: [
    { key: "gross", label: "Gross pay", kind: "money" },
    { key: "employerShare", label: "Employer share", kind: "money" },
    { key: "totalCost", label: "Total cost", kind: "money" },
    { key: "net", label: "Net pay", kind: "money" },
    { key: "paid", label: "Paid employees", kind: "count" },
    { key: "costPerHead", label: "Cost per head", kind: "money" },
  ],
  statutory: [
    { key: "sssEe", label: "SSS employee", kind: "money" },
    { key: "sssEr", label: "SSS employer (with EC)", kind: "money" },
    { key: "phEe", label: "PhilHealth employee", kind: "money" },
    { key: "phEr", label: "PhilHealth employer", kind: "money" },
    { key: "piEe", label: "Pag-IBIG employee", kind: "money" },
    { key: "piEr", label: "Pag-IBIG employer", kind: "money" },
    { key: "wht", label: "Withholding tax", kind: "money" },
    { key: "total", label: "Total remitted", kind: "money" },
  ],
  overtime: [
    { key: "otMinutes", label: "OT hours", kind: "minutes" },
    { key: "otDays", label: "Days with OT", kind: "days" },
    { key: "otPay", label: "OT pay", kind: "money" },
  ],
  attendance: [
    { key: "lateMinutes", label: "Late", kind: "minutes" },
    { key: "undertimeMinutes", label: "Undertime", kind: "minutes" },
    { key: "absentDays", label: "Absences", kind: "days" },
    { key: "missingPunchDays", label: "Missing punches", kind: "days" },
    { key: "presentDays", label: "Days worked", kind: "days" },
  ],
  leave: [
    { key: "paidLeaveDays", label: "Paid leave days", kind: "days" },
    { key: "unpaidLeaveDays", label: "Unpaid leave days", kind: "days" },
    { key: "balanceDays", label: "Balance left", kind: "days" },
  ],
  headcount: [
    { key: "startActive", label: "Headcount at start", kind: "count" },
    { key: "hires", label: "Hires", kind: "count" },
    { key: "separations", label: "Separations", kind: "count" },
    { key: "endActive", label: "Headcount at end", kind: "count" },
    { key: "turnoverPct", label: "Turnover", kind: "pct" },
  ],
  thirteenth: [
    { key: "basis", label: "13th month basis", kind: "money" },
    { key: "accrual", label: "Accrued 13th month", kind: "money" },
  ],
};

/** Per-employee raw sums; the derived columns are worked out after rolling up. */
type Raw = Record<string, bigint | number>;
const ZERO: Record<Topic, Raw> = {
  payroll: { gross: 0n, employerShare: 0n, net: 0n, paid: 0 },
  statutory: { sssEe: 0n, sssEr: 0n, phEe: 0n, phEr: 0n, piEe: 0n, piEr: 0n, wht: 0n },
  overtime: { otMinutes: 0, otDays: 0, otPay: 0n },
  attendance: { lateMinutes: 0, undertimeMinutes: 0, absentDays: 0, missingPunchDays: 0, presentDays: 0 },
  leave: { paidLeaveDays: 0, unpaidLeaveDays: 0, balanceDays: 0 },
  headcount: { startActive: 0, hires: 0, separations: 0, endActive: 0 },
  thirteenth: { basis: 0n, accrual: 0n },
};

function add(a: Raw, b: Raw): Raw {
  const out: Raw = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k] ?? (typeof v === "bigint" ? 0n : 0);
    out[k] = typeof v === "bigint" ? (cur as bigint) + v : Math.round(((cur as number) + v) * 10000) / 10000;
  }
  return out;
}

function derive(topic: Topic, raw: Raw): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const [k, x] of Object.entries(raw)) v[k] = typeof x === "bigint" ? x.toString() : x;
  if (topic === "payroll") {
    const total = (raw.gross as bigint) + (raw.employerShare as bigint);
    v.totalCost = total.toString();
    const paid = raw.paid as number;
    v.costPerHead = paid > 0 ? (total / BigInt(paid)).toString() : null;
  }
  if (topic === "statutory") {
    const keys = ["sssEe", "sssEr", "phEe", "phEr", "piEe", "piEr", "wht"];
    v.total = keys.reduce((s, k) => s + (raw[k] as bigint), 0n).toString();
  }
  if (topic === "headcount") {
    const avg = ((raw.startActive as number) + (raw.endActive as number)) / 2;
    v.turnoverPct = avg > 0 ? Math.round(((raw.separations as number) / avg) * 1000) / 10 : null;
  }
  return v;
}

// ---- dates ----

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export function windowOf(from: string, to: string): { start: Date; end: Date } {
  const a = MONTH.exec(from);
  const b = MONTH.exec(to);
  if (!a || !b) throw new DrillRefusal("from and to must be months written as YYYY-MM");
  const start = new Date(Date.UTC(Number(a[1]), Number(a[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(b[1]), Number(b[2]), 0, 23, 59, 59, 999));
  if (end < start) throw new DrillRefusal("The period ends before it starts");
  const months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2])) + 1;
  if (months > 36) throw new DrillRefusal("Pick a period of 36 months or less");
  return { start, end };
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ---- employees in scope ----

type Emp = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  department: { name: string } | null;
  position: { title: string } | null;
  employmentStatus: string;
  hireDate: Date;
  resignationDate: Date | null;
  endOfContractDate: Date | null;
};

const SEPARATED = new Set(["RESIGNED", "TERMINATED", "RETIRED"]);

function employeeWhere(tenantId: string, f: DrillFilters): Prisma.EmployeeWhereInput {
  const w: Prisma.EmployeeWhereInput = { tenantId };
  if (f.branchId) w.branchId = f.branchId;
  if (f.departmentId) w.departmentId = f.departmentId === "none" ? null : f.departmentId;
  if (f.employmentType) w.employmentType = f.employmentType;
  if (f.employeeId) w.id = f.employeeId;
  return w;
}

const fullName = (e: Pick<Emp, "firstName" | "lastName">) => `${e.lastName}, ${e.firstName}`;

// ---- the engine ----

export async function drill(tenantId: string, topic: Topic, f: DrillFilters): Promise<DrillResult> {
  if (!TOPICS.includes(topic)) throw new DrillRefusal(`Unknown topic ${String(topic)}`);
  if (f.employmentType && !Object.values(EmploymentType).includes(f.employmentType))
    throw new DrillRefusal("Unknown employment type");
  const { start, end } = windowOf(f.from, f.to);
  const level: DrillResult["level"] = f.employeeId ? "employee" : f.departmentId ? "department" : "company";

  return withTenant(tenantId, async (tx) => {
    const emps = (await tx.employee.findMany({
      where: employeeWhere(tenantId, f),
      select: {
        id: true, employeeNumber: true, firstName: true, lastName: true, departmentId: true,
        department: { select: { name: true } }, position: { select: { title: true } },
        employmentStatus: true, hireDate: true, resignationDate: true, endOfContractDate: true,
      },
    })) as Emp[];
    if (f.employeeId && emps.length === 0) throw new DrillRefusal("No such employee in these filters");
    const ids = emps.map((e) => e.id);

    const perEmp = new Map<string, Raw>(ids.map((id) => [id, { ...ZERO[topic] }]));
    const bump = (id: string, r: Raw) => perEmp.set(id, add(perEmp.get(id) ?? { ...ZERO[topic] }, r));

    const result: DrillResult = {
      topic, level, window: { start: ymd(start), end: ymd(end) },
      columns: COLUMNS[topic], totals: {}, rows: [], payTopic: PAY_TOPICS.includes(topic),
    };

    if (topic === "payroll" || topic === "statutory" || topic === "thirteenth" || topic === "overtime") {
      const sheets = ids.length === 0 ? [] : await tx.payrollSheet.findMany({
        where: { tenantId, employeeId: { in: ids }, payrollBook: { status: "FINALIZED", periodEnd: { gte: start, lte: end } } },
        select: {
          id: true, employeeId: true, grossCompensationCents: true, netPayCents: true, withholdingTaxCents: true,
          sssEeCents: true, sssErCents: true, sssEcCents: true, philhealthEeCents: true, philhealthErCents: true,
          pagibigEeCents: true, pagibigErCents: true, otPayCents: true,
          thirteenthAccrualBasisCents: true, thirteenthAccrualCents: true,
          payrollBook: { select: { id: true, periodStart: true, periodEnd: true, runType: true, payDate: true } },
        },
        orderBy: { payrollBook: { periodEnd: "asc" } },
      });
      const paidSeen = new Set<string>();
      const sheetRaw = (s: (typeof sheets)[number]): Raw => {
        if (topic === "payroll") {
          const er = s.sssErCents + s.sssEcCents + s.philhealthErCents + s.pagibigErCents;
          const first = !paidSeen.has(s.employeeId);
          paidSeen.add(s.employeeId);
          return { gross: s.grossCompensationCents, employerShare: er, net: s.netPayCents, paid: first ? 1 : 0 };
        }
        if (topic === "statutory") return {
          sssEe: s.sssEeCents, sssEr: s.sssErCents + s.sssEcCents, phEe: s.philhealthEeCents, phEr: s.philhealthErCents,
          piEe: s.pagibigEeCents, piEr: s.pagibigErCents, wht: s.withholdingTaxCents,
        };
        if (topic === "thirteenth") return { basis: s.thirteenthAccrualBasisCents ?? 0n, accrual: s.thirteenthAccrualCents ?? 0n };
        return { otPay: s.otPayCents };
      };
      for (const s of sheets) bump(s.employeeId, sheetRaw(s));
      if (level === "employee" && topic !== "overtime") {
        paidSeen.clear();
        result.detail = {
          kind: "payslips",
          columns: COLUMNS[topic].filter((c) => !["paid", "costPerHead"].includes(c.key)),
          rows: sheets.map((s) => {
            const b = s.payrollBook;
            const r = sheetRaw(s);
            const values = derive(topic, r);
            return {
              id: s.id,
              label: `${ymd(b.periodStart)} to ${ymd(b.periodEnd)}`,
              sub: `${b.runType.replace("_", " ").toLowerCase()}${b.payDate ? `, paid ${ymd(b.payDate)}` : ""}`,
              href: `/payroll/${b.id}`,
              values,
            };
          }),
        };
      }
    }

    if (topic === "overtime" || topic === "attendance" || topic === "leave") {
      const days = ids.length === 0 ? [] : await tx.dTRRecord.findMany({
        where: { tenantId, employeeId: { in: ids }, date: { gte: start, lte: end }, approvalStatus: { not: "REJECTED" } },
        select: {
          id: true, employeeId: true, date: true, dayStatus: true, workedMinutes: true, lateMinutes: true,
          undertimeMinutes: true, otMinutes: true, hasMissingPunch: true, approvalStatus: true,
        },
        orderBy: { date: "asc" },
      });
      const dayRaw = (d: (typeof days)[number]): Raw => {
        if (topic === "overtime") return { otMinutes: d.otMinutes, otDays: d.otMinutes > 0 ? 1 : 0 };
        if (topic === "attendance") return {
          lateMinutes: d.lateMinutes, undertimeMinutes: d.undertimeMinutes,
          absentDays: d.dayStatus === "ABSENT" ? 1 : 0, missingPunchDays: d.hasMissingPunch ? 1 : 0,
          presentDays: d.dayStatus === "PRESENT" ? 1 : 0,
        };
        return { paidLeaveDays: d.dayStatus === "PAID_LEAVE" ? 1 : 0, unpaidLeaveDays: d.dayStatus === "UNPAID_LEAVE" ? 1 : 0 };
      };
      const shows = (d: (typeof days)[number]) =>
        topic === "overtime" ? d.otMinutes > 0
          : topic === "attendance" ? d.lateMinutes > 0 || d.undertimeMinutes > 0 || d.dayStatus === "ABSENT" || d.hasMissingPunch
            : d.dayStatus === "PAID_LEAVE" || d.dayStatus === "UNPAID_LEAVE";
      for (const d of days) bump(d.employeeId, dayRaw(d));
      if (level === "employee") {
        result.detail = {
          kind: "days",
          columns: [
            { key: "workedMinutes", label: "Worked", kind: "minutes" },
            ...(topic === "overtime" ? [{ key: "otMinutes", label: "OT", kind: "minutes" as const }] : []),
            ...(topic === "attendance" ? [
              { key: "lateMinutes", label: "Late", kind: "minutes" as const },
              { key: "undertimeMinutes", label: "Undertime", kind: "minutes" as const },
            ] : []),
          ],
          rows: days.filter(shows).map((d) => ({
            id: d.id,
            label: ymd(d.date),
            sub: `${d.dayStatus.replace("_", " ").toLowerCase()}${d.hasMissingPunch ? ", missing punch" : ""}${d.approvalStatus === "PENDING" ? ", not yet approved" : ""}`,
            values: { workedMinutes: d.workedMinutes, otMinutes: d.otMinutes, lateMinutes: d.lateMinutes, undertimeMinutes: d.undertimeMinutes },
          })),
        };
      }
    }

    if (topic === "leave") {
      const balances = ids.length === 0 ? [] : await tx.leaveBalance.findMany({
        where: { tenantId, employeeId: { in: ids }, year: end.getUTCFullYear() },
        select: { id: true, employeeId: true, openingBalance: true, earned: true, used: true, forfeited: true, convertedToCash: true, leaveType: { select: { name: true } } },
      });
      const left = (b: (typeof balances)[number]) =>
        Math.round((Number(b.openingBalance) + Number(b.earned) - Number(b.used) - Number(b.forfeited) - Number(b.convertedToCash)) * 100) / 100;
      for (const b of balances) bump(b.employeeId, { balanceDays: left(b) });
      if (level === "employee") {
        result.detail2 = {
          kind: "balances",
          columns: [
            { key: "earned", label: "Opening and earned", kind: "days" },
            { key: "used", label: "Used", kind: "days" },
            { key: "left", label: "Left", kind: "days" },
          ],
          rows: balances.map((b) => ({
            id: b.id, label: b.leaveType.name, sub: `${end.getUTCFullYear()}`,
            values: { earned: Number(b.openingBalance) + Number(b.earned), used: Number(b.used), left: left(b) },
          })),
        };
      }
    }

    if (topic === "headcount") {
      const cases = ids.length === 0 ? [] : await tx.offboardingCase.findMany({
        where: { tenantId, employeeId: { in: ids } },
        select: { employeeId: true, lastWorkingDay: true },
        orderBy: { lastWorkingDay: "desc" },
      });
      const lastDay = new Map<string, Date>();
      for (const c of cases) if (!lastDay.has(c.employeeId)) lastDay.set(c.employeeId, c.lastWorkingDay);
      const dayBefore = new Date(start.getTime() - 1);
      for (const e of emps) {
        const sep = separationDate(e, lastDay.get(e.id) ?? null);
        const activeOn = (d: Date) => (e.hireDate <= d && (!sep || sep >= d) ? 1 : 0);
        bump(e.id, {
          startActive: activeOn(dayBefore),
          hires: e.hireDate >= start && e.hireDate <= end ? 1 : 0,
          separations: sep && sep >= start && sep <= end ? 1 : 0,
          endActive: activeOn(end),
        });
        if (level === "employee") {
          result.detail = {
            kind: "facts",
            columns: [],
            rows: [
              { id: "hired", label: "Hired", sub: ymd(e.hireDate), values: {} },
              { id: "status", label: "Status", sub: e.employmentStatus.replace("_", " ").toLowerCase(), values: {} },
              ...(sep ? [{ id: "separated", label: "Separated", sub: ymd(sep), values: {} }] : []),
            ],
          };
        }
      }
    }

    // ---- roll up ----
    const total = [...perEmp.values()].reduce((a, r) => add(a, r), { ...ZERO[topic] });
    result.totals = derive(topic, total);

    if (level === "company") {
      const groups = new Map<string, { name: string; raw: Raw; n: number }>();
      for (const e of emps) {
        const key = e.departmentId ?? "none";
        const g = groups.get(key) ?? { name: e.department?.name ?? "No department", raw: { ...ZERO[topic] }, n: 0 };
        g.raw = add(g.raw, perEmp.get(e.id)!);
        g.n += 1;
        groups.set(key, g);
      }
      result.rows = [...groups.entries()]
        .map(([id, g]) => ({ id, name: g.name, sub: `${g.n} employee${g.n === 1 ? "" : "s"}`, values: derive(topic, g.raw) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.rows = emps
        .map((e) => ({ id: e.id, name: fullName(e), sub: [e.employeeNumber, e.position?.title].filter(Boolean).join(", "), values: derive(topic, perEmp.get(e.id)!) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }) as Promise<DrillResult>;
}

export function separationDate(e: Pick<Emp, "employmentStatus" | "resignationDate" | "endOfContractDate">, lastWorkingDay: Date | null): Date | null {
  if (lastWorkingDay) return lastWorkingDay;
  if (e.resignationDate) return e.resignationDate;
  if (SEPARATED.has(e.employmentStatus) && e.endOfContractDate) return e.endOfContractDate;
  return null;
}

/** For a caller without PAYROLL READ: pay topics stop at the company (department) level. */
export function payDetailHidden(topic: Topic, f: DrillFilters, mayReadPay: boolean): boolean {
  return PAY_TOPICS.includes(topic) && !mayReadPay && !!(f.departmentId || f.employeeId);
}

