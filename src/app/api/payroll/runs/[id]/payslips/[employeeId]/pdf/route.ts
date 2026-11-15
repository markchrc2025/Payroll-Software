/**
 * GET /api/payroll/runs/[id]/payslips/[employeeId]/pdf
 *
 * The employee's payslip for a FINALIZED run as a PDF (PAY-139), for the
 * admin's Payslip view. Same document as the employee's own download and the
 * file the payslip.publish job stores.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { err, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { loadPayslipPdfData, PayslipNotAvailableError } from "@/lib/payslip/pdf-data";
import { payslipFileName, renderPayslipPdf } from "@/lib/payslip/pdf-document";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; employeeId: string }> },
) {
  const guard = await requirePermission(req, "PAYROLL", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id, employeeId } = await params;

  try {
    const data = await withTenant(auth.tenantId, (tx) =>
      loadPayslipPdfData(tx, { tenantId: auth.tenantId, bookId: id, employeeId }),
    );
    const pdf = await renderPayslipPdf(data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${payslipFileName(data)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof PayslipNotAvailableError) return err(e.message, 404);
    return serverError(e);
  }
}
