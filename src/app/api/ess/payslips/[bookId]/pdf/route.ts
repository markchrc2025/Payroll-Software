/**
 * GET /api/ess/payslips/[bookId]/pdf
 *
 * The signed-in employee's own payslip for a FINALIZED run as a PDF
 * (PAY-139). Same document as the admin download and the stored copy.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { loadPayslipPdfData, PayslipNotAvailableError } from "@/lib/payslip/pdf-data";
import { payslipFileName, renderPayslipPdf } from "@/lib/payslip/pdf-document";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { bookId } = await params;

  try {
    // Only ever the caller's own sheet: employeeId comes from the session.
    const data = await withTenant(ctx.tenantId, (tx) =>
      loadPayslipPdfData(tx, { tenantId: ctx.tenantId, bookId, employeeId: ctx.employeeId }),
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
