/**
 * GET /api/permissions — List all permissions in the global catalog.
 *
 * Returns the full 24-item permission catalog (module × action pairs).
 * Requires ROLES:READ permission (or SUPER_ADMIN).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "ROLES", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  try {
    // Permissions are global (no tenantId). We still use withTenant to ensure
    // the GUC is set for RLS — but Permission has no RLS policy, so any tenant
    // can read the global catalog.
    const permissions = await withTenant(auth.tenantId, (tx) =>
      tx.permission.findMany({
        orderBy: [{ module: "asc" }, { action: "asc" }],
      })
    );

    return ok(permissions);
  } catch (e) {
    return serverError(e);
  }
}
