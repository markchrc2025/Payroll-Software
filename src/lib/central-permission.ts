/**
 * Central Portal RBAC — authorization helpers for SUPER_ADMIN routes & pages.
 *
 * Layering:
 *   • `systemRole = SUPER_ADMIN` gates *whether* you can reach the Central
 *     Portal at all (enforced at login + layout).
 *   • A `CentralRole` (with its CentralPermission set) gates *what* you can do
 *     once inside.
 *
 * The built-in "Super Admin" role (isSystem = true) always bypasses every
 * check, so the bootstrap administrators can never lock themselves out — even
 * if the permission catalog changes underneath them.
 *
 * Like getSuperAdminContext, every call re-validates against the live DB (the
 * 8h JWT is never trusted for authorization), so a deactivated/soft-deleted
 * admin loses access on their very next request.
 */
import { auth } from "@/auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import { forbidden, unauthorized } from "@/lib/api-response";
import type { CentralModule, CentralAction } from "@prisma/client";

export type CentralContext = {
  userId: string;
  centralRoleId: string | null;
  centralRoleName: string | null;
  /** True when the user holds the built-in Super Admin role (full bypass). */
  isSystemSuperAdmin: boolean;
  /** Set of "MODULE:ACTION" strings the user is granted. */
  permissions: Set<string>;
};

/**
 * Resolve the current Central Portal caller and their effective permissions.
 * Returns null when not signed in or not an active SUPER_ADMIN.
 */
export async function getCentralContext(): Promise<CentralContext | null> {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.systemRole !== "SUPER_ADMIN") return null;

  const user = await prismaAdmin.user.findFirst({
    where: {
      id: session.user.id,
      tenantId: null,
      systemRole: "SUPER_ADMIN",
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      centralRoleId: true,
      centralRole: {
        select: {
          name: true,
          isSystem: true,
          deletedAt: true,
          permissions: {
            select: { permission: { select: { module: true, action: true } } },
          },
        },
      },
    },
  });
  if (!user) return null;

  // A soft-deleted role grants nothing.
  const role =
    user.centralRole && user.centralRole.deletedAt === null ? user.centralRole : null;

  const permissions = new Set<string>();
  if (role) {
    for (const rp of role.permissions) {
      permissions.add(`${rp.permission.module}:${rp.permission.action}`);
    }
  }

  return {
    userId: user.id,
    centralRoleId: role ? user.centralRoleId : null,
    centralRoleName: role?.name ?? null,
    isSystemSuperAdmin: role?.isSystem === true,
    permissions,
  };
}

/**
 * Pure permission check against a resolved context.
 * MANAGE implies READ for the same module.
 */
export function hasCentralPermission(
  ctx: CentralContext,
  module: CentralModule,
  action: CentralAction,
): boolean {
  if (ctx.isSystemSuperAdmin) return true;
  if (ctx.permissions.has(`${module}:${action}`)) return true;
  // Anyone who can MANAGE a module can implicitly READ it.
  if (action === "READ" && ctx.permissions.has(`${module}:MANAGE`)) return true;
  return false;
}

/**
 * API route guard. Returns the CentralContext on success, or a Response
 * (401/403) to return directly from the handler.
 *
 *   const ctx = await requireCentralPermission("BILLING", "READ");
 *   if (ctx instanceof Response) return ctx;
 *   // ...use ctx.userId
 */
export async function requireCentralPermission(
  module: CentralModule,
  action: CentralAction,
): Promise<CentralContext | Response> {
  const ctx = await getCentralContext();
  if (!ctx) return unauthorized();
  if (!hasCentralPermission(ctx, module, action)) return forbidden();
  return ctx;
}

/**
 * Server-Component page guard. Redirects to login when unauthenticated, or to
 * the Central Portal dashboard (always reachable by any central admin) when the
 * caller lacks the required permission. Returns the context otherwise.
 */
export async function requireCentralPage(
  module: CentralModule,
  action: CentralAction,
): Promise<CentralContext> {
  const ctx = await getCentralContext();
  if (!ctx) redirect("/centralportal/login");
  if (!hasCentralPermission(ctx, module, action)) {
    redirect("/centralportal/dashboard");
  }
  return ctx;
}
