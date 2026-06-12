/**
 * GET /api/ess/announcements
 *
 * Published, non-deleted announcements for the employee's tenant, newest first.
 * Degrades to an empty list if the Announcement table doesn't exist yet (i.e.
 * before the ESS announcements migration has been applied).
 *
 * Response: { data: Announcement[] }
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  try {
    const items = await withTenant(ctx.tenantId, (tx) =>
      tx.announcement.findMany({
        where: { tenantId: ctx.tenantId, isPublished: true, deletedAt: null },
        orderBy: { publishedAt: "desc" },
        take: 20,
        select: { id: true, title: true, body: true, category: true, publishedAt: true },
      }),
    );
    return ok(items, "Announcements retrieved");
  } catch (e) {
    // Table may not exist before the migration is applied — show an empty feed
    // rather than failing the screen.
    console.warn("[ess/announcements] returning empty:", e instanceof Error ? e.message : e);
    return ok([], "Announcements retrieved");
  }
}
