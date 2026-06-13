/**
 * PATCH /api/admin/support/tickets/[id] — update status / priority / assignee.
 * Central Portal, SUPPORT module (MANAGE).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";

const patchSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).optional(),
  agentUserId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("SUPPORT", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const existing = await prismaAdmin.supportTicket.findUnique({
      where: { id },
      select: { id: true, ticketNumber: true, tenant: { select: { id: true, name: true } } },
    });
    if (!existing) return notFound("Ticket");

    const resolving = parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
    const ticket = await prismaAdmin.supportTicket.update({
      where: { id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
        ...(parsed.data.agentUserId !== undefined ? { agentUserId: parsed.data.agentUserId } : {}),
        ...(resolving ? { resolvedAt: new Date() } : {}),
      },
      select: {
        id: true, ticketNumber: true, subject: true, priority: true, status: true,
        createdAt: true,
        tenant: { select: { id: true, name: true } },
        agent: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: `updated ticket ${existing.ticketNumber}`,
      target: existing.tenant.name,
      kind: "TENANT",
      tenantId: existing.tenant.id,
      ipAddress: getClientIp(req),
    });

    return ok(ticket, "Ticket updated");
  } catch (e) {
    return serverError(e);
  }
}
