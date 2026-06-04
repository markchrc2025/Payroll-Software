import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { PortalSidebar } from "@/components/portal-sidebar";

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
    <div className="flex h-screen" style={{ background: "#F8FAFC", fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      <PortalSidebar initials={initials} displayName={displayName} />

      <main className="flex-1 overflow-auto" style={{ padding: 20 }}>{children}</main>
    </div>
  );
}
