/**
 * PAY-197 part 3 (waited on PAY-199): the separated employee's BIR 2316 for
 * the year of their last working day, on the official layout, from the
 * portal. Available once the final pay run is finalized, so the certificate
 * carries the whole of their pay with the company that year.
 */
import type { NextRequest } from "next/server";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { getPortalSession } from "@/lib/offboarding/portal";
import { loadBir2316Report } from "@/lib/payroll/reports/bir-2316-load";
import { fill2316 } from "@/lib/payroll/reports/bir-2316-pdf";
import { signatoryOf, signatureOf } from "@/lib/payroll/reports/signature";

export async function GET(req: NextRequest) {
  const ctx = await getPortalSession(req);
  if (!ctx) return unauthorized();
  const r = await withTenant(ctx.tenantId, async (tx) => {
    const finalPay = await tx.payrollSheet.findFirst({
      where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId, payrollBook: { runType: "FINAL_PAY", status: "FINALIZED" } },
      select: { payrollBook: { select: { periodEnd: true } } }, orderBy: { payrollBook: { finalizedAt: "desc" } },
    });
    if (!finalPay) return null;
    const c = await tx.offboardingCase.findFirstOrThrow({ where: { id: ctx.caseId, tenantId: ctx.tenantId }, select: { lastWorkingDay: true } });
    const year = c.lastWorkingDay.getUTCFullYear();
    const cert = (await loadBir2316Report(tx, ctx.tenantId, year, ctx.employeeId)).certificates.find((x) => x.employeeId === ctx.employeeId) ?? null;
    return { year, cert, sig: await signatureOf(tx, ctx.tenantId, ctx.employeeId), employerSignatory: await signatoryOf(tx, ctx.tenantId) };
  });
  if (!r) return err("Your BIR 2316 will be here once your final pay is released.", 404);
  if (!r.cert) return err(`No payroll in ${r.year} for you`, 404);
  const pdf = await fill2316(r.cert.form, { signature: r.sig, employerSignatory: r.employerSignatory });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="BIR_2316_${r.year}.pdf"`, "cache-control": "private, no-store" } });
}
