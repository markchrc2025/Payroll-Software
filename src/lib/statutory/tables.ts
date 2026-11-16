/**
 * PAY-159: the statutory tables a company's payroll uses, for the read-only
 * Statutory Table page (Payroll sidebar).
 *
 * Which version is in force comes from getActiveRule, the same resolver the
 * payroll engine calls, so the page can never show a table the payroll does
 * not use. This module only labels every version (in force, upcoming,
 * earlier, or replaced by the company's own rate) and turns bracket lists
 * into the ranges the engine actually applies.
 *
 * Statutory rates are Sentire's to change (Mark's ruling); companies only
 * read them here.
 */
import type { StatutoryCategory } from "@prisma/client";
import type {
  BirWithholdingPayload,
  PagibigSchedulePayload,
  StatutoryPayloadFor,
} from "./types";

export const STATUTORY_TABLES = [
  { category: "SSS_SCHEDULE", key: "sss", label: "SSS" },
  { category: "PHILHEALTH_SCHEDULE", key: "philhealth", label: "PhilHealth" },
  { category: "PAGIBIG_SCHEDULE", key: "pagibig", label: "Pag-IBIG" },
  { category: "BIR_WITHHOLDING_TABLE", key: "bir", label: "BIR withholding tax" },
] as const satisfies ReadonlyArray<{ category: StatutoryCategory; key: string; label: string }>;

export type TableCategory = (typeof STATUTORY_TABLES)[number]["category"];

/**
 * IN_FORCE  the version the payroll uses on the as-of date.
 * UPCOMING  starts after the as-of date.
 * EARLIER   ended on or before the as-of date.
 * REPLACED  covers the as-of date but is not used, because the company has
 *           its own rate (or a later version of the same rate) for that date.
 */
export type TableStatus = "IN_FORCE" | "UPCOMING" | "EARLIER" | "REPLACED";

export type RuleRecord = {
  id: string;
  tenantId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  legalBasis: string;
  version: string;
};

export type TableVersion<P = unknown> = {
  id: string;
  version: string;
  legalBasis: string;
  /** First day in force (YYYY-MM-DD). */
  effectiveFrom: string;
  /** Last day in force (YYYY-MM-DD), or null when open-ended. */
  lastDay: string | null;
  /** True when this is the company's own rate, not Sentire's default. */
  companyRate: boolean;
  status: TableStatus;
  payload: P;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** effectiveTo is exclusive; the last day in force is the day before it. */
export function lastDayInForce(effectiveTo: Date | null): string | null {
  if (!effectiveTo) return null;
  return ymd(new Date(effectiveTo.getTime() - 24 * 60 * 60 * 1000));
}

export function versionStatus(rule: RuleRecord, inForceId: string | null, asOf: Date): TableStatus {
  if (rule.id === inForceId) return "IN_FORCE";
  if (rule.effectiveFrom > asOf) return "UPCOMING";
  if (rule.effectiveTo !== null && rule.effectiveTo <= asOf) return "EARLIER";
  return "REPLACED";
}

/**
 * Every version of one table the company can see (Sentire's defaults and its
 * own rates), newest first, each labelled. Ties on the start date put the
 * company's own rate first, the order the resolver prefers.
 */
export function tableVersions<P>(
  rules: Array<RuleRecord & { payload: P }>,
  inForceId: string | null,
  asOf: Date,
): TableVersion<P>[] {
  return [...rules]
    .sort(
      (a, b) =>
        b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
        Number(b.tenantId !== null) - Number(a.tenantId !== null),
    )
    .map((r) => ({
      id: r.id,
      version: r.version,
      legalBasis: r.legalBasis,
      effectiveFrom: ymd(r.effectiveFrom),
      lastDay: lastDayInForce(r.effectiveTo),
      companyRate: r.tenantId !== null,
      status: versionStatus(r, inForceId, asOf),
      payload: r.payload,
    }));
}

export type BirRange = {
  /** Taxable pay from (centavos), inclusive. */
  from: number;
  /** Taxable pay to (centavos), inclusive; null for the top bracket. */
  to: number | null;
  fixedTax: number;
  /** Rate on the excess over `from`. */
  plusRate: number;
};

/**
 * BIR brackets as the engine applies them (lookupBIR): a bracket covers pay
 * from its floor up to one centavo below the next floor, and the tax is the
 * fixed amount plus the rate on the excess over the floor.
 */
export function birRanges(brackets: BirWithholdingPayload["frequencies"]["MONTHLY"]): BirRange[] {
  return brackets.map((b, i) => {
    const next = brackets[i + 1];
    return { from: b.floor, to: next ? next.floor - 1 : null, fixedTax: b.fixedTax, plusRate: b.plusRate };
  });
}

export type PagibigRange = {
  /** Monthly compensation from (centavos), inclusive. */
  from: number;
  /** Monthly compensation to (centavos), inclusive; null for the top bracket. */
  to: number | null;
  eeRate: number;
  erRate: number;
};

/**
 * Pag-IBIG brackets as the engine applies them (computePagibig): the first
 * bracket whose upper bound is at or above the compensation.
 */
export function pagibigRanges(payload: PagibigSchedulePayload): PagibigRange[] {
  return payload.brackets.map((b, i) => {
    const prev = payload.brackets[i - 1];
    return { from: prev?.upTo != null ? prev.upTo + 1 : 0, to: b.upTo, eeRate: b.eeRate, erRate: b.erRate };
  });
}

/** BIR pay frequencies in the order the page lists them. */
export const BIR_FREQUENCIES = ["DAILY", "WEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const;

export type StatutoryTablesResponse = {
  asOf: string;
  tables: Array<{
    category: TableCategory;
    key: string;
    label: string;
    versions: TableVersion<StatutoryPayloadFor<TableCategory>>[];
  }>;
};
