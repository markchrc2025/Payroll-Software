/**
 * GET /api/background/[kind]?asOf=YYYY-MM-DD&withinDays=60
 * Wave B (PAY-212): the company-wide Education, Experience, Training and
 * Legal Documents tables (src/lib/background/report.ts).
 * education, experience, training: EMPLOYEES:READ. legal-documents: DOCUMENTS:READ.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { isBackgroundKind, loadBackground } from "@/lib/background/report";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { kind } = await params;
  if (!isBackgroundKind(kind)) return err("Unknown page", 404);
  const denied = await forbidUnless(auth, kind === "legal-documents" ? ["DOCUMENTS", "READ"] : ["EMPLOYEES", "READ"]);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const asOfRaw = sp.get("asOf");
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? new Date(`${asOfRaw}T00:00:00.000Z`) : undefined;
  const within = Number(sp.get("withinDays") ?? "60");
  const withinDays = Number.isInteger(within) && within >= 0 && within <= 365 ? within : 60;
  const table = await withTenant(auth.tenantId, (tx) => loadBackground(tx, auth.tenantId, kind, { asOf, withinDays }));
  return ok(table);
}
