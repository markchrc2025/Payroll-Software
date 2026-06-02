/**
 * POST /api/kiosks/[id]/regenerate-token
 * Generates a new device token for a kiosk, immediately invalidating the old one.
 */
import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, notFound } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const updated = await withTenant(auth.tenantId, async (tx) => {
    const kiosk = await tx.kiosk.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!kiosk) return null;

    return tx.kiosk.update({
      where: { id },
      data: { deviceToken: randomUUID() },
      select: { id: true, name: true, deviceToken: true },
    });
  });

  if (!updated) return notFound("Kiosk not found");
  return ok(updated, "Token regenerated");
}
