/**
 * GET /api/ess/announcements/[id]
 *
 * A single published announcement for the employee's tenant.
 * Response: { data: Announcement }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { notFound, ok, serverError, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    const item = await withTenant(ctx.tenantId, (tx) =>
      tx.announcement.findFirst({
        where: { id, tenantId: ctx.tenantId, isPublished: true, deletedAt: null },
        select: { id: true, title: true, body: true, category: true, publishedAt: true },
      }),
    );
    if (!item) return notFound("Announcement");
    return ok(item, "Announcement retrieved");
  } catch (e) {
    console.error("[ess/announcements/:id]", e);
    return serverError(e);
  }
}
