/**
 * JSON serializers for Phase D2 payroll entities. Converts BigInt centavos to
 * strings and `Decimal` time fields to strings (Prisma already does this, but
 * we re-export the type for callers).
 */
import type {
  EmployeePayComponent,
  LeaveBalance,
  LeaveTransaction,
  LeaveType,
  Loan,
  PayComponent,
  PayrollAdjustment,
  PayrollBook,
  PayrollSheet,
  PeriodInput,
} from "@prisma/client";
import { centavosToJson } from "@/lib/money";

export function serializePayComponent<T extends PayComponent>(c: T) {
  return { ...c };
}

export function serializeEmployeePayComponent<T extends EmployeePayComponent>(
  a: T,
) {
  return {
    ...a,
    amountCents: centavosToJson(a.amountCents)!,
  };
}

export function serializePeriodInput<T extends PeriodInput>(p: T) {
  return {
    ...p,
    daysWorked: p.daysWorked.toString(),
    regularOtHours: p.regularOtHours.toString(),
    restDayHours: p.restDayHours.toString(),
    specialHolidayHours: p.specialHolidayHours.toString(),
    regularHolidayHours: p.regularHolidayHours.toString(),
    nightDiffHours: p.nightDiffHours.toString(),
    hazardHours: p.hazardHours.toString(),
    unpaidLeaveDays: p.unpaidLeaveDays.toString(),
  };
}

export function serializeLoan<T extends Loan>(l: T) {
  return {
    ...l,
    principalCents: centavosToJson(l.principalCents)!,
    installmentCents: centavosToJson(l.installmentCents)!,
    balanceCents: centavosToJson(l.balanceCents)!,
  };
}

// ---------------------------------------------------------------------------
// Phase D3 — PayrollBook + PayrollSheet
// ---------------------------------------------------------------------------

export function serializePayrollBook<T extends PayrollBook & { sheets?: PayrollSheet[] }>(
  b: T,
) {
  const { sheets, ...rest } = b;
  return {
    ...rest,
    ...(sheets ? { sheets: sheets.map(serializePayrollSheet) } : {}),
  };
}

export function serializePayrollSheet<T extends PayrollSheet>(s: T) {
  return {
    ...s,
    basicSalaryCentsSnapshot: centavosToJson(s.basicSalaryCentsSnapshot)!,
    basePayCents: centavosToJson(s.basePayCents)!,
    lateUndertimeDeductionCents: centavosToJson(s.lateUndertimeDeductionCents)!,
    otPayCents: centavosToJson(s.otPayCents)!,
    nsdPayCents: centavosToJson(s.nsdPayCents)!,
    holidayPayCents: centavosToJson(s.holidayPayCents)!,
    restDayPayCents: centavosToJson(s.restDayPayCents)!,
    hazardPayCents: centavosToJson(s.hazardPayCents)!,
    taxableAllowancesCents: centavosToJson(s.taxableAllowancesCents)!,
    grossCompensationCents: centavosToJson(s.grossCompensationCents)!,
    mweExemptCompensationCents: centavosToJson(s.mweExemptCompensationCents)!,
    nontaxableBasicCents: centavosToJson(s.nontaxableBasicCents)!,
    nontaxableCompensationCents: centavosToJson(s.nontaxableCompensationCents)!,
    nontaxable13MonthAndBenefitsCents: centavosToJson(s.nontaxable13MonthAndBenefitsCents)!,
    grossTaxableIncomeCents: centavosToJson(s.grossTaxableIncomeCents)!,
    sssEeCents: centavosToJson(s.sssEeCents)!,
    sssErCents: centavosToJson(s.sssErCents)!,
    sssEcCents: centavosToJson(s.sssEcCents)!,
    philhealthEeCents: centavosToJson(s.philhealthEeCents)!,
    philhealthErCents: centavosToJson(s.philhealthErCents)!,
    pagibigEeCents: centavosToJson(s.pagibigEeCents)!,
    pagibigErCents: centavosToJson(s.pagibigErCents)!,
    withholdingTaxCents: centavosToJson(s.withholdingTaxCents)!,
    nontaxableAdditionsCents: centavosToJson(s.nontaxableAdditionsCents)!,
    loanDeductionsCents: centavosToJson(s.loanDeductionsCents)!,
    loanDeferredCents: centavosToJson(s.loanDeferredCents)!,
    adjustmentDeductionsCents: centavosToJson(s.adjustmentDeductionsCents)!,
    netPayCents: centavosToJson(s.netPayCents)!,
  };
}

export function serializePayrollAdjustment<T extends PayrollAdjustment>(a: T) {
  return {
    ...a,
    amountCents: centavosToJson(a.amountCents)!,
  };
}

// ---------------------------------------------------------------------------
// Phase G — Leave Management
// ---------------------------------------------------------------------------

export function serializeLeaveType<T extends LeaveType>(lt: T) {
  return {
    ...lt,
    accrualAmount: lt.accrualAmount.toString(),
    maxAccruableBalance: lt.maxAccruableBalance?.toString() ?? null,
    carryOverLimit: lt.carryOverLimit?.toString() ?? null,
  };
}

export function serializeLeaveBalance<T extends LeaveBalance>(lb: T) {
  return {
    ...lb,
    openingBalance: lb.openingBalance.toString(),
    earned: lb.earned.toString(),
    used: lb.used.toString(),
    forfeited: lb.forfeited.toString(),
    convertedToCash: lb.convertedToCash.toString(),
  };
}

export function serializeLeaveTransaction<T extends LeaveTransaction>(lt: T) {
  return {
    ...lt,
    amount: lt.amount.toString(),
    paidUnits: lt.paidUnits.toString(),
    unpaidUnits: lt.unpaidUnits.toString(),
  };
}

// ---------------------------------------------------------------------------
// Phase J — DTR / Timesheet
// ---------------------------------------------------------------------------

export function serializeShiftSchedule<T extends { workDays: unknown }>(s: T) {
  return s; // workDays is JSON — no BigInt fields to convert
}

export function serializeShiftAssignment<T>(a: T) {
  return a;
}

export function serializeDtrRecord<T>(r: T) {
  return r; // No BigInt fields in DTRRecord
}

// ---------------------------------------------------------------------------
// Phase K — Expense Claims
// ---------------------------------------------------------------------------

export function serializeExpenseClaim<
  T extends { amountCents: bigint },
>(c: T) {
  return {
    ...c,
    amountCents: c.amountCents.toString(),
  };
}
