/**
 * PAY-149: makes sure a company has the seeded Other Deductions (Inventory
 * Deduction). Idempotent; called when the Pay Components list is read, so
 * existing companies get it without a data migration. An archived seeded
 * component is left archived.
 */
import type { TenantTx } from "@/lib/with-tenant";
import { SEEDED_DEDUCTIONS } from "@/lib/payroll/deduction-components";

export async function ensureSeededDeductions(tx: TenantTx, tenantId: string): Promise<void> {
  const have = await tx.payComponent.findMany({
    where: { tenantId, code: { in: SEEDED_DEDUCTIONS.map((d) => d.code) } },
    select: { code: true },
  });
  const codes = new Set(have.map((h) => h.code));
  const missing = SEEDED_DEDUCTIONS.filter((d) => !codes.has(d.code));
  if (missing.length === 0) return;
  await tx.payComponent.createMany({
    data: missing.map((d) => ({
      tenantId, code: d.code, name: d.name, kind: "DEDUCTION" as const, taxability: "NON_TAXABLE" as const,
      isSystem: true, isLossOrDamage: d.isLossOrDamage,
    })),
    skipDuplicates: true,
  });
}
