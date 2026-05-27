/**
 * GET /api/payroll/runs/[id]/bank-files/bpi
 *
 * Downloads a BPI batch payroll credit file for a FINALIZED payroll run.
 * Only available for FINALIZED runs. Requires an authenticated tenant user.
 *
 * Returns: text/plain with Content-Disposition: attachment
 * Filename: "bpi-payroll-YYYYMMDD.txt"
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { notFound, serverError, unauthorized } from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { withTenant } from "@/lib/with-tenant";
import { formatBpiFile } from "@/lib/payroll/bank-files/bpi";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const book = await getRun(auth.tenantId, id);

    if (book.status !== "FINALIZED") {
      return new Response(
        JSON.stringify({ error: "Bank files are only available for FINALIZED runs" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load employee bank data + tenant name in one transaction.
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

    // Build detail rows — one per sheet, in sheet order.
    const rows = book.sheets.map((sheet) => {
      const emp = empMap.get(sheet.employeeId);
      return {
        employeeNumber: emp?.employeeNumber ?? sheet.employeeId.substring(0, 12),
        accountNumber: emp?.bankAccountNumber ?? null,
        accountName: emp?.bankAccountName ?? null,
        netPayCents: sheet.netPayCents,
      };
    });

    // Batch reference: first 8 chars of book id + period end YYYYMMDD.
    const y = book.periodEnd.getUTCFullYear().toString();
    const m = (book.periodEnd.getUTCMonth() + 1).toString().padStart(2, "0");
    const d = book.periodEnd.getUTCDate().toString().padStart(2, "0");
    const batchRef = `${book.id.substring(0, 8)}${y}${m}${d}`;
    const filename = `bpi-payroll-${y}${m}${d}.txt`;

    const content = formatBpiFile({
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
