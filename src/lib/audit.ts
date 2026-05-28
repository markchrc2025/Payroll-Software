/**
 * Audit log writer — non-blocking helper used by admin/mutation routes.
 *
 * Always writes via prismaAdmin (BYPASSRLS) so it can capture cross-tenant
 * SUPER_ADMIN actions too (tenantId may be null for global ops — but the
 * AuditLog model requires tenantId to be non-null, so for SUPER_ADMIN global
 * ops we use a sentinel value or pass the affected tenantId directly).
 *
 * Never throws — errors are swallowed after console.error so a logging
 * failure never breaks the primary request.
 */
import type { AuditAction } from "@prisma/client";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";

export type WriteAuditLogParams = {
  tenantId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    await prismaAdmin.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        changes: (params.changes ?? undefined) as unknown as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] Failed to write audit log:", e);
  }
}

/** Extract client IP from a Next.js request. Best-effort. */
export function getClientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
