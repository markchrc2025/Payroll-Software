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
          select: { name: true, logoKey: true, logoUrl: true },
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

  // The sidebar tile shows the uploaded company logo when one exists, falling
  // back to the tenant initials. We point at the logo endpoint (which resolves
  // to a public or presigned R2 URL) rather than embedding the URL here.
  const tenantLogoUrl =
    tenant?.logoKey || tenant?.logoUrl ? "/api/settings/tenant/logo" : null;

  return (
    // .sx-frappe switches on the Frappe UI style (Option B) for the admin only;
    // see the "Frappe UI style" block in src/app/globals.css.
    <div className="sx-frappe flex min-h-screen bg-background">
      {/* Sidebar — self-contained client component with collapse logic */}
      <SidebarNav
        tenantName={tenantName}
        tenantInitials={tenantInitials}
        tenantLogoUrl={tenantLogoUrl}
        userName={displayName}
        userRole={userRole}
        userInitials={initials}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header */}
        <header className="flex h-12 items-center gap-3 px-4 lg:px-5 border-b bg-card sticky top-0 z-20">
          {/* Mobile: show logo inline */}
          <div className="lg:hidden shrink-0 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#1F1F1F] text-xs font-bold text-white">
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

        <main className="flex-1 p-5 pb-10 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
