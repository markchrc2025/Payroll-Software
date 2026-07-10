/**
 * Tenant-realm SSO resolution (Authenticize as OIDC IdP).
 *
 * Authenticize proves a person owns an email; it is NOT a directory of who may
 * use Sentire Payroll. This resolver answers the app's own question: does this
 * proven identity map to an existing, active tenant user?
 *
 * Company-code-first: an email may belong to accounts in several tenants (the
 * `@@unique([tenantId, email])` contract), and the SSO flow carries no
 * password to disambiguate — so the user selects their workspace by company
 * code (the same field the password login already requires). Given the code we
 * scope to one tenant and match by:
 *   1. the Authenticize subject link (fast path on repeat logins), else
 *   2. email within that tenant (first login; the caller then persists the link).
 *
 * SUPER_ADMIN (Central Portal) accounts have tenantId = null and are therefore
 * never reachable here — the tenant and central realms stay separate.
 */
import type { SystemRole } from "@prisma/client";

export type TenantSsoUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  systemRole: SystemRole;
  roleId: string | null;
  authenticizeUserId: string | null;
};

export type TenantSsoResult =
  | { ok: true; user: TenantSsoUser }
  | { ok: false; reason: "missing_input" | "unknown_company" | "no_account" };

/** A user row as Prisma returns it (tenantId nullable at the type level). */
type RawUserRow = Omit<TenantSsoUser, "tenantId"> & { tenantId: string | null };

/**
 * Minimal shape of the (RLS-bypassing) admin Prisma client this needs.
 * `PromiseLike` + `unknown` args keep the real `PrismaClient` structurally
 * assignable without pulling in Prisma's generic query types.
 */
export interface TenantSsoDb {
  tenant: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  user: {
    findFirst(args: unknown): PromiseLike<RawUserRow | null>;
  };
}

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  tenantId: true,
  systemRole: true,
  roleId: true,
  authenticizeUserId: true,
} as const;

export async function resolveTenantSsoUser(
  db: TenantSsoDb,
  input: { email: string; companyCode?: string; authenticizeUserId?: string },
): Promise<TenantSsoResult> {
  const email = input.email.trim().toLowerCase();
  const companyCode = input.companyCode?.trim().toUpperCase();
  const authenticizeUserId = input.authenticizeUserId?.trim();

  if (!email || !companyCode) return { ok: false, reason: "missing_input" };

  const tenant = await db.tenant.findFirst({
    where: { companyCode, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) return { ok: false, reason: "unknown_company" };

  const live = { isActive: true, deletedAt: null } as const;
  // tenantId comes back as string|null on the row type, but we filtered by a
  // concrete tenant.id, so normalise it to that.
  const normalise = (u: RawUserRow): TenantSsoUser => ({ ...u, tenantId: tenant.id });

  // Fast path: a previously-linked account in this tenant.
  if (authenticizeUserId) {
    const linked = await db.user.findFirst({
      where: { tenantId: tenant.id, authenticizeUserId, ...live },
      select: USER_SELECT,
    });
    if (linked) return { ok: true, user: normalise(linked) };
  }

  // First login: match by email within the chosen tenant. systemRole is pinned
  // to TENANT_USER so a stray same-email admin row can never be matched here.
  const byEmail = await db.user.findFirst({
    where: { tenantId: tenant.id, email, systemRole: "TENANT_USER", ...live },
    select: USER_SELECT,
  });
  if (byEmail) return { ok: true, user: normalise(byEmail) };

  return { ok: false, reason: "no_account" };
}
