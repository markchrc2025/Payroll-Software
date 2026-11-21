/**
 * GET /api/payroll/annual-statement?employeeId&year[&format=pdf]
 * Wave G2 (PAY-217): an employee's Annual Salary Statement from finalized
 * runs (PAYROLL:READ; src/lib/payroll/annual-statement.tsx).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { buildStatement, statementPdf } from "@/lib/payroll/annual-statement";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year")), employeeId = sp.get("employeeId");
  if (!employeeId || !Number.isInteger(year) || year < 2000 || year > 2100) return err("Choose the employee and the year", 422);
  const st = await withTenant(auth.tenantId, (tx) => buildStatement(tx, auth.tenantId, employeeId, year)).catch(() => null);
  if (!st) return err("Employee not found", 404);
  if (sp.get("format") !== "pdf") return ok(st);
  const pdf = await statementPdf(st);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Annual_Salary_Statement_${year}_${st.employee.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf"`, "cache-control": "private, no-store" } });
}
