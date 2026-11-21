/** POST /api/ess/team/documents/[id]/ack: "I have read and understood" the current version. Wave F3 (PAY-216). */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { acknowledge, SharingRefusal } from "@/lib/team/sharing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  try {
    return ok(await withTenant(ctx.tenantId, (tx) => acknowledge(tx, ctx.tenantId, ctx.employeeId, id)), "Acknowledged");
  } catch (e) {
    if (e instanceof SharingRefusal) return err(e.message, e.status);
    throw e;
  }
}
