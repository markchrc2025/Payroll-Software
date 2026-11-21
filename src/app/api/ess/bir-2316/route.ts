/**
 * PAY-199: GET /api/ess/bir-2316?year= the employee's own BIR Form 2316 for a
 * year, as a PDF on the official layout, with their e-signature when they
 * have uploaded one. 404 when the year has no finalized payroll for them.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { loadBir2316Report } from "@/lib/payroll/reports/bir-2316-load";
import { fill2316 } from "@/lib/payroll/reports/bir-2316-pdf";
import { signatoryOf, signatureOf } from "@/lib/payroll/reports/signature";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return err("Choose the year", 422);
  const { cert, sig, employerSignatory } = await withTenant(ctx.tenantId, async (tx) => ({
    cert: (await loadBir2316Report(tx, ctx.tenantId, year, ctx.employeeId)).certificates.find((c) => c.employeeId === ctx.employeeId) ?? null,
    sig: await signatureOf(tx, ctx.tenantId, ctx.employeeId),
    employerSignatory: await signatoryOf(tx, ctx.tenantId),
  }));
  if (!cert) return err(`No finalized payroll in ${year} yet`, 404);
  const pdf = await fill2316(cert.form, { signature: sig, employerSignatory });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="BIR_2316_${year}.pdf"`, "cache-control": "private, no-store" } });
}
