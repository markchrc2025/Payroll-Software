/**
 * Wave D (PAY-214): the shape of the four HR reports (src/lib/reports/hr-reports.ts),
 * shared with the page, and the Excel workbook: the main table on one sheet,
 * each summary section on its own.
 */
export const HR_REPORTS = {
  "expense-transactions": { title: "Expense Transaction Report", permission: ["PAYROLL", "READ"], params: "range" },
  "leave-transactions": { title: "Leave Transaction Report", permission: ["LEAVES", "READ"], params: "year" },
  "leave-entitlement": { title: "Leave Entitlement Report", permission: ["LEAVES", "READ"], params: "asOf" },
  "time-clock": { title: "Time Clock Report", permission: ["TIMESHEETS", "READ"], params: "range" },
} as const;
export type HrReportKind = keyof typeof HR_REPORTS;
export const isHrReportKind = (k: string): k is HrReportKind => Object.prototype.hasOwnProperty.call(HR_REPORTS, k);

export type Column = { key: string; label: string; numeric?: boolean };
export type Row = Record<string, string | null>;
export type Section = { title: string; columns: Column[]; rows: Row[] };
export type HrReport = { kind: HrReportKind; title: string; subtitle: string; columns: Column[]; rows: Row[]; sections: Section[] };

/** Rows for a sheet: the header, then each row; numeric columns as numbers. */
export function sheetRows(columns: Column[], rows: Row[]): (string | number)[][] {
  return [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (v == null) return "";
    return c.numeric && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }))];
}

/** Sheet names: at most 31 characters, none of \ / ? * [ ] :, unique. */
export function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let name = base, i = 2;
  while (used.has(name)) name = `${base.slice(0, 28)} ${i++}`;
  used.add(name);
  return name;
}
