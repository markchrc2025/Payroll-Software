/**
 * Wave B (PAY-212): the shape of a company-wide background table, shared by
 * the API (src/lib/background/report.ts) and the page, with its CSV.
 */
export const BACKGROUND_KINDS = ["education", "experience", "training", "legal-documents"] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];
export const isBackgroundKind = (k: string): k is BackgroundKind => (BACKGROUND_KINDS as readonly string[]).includes(k);

export type Column = { key: string; label: string };
export type Row = Record<string, string | null>;
export type BackgroundTable = { kind: BackgroundKind; title: string; asOf: string; withinDays: number; columns: Column[]; rows: Row[]; counts: Record<string, number> };

/** The table as CSV (same columns as the page). */
export function backgroundCsv(t: BackgroundTable): string {
  const esc = (v: string | null) => {
    const s = v ?? "";
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns.map((c) => esc(c.label)).join(","), ...t.rows.map((r) => t.columns.map((c) => esc(r[c.key] ?? null)).join(","))].join("\r\n") + "\r\n";
}
