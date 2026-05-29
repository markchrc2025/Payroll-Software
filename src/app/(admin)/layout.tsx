import { redirect } from "next/navigation";
import Link from "next/link";
import { getSuperAdminContext } from "@/lib/super-admin-auth";

const navItems = [
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/statutory", label: "Statutory Rules" },
  { href: "/admin/audit-log", label: "Audit Log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSuperAdminContext();
  if (!ctx) {
    redirect("/login?callbackUrl=/admin/tenants");
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-200">
          <p className="font-bold text-gray-900 text-sm">Sentire Payroll</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 uppercase tracking-wider">
            SUPER_ADMIN
          </span>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded mx-2 mb-0.5 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
