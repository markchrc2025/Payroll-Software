/**
 * GET /api/settings/tenant/logo
 *
 * Serves the current tenant's company logo. Redirects (302) to a public R2
 * URL when configured, otherwise to a short-lived presigned GET URL. Falls
 * back to a legacy external logoUrl. 404 when no logo is set.
 */

import type { NextRequest } from "next/server";

import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { unauthorized, notFound, err } from "@/lib/api-response";
import { resolveObjectUrl, isR2Configured } from "@/lib/r2";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const tenant = await withTenant(auth.tenantId, (tx) =>
    tx.tenant.findFirst({
      where: { id: auth.tenantId, deletedAt: null },
      select: { logoKey: true, logoUrl: true },
    }),
  );
  if (!tenant) return notFound("Tenant");

  if (tenant.logoKey) {
    if (!isR2Configured()) return err("File storage is not configured.", 503);
    const url = await resolveObjectUrl(tenant.logoKey);
    if (url) return Response.redirect(url, 302);
  }

  // Legacy / externally-hosted logo
  if (tenant.logoUrl) return Response.redirect(tenant.logoUrl, 302);

  return notFound("Logo");
}
