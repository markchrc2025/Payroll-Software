/**
 * GET /api/payroll/reports/bir/2316?year=YYYY[&employeeId=ID]
 *
 * Returns BIR Form 2316 certificates for all employees (or a single
 * employee when `employeeId` is supplied) for the given calendar year.
 *
 * All FINALIZED PayrollBooks whose `periodEnd` falls within the year are
 * included — REGULAR, YEAR_END, OFF_CYCLE, and FINAL_PAY.
 *
 * Response (all employees):  { data: Bir2316Report }
 * Response (single employee): { data: Bir2316Certificate }
 * PAY-199: &format=pdf with employeeId: the certificate on the official
 * layout (BIR 2316, September 2021 ENCS), with the employee's e-signature.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { loadBir2316Report } from "@/lib/payroll/reports/bir-2316-load";
import { fill2316 } from "@/lib/payroll/reports/bir-2316-pdf";
import { signatureOf } from "@/lib/payroll/reports/signature";
import { forbidUnless } from "@/lib/authz/route-permission";
import { crossFoot2316 } from "@/lib/payroll/reports/cross-foot-data";

const querySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000, "year must be ≥ 2000")
    .max(2099, "year must be ≤ 2099"),
  employeeId: z.string().optional(),
  format: z.enum(["json", "pdf"]).default("json"),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["REPORTS", "READ"]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year"),
    employeeId: searchParams.get("employeeId") ?? undefined,
    format: searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  }
  const { year, employeeId, format } = parsed.data;
  if (format === "pdf" && !employeeId) return err("Choose the employee for the PDF", 400);

  try {
    const report = await withTenant(auth.tenantId, (tx) => loadBir2316Report(tx, auth.tenantId, year, employeeId));

    // Single-employee response: return the certificate directly (or 404).
    if (employeeId) {
      const cert = report.certificates.find(
        (c) => c.employeeId === employeeId,
      );
      if (!cert) return notFound("No payroll data found for this employee in the requested year");
      if (format === "pdf") {
        const sig = await withTenant(auth.tenantId, (tx) => signatureOf(tx, auth.tenantId, employeeId));
        const pdf = await fill2316(cert.form, { signature: sig });
        return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="BIR_2316_${year}_${cert.employeeNumber}.pdf"`, "cache-control": "private, no-store" } });
      }
      return ok({ ...cert, crossFoot: await crossFoot2316(auth.tenantId, year, [cert], employeeId) });
    }

    // PAY-70: each certificate against that employee's payslips for the year.
    return ok({ ...report, crossFoot: await crossFoot2316(auth.tenantId, year, report.certificates) });
  } catch (e) {
    console.error("[bir/2316]", e);
    return err("Internal server error", 500);
  }
}

/** PAY-144: the 2316 inputs that come from an employee's year-to-date openings. */
