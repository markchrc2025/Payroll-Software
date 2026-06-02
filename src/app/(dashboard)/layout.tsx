import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GlobalSearch } from "@/components/global-search";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";
import prismaAdmin from "@/lib/prisma-admin";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Fetch tenant name + user role in parallel
  const [tenant, role] = await Promise.all([
    session.user.tenantId
      ? prismaAdmin.tenant.findUnique({
          where: { id: session.user.tenantId },
          select: { name: true },
        })
      : null,
    session.user.roleId
      ? prismaAdmin.role.findUnique({
          where: { id: session.user.roleId },
          select: { name: true },
        })
      : null,
  ]);

  const displayName = session.user.name?.trim() || session.user.email || "User";
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const tenantName = tenant?.name ?? "Sentire";
  const tenantInitials = tenantName
    .split(/\s+/)
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const userRole = role?.name ?? (session.user.systemRole === "SUPER_ADMIN" ? "Super Admin" : "Staff");

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — self-contained client component with collapse logic */}
      <SidebarNav
        tenantName={tenantName}
        tenantInitials={tenantInitials}
        userName={displayName}
        userRole={userRole}
        userInitials={initials}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header */}
        <header className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b bg-card sticky top-0 z-20 shadow-sm">
          {/* Mobile: show logo inline */}
          <div className="lg:hidden shrink-0 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#5A93F7] to-[#2D6BE4] text-xs font-bold text-white">
              S
            </div>
            <span className="text-sm font-semibold text-foreground">Sentire</span>
          </div>

          {/* Search — hidden on very small screens */}
          <div className="hidden sm:flex flex-1 max-w-sm">
            <GlobalSearch />
          </div>

          <div className="flex-1" />

          <UserMenu displayName={displayName} initials={initials} />
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
