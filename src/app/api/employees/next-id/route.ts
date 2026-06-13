/**
 * GET /api/employees/next-id
 * Returns the preview Employee ID that would be assigned to the next new employee.
 * Non-locking and non-incrementing — informational only for the wizard preview.
 * The actual ID is assigned atomically in POST /api/employees.
 */

import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { formatEmployeeId } from "@/lib/claim-employee-id";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "EMPLOYEES", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const tenant = await withTenant(auth.tenantId, (tx) =>
    tx.tenant.findFirst({
      where: { id: auth.tenantId },
      select: {
        empIdPrefix: true,
        empIdIncludeYear: true,
        empIdPadding: true,
        empIdSuffix: true,
        empIdNextSeq: true,
        empIdSeqYear: true,
      },
    }),
  );

  if (!tenant) return ok({ previewId: "EMP-0001" });

  const currentYear = new Date().getFullYear();
  const shouldReset = tenant.empIdIncludeYear && tenant.empIdSeqYear !== currentYear;
  const previewSeq = shouldReset ? 1 : tenant.empIdNextSeq;
  const previewId = formatEmployeeId(
    tenant,
    previewSeq,
    tenant.empIdIncludeYear ? currentYear : null,
  );

  return ok({ previewId });
}
