/**
 * Statutory rule resolver (Phase D1).
 *
 * Picks the active rule for a given (tenant, category, asOf) tuple:
 *
 *   1. Tenant-scoped override active for `asOf` → preferred.
 *   2. Else: global rule (tenantId IS NULL) active for `asOf`.
 *   3. Else: throws — payroll must never silently fall back to hardcoded math.
 *
 * "Active" means `effectiveFrom <= asOf` AND (`effectiveTo IS NULL` OR
 * `asOf < effectiveTo`). When multiple rows qualify, the one with the latest
 * `effectiveFrom` wins (the most recently published rule).
 *
 * USAGE:
 *   • Inside a tenant-scoped request: `await getActiveRule(tx, tenantId, ...)`
 *     where `tx` is the TenantTx from `withTenant(...)`.
 *   • Background / cross-tenant compute: pass `prismaAdmin` and `tenantId`
 *     explicitly; the query is filtered by tenantId in WHERE.
 *
 * The resolver issues a SINGLE query that returns up to 2 rows (one tenant,
 * one global) and selects the winner in JS. This avoids two round trips.
 */
import type { Prisma, StatutoryCategory } from "@prisma/client";
import {
  parseStatutoryPayload,
  type StatutoryPayloadFor,
} from "./types";

// Both `prisma` (tenant-scoped) and `prismaAdmin` share the same model API.
// We accept either via the lowest-common-denominator type.
type RuleClient = {
  statutoryRule: {
    findMany: (args: {
      where: Prisma.StatutoryRuleWhereInput;
      orderBy?: Prisma.StatutoryRuleOrderByWithRelationInput;
    }) => Promise<
      Array<{
        id: string;
        tenantId: string | null;
        category: StatutoryCategory;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        legalBasis: string;
        version: string;
        payload: Prisma.JsonValue;
      }>
    >;
  };
};

export interface ResolvedRule<C extends StatutoryCategory> {
  id: string;
  category: C;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  legalBasis: string;
  version: string;
  /** `null` = global baseline; non-null = tenant override. */
  tenantId: string | null;
  payload: StatutoryPayloadFor<C>;
}

export class StatutoryRuleNotFoundError extends Error {
  constructor(category: StatutoryCategory, tenantId: string, asOf: Date) {
    super(
      `No active StatutoryRule for category=${category} tenant=${tenantId} asOf=${asOf.toISOString()}`,
    );
    this.name = "StatutoryRuleNotFoundError";
  }
}

export async function getActiveRule<C extends StatutoryCategory>(
  client: RuleClient,
  tenantId: string,
  category: C,
  asOf: Date,
): Promise<ResolvedRule<C>> {
  // Pull every candidate row (tenant override OR global) that could be active
  // at `asOf`. Order by tenantId DESC NULLS LAST so tenant rows come first,
  // then by effectiveFrom DESC for "most recently published wins".
  const rows = await client.statutoryRule.findMany({
    where: {
      category,
      effectiveFrom: { lte: asOf },
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: asOf } },
          ],
        },
        {
          OR: [{ tenantId }, { tenantId: null }],
        },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  // Prefer the latest tenant-scoped row; fall back to the latest global row.
  const tenantRow = rows.find((r) => r.tenantId === tenantId);
  const globalRow = rows.find((r) => r.tenantId === null);
  const winner = tenantRow ?? globalRow;
  if (!winner) {
    throw new StatutoryRuleNotFoundError(category, tenantId, asOf);
  }

  return {
    id: winner.id,
    category,
    effectiveFrom: winner.effectiveFrom,
    effectiveTo: winner.effectiveTo,
    legalBasis: winner.legalBasis,
    version: winner.version,
    tenantId: winner.tenantId,
    payload: parseStatutoryPayload(category, winner.payload),
  };
}
