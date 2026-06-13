/**
 * GET  /api/admin/support/tickets — list support tickets (newest first)
 * POST /api/admin/support/tickets — open a ticket against a tenant
 *
 * Central Portal, SUPPORT module. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError } from "@/lib/api-response";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";

const createSchema = z.object({
  tenantId: z.string().min(1),
  subject: z.string().min(1).max(300),
  body: z.string().max(5000).optional().nullable(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).default("NORMAL"),
  agentUserId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const ctx = await requireCentralPermission("SUPPORT", "READ");
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const tenantId = url.searchParams.get("tenantId");

  const tickets = await prismaAdmin.supportTicket.findMany({
    where: {
      ...(status ? { status: status as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED" } : {}),
      ...(tenantId ? { tenantId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, ticketNumber: true, subject: true, priority: true, status: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
      agent: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return ok(tickets);
}

export async function POST(req: NextRequest) {
  const ctx = await requireCentralPermission("SUPPORT", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { id: parsed.data.tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!tenant) return err("Tenant not found", 404);

    // Sequential, human-friendly ticket number.
    const count = await prismaAdmin.supportTicket.count();
    const ticketNumber = `T-${4800 + count + 1}`;

    const ticket = await prismaAdmin.supportTicket.create({
      data: {
        ticketNumber,
        tenantId: tenant.id,
        subject: parsed.data.subject,
        body: parsed.data.body ?? null,
        priority: parsed.data.priority,
        agentUserId: parsed.data.agentUserId ?? null,
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
      action: `opened ticket ${ticketNumber}`,
      target: tenant.name,
      kind: "TENANT",
      tenantId: tenant.id,
      ipAddress: getClientIp(req),
    });

    return ok(ticket, "Ticket created", 201);
  } catch (e) {
    return serverError(e);
  }
}
