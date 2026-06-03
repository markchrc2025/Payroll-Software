"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Receipt,
  HeadphonesIcon,
  ShieldCheck,
} from "lucide-react";

const NAV = [
  { href: "/portal/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/portal/tenants",   icon: Building2,        label: "Tenants" },
  { href: "/portal/billing",   icon: Receipt,          label: "Provider Billing" },
  { href: "/portal/support",   icon: HeadphonesIcon,   label: "Support" },
];

type Props = { initials: string };

export function PortalSidebar({ initials }: Props) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/portal/dashboard") return pathname === "/portal/dashboard";
    return pathname === href || pathname.startsWith(href + "/") ||
      // tenant sub-pages (/portal/tenants/[id]/...) should keep Tenants active
      (href === "/portal/tenants" && pathname.startsWith("/portal/tenants"));
  }

  return (
    <aside
      className="hidden lg:flex flex-col items-center shrink-0 sticky top-0 h-screen overflow-hidden"
      style={{ width: 56, background: "#1E3A5F", borderRight: "0.5px solid rgba(255,255,255,0.07)" }}
    >
      {/* Brand mark */}
      <div
        className="flex items-center justify-center mt-3 mb-3 rounded-[9px] shrink-0"
        style={{ width: 34, height: 34, background: "rgba(255,255,255,0.12)" }}
      >
        <span className="text-white text-[15px] font-semibold">S</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-0.5 w-full px-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className="flex items-center justify-center rounded-[8px] transition-colors"
              style={{
                width: 38,
                height: 38,
                background: active ? "rgba(255,255,255,0.15)" : "transparent",
              }}
            >
              <Icon
                size={18}
                style={{ color: active ? "white" : "rgba(255,255,255,0.45)" }}
              />
            </Link>
          );
        })}
      </nav>

      {/* Security badge */}
      <div
        className="flex items-center justify-center mt-auto mb-3 rounded-[8px]"
        style={{ width: 38, height: 38, background: "rgba(255,255,255,0.06)" }}
        title="Super Admin"
      >
        <ShieldCheck size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
      </div>

      {/* User initials */}
      <div
        className="flex items-center justify-center mb-3 rounded-full shrink-0"
        style={{ width: 32, height: 32, background: "rgba(255,255,255,0.12)" }}
      >
        <span className="text-white text-[11px] font-semibold">{initials}</span>
      </div>
    </aside>
  );
}
