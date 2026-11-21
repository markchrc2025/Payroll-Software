/**
 * Wave E2 (PAY-215): the leave year end, from the Leave Earning Policies.
 *
 * For each employee with an entitlement from a policy in the year, the days
 * left at year end (on file, less pending requests, which are held back) go:
 *   1. into the next year as carry-over, up to the policy's cap (no cap: all,
 *      unless the policy converts unused days to cash, then none);
 *   2. the rest into cash when the policy converts unused days, else they
 *      are forfeited.
 * Each step is a dated leave transaction (CARRYOVER on next year's balance,
 * CONVERSION or FORFEITURE on this year's) keyed by the year, so running it
 * twice changes nothing, and none edits an earlier one.
 *
 * Cash conversion lands as payroll adjustments on a draft run the user
 * picks: days times the daily rate on 31 December. Decision 8 (Mark, 21 Nov
 * 2026): for a vacation-leave policy, up to 10 converted days a year are de
 * minimis (non-taxable, RR 11-2018), the rest taxable; other leave is taxable.
 *
 * Expiry: carried days expire the given number of months after the year end
 * (at the end of that month). Days used in the new year come out of the
 * carried days first, so what expires is what was carried and not yet used.
 */
import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { multiply } from "@/lib/money";
import { deriveSalaryRates, effectiveDivisor } from "@/lib/payroll/rates";

type Tx = Prisma.TransactionClient;

export const DE_MINIMIS_LEAVE_DAYS = 10;
const YE = (y: number) => `YE-${y}`;
const EXP = (y: number) => `EXP-${y}`;
const d4 = (n: Decimal) => n.toFixed(4);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

export class YearEndRefusal extends Error {}

export type YearEndRow = {
  employeeId: string; employeeNumber: string; employeeName: string;
  policyId: string; policyName: string; leaveTypeId: string; leaveType: string;
  balanceId: string; entitlementId: string;
  available: string; heldBack: string; carry: string; convert: string; forfeit: string;
  cashCents: string; deMinimisCents: string; taxableCents: string;
  done: boolean;
};

export async function planYearEnd(tx: Tx, tenantId: string, year: number): Promise<YearEndRow[]> {
  const yStart = utc(year, 0, 1), yEnd = utc(year, 11, 31);
  const policies = await tx.leaveEarningPolicy.findMany({ where: { tenantId, deletedAt: null }, include: { leaveType: { select: { name: true } } }, orderBy: { name: "asc" } });
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { workingDaysDenominator: true } });
  const rows: YearEndRow[] = [];
  const vacationDays = new Map<string, Decimal>(); // de minimis days used per employee
  for (const p of policies) {
    const ents = await tx.leaveEntitlement.findMany({
      where: { tenantId, policyId: p.id, deletedAt: null, startDate: { lte: yEnd }, OR: [{ endDate: null }, { endDate: { gte: yStart } }] },
      orderBy: { startDate: "desc" },
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, workingDaysDenominator: true } } },
    });
    const byEmp = new Map<string, (typeof ents)[number]>();
    for (const e of ents) if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, e); // latest
    for (const [empId, ent] of byEmp) {
      const bal = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: empId, leaveTypeId: p.leaveTypeId, year } } });
      if (!bal) continue;
      const done = (await tx.leaveTransaction.count({ where: { tenantId, entitlementId: ent.id, periodKey: YE(year) } })) > 0;
      const onFile = new Decimal(bal.openingBalance.toString()).plus(bal.earned.toString()).minus(bal.used.toString()).minus(bal.forfeited.toString()).minus(bal.convertedToCash.toString());
      const pending = await tx.leaveTransaction.aggregate({ where: { leaveBalanceId: bal.id, type: "USAGE", approvalStatus: "PENDING" }, _sum: { paidUnits: true } });
      const held = new Decimal((pending._sum.paidUnits ?? 0).toString());
      const left = Decimal.max(0, onFile.minus(held));
      const cap = p.carryOverCap == null ? null : new Decimal(p.carryOverCap.toString());
      const carry = cap ? Decimal.min(left, cap) : p.convertUnusedToCash ? new Decimal(0) : left;
      const rest = left.minus(carry);
      const convert = p.convertUnusedToCash ? rest : new Decimal(0);
      const forfeit = p.convertUnusedToCash ? new Decimal(0) : rest;
      let cash = 0n, dm = 0n;
      if (convert.gt(0)) {
        const term = await tx.employmentTerm.findFirst({ where: { tenantId, employeeId: empId, basicSalaryCents: { not: null }, effectiveDate: { lte: yEnd } }, orderBy: { effectiveDate: "desc" }, select: { basicSalaryCents: true, salaryType: true } });
        if (!term?.basicSalaryCents || !term.salaryType) throw new YearEndRefusal(`${ent.employee.lastName}, ${ent.employee.firstName} has no salary on 31 December ${year}`);
        const daily = deriveSalaryRates({ basicSalaryCents: term.basicSalaryCents, salaryType: term.salaryType, divisor: effectiveDivisor(ent.employee.workingDaysDenominator, tenant.workingDaysDenominator), hoursPerDay: 8 }).dailyRateCents;
        cash = multiply(daily, convert.toNumber());
        if (p.vacationLeave) {
          const usedDm = vacationDays.get(empId) ?? new Decimal(0);
          const dmDays = Decimal.min(convert, Decimal.max(0, new Decimal(DE_MINIMIS_LEAVE_DAYS).minus(usedDm)));
          vacationDays.set(empId, usedDm.plus(dmDays));
          dm = dmDays.eq(convert) ? cash : multiply(daily, dmDays.toNumber());
        }
      }
      rows.push({
        employeeId: empId, employeeNumber: ent.employee.employeeNumber, employeeName: `${ent.employee.lastName}, ${ent.employee.firstName}`,
        policyId: p.id, policyName: p.name, leaveTypeId: p.leaveTypeId, leaveType: p.leaveType.name, balanceId: bal.id, entitlementId: ent.id,
        available: d4(onFile), heldBack: d4(held), carry: d4(carry), convert: d4(convert), forfeit: d4(forfeit),
        cashCents: cash.toString(), deMinimisCents: dm.toString(), taxableCents: (cash - dm).toString(), done,
      });
    }
  }
  return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.leaveType.localeCompare(b.leaveType));
}

export async function applyYearEnd(tx: Tx, tenantId: string, year: number, payrollRunId: string | null) {
  const rows = (await planYearEnd(tx, tenantId, year)).filter((r) => !r.done);
  const needsRun = rows.some((r) => BigInt(r.cashCents) > 0n);
  if (needsRun) {
    if (!payrollRunId) throw new YearEndRefusal("Choose the draft payroll run the converted leave is paid in");
    const run = await tx.payrollBook.findFirst({ where: { id: payrollRunId, tenantId }, select: { status: true, runType: true } });
    if (!run || run.status !== "DRAFT" || run.runType === "FINAL_PAY") throw new YearEndRefusal("The converted leave is paid in a draft regular, off-cycle or year-end run");
  }
  for (const r of rows) {
    const base = { tenantId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entitlementId: r.entitlementId, periodKey: YE(year), approvalStatus: "APPROVED" as const };
    if (new Decimal(r.convert).gt(0)) {
      await tx.leaveTransaction.create({ data: { ...base, leaveBalanceId: r.balanceId, type: "CONVERSION", amount: r.convert, reason: `Year-end ${year}: converted to cash` } });
      await tx.leaveBalance.update({ where: { id: r.balanceId }, data: { convertedToCash: { increment: r.convert } } });
    }
    if (new Decimal(r.forfeit).gt(0)) {
      await tx.leaveTransaction.create({ data: { ...base, leaveBalanceId: r.balanceId, type: "FORFEITURE", amount: r.forfeit, reason: `Year-end ${year}: over the carry-over cap` } });
      await tx.leaveBalance.update({ where: { id: r.balanceId }, data: { forfeited: { increment: r.forfeit } } });
    }
    // The next year's balance gets the carry-over (and a CARRYOVER row even
    // for zero days, which marks the year as done).
    const next = await tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: year + 1 } },
      create: { tenantId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: year + 1, openingBalance: r.carry },
      update: { openingBalance: { increment: r.carry } },
    });
    await tx.leaveTransaction.create({ data: { ...base, leaveBalanceId: next.id, type: "CARRYOVER", amount: r.carry, reason: `Carried over from ${year}` } });
    const dm = BigInt(r.deMinimisCents), taxable = BigInt(r.taxableCents);
    if (dm > 0n) await tx.payrollAdjustment.create({ data: { tenantId, employeeId: r.employeeId, payrollBookId: payrollRunId!, kind: "ADDITION", amountCents: dm, isTaxable: false, reason: `Unused ${r.leaveType} ${year} converted to cash: de minimis, up to ${DE_MINIMIS_LEAVE_DAYS} days (RR 11-2018)` } });
    if (taxable > 0n) await tx.payrollAdjustment.create({ data: { tenantId, employeeId: r.employeeId, payrollBookId: payrollRunId!, kind: "ADDITION", amountCents: taxable, isTaxable: true, reason: `Unused ${r.leaveType} ${year} converted to cash: taxable` } });
  }
  return { processed: rows.length, cashCents: rows.reduce((s, r) => s + BigInt(r.cashCents), 0n).toString() };
}

/** Expires carried days whose time is up as of `asOf`; returns how many rows expired. */
export async function expireCarried(tx: Tx, tenantId: string, asOf: Date) {
  const policies = await tx.leaveEarningPolicy.findMany({ where: { tenantId, deletedAt: null, expiresAfterMonths: { not: null } }, select: { id: true, expiresAfterMonths: true } });
  let expired = 0;
  for (const p of policies) {
    const carries = await tx.leaveTransaction.findMany({
      where: { tenantId, type: "CARRYOVER", entitlement: { policyId: p.id }, periodKey: { startsWith: "YE-" } },
    });
    for (const c of carries) {
      const year = Number(c.periodKey!.slice(3));
      const expiresOn = utc(year + 1, p.expiresAfterMonths!, 0); // last day of the month, N months after 31 December
      if (expiresOn > asOf) continue;
      if (await tx.leaveTransaction.count({ where: { tenantId, entitlementId: c.entitlementId, type: "FORFEITURE", periodKey: EXP(year) } })) continue;
      const b = await tx.leaveBalance.findUniqueOrThrow({ where: { id: c.leaveBalanceId } });
      const left = new Decimal(b.openingBalance.toString()).plus(b.earned.toString()).minus(b.used.toString()).minus(b.forfeited.toString()).minus(b.convertedToCash.toString());
      const amount = Decimal.max(0, Decimal.min(new Decimal(c.amount.toString()).minus(b.used.toString()), left));
      await tx.leaveTransaction.create({ data: { tenantId, employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, leaveBalanceId: b.id, entitlementId: c.entitlementId, periodKey: EXP(year), type: "FORFEITURE", amount: d4(amount), approvalStatus: "APPROVED", reason: `Days carried from ${year} expired` } });
      if (amount.gt(0)) await tx.leaveBalance.update({ where: { id: b.id }, data: { forfeited: { increment: d4(amount) } } });
      expired++;
    }
  }
  return { expired };
}
