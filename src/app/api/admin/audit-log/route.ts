/**
 * GET /api/admin/audit-log
 *
 * List audit log entries across all tenants (or filtered by tenantId).
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 *
 * Query params:
 *   tenantId   — filter by tenant
 *   actorUserId — filter by actor
 *   entity     — filter by entity type (e.g. "Tenant", "Employee")
 *   entityId   — filter by entity ID
 *   action     — filter by AuditAction enum value
 *   from       — ISO date lower bound (createdAt ≥ from)
 *   to         — ISO date upper bound (createdAt ≤ to)
 *   page       — default 1
 *   limit      — default 50, max 200
 */
import type { NextRequest } from "next/server";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { unauthorized, err, paginated } from "@/lib/api-response";
import type { AuditAction } from "@prisma/client";

const VALID_ACTIONS: AuditAction[] = [
  "CREATE", "UPDATE", "DELETE", "READ", "APPROVE",
  "REJECT", "EXPORT", "LOGIN", "LOGOUT", "IMPERSONATE",
];

export async function GET(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const skip  = (page - 1) * limit;

  const tenantId    = url.searchParams.get("tenantId") ?? undefined;
  const actorUserId = url.searchParams.get("actorUserId") ?? undefined;
  const entity      = url.searchParams.get("entity") ?? undefined;
  const entityId    = url.searchParams.get("entityId") ?? undefined;
  const actionParam = url.searchParams.get("action");
  const from        = url.searchParams.get("from");
  const to          = url.searchParams.get("to");

  if (actionParam && !VALID_ACTIONS.includes(actionParam as AuditAction)) {
    return err(`Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`, 400);
  }

  const where = {
    ...(tenantId    ? { tenantId }    : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(entity      ? { entity }      : {}),
    ...(entityId    ? { entityId }    : {}),
    ...(actionParam ? { action: actionParam as AuditAction } : {}),
    ...((from || to) ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      },
    } : {}),
  };

  const [total, logs] = await Promise.all([
    prismaAdmin.auditLog.count({ where }),
    prismaAdmin.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        tenantId: true,
        actorUserId: true,
        action: true,
        entity: true,
        entityId: true,
        changes: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
  ]);

  return paginated(logs, total, page, limit);
}
