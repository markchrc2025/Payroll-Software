"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Receipt,
  HeadphonesIcon,
  ChevronRight,
} from "lucide-react";

const NAV = [
  { href: "/portal/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/portal/tenants",   icon: Building2,        label: "Tenants" },
  { href: "/portal/billing",   icon: Receipt,          label: "Provider Billing" },
  { href: "/portal/support",   icon: HeadphonesIcon,   label: "Support" },
];

const STORAGE_KEY = "portal-sidebar-expanded";

type Props = { initials: string; displayName: string };

export function PortalSidebar({ initials, displayName }: Props) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setExpanded(stored === "true");
    setMounted(true);
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  function isActive(href: string) {
    if (href === "/portal/dashboard") return pathname === "/portal/dashboard";
    return pathname === href || pathname.startsWith(href + "/") ||
      (href === "/portal/tenants" && pathname.startsWith("/portal/tenants"));
  }

  const w = mounted ? (expanded ? 200 : 56) : 56;

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-hidden"
      style={{
        width: w,
        background: "#1E3A5F",
        borderRight: "0.5px solid rgba(255,255,255,0.07)",
        transition: "width 0.2s ease",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 mt-3 mb-3 px-2.5 shrink-0">
        <div
          className="flex items-center justify-center rounded-[9px] shrink-0"
          style={{ width: 34, height: 34, background: "rgba(255,255,255,0.12)" }}
        >
          <span className="text-white text-[15px] font-semibold">S</span>
        </div>
        {expanded && (
          <div className="overflow-hidden whitespace-nowrap">
            <p className="text-white text-[12px] font-semibold leading-none">Sentire Central</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Super Admin</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 w-full px-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={!expanded ? label : undefined}
              className="flex items-center rounded-[8px] transition-colors"
              style={{
                height: 38,
                gap: 10,
                padding: "0 10px",
                justifyContent: expanded ? "flex-start" : "center",
                background: active ? "rgba(255,255,255,0.15)" : "transparent",
              }}
            >
              <Icon
                size={18}
                style={{ color: active ? "white" : "rgba(255,255,255,0.45)", flexShrink: 0 }}
              />
              {expanded && (
                <span
                  className="text-[12px] font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ color: active ? "white" : "rgba(255,255,255,0.6)" }}
                >
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Toggle collapse button */}
      <button
        onClick={toggle}
        className="flex items-center justify-center mx-auto mb-2 rounded-[8px] transition-colors hover:bg-white/10"
        style={{ width: 38, height: 28 }}
        title={expanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        <ChevronRight
          size={14}
          style={{
            color: "rgba(255,255,255,0.35)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {/* User initials */}
      <div className="flex items-center gap-2.5 mb-3 px-2.5 shrink-0">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 32, height: 32, background: "rgba(255,255,255,0.12)" }}
          title={displayName}
        >
          <span className="text-white text-[11px] font-semibold">{initials}</span>
        </div>
        {expanded && (
          <span
            className="text-[11px] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {displayName}
          </span>
        )}
      </div>
    </aside>
  );
}
