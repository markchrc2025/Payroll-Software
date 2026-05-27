/**
 * JSON serializers for Phase D2 payroll entities. Converts BigInt centavos to
 * strings and `Decimal` time fields to strings (Prisma already does this, but
 * we re-export the type for callers).
 */
import type {
  EmployeePayComponent,
  Loan,
  PayComponent,
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
