import type { TenantTx } from "./with-tenant";

type EmpIdConfig = {
  empIdPrefix: string;
  empIdIncludeYear: boolean;
  empIdPadding: number;
  empIdSuffix: string;
  empIdNextSeq: number;
  empIdSeqYear: number | null;
};

/**
 * Atomically claims the next employee ID sequence number for the given tenant.
 * Must be called inside an active withTenant transaction.
 *
 * Uses SELECT ... FOR UPDATE to lock the Tenant row so concurrent employee
 * creates cannot claim the same number. Whoever commits first wins.
 */
export async function claimEmployeeId(tx: TenantTx, tenantId: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  const rows = await tx.$queryRaw<EmpIdConfig[]>`
    SELECT "empIdPrefix", "empIdIncludeYear", "empIdPadding", "empIdSuffix",
           "empIdNextSeq", "empIdSeqYear"
    FROM "Tenant"
    WHERE id = ${tenantId}
    FOR UPDATE
  `;

  const cfg = rows[0];
  if (!cfg) throw new Error("Tenant not found during employee ID claim");

  const shouldReset = cfg.empIdIncludeYear && cfg.empIdSeqYear !== currentYear;
  const claimedSeq = shouldReset ? 1 : cfg.empIdNextSeq;

  await tx.$executeRaw`
    UPDATE "Tenant"
    SET "empIdNextSeq" = ${claimedSeq + 1},
        "empIdSeqYear" = ${cfg.empIdIncludeYear ? currentYear : null}
    WHERE id = ${tenantId}
  `;

  return formatEmployeeId(cfg, claimedSeq, cfg.empIdIncludeYear ? currentYear : null);
}

/**
 * Atomically reserves N consecutive sequence numbers for a bulk import.
 * Must be called inside an active withTenant transaction.
 * Returns [config, firstClaimedSeq] — the caller builds IDs using
 * formatEmployeeId(cfg, firstClaimedSeq + i, year) for i in 0..n-1.
 */
export async function claimEmployeeIdBulk(
  tx: TenantTx,
  tenantId: string,
  n: number,
): Promise<{ cfg: EmpIdConfig; firstSeq: number; year: number | null }> {
  if (n <= 0) throw new Error("claimEmployeeIdBulk: n must be > 0");

  const currentYear = new Date().getFullYear();

  const rows = await tx.$queryRaw<EmpIdConfig[]>`
    SELECT "empIdPrefix", "empIdIncludeYear", "empIdPadding", "empIdSuffix",
           "empIdNextSeq", "empIdSeqYear"
    FROM "Tenant"
    WHERE id = ${tenantId}
    FOR UPDATE
  `;

  const cfg = rows[0];
  if (!cfg) throw new Error("Tenant not found during bulk employee ID claim");

  const shouldReset = cfg.empIdIncludeYear && cfg.empIdSeqYear !== currentYear;
  const firstSeq = shouldReset ? 1 : cfg.empIdNextSeq;

  await tx.$executeRaw`
    UPDATE "Tenant"
    SET "empIdNextSeq" = ${firstSeq + n},
        "empIdSeqYear" = ${cfg.empIdIncludeYear ? currentYear : null}
    WHERE id = ${tenantId}
  `;

  return { cfg, firstSeq, year: cfg.empIdIncludeYear ? currentYear : null };
}

/** Pure formatter — shared by the claim helpers, the preview API, and the settings page. */
export function formatEmployeeId(
  cfg: Pick<EmpIdConfig, "empIdPrefix" | "empIdIncludeYear" | "empIdPadding" | "empIdSuffix">,
  seq: number,
  year: number | null,
): string {
  const seqStr = String(seq).padStart(cfg.empIdPadding, "0");
  const yearPart = cfg.empIdIncludeYear && year ? String(year) : "";
  return `${cfg.empIdPrefix}${yearPart}${seqStr}${cfg.empIdSuffix}`;
}
