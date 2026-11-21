/**
 * POST /api/ess/background/[kind]   kind: education | experience | training
 * Wave B (PAY-212, decision 7): the employee adds their own record as a
 * Profile Request; HR approves it in Profile Requests before it is saved.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { isBackgroundField } from "@/lib/background/entry-view";
import { BackgroundEntryRefusal, parseBackground } from "@/lib/background/ess-entry";

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { kind } = await params;
  const field = `background.${kind}`;
  if (!isBackgroundField(field)) return err("Unknown record kind", 404);
  const body = await req.json().catch(() => null);
  try {
    const { stored } = parseBackground(field, body);
    const row = await withTenant(ctx.tenantId, (tx) => tx.profileUpdateRequest.create({
      data: { tenantId: ctx.tenantId, employeeId: ctx.employeeId, field, oldValue: null, newValue: stored, status: "PENDING" },
    }));
    return ok(row, "Sent to HR. It is added to your records once approved.", 201);
  } catch (e) {
    if (e instanceof BackgroundEntryRefusal) return err(e.message, 422);
    throw e;
  }
}
