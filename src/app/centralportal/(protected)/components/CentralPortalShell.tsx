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
      style={{ background: "#0A1929" }}
    >
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{ background: "#0F2340", borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex items-center gap-3 px-5 py-5 border-b"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{ background: "#2D6BE4" }}
          >
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Sentire Central</p>
            <p className="text-[10px] text-white/40 mt-0.5">Super Admin Portal</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active ? "text-blue-400" : "text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
                style={active ? { background: "rgba(45,107,228,0.15)" } : {}}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-lg mb-1"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "#2D6BE4" }}
            >
              {user.name?.charAt(0)?.toUpperCase() ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user.name ?? "Admin"}</p>
              <p className="text-[10px] text-white/40 truncate">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-white/40 hover:text-white hover:bg-white/5 text-xs gap-2"
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
