/**
 * /api/payroll/runs/[id]
 *   GET — fetch a single payroll run with all its sheets (each with the
 *         employee's number and name for display)
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import {
  notFound,
  ok,
  serverError,
} from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";
import { withTenant } from "@/lib/with-tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  try {
    const book = await getRun(auth.tenantId, id);
    // Names and employee numbers for the run page (sheets only carry the id).
    const people = await withTenant(auth.tenantId, (tx) =>
      tx.employee.findMany({
        where: { id: { in: book.sheets.map((s) => s.employeeId) } },
        select: { id: true, employeeNumber: true, firstName: true, lastName: true },
      }),
    );
    const byId = new Map(people.map((p) => [p.id, p]));
    const serialized = serializePayrollBook(book);
    return ok({
      ...serialized,
      sheets: serialized.sheets?.map((s) => {
        const p = byId.get(s.employeeId);
        return {
          ...s,
          employeeNumber: p?.employeeNumber ?? null,
          employeeName: p ? `${p.firstName} ${p.lastName}` : null,
        };
      }),
    });
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    return serverError(e);
  }
}
