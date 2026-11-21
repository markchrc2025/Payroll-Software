/**
 * PAY-205 (the build half of PAY-72; Q9b, Mark 17 Nov 2026: every write path
 * has an authenticated principal, including the pg-boss system principal).
 *
 * A job writes as the SYSTEM principal: the job's name, and the user whose
 * request queued it when there was one (a scheduled sweep has none). Every
 * job that writes leaves an AuditLog row with that principal, in the company
 * it wrote to, so a background change is never anonymous.
 */
import type { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";

export const SYSTEM_PRINCIPAL = "SYSTEM" as const;

export interface SystemPrincipal {
  kind: typeof SYSTEM_PRINCIPAL;
  job: string;
  /** The user whose request queued the job; null for a scheduled sweep. */
  enqueuedByUserId: string | null;
}

export function systemPrincipal(job: string, enqueuedByUserId?: string | null): SystemPrincipal {
  return { kind: SYSTEM_PRINCIPAL, job, enqueuedByUserId: enqueuedByUserId ?? null };
}

/** Records what a job wrote, as the SYSTEM principal. Never throws: a log failure must not undo the job. */
export async function recordJobWrite(
  principal: SystemPrincipal,
  args: { tenantId: string; entity: string; entityId?: string | null; action?: "CREATE" | "UPDATE" | "DELETE"; summary: Record<string, unknown> },
): Promise<void> {
  try {
    await prismaAdmin.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: principal.enqueuedByUserId,
        action: args.action ?? "UPDATE",
        entity: args.entity,
        entityId: args.entityId ?? null,
        changes: { principal, ...args.summary } as unknown as Prisma.InputJsonValue,
        userAgent: `pg-boss:${principal.job}`,
      },
    });
  } catch (e) {
    console.error(`[jobs/${principal.job}] could not record the system principal:`, e);
  }
}
