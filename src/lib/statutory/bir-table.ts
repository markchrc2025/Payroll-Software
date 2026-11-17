/**
 * PAY-161: the BIR withholding tax table editor (Central Portal > Compliance).
 *
 * Pure helpers shared by the editor and the publish API:
 *   - birTableProblems: what is wrong with a table before it can be published;
 *   - birTableFromRows / birTableToRows: the Excel round trip (one row per
 *     bracket: Frequency, From (₱), Fixed tax (₱), Rate (%)).
 *
 * The engine (lookupBIR) applies a bracket from its floor up to one centavo
 * below the next floor, with tax = fixed tax + rate × (pay − floor). So a
 * table must start at ₱0 and its floors must go up; a progressive table's
 * fixed tax and rate never go down. Every pay frequency is required, because
 * a company paying daily or weekly cannot run payroll without its table.
 */
import type { BirWithholdingPayload } from "./types";

export const BIR_TABLE_FREQUENCIES = ["DAILY", "WEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const;
export type BirTableFrequency = (typeof BIR_TABLE_FREQUENCIES)[number];

export const BIR_FREQUENCY_LABEL: Record<BirTableFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  SEMI_MONTHLY: "Semi-monthly",
  MONTHLY: "Monthly",
};

export type BirBracketInput = { floor: number; fixedTax: number; plusRate: number };
export type BirTableInput = { frequencies: Partial<Record<BirTableFrequency, BirBracketInput[]>> };

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Everything that stops a table from being published; empty when it is fine. */
export function birTableProblems(table: BirTableInput): string[] {
  const out: string[] = [];
  for (const f of BIR_TABLE_FREQUENCIES) {
    const label = BIR_FREQUENCY_LABEL[f];
    const rows = table.frequencies?.[f];
    if (!rows || rows.length === 0) {
      out.push(`${label}: add at least one bracket.`);
      continue;
    }
    rows.forEach((b, i) => {
      const n = i + 1;
      if (!Number.isInteger(b.floor) || b.floor < 0) out.push(`${label}, bracket ${n}: "From" must be ₱0.00 or more.`);
      if (!Number.isInteger(b.fixedTax) || b.fixedTax < 0) out.push(`${label}, bracket ${n}: fixed tax must be ₱0.00 or more.`);
      if (!(b.plusRate >= 0 && b.plusRate <= 1)) out.push(`${label}, bracket ${n}: rate must be between 0% and 100%.`);
    });
    if (rows[0]!.floor !== 0) out.push(`${label}: the first bracket must start at ₱0.00.`);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!;
      const b = rows[i]!;
      if (b.floor <= a.floor) {
        out.push(`${label}, bracket ${i + 1}: "From" ${peso(b.floor)} must be above bracket ${i}'s ${peso(a.floor)}.`);
      }
      if (b.fixedTax < a.fixedTax) out.push(`${label}, bracket ${i + 1}: fixed tax is lower than bracket ${i}'s.`);
      if (b.plusRate < a.plusRate) out.push(`${label}, bracket ${i + 1}: rate is lower than bracket ${i}'s.`);
    }
  }
  return out;
}

/** The table as the payload the API stores (every frequency present). */
export function birTablePayload(table: BirTableInput): BirWithholdingPayload {
  const f = table.frequencies;
  return {
    frequencies: {
      DAILY: f.DAILY ?? [],
      WEEKLY: f.WEEKLY ?? [],
      SEMI_MONTHLY: f.SEMI_MONTHLY ?? [],
      MONTHLY: f.MONTHLY ?? [],
    },
  };
}

/** "Semi-monthly", "SEMI_MONTHLY", "semi monthly" -> SEMI_MONTHLY; null if not a frequency. */
export function birFrequencyFromLabel(v: unknown): BirTableFrequency | null {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.startsWith("semi")) return "SEMI_MONTHLY";
  if (s.startsWith("daily") || s === "day") return "DAILY";
  if (s.startsWith("weekly") || s === "week") return "WEEKLY";
  if (s.startsWith("monthly") || s === "month") return "MONTHLY";
  return null;
}

/** A spreadsheet number: 10417, "10,417.00", "₱10,417", "15%". Null when not a number. */
export function sheetNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₱,%\s]/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const toCentavos = (pesos: number) => Math.round(pesos * 100);
/** "15" (percent) -> 0.15, without floating-point noise. */
const toRatio = (percent: number) => Number((percent / 100).toFixed(6));

/**
 * Read a sheet with one row per bracket: Frequency, From (₱), Fixed tax (₱),
 * Rate (%). Header and blank rows are skipped. Brackets keep the sheet's
 * order (birTableProblems reports any that are out of order).
 */
export function birTableFromRows(rows: unknown[][]): { table: BirTableInput } | { error: string } {
  const frequencies: BirTableInput["frequencies"] = {};
  let read = 0;
  for (const r of rows) {
    const freq = birFrequencyFromLabel(r?.[0]);
    const from = sheetNumber(r?.[1]);
    const fixed = sheetNumber(r?.[2]);
    const rate = sheetNumber(r?.[3]);
    if (!freq || from === null || fixed === null || rate === null) continue;
    (frequencies[freq] ??= []).push({ floor: toCentavos(from), fixedTax: toCentavos(fixed), plusRate: toRatio(rate) });
    read++;
  }
  if (read === 0) {
    return { error: "No bracket rows found. Use the columns Frequency, From (₱), Fixed tax (₱), Rate (%), one row per bracket." };
  }
  return { table: { frequencies } };
}

export const BIR_SHEET_HEADER = ["Frequency", "From (₱)", "Fixed tax (₱)", "Rate (%)"] as const;

/** The table as sheet rows (header first), for "Download as Excel". */
export function birTableToRows(table: BirTableInput): (string | number)[][] {
  const out: (string | number)[][] = [[...BIR_SHEET_HEADER]];
  for (const f of BIR_TABLE_FREQUENCIES) {
    for (const b of table.frequencies?.[f] ?? []) {
      out.push([BIR_FREQUENCY_LABEL[f], b.floor / 100, b.fixedTax / 100, Number((b.plusRate * 100).toFixed(4))]);
    }
  }
  return out;
}
