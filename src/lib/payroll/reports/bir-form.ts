/**
 * PAY-71 (Mark, build plan v3): BIR 1601-C, 1604-C and 2316 follow the
 * mandated structure. No added columns. Anything Sentire has to say about a
 * figure goes in a footnote.
 *
 * A BirFormView is a BIR form written out the way the form itself is laid
 * out: the same parts, the same item numbers, the same labels, in the same
 * order. A value is null when the item is not a payroll figure (for example
 * penalties, or the bank the tax was paid through): the filer fills it in.
 *
 * Money is in centavos as a string. Pure types and helpers, no DB access.
 */

export type BirValueKind = "money" | "text";

export interface BirFormLine {
  /** The item number printed on the form, for example "14" or "25A". */
  no: string;
  /** The label printed on the form. */
  label: string;
  kind: BirValueKind;
  /** Centavos for money, plain text for text, null when the filer fills it in. */
  value: string | null;
}

export interface BirFormSection {
  heading: string;
  lines: BirFormLine[];
}

export interface BirScheduleColumn {
  /** The column code printed on the schedule, for example "7a". */
  no: string;
  label: string;
  /** The group header the column sits under on the schedule, if any. */
  group?: string;
  kind: BirValueKind;
}

export interface BirSchedule {
  title: string;
  columns: BirScheduleColumn[];
  rows: (string | null)[][];
  /** The TOTALS row: one cell per column, null where the form has no total. */
  totals: (string | null)[] | null;
}

export interface BirFormView {
  formNo: string;
  /** The form version, for example "January 2018 (ENCS)". */
  version: string;
  title: string;
  /** What the form covers, for example "November 2026" or "2026". */
  period: string;
  sections: BirFormSection[];
  schedules: BirSchedule[];
  footnotes: string[];
}

export const moneyLine = (no: string, label: string, cents: bigint | null): BirFormLine => ({
  no,
  label,
  kind: "money",
  value: cents === null ? null : cents.toString(),
});

export const textLine = (no: string, label: string, value: string | null | undefined): BirFormLine => ({
  no,
  label,
  kind: "text",
  value: value == null || value === "" ? null : value,
});

/** "1234567" centavos as "12,345.67"; negatives in parentheses, as on a return. */
export function formatCentavos(cents: string | bigint): string {
  const n = typeof cents === "bigint" ? cents : BigInt(cents);
  const abs = n < 0n ? -n : n;
  const pesos = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${pesos}.${(abs % 100n).toString().padStart(2, "0")}`;
  return n < 0n ? `(${text})` : text;
}

/** A TIN as the forms print it: 000-000-000-00000 (branch code padded to five). */
export function formatTin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return raw.trim() || null;
  const branch = digits.slice(9).padStart(5, "0").slice(-5);
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${branch}`;
}

/** A date as MM/DD/YYYY, the way the forms ask for it. */
export function formatMdy(d: Date | null | undefined): string | null {
  if (!d) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/** Rows of text for a spreadsheet or a print: the form, top to bottom. */
export function formViewToRows(view: BirFormView): string[][] {
  const rows: string[][] = [
    [`BIR Form No. ${view.formNo}`, view.version],
    [view.title],
    [view.period],
    [],
  ];
  const cell = (kind: BirValueKind, v: string | null) =>
    v === null ? "" : kind === "money" ? formatCentavos(v) : v;
  for (const s of view.sections) {
    rows.push([s.heading]);
    for (const l of s.lines) rows.push([l.no, l.label, cell(l.kind, l.value)]);
    rows.push([]);
  }
  for (const sch of view.schedules) {
    rows.push([sch.title]);
    if (sch.columns.some((c) => c.group)) rows.push(sch.columns.map((c) => c.group ?? ""));
    rows.push(sch.columns.map((c) => c.label));
    rows.push(sch.columns.map((c) => c.no));
    for (const r of sch.rows) rows.push(r.map((v, i) => cell(sch.columns[i]!.kind, v)));
    if (sch.totals) rows.push(sch.totals.map((v, i) => (i === 0 && v === null ? "TOTALS" : cell(sch.columns[i]!.kind, v))));
    rows.push([]);
  }
  if (view.footnotes.length > 0) {
    rows.push(["Notes"]);
    view.footnotes.forEach((f, i) => rows.push([`${i + 1}`, f]));
  }
  return rows;
}
