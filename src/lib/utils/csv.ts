/**
 * CSV utility — parse incoming CSV buffers and generate CSV exports.
 * Uses PapaParse (Node-compatible) for robust parsing.
 */

import Papa from "papaparse";

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type ParseResult<T> = {
  rows: T[];
  errors: { row: number; message: string }[];
};

/**
 * Parse a CSV string into an array of plain objects with lowercased keys.
 * Trims whitespace from all values.
 */
export function parseCsvString(csv: string): {
  rows: Record<string, string>[];
  parseErrors: string[];
} {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim(),
  });

  const parseErrors = result.errors.map(
    (e) => `Row ${e.row ?? "?"}: ${e.message}`
  );

  return { rows: result.data, parseErrors };
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/**
 * Serialize an array of objects to a CSV string.
 */
export function toCsvString(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows);
}

/**
 * Build a Next.js Response that triggers a CSV file download.
 */
export function csvDownloadResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Employee export shape
// ---------------------------------------------------------------------------

export const EMPLOYEE_EXPORT_HEADERS = [
  "employee_number",
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "birth_date",
  "gender",
  "civil_status",
  "mobile_number",
  "work_email",
  "personal_email",
  "address_line1",
  "city",
  "province",
  "zip_code",
  "region",
  "department_name",
  "branch_name",
  "job_title",
  "job_level",
  "employment_type",
  "employment_status",
  "hire_date",
  "regularization_date",
  "pay_frequency",
  "salary_type",
  "basic_salary",
  "bank_name",
  "bank_account_number",
  "bank_account_name",
] as const;
