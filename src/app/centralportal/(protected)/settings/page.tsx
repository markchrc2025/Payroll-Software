import { getCentralContext, hasCentralPermission } from "@/lib/central-permission";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";
import CentralRolesClient from "./CentralRolesClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getCentralContext();
  if (!ctx) redirect("/centralportal/login");

  const canReadUsers = hasCentralPermission(ctx, "USERS", "READ");
  const canManageUsers = hasCentralPermission(ctx, "USERS", "MANAGE");
  const canReadRoles = hasCentralPermission(ctx, "ROLES", "READ");
  const canManageRoles = hasCentralPermission(ctx, "ROLES", "MANAGE");

  // Settings is reachable with either Users or Roles read access.
  if (!canReadUsers && !canReadRoles) redirect("/centralportal/dashboard");

  const [admins, roles, catalog] = await Promise.all([
    prismaAdmin.user.findMany({
      where: { tenantId: null, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
        centralRoleId: true,
        centralRole: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prismaAdmin.centralRole.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { permissions: true, users: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    }),
    prismaAdmin.centralPermission.findMany({
      orderBy: [{ module: "asc" }, { action: "asc" }],
      select: { id: true, module: true, action: true, label: true },
    }),
  ]);

  const serializableAdmins = admins.map((a) => ({
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    systemRole: a.systemRole,
    isActive: a.isActive,
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    centralRoleId: a.centralRoleId,
    centralRoleName: a.centralRole?.name ?? null,
  }));

  const serializableRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionCount: r._count.permissions,
    userCount: r._count.users,
  }));

  // Roles available for assignment in the Users table (id + name only).
  const roleOptions = serializableRoles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
          Manage Central Portal administrators, roles, and access
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {canReadRoles && (
          <CentralRolesClient
            initialRoles={serializableRoles}
            catalog={catalog}
            canManage={canManageRoles}
          />
        )}

        {canReadUsers && (
          <UsersClient
            initialAdmins={serializableAdmins}
            currentUserId={ctx.userId}
            roleOptions={roleOptions}
            canManage={canManageUsers}
          />
        )}
      </div>
    </div>
  );
}
