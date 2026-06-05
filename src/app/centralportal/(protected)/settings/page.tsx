import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const admins = await prismaAdmin.user.findMany({
    where: { tenantId: null, deletedAt: null },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const serializable = admins.map((a) => ({
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    systemRole: a.systemRole,
    isActive: a.isActive,
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
          Manage Central Portal administrators and access
        </p>
      </div>

      <UsersClient initialAdmins={serializable} currentUserId={ctx.userId} />
    </div>
  );
}
