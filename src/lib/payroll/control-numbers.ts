/**
 * PAY-69 (Q3b, Mark 17 Nov 2026: every document carries a document control
 * number). Runs and payslips get theirs when the run is finalized:
 *
 *   PR-YYYY-NNNN     the payroll run, NNNN counting the company's runs of year YYYY
 *   PS-YYYY-NNNNNN   each payslip in it, numbered by employee name
 *
 * YYYY is the year the pay period ends. The counter row is claimed inside the
 * finalize transaction (INSERT ... ON CONFLICT DO UPDATE takes a row lock), so
 * concurrent finalizes queue behind each other and a finalize that rolls back
 * gives its numbers back: the series never has a gap. A database trigger keeps
 * an issued number from ever changing (Q8b).
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type DocType = "PAYROLL_RUN" | "PAYSLIP" | "PAYROLL_CORRECTION";

const PREFIX: Record<DocType, { code: string; width: number }> = {
  PAYROLL_RUN: { code: "PR", width: 4 },
  PAYSLIP: { code: "PS", width: 6 },
  /** PAY-68: payroll corrections, PC-YYYY-NNNN, issued at approval. */
  PAYROLL_CORRECTION: { code: "PC", width: 4 },
};

export function formatControlNumber(docType: DocType, year: number, n: number): string {
  const { code, width } = PREFIX[docType];
  return `${code}-${year}-${String(n).padStart(width, "0")}`;
}

/** Claims `count` consecutive numbers and returns the first. */
export async function claimNumbers(
  tx: Prisma.TransactionClient, tenantId: string, docType: DocType, year: number, count: number,
): Promise<number> {
  if (count < 1) throw new Error("claimNumbers: count must be at least 1");
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "DocumentSeries" (id, "tenantId", "docType", "seriesYear", "lastNumber", "updatedAt")
    VALUES (${`ds_${randomUUID()}`}, ${tenantId}, ${docType}, ${year}, ${count}, now())
    ON CONFLICT ("tenantId", "docType", "seriesYear")
    DO UPDATE SET "lastNumber" = "DocumentSeries"."lastNumber" + ${count}, "updatedAt" = now()
    RETURNING "lastNumber"`;
  return Number(rows[0]!.lastNumber) - count + 1;
}

/**
 * Issues the run's number and one per payslip, ordered by employee last
 * name, first name, then id. Call inside the finalize transaction.
 */
export async function issueRunControlNumbers(
  tx: Prisma.TransactionClient, tenantId: string, bookId: string, periodEnd: Date,
): Promise<{ run: string; payslips: number }> {
  const year = periodEnd.getUTCFullYear();
  const sheets = await tx.payrollSheet.findMany({
    where: { payrollBookId: bookId, controlNumber: null },
    select: { id: true, employee: { select: { lastName: true, firstName: true, id: true } } },
  });
  sheets.sort((a, b) =>
    a.employee.lastName.localeCompare(b.employee.lastName) ||
    a.employee.firstName.localeCompare(b.employee.firstName) ||
    a.employee.id.localeCompare(b.employee.id));
  const run = formatControlNumber("PAYROLL_RUN", year, await claimNumbers(tx, tenantId, "PAYROLL_RUN", year, 1));
  await tx.payrollBook.update({ where: { id: bookId }, data: { controlNumber: run } });
  if (sheets.length) {
    const first = await claimNumbers(tx, tenantId, "PAYSLIP", year, sheets.length);
    for (const [i, s] of sheets.entries()) {
      await tx.payrollSheet.update({ where: { id: s.id }, data: { controlNumber: formatControlNumber("PAYSLIP", year, first + i) } });
    }
  }
  return { run, payslips: sheets.length };
}
