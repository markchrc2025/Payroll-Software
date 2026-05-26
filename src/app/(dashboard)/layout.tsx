import type { ReactNode } from "react";
import Link from "next/link";
import { Users, Building2, GitBranch, LayoutDashboard } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/branches", label: "Branches", icon: GitBranch },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-background border-r shrink-0">
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <span className="text-lg font-bold tracking-tight">PayrollPH</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t text-xs text-muted-foreground">
          Phase 2 — Dev Mode
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar (mobile nav placeholder) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-background">
          <span className="font-bold text-base">PayrollPH</span>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
