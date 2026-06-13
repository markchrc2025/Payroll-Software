/**
 * Central Portal audit + subscription-event writers (server-only).
 * Non-throwing: a logging failure must never break the primary request.
 */
import "server-only";
import prismaAdmin from "@/lib/prisma-admin";
import { Prisma } from "@prisma/client";
import type { CentralAuditKind, SubscriptionEventType } from "@prisma/client";

export async function writeCentralAudit(params: {
  actorUserId?: string | null;
  /** Optional; resolved from actorUserId when omitted. */
  actorName?: string;
  action: string;
  target: string;
  kind: CentralAuditKind;
  tenantId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    let actorName = params.actorName;
    if (!actorName && params.actorUserId) {
      const u = await prismaAdmin.user.findUnique({
        where: { id: params.actorUserId },
        select: { firstName: true, lastName: true, email: true },
      });
      actorName = u ? `${u.firstName} ${u.lastName}`.trim() || u.email : undefined;
    }
    await prismaAdmin.centralAuditEvent.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        actorName: actorName || "System",
        action: params.action,
        target: params.target,
        kind: params.kind,
        tenantId: params.tenantId ?? null,
        ipAddress: params.ipAddress ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    console.error("[central-audit] failed to write:", e);
  }
}

export async function logSubscriptionEvent(params: {
  tenantId: string;
  type: SubscriptionEventType;
  detail?: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    await prismaAdmin.subscriptionEvent.create({
      data: {
        tenantId: params.tenantId,
        type: params.type,
        detail: params.detail ?? null,
        actorUserId: params.actorUserId ?? null,
      },
    });
  } catch (e) {
    console.error("[sub-event] failed to write:", e);
  }
}
