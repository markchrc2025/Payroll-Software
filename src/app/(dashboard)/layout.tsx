import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users,
  Building2,
  GitBranch,
  LayoutDashboard,
  Wallet,
  CalendarClock,
  FileBarChart2,
  Settings,
  LogOut,
  CalendarDays,
} from "lucide-react";
import { auth } from "@/auth";
import { signOutAction } from "./_actions/sign-out";

const navSections: {
  label: string;
  items: { href: string; label: string; icon: typeof Users }[];
}[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Workforce",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/departments", label: "Departments", icon: Building2 },
      { href: "/branches", label: "Branches", icon: GitBranch },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/attendance", label: "Time & Attendance", icon: CalendarClock },
      { href: "/leave", label: "Leave", icon: CalendarDays },
      { href: "/payroll", label: "Payroll", icon: Wallet },
      { href: "/reports", label: "Reports", icon: FileBarChart2 },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function SentireLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-sky-600 shadow-sm ring-1 ring-white/20">
        <span className="text-sm font-bold text-white">S</span>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
          Sentire
        </div>
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
          Payroll
        </div>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const displayName = session.user.name?.trim() || session.user.email || "User";
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar text-sidebar-foreground shrink-0 border-r border-sidebar-border">
        <div className="flex items-center px-5 py-5 border-b border-sidebar-border/60">
          <SentireLogo />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border/60 space-y-3">
          <div className="flex items-center gap-2.5 px-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold ring-1 ring-sidebar-border">
              {initials}
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{displayName}</div>
              <div className="text-[11px] text-sidebar-foreground/60 truncate">
                {session.user.email}
              </div>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b bg-sidebar text-sidebar-foreground">
          <SentireLogo />
          <form action={signOutAction}>
            <button
              type="submit"
              className="p-2 rounded-md hover:bg-sidebar-accent"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
