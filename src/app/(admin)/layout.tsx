import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSuperAdminContext();
  if (!ctx) {
    redirect("/login?callbackUrl=/admin/dashboard");
  }

  const initials = "SA";

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Icon sidebar */}
      <aside className="w-14 bg-[#1E3A5F] flex flex-col items-center py-3 gap-1 shrink-0">
        {/* Logo */}
        <div className="w-9 h-9 rounded-[9px] bg-white/10 flex items-center justify-center mb-3">
          <span className="text-white text-sm font-semibold">S</span>
        </div>

        <AdminSidebarNav />

        {/* Bottom: user avatar */}
        <div className="mt-auto w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <span className="text-white text-xs font-medium">{initials}</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
