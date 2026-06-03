"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Headphones,
  BookText,
  ClipboardList,
} from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", icon: LayoutDashboard, title: "Dashboard", group: "dashboard" },
  { href: "/admin/tenants", icon: Building2, title: "Tenants", group: "tenants" },
  { href: "/admin/statutory", icon: BookText, title: "Statutory Rules", group: "statutory" },
  { href: "/admin/audit-log", icon: ClipboardList, title: "Audit Log", group: "audit" },
];

export function AdminSidebarNav() {
  const pathname = usePathname();

  function isActive(group: string) {
    if (group === "dashboard") return pathname === "/admin/dashboard" || pathname === "/admin";
    if (group === "tenants") return pathname.startsWith("/admin/tenants");
    if (group === "statutory") return pathname.startsWith("/admin/statutory");
    if (group === "audit") return pathname.startsWith("/admin/audit-log");
    return false;
  }

  return (
    <>
      {NAV.map(({ href, icon: Icon, title, group }) => (
        <Link
          key={href}
          href={href}
          title={title}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            isActive(group)
              ? "bg-white/15"
              : "hover:bg-white/10"
          }`}
        >
          <Icon
            size={18}
            className={isActive(group) ? "text-white" : "text-white/50"}
          />
        </Link>
      ))}
    </>
  );
}
