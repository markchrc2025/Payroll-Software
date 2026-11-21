/**
 * GET /api/employees/sensitive-access: whether the caller's role may see
 * (SENSITIVE_DATA:READ) and record (SENSITIVE_DATA:UPDATE) ethnicity and
 * religion. Wave A1 (PAY-208); the employee form shows the fields only then.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { sensitiveAccess } from "@/lib/employees/sensitive";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: answers only what the caller's own role allows; reveals no record.
  return ok(await sensitiveAccess(auth));
}
