/**
 * GET /api/ess/salary-statement?year[&format=pdf]: the employee's own Annual
 * Salary Statement (Wave G2, PAY-217).
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { buildStatement, statementPdf } from "@/lib/payroll/annual-statement";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return err("Choose the year", 422);
  const st = await withTenant(ctx.tenantId, (tx) => buildStatement(tx, ctx.tenantId, ctx.employeeId, year));
  if (sp.get("format") !== "pdf") return ok(st);
  const pdf = await statementPdf(st);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Annual_Salary_Statement_${year}.pdf"`, "cache-control": "private, no-store" } });
}
