/** PAY-197 part 2 (and PAY-157): the final payslip PDF, the employee's own, once final pay is finalized. */
import type { NextRequest } from "next/server";
import { err, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getPortalSession } from "@/lib/offboarding/portal";
import { loadPayslipPdfData, PayslipNotAvailableError } from "@/lib/payslip/pdf-data";
import { payslipFileName, renderPayslipPdf } from "@/lib/payslip/pdf-document";

export async function GET(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  try {
    const data = await withTenant(ctx.tenantId, async (tx) => {
      const sheet = await tx.payrollSheet.findFirst({
        where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId, payrollBook: { runType: "FINAL_PAY", status: "FINALIZED" } },
        select: { payrollBookId: true }, orderBy: { payrollBook: { finalizedAt: "desc" } },
      });
      if (!sheet) throw new PayslipNotAvailableError("Your final payslip is not ready yet.");
      return loadPayslipPdfData(tx, { tenantId: ctx.tenantId, bookId: sheet.payrollBookId, employeeId: ctx.employeeId });
    });
    const pdf = await renderPayslipPdf(data);
    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${payslipFileName(data)}"`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof PayslipNotAvailableError) return err(e.message, 404);
    return serverError(e);
  }
}
