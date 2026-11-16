/**
 * PAY-144 (Mark, 16 Nov 2026, HR.my review D4 = C): year-to-date openings.
 *
 * A company that joins Sentire mid-year enters, per employee and year, what it
 * paid before Sentire (PRIOR_PAYROLL), and the figures from a previous
 * employer's 2316 for a new hire who transferred within the year
 * (PREVIOUS_EMPLOYER). The payroll then reads them:
 *
 *   13th month (YEAR_END, FINAL_PAY): basic pay earned before Sentire joins the
 *     base; 13th month already paid this year is subtracted. PRIOR_PAYROLL only:
 *     another employer's pay is never this employer's 13th month.
 *   90,000 exemption (13th month and other benefits): what both sources already
 *     used, plus earlier finalized Sentire runs, is taken off the cap.
 *   Annualization (YEAR_END true-up, FINAL_PAY): taxable compensation and tax
 *     withheld from both sources join the year's totals.
 *   2316 and alphalist: PRIOR_PAYROLL is this employer's pay for the year;
 *     PREVIOUS_EMPLOYER appears in the 2316's previous-employer lines.
 *
 * A YEAR_END or FINAL_PAY run keeps a copy of what it used
 * (periodInputSnapshot.ytdOpening), and openings are locked once the employee
 * has such a run FINALIZED in that year, so a sealed run always reproduces.
 */
import { z } from "zod";
import type { Prisma, YtdOpeningSource } from "@prisma/client";

export const YTD_OPENING_SOURCES = ["PRIOR_PAYROLL", "PREVIOUS_EMPLOYER"] as const;

/** One opening as the payroll reads it (centavos). */
export interface YtdOpening {
  source: YtdOpeningSource;
  previousEmployerName: string | null;
  previousEmployerTin: string | null;
  basicPayEarnedCents: bigint;
  thirteenthMonthPaidCents: bigint;
  taxableCompensationCents: bigint;
  withholdingTaxCents: bigint;
  nontaxable13MonthAndBenefitsCents: bigint;
  sssEeCents: bigint;
  philhealthEeCents: bigint;
  pagibigEeCents: bigint;
  otherNontaxableCents: bigint;
}

export interface YtdOpeningTotals {
  /** PRIOR_PAYROLL only: basic pay earned before Sentire (13th month base). */
  basicPayEarnedCents: bigint;
  /** PRIOR_PAYROLL only: 13th month already paid this year. */
  thirteenthMonthPaidCents: bigint;
  /** Both sources: taxable compensation for annualization. */
  taxableCompensationCents: bigint;
  /** Both sources: tax already withheld. */
  withholdingTaxCents: bigint;
  /** Both sources: the 90,000 exemption already used. */
  benefitsExemptUsedCents: bigint;
}

export const NO_OPENINGS: YtdOpeningTotals = {
  basicPayEarnedCents: 0n,
  thirteenthMonthPaidCents: 0n,
  taxableCompensationCents: 0n,
  withholdingTaxCents: 0n,
  benefitsExemptUsedCents: 0n,
};

export function ytdOpeningTotals(openings: YtdOpening[]): YtdOpeningTotals {
  const t = { ...NO_OPENINGS };
  for (const o of openings) {
    if (o.source === "PRIOR_PAYROLL") {
      t.basicPayEarnedCents += o.basicPayEarnedCents;
      t.thirteenthMonthPaidCents += o.thirteenthMonthPaidCents;
    }
    t.taxableCompensationCents += o.taxableCompensationCents;
    t.withholdingTaxCents += o.withholdingTaxCents;
    t.benefitsExemptUsedCents += o.nontaxable13MonthAndBenefitsCents;
  }
  return t;
}

/** Gross compensation of a PRIOR_PAYROLL opening: the sum of its parts. */
export function openingGrossCents(o: YtdOpening): bigint {
  return (
    o.taxableCompensationCents +
    o.nontaxable13MonthAndBenefitsCents +
    o.sssEeCents +
    o.philhealthEeCents +
    o.pagibigEeCents +
    o.otherNontaxableCents
  );
}

/**
 * A PRIOR_PAYROLL opening in the shape the 2316 and alphalist builders add up
 * (their sheet inputs). Mandatory contributions sit inside the non-taxable
 * compensation, as on a payroll sheet; the builders take them back out.
 */
export function openingAsReportSheet(o: YtdOpening) {
  const contributions = o.sssEeCents + o.philhealthEeCents + o.pagibigEeCents;
  return {
    grossCompensationCents: openingGrossCents(o),
    mweExemptCompensationCents: 0n,
    nontaxableBasicCents: 0n,
    nontaxableCompensationCents: o.otherNontaxableCents + contributions,
    nontaxable13MonthAndBenefitsCents: o.nontaxable13MonthAndBenefitsCents,
    grossTaxableIncomeCents: o.taxableCompensationCents,
    sssEeCents: o.sssEeCents,
    philhealthEeCents: o.philhealthEeCents,
    pagibigEeCents: o.pagibigEeCents,
    withholdingTaxCents: o.withholdingTaxCents,
  };
}

// ---------------------------------------------------------------------------
// Snapshot kept on YEAR_END and FINAL_PAY sheets
// ---------------------------------------------------------------------------

export interface YtdOpeningSnapshot {
  year: number;
  basicPayEarnedCents: string;
  thirteenthMonthPaidCents: string;
  taxableCompensationCents: string;
  withholdingTaxCents: string;
  benefitsExemptUsedCents: string;
  previousEmployerName: string | null;
}

export function ytdOpeningSnapshot(
  year: number,
  openings: YtdOpening[],
): YtdOpeningSnapshot | undefined {
  if (openings.length === 0) return undefined;
  const t = ytdOpeningTotals(openings);
  return {
    year,
    basicPayEarnedCents: t.basicPayEarnedCents.toString(),
    thirteenthMonthPaidCents: t.thirteenthMonthPaidCents.toString(),
    taxableCompensationCents: t.taxableCompensationCents.toString(),
    withholdingTaxCents: t.withholdingTaxCents.toString(),
    benefitsExemptUsedCents: t.benefitsExemptUsedCents.toString(),
    previousEmployerName:
      openings.find((o) => o.source === "PREVIOUS_EMPLOYER")?.previousEmployerName ?? null,
  };
}

// ---------------------------------------------------------------------------
// Input validation (API body in centavos, CSV in pesos)
// ---------------------------------------------------------------------------

const cents = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = String(v).trim();
    if (s === "") return 0n;
    if (!/^\d+$/.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amounts must be whole centavos, 0 or more" });
      return z.NEVER;
    }
    return BigInt(s);
  });

const common = {
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2099),
  taxableCompensationCents: cents.default(0n),
  withholdingTaxCents: cents.default(0n),
  nontaxable13MonthAndBenefitsCents: cents.default(0n),
  note: z.string().trim().max(500).optional().nullable(),
};

export const ytdOpeningInput = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("PRIOR_PAYROLL"),
    ...common,
    basicPayEarnedCents: cents.default(0n),
    thirteenthMonthPaidCents: cents.default(0n),
    sssEeCents: cents.default(0n),
    philhealthEeCents: cents.default(0n),
    pagibigEeCents: cents.default(0n),
    otherNontaxableCents: cents.default(0n),
  }),
  z.object({
    source: z.literal("PREVIOUS_EMPLOYER"),
    ...common,
    previousEmployerName: z
      .string({ error: "Previous employer name is required" })
      .trim()
      .min(1, "Previous employer name is required")
      .max(200),
    previousEmployerTin: z.string().trim().max(30).optional().nullable(),
  }),
]);
export type YtdOpeningInput = z.infer<typeof ytdOpeningInput>;

/** The row written to EmployeeYtdOpening for a validated input. */
export function openingRow(input: YtdOpeningInput) {
  const zero = 0n;
  const base = {
    taxableCompensationCents: input.taxableCompensationCents,
    withholdingTaxCents: input.withholdingTaxCents,
    nontaxable13MonthAndBenefitsCents: input.nontaxable13MonthAndBenefitsCents,
    note: input.note ?? null,
  };
  if (input.source === "PRIOR_PAYROLL") {
    return {
      ...base,
      previousEmployerName: null,
      previousEmployerTin: null,
      basicPayEarnedCents: input.basicPayEarnedCents,
      thirteenthMonthPaidCents: input.thirteenthMonthPaidCents,
      sssEeCents: input.sssEeCents,
      philhealthEeCents: input.philhealthEeCents,
      pagibigEeCents: input.pagibigEeCents,
      otherNontaxableCents: input.otherNontaxableCents,
    };
  }
  return {
    ...base,
    previousEmployerName: input.previousEmployerName,
    previousEmployerTin: input.previousEmployerTin || null,
    basicPayEarnedCents: zero,
    thirteenthMonthPaidCents: zero,
    sssEeCents: zero,
    philhealthEeCents: zero,
    pagibigEeCents: zero,
    otherNontaxableCents: zero,
  };
}

/**
 * A peso amount typed by a person ("12,345.67", "₱500", "") to centavos.
 * At most two decimals; never negative. Empty means 0.
 */
export function parsePesoAmount(raw: string | undefined | null): bigint {
  const s = (raw ?? "").replace(/[₱,\s]/g, "");
  if (s === "") return 0n;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new RangeError(`"${raw}" is not a peso amount (digits, at most two decimals, not negative)`);
  }
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}

/** CSV columns, in template order. */
export const YTD_CSV_COLUMNS = [
  "employee_number",
  "year",
  "source",
  "previous_employer_name",
  "previous_employer_tin",
  "basic_pay_earned",
  "thirteenth_month_paid",
  "taxable_compensation",
  "tax_withheld",
  "nontaxable_13th_month_and_benefits",
  "sss_ee",
  "philhealth_ee",
  "pagibig_ee",
  "other_nontaxable",
  "note",
] as const;

/**
 * One CSV row (lower-case headers, pesos) to an API-shaped input, or the
 * reasons it cannot be one. `employeeId` is resolved by the caller.
 */
export function csvRowToInput(
  row: Record<string, string>,
  employeeId: string,
): { ok: true; input: YtdOpeningInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const amt = (col: string): string => {
    try {
      return parsePesoAmount(row[col]).toString();
    } catch (e) {
      errors.push(`${col}: ${(e as Error).message}`);
      return "0";
    }
  };
  const source = (row.source ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const raw = {
    source,
    employeeId,
    year: row.year,
    taxableCompensationCents: amt("taxable_compensation"),
    withholdingTaxCents: amt("tax_withheld"),
    nontaxable13MonthAndBenefitsCents: amt("nontaxable_13th_month_and_benefits"),
    note: row.note || null,
    ...(source === "PREVIOUS_EMPLOYER"
      ? {
          previousEmployerName: row.previous_employer_name ?? "",
          previousEmployerTin: row.previous_employer_tin || null,
        }
      : {
          basicPayEarnedCents: amt("basic_pay_earned"),
          thirteenthMonthPaidCents: amt("thirteenth_month_paid"),
          sssEeCents: amt("sss_ee"),
          philhealthEeCents: amt("philhealth_ee"),
          pagibigEeCents: amt("pagibig_ee"),
          otherNontaxableCents: amt("other_nontaxable"),
        }),
  };
  if (source === "PREVIOUS_EMPLOYER") {
    for (const col of ["basic_pay_earned", "thirteenth_month_paid", "sss_ee", "philhealth_ee", "pagibig_ee", "other_nontaxable"]) {
      if ((row[col] ?? "").trim() !== "" && parsePesoSafe(row[col]) !== 0n) {
        errors.push(`${col}: leave blank for a previous employer (only this company's own pay goes there)`);
      }
    }
  }
  if (source !== "PRIOR_PAYROLL" && source !== "PREVIOUS_EMPLOYER") {
    errors.push(`source: must be PRIOR_PAYROLL or PREVIOUS_EMPLOYER (got "${row.source ?? ""}")`);
  }
  if (errors.length) return { ok: false, errors };
  const parsed = ytdOpeningInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`) };
  }
  return { ok: true, input: parsed.data };
}

function parsePesoSafe(raw: string | undefined): bigint {
  try {
    return parsePesoAmount(raw);
  } catch {
    return -1n;
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

const OPENING_SELECT = {
  employeeId: true,
  source: true,
  previousEmployerName: true,
  previousEmployerTin: true,
  basicPayEarnedCents: true,
  thirteenthMonthPaidCents: true,
  taxableCompensationCents: true,
  withholdingTaxCents: true,
  nontaxable13MonthAndBenefitsCents: true,
  sssEeCents: true,
  philhealthEeCents: true,
  pagibigEeCents: true,
  otherNontaxableCents: true,
} as const;

export async function loadYtdOpenings(
  tx: Tx,
  tenantId: string,
  employeeId: string,
  year: number,
): Promise<YtdOpening[]> {
  return tx.employeeYtdOpening.findMany({
    where: { tenantId, employeeId, year },
    select: OPENING_SELECT,
    orderBy: { source: "asc" },
  });
}

/** Openings for many employees at once, keyed by employee id. */
export async function loadYtdOpeningsByEmployee(
  tx: Tx,
  tenantId: string,
  year: number,
  employeeIds?: string[],
): Promise<Map<string, YtdOpening[]>> {
  const rows = await tx.employeeYtdOpening.findMany({
    where: { tenantId, year, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
    select: OPENING_SELECT,
  });
  const byEmployee = new Map<string, YtdOpening[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(r);
    byEmployee.set(r.employeeId, list);
  }
  return byEmployee;
}

function yearBounds(year: number) {
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/**
 * Employees (of those given) whose openings for the year are locked: they
 * have a FINALIZED YEAR_END or FINAL_PAY run in that year, which keeps a copy
 * of what it used. Changing an opening afterwards would make the sealed run
 * disagree with its inputs, so it is refused.
 */
export async function lockedEmployees(
  tx: Tx,
  tenantId: string,
  year: number,
  employeeIds?: string[],
): Promise<Set<string>> {
  const sheets = await tx.payrollSheet.findMany({
    where: {
      tenantId,
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      payrollBook: {
        status: "FINALIZED",
        runType: { in: ["YEAR_END", "FINAL_PAY"] },
        periodEnd: yearBounds(year),
      },
    },
    select: { employeeId: true },
  });
  return new Set(sheets.map((s) => s.employeeId));
}

/**
 * The 90,000 exemption (13th month and other benefits) already used this
 * year: what the openings used plus what earlier FINALIZED Sentire runs used.
 * A draft run's own sheets are never FINALIZED, so they are not counted.
 */
export async function benefitsExemptUsedCents(
  tx: Tx,
  tenantId: string,
  employeeId: string,
  year: number,
  openings: YtdOpening[],
): Promise<bigint> {
  const agg = await tx.payrollSheet.aggregate({
    where: {
      tenantId,
      employeeId,
      payrollBook: { status: "FINALIZED", periodEnd: yearBounds(year) },
    },
    _sum: { nontaxable13MonthAndBenefitsCents: true },
  });
  return ytdOpeningTotals(openings).benefitsExemptUsedCents + (agg._sum.nontaxable13MonthAndBenefitsCents ?? 0n);
}
