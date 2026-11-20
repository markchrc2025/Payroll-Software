/**
 * PAY-71: what the BIR forms read besides the payslips: the withholding
 * agent (the company), each employee's TIN and Part I details, and the BIR
 * and minimum wage tables in force.
 *
 * TINs are stored encrypted; they are decrypted here, for the people allowed
 * to open the BIR reports (REPORTS:READ), and nowhere logged.
 */
import type { Prisma } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { getActiveRule } from "@/lib/statutory/resolver";
import { annualTaxDueCents } from "@/lib/payroll/annual-tax";
import type { BirWithholdingAgent } from "./bir-1601c";
import type { Bir2316Person } from "./bir-2316";

type Tx = Prisma.TransactionClient;

const safeDecrypt = (v: string | null | undefined): string | null => {
  try {
    return decrypt(v);
  } catch {
    return null;
  }
};

const joined = (...parts: (string | null | undefined)[]) => {
  const text = parts.map((p) => p?.trim()).filter(Boolean).join(", ");
  return text === "" ? null : text;
};

export async function loadWithholdingAgent(tx: Tx, tenantId: string): Promise<BirWithholdingAgent> {
  const t = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      name: true, tinNumber: true, address: true, city: true, province: true,
      zipCode: true, contactPhone: true, contactEmail: true,
    },
  });
  return {
    tin: safeDecrypt(t.tinNumber),
    rdoCode: null,
    name: t.name,
    address: joined(t.address, t.city, t.province),
    zipCode: t.zipCode,
    contactNumber: t.contactPhone,
    email: t.contactEmail,
  };
}

export async function loadEmployeeTins(tx: Tx, tenantId: string, employeeIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (employeeIds.length === 0) return out;
  const rows = await tx.statutoryId.findMany({
    where: { tenantId, type: "TIN", employeeId: { in: employeeIds } },
    select: { employeeId: true, number: true },
  });
  for (const r of rows) {
    const tin = safeDecrypt(r.number);
    if (tin) out.set(r.employeeId, tin);
  }
  return out;
}

/** The year's tax on a taxable amount, by the BIR table in force at year end. */
export async function loadAnnualTaxDue(tx: Tx, tenantId: string, year: number): Promise<((cents: bigint) => bigint) | undefined> {
  try {
    const rule = await getActiveRule(tx, tenantId, "BIR_WITHHOLDING_TABLE", new Date(Date.UTC(year, 11, 31)));
    return (cents) => annualTaxDueCents(rule.payload, cents);
  } catch {
    return undefined;
  }
}

/** The minimum wage per day by region code, at year end (empty when none is published). */
export async function loadMinimumWages(tx: Tx, tenantId: string, year: number): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  try {
    const rule = await getActiveRule(tx, tenantId, "MINIMUM_WAGE_RATE", new Date(Date.UTC(year, 11, 31)));
    for (const [code, r] of Object.entries(rule.payload.regions)) out.set(code, BigInt(r.dailyRate));
  } catch {
    // No table: Items 9 and 10 stay blank.
  }
  return out;
}

export const BIR_EMPLOYEE_SELECT = {
  id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, suffix: true,
  taxClassification: true, birthDate: true, mobileNumber: true, phoneNumber: true,
  addressLine1: true, addressLine2: true, city: true, province: true, zipCode: true, region: true,
  hireDate: true, resignationDate: true, lastWorkingDate: true, endOfContractDate: true,
  employmentStatus: true, nationality: true,
} as const;

export interface BirEmployeeRow {
  id: string;
  birthDate: Date | null;
  mobileNumber: string | null;
  phoneNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  region: string | null;
  hireDate: Date;
  resignationDate: Date | null;
  lastWorkingDate: Date | null;
  endOfContractDate: Date | null;
}

/** The employee's last day with the company, when one is on record. */
export function lastDayOf(e: Pick<BirEmployeeRow, "resignationDate" | "lastWorkingDate" | "endOfContractDate">): Date | null {
  return e.lastWorkingDate ?? e.resignationDate ?? e.endOfContractDate ?? null;
}

/** First and last day of employment inside the year. */
export function employmentWithinYear(e: BirEmployeeRow, year: number): { from: Date; to: Date } {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));
  const last = lastDayOf(e);
  return {
    from: e.hireDate > jan1 ? e.hireDate : jan1,
    to: last && last < dec31 && last >= jan1 ? last : dec31,
  };
}

export function personOf(
  e: BirEmployeeRow,
  year: number,
  tin: string | null,
  minimumWages: Map<string, bigint>,
  /** Working days a year the employee's daily rate is based on. */
  daysPerYear: number | null,
): Bir2316Person {
  const smwDaily = e.region ? minimumWages.get(e.region) ?? null : null;
  const period = employmentWithinYear(e, year);
  return {
    tin,
    address: joined(e.addressLine1, e.addressLine2, e.city, e.province),
    zipCode: e.zipCode,
    birthDate: e.birthDate,
    contactNumber: e.mobileNumber ?? e.phoneNumber,
    periodFrom: period.from,
    periodTo: period.to,
    smwDailyCents: smwDaily,
    smwMonthlyCents: smwDaily !== null && daysPerYear ? (smwDaily * BigInt(daysPerYear)) / 12n : null,
  };
}
