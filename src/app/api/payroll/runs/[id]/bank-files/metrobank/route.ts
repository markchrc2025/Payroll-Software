/**
 * GET /api/payroll/runs/[id]/bank-files/metrobank
 *
 * Downloads a Metrobank batch payroll credit file for a FINALIZED payroll run.
 * Returns: text/plain with Content-Disposition: attachment
 * Filename: "metrobank-payroll-YYYYMMDD.txt"
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { notFound, serverError } from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";
import { formatMetrobankFile } from "@/lib/payroll/bank-files/metrobank";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "EXPORT");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const book = await getRun(auth.tenantId, id);

    if (book.status !== "FINALIZED") {
      return new Response(
        JSON.stringify({ error: "Bank files are only available for FINALIZED runs" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const employeeIds = book.sheets.map((s) => s.employeeId);
    const { employees, tenantName } = await withTenant(auth.tenantId, async (tx) => {
      const [emps, tenant] = await Promise.all([
        tx.employee.findMany({
          where: { id: { in: employeeIds } },
          select: {
            id: true,
            employeeNumber: true,
            bankAccountNumber: true,
            bankAccountName: true,
          },
        }),
        tx.tenant.findUniqueOrThrow({
          where: { id: auth.tenantId },
          select: { name: true },
        }),
      ]);
      return { employees: emps, tenantName: tenant.name };
    });

    const empMap = new Map(employees.map((e) => [e.id, e]));

    const rows = book.sheets.map((sheet) => {
      const emp = empMap.get(sheet.employeeId);
      return {
        employeeNumber: emp?.employeeNumber ?? sheet.employeeId.substring(0, 12),
        accountNumber: emp?.bankAccountNumber ?? null,
        accountName: emp?.bankAccountName ?? null,
        netPayCents: sheet.netPayCents,
      };
    });

    const y = book.periodEnd.getUTCFullYear().toString();
    const m = (book.periodEnd.getUTCMonth() + 1).toString().padStart(2, "0");
    const d = book.periodEnd.getUTCDate().toString().padStart(2, "0");
    const batchRef = `${book.id.substring(0, 8)}${y}${m}${d}`;
    const filename = `metrobank-payroll-${y}${m}${d}.txt`;

    const content = formatMetrobankFile({
      companyName: tenantName,
      valueDate: book.periodEnd,
      batchReference: batchRef,
      rows,
    });

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    return serverError(e);
  }
}
