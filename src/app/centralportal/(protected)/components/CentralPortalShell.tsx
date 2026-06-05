"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  LifeBuoy,
  LogOut,
  Shield,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/centralportal/dashboard", icon: LayoutDashboard },
  { label: "Tenants",   href: "/centralportal/tenants",   icon: Building2 },
  { label: "Support",   href: "/centralportal/support",   icon: LifeBuoy },
  { label: "Settings",  href: "/centralportal/settings",  icon: Settings },
];

type Props = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null };
};

export default function CentralPortalShell({ children, user }: Props) {
  const path = usePathname();

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "#F9FAFB", fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}
    >
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{ background: "#FFFFFF", borderRight: "1px solid #E5E7EB" }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-3 px-5 py-5 border-b"
          style={{ borderColor: "#F3F4F6" }}
        >
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{ background: "#1E3A5F" }}
          >
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: "#111827" }}>
              Sentire Central
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Super Admin Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active ? "" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
                style={active ? { background: "rgba(30,58,95,0.08)", color: "#1E3A5F" } : {}}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t" style={{ borderColor: "#F3F4F6" }}>
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-lg mb-1"
            style={{ background: "#F9FAFB" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "#1E3A5F" }}
            >
              {user.name?.charAt(0)?.toUpperCase() ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "#111827" }}>
                {user.name ?? "Admin"}
              </p>
              <p className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-500 hover:text-gray-800 hover:bg-gray-50 text-xs gap-2"
            onClick={() => signOut({ callbackUrl: "/centralportal/login" })}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
