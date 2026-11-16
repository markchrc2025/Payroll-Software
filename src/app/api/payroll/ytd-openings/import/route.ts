/**
 * POST /api/payroll/ytd-openings/import (PAY-144)
 *
 * Imports year-to-date openings from a CSV (multipart field "file"). Amounts
 * are in pesos, at most two decimals, commas allowed. Columns (header row,
 * case-insensitive), in template order:
 *
 *   employee_number, year, source (PRIOR_PAYROLL or PREVIOUS_EMPLOYER),
 *   previous_employer_name, previous_employer_tin, basic_pay_earned,
 *   thirteenth_month_paid, taxable_compensation, tax_withheld,
 *   nontaxable_13th_month_and_benefits, sss_ee, philhealth_ee, pagibig_ee,
 *   other_nontaxable, note
 *
 * All or nothing: every row is checked first, and if any row is wrong nothing
 * is saved and every problem is listed with its row number. A row for an
 * employee and year that is locked (finalized 13th month or final pay run) is
 * a problem. A row replaces the employee's existing opening of the same year
 * and source.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { parseCsvString } from "@/lib/utils/csv";
import {
  csvRowToInput,
  lockedEmployees,
  openingRow,
  type YtdOpeningInput,
} from "@/lib/payroll/ytd-openings";

const MAX_ROWS = 5000;

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return err("Upload a CSV file in the 'file' field.", 400);

  const { rows, parseErrors } = parseCsvString(await file.text());
  if (parseErrors.length) return err("The CSV could not be read.", 400, { problems: parseErrors });
  if (rows.length === 0) return err("The CSV has no data rows.", 400);
  if (rows.length > MAX_ROWS) return err(`At most ${MAX_ROWS} rows per file.`, 400);

  type Problem = { row: number; employeeNumber: string; errors: string[] };
  type Outcome =
    | { kind: "problems"; problems: Problem[] }
    | { kind: "saved"; created: number; replaced: number; years: number[] };
  const outcome: Outcome = await withTenant(auth.tenantId, async (tx): Promise<Outcome> => {
    const numbers = [...new Set(rows.map((r) => (r.employee_number ?? "").trim()).filter(Boolean))];
    const employees = await tx.employee.findMany({
      where: { tenantId: auth.tenantId, deletedAt: null, employeeNumber: { in: numbers } },
      select: { id: true, employeeNumber: true },
    });
    const idByNumber = new Map(employees.map((e) => [e.employeeNumber, e.id]));

    const problems: Problem[] = [];
    const inputs: YtdOpeningInput[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const rowNo = i + 2; // the header is row 1
      const num = (r.employee_number ?? "").trim();
      const id = idByNumber.get(num);
      if (!id) {
        problems.push({ row: rowNo, employeeNumber: num, errors: [num ? `No employee with number ${num}` : "employee_number is empty"] });
        return;
      }
      const res = csvRowToInput(r, id);
      if (!res.ok) {
        problems.push({ row: rowNo, employeeNumber: num, errors: res.errors });
        return;
      }
      const key = `${id}|${res.input.year}|${res.input.source}`;
      if (seen.has(key)) {
        problems.push({ row: rowNo, employeeNumber: num, errors: [`Duplicate: ${num} already has a ${res.input.source} row for ${res.input.year} in this file`] });
        return;
      }
      seen.add(key);
      inputs.push(res.input);
    });

    // Locked employee-years (finalized 13th month or final pay).
    const years = [...new Set(inputs.map((x) => x.year))];
    for (const y of years) {
      const ids = inputs.filter((x) => x.year === y).map((x) => x.employeeId);
      const locked = await lockedEmployees(tx, auth.tenantId, y, ids);
      inputs.forEach((x, i) => {
        if (x.year === y && locked.has(x.employeeId)) {
          const num = employees.find((e) => e.id === x.employeeId)?.employeeNumber ?? "";
          problems.push({
            row: rowNumberOf(rows, num, x, i),
            employeeNumber: num,
            errors: [`Locked: ${num} already has a finalized 13th month or final pay run for ${y}`],
          });
        }
      });
    }

    if (problems.length) {
      problems.sort((a, b) => a.row - b.row);
      return { kind: "problems", problems };
    }

    let created = 0;
    let replaced = 0;
    for (const input of inputs) {
      const key = {
        tenantId_employeeId_year_source: {
          tenantId: auth.tenantId,
          employeeId: input.employeeId,
          year: input.year,
          source: input.source,
        },
      };
      const exists = await tx.employeeYtdOpening.findUnique({ where: key, select: { id: true } });
      const row = openingRow(input);
      await tx.employeeYtdOpening.upsert({
        where: key,
        create: { tenantId: auth.tenantId, employeeId: input.employeeId, year: input.year, source: input.source, ...row },
        update: row,
      });
      if (exists) replaced++;
      else created++;
    }
    return { kind: "saved", created, replaced, years };
  });

  if (outcome.kind === "problems") {
    return err(
      `Nothing was imported: ${outcome.problems.length} row(s) need fixing.`,
      422,
      { problems: outcome.problems },
    );
  }

  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId ?? null,
    action: "CREATE",
    entity: "EmployeeYtdOpening",
    entityId: null,
    changes: { import: true, file: file.name, created: outcome.created, replaced: outcome.replaced, years: outcome.years },
    ipAddress: getClientIp(req),
  });
  return ok({ created: outcome.created, replaced: outcome.replaced });
}

/** The CSV row number (header = 1) of an accepted input, for messages. */
function rowNumberOf(
  rows: Record<string, string>[],
  employeeNumber: string,
  input: YtdOpeningInput,
  fallbackIndex: number,
): number {
  const i = rows.findIndex(
    (r) =>
      (r.employee_number ?? "").trim() === employeeNumber &&
      String(r.year ?? "").trim() === String(input.year) &&
      (r.source ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") === input.source,
  );
  return (i >= 0 ? i : fallbackIndex) + 2;
}
