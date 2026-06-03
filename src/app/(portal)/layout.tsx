import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { PortalSidebar } from "@/components/portal-sidebar";
import { UserMenu } from "@/components/user-menu";

export const metadata = {
  title: "Sentire Central Portal",
};

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = await getSuperAdminContext();
  if (!ctx) {
    redirect("/centralportal/login");
  }

  const session = await auth();
  const displayName =
    session?.user?.name?.trim() || session?.user?.email || "Super Admin";
  const initials = displayName
    .split(/\s+/)
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen" style={{ background: "#F8FAFC" }}>
      <PortalSidebar initials={initials} />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header */}
        <header
          className="flex items-center justify-between px-5 py-3 shrink-0 sticky top-0 z-20"
          style={{
            background: "white",
            borderBottom: "0.5px solid #E5E7EB",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold uppercase tracking-[1.8px]"
              style={{ color: "#1E3A5F" }}
            >
              Central Portal
            </span>
            <span
              className="text-[10px] rounded-full px-2 py-0.5 font-semibold"
              style={{ background: "#FEE2E2", color: "#991B1B" }}
            >
              SUPER ADMIN
            </span>
          </div>
          <UserMenu displayName={displayName} initials={initials} />
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
