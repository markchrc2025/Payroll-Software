/**
 * withTenant — runs a callback inside a transaction with the per-tenant
 * Postgres GUC `app.current_tenant_id` set, so RLS policies see the right
 * tenant. ALL tenant-scoped reads/writes from API routes MUST go through this
 * helper.
 *
 * Usage:
 *   const employees = await withTenant(auth.tenantId, (tx) =>
 *     tx.employee.findMany({ where: { isActive: true } })
 *   );
 *
 * Notes:
 *   • Uses `set_config(..., true)` so the GUC is SCOPED TO THE TRANSACTION
 *     (third arg = is_local). This is safe across pooled connections.
 *   • tenantId is validated as cuid-shaped (a-z0-9 only) to prevent injection;
 *     we still bind via $executeRaw parameter.
 */
import prisma from "./prisma";
import type { Prisma } from "@prisma/client";

const CUID_RE = /^[a-z0-9]+$/i;

export type TenantTx = Prisma.TransactionClient;

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!CUID_RE.test(tenantId)) {
    throw new Error("withTenant: invalid tenantId");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx as unknown as TenantTx);
  }, { maxWait: 15000, timeout: 30000 });
}
