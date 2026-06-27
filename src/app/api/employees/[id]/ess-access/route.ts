/**
 * POST /api/employees/[id]/ess-access — manage an employee's ESS access.
 *
 * Body (discriminated by `action`):
 *   { action: "activate" }                          — grant access (→ INVITED)
 *   { action: "disable", reason }                   — revoke now (→ DISABLED), kills sessions
 *   { action: "schedule", deactivateAt, reason }    — schedule future deactivation
 *   { action: "cancel_schedule" }                   — cancel a pending schedule
 *
 * Requires EMPLOYEES:UPDATE.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("disable"), reason: z.string().trim().min(1, "A reason is required").max(500) }),
  z.object({
    action: z.literal("schedule"),
    deactivateAt: z.coerce.date(),
    reason: z.string().trim().min(1, "A reason is required").max(500),
  }),
  z.object({ action: z.literal("cancel_schedule") }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(req, "EMPLOYEES", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const input = parsed.data;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.employee.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, essAccessStatus: true, essActivatedAt: true, workEmail: true },
    });
    if (!emp) return { kind: "not_found" as const };

    if (input.action === "activate") {
      // Safeguard: an ESS account must be tied to a work email (used for
      // invites, password reset, and notifications). No email → no activation.
      if (!emp.workEmail) {
        return { kind: "needs_email" as const };
      }
      await tx.employee.update({
        where: { id },
        data: {
          // Re-granting clears any prior disable/scheduled deactivation.
          essAccessStatus: "INVITED",
          essInvitedAt: new Date(),
          essInvitedByUserId: ctx.userId,
          essDeactivateAt: null,
          essDeactivateReason: null,
          essDeactivateScheduledByUserId: null,
        },
      });
      return { kind: "ok" as const, message: "ESS access granted" };
    }

    if (input.action === "disable") {
      await tx.employee.update({
        where: { id },
        data: {
          essAccessStatus: "DISABLED",
          essDeactivateAt: new Date(),
          essDeactivateReason: input.reason,
          essDeactivateScheduledByUserId: ctx.userId,
        },
      });
      // End any live sessions immediately.
      await tx.essSession.updateMany({
        where: { employeeId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { kind: "ok" as const, message: "ESS access disabled" };
    }

    if (input.action === "schedule") {
      // A past/now date is treated as an immediate disable.
      if (input.deactivateAt.getTime() <= Date.now()) {
        await tx.employee.update({
          where: { id },
          data: {
            essAccessStatus: "DISABLED",
            essDeactivateAt: new Date(),
            essDeactivateReason: input.reason,
            essDeactivateScheduledByUserId: ctx.userId,
          },
        });
        await tx.essSession.updateMany({
          where: { employeeId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { kind: "ok" as const, message: "ESS access disabled" };
      }
      await tx.employee.update({
        where: { id },
        data: {
          essDeactivateAt: input.deactivateAt,
          essDeactivateReason: input.reason,
          essDeactivateScheduledByUserId: ctx.userId,
        },
      });
      return { kind: "ok" as const, message: "ESS deactivation scheduled" };
    }

    // cancel_schedule
    await tx.employee.update({
      where: { id },
      data: {
        essDeactivateAt: null,
        essDeactivateReason: null,
        essDeactivateScheduledByUserId: null,
      },
    });
    return { kind: "ok" as const, message: "Scheduled deactivation cancelled" };
  });

  if (result.kind === "not_found") return notFound("Employee");
  if (result.kind === "needs_email") {
    return err("Add a work email to this employee before enabling ESS access.", 422);
  }

  void writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "UPDATE",
    entity: "Employee",
    entityId: id,
    changes: {
      field: "essAccess",
      essAction: input.action,
      ...("reason" in input ? { reason: input.reason } : {}),
      ...("deactivateAt" in input ? { deactivateAt: input.deactivateAt.toISOString() } : {}),
    },
    ipAddress: getClientIp(req),
  });

  return ok({ id }, result.message);
}
