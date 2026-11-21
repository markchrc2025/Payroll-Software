/**
 * GET /api/document-requests?status=PENDING|APPROVED|REJECTED
 * Wave C3 (PAY-213): the company's document requests (DOCUMENTS:READ).
 */
import type { NextRequest } from "next/server";
import type { ApprovalStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";

const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["DOCUMENTS", "READ"]);
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await withTenant(auth.tenantId, (tx) => tx.documentRequest.findMany({
    omit: { renderedBody: true },
    where: { tenantId: auth.tenantId, ...(status && STATUSES.has(status) ? { status: status as ApprovalStatus } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } }, template: { select: { name: true, showsSalary: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  }));
  return ok(rows.map((r) => ({ ...r, issued: r.status === "APPROVED" })));
}
