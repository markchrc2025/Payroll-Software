/**
 * /api/payroll/runs/[id]
 *   GET — fetch a single payroll run with all its sheets
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  err,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api-response";
import { getRun, PayrollRunNotFoundError } from "@/lib/payroll/persist";
import { serializePayrollBook } from "@/lib/payroll/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const book = await getRun(auth.tenantId, id);
    return ok(serializePayrollBook(book));
  } catch (e) {
    if (e instanceof PayrollRunNotFoundError) return notFound("PayrollBook");
    return serverError(e);
  }
}
