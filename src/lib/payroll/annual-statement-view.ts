/** Wave G2 (PAY-217): the Annual Salary Statement shape, shared with the pages. */
export const STATEMENT_COLUMNS = [
  ["basic", "Basic"], ["premiums", "OT & premiums"], ["allowances", "Allowances"], ["thirteenth", "13th & benefits"], ["other", "Other"],
  ["gross", "Gross"], ["sss", "SSS"], ["philhealth", "PhilHealth"], ["pagibig", "Pag-IBIG"], ["tax", "Tax"], ["net", "Net"],
] as const;
export type StatementKey = (typeof STATEMENT_COLUMNS)[number][0];
export type StatementRow = { month: string } & Record<StatementKey, string>;
export type Statement = {
  year: number; company: string; employee: { id: string; name: string; number: string; position: string | null; tin: string | null };
  rows: StatementRow[]; total: StatementRow; runs: number;
};

