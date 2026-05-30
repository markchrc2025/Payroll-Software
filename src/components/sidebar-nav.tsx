"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  GitBranch,
  MapPin,
  Briefcase,
  Package,
  AlertCircle,
  ArrowRightLeft,
  UserCheck,
  Receipt,
  UserSearch,
  Clock,
  CalendarDays,
  Timer,
  CalendarOff,
  FileText,
  SlidersHorizontal,
  Landmark,
  Building,
  ShieldCheck,
  BarChart2,
  ClipboardList,
  KeyRound,
  ChevronsUpDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  badgeAmber?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Workforce",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/departments", label: "Departments", icon: Building2 },
      { href: "/branches", label: "Branches", icon: GitBranch },
      { href: "/work-locations", label: "Locations", icon: MapPin },
      { href: "/positions", label: "Positions", icon: Briefcase },
      { href: "/assets", label: "Assets", icon: Package },
    ],
  },
  {
    label: "HR Ops",
    items: [
      { href: "/incidents", label: "Incidents", icon: AlertCircle },
      { href: "/movements", label: "Movements", icon: ArrowRightLeft },
      { href: "/profile-update-requests", label: "Profile Requests", icon: UserCheck },
      { href: "/expense-claims", label: "Claims", icon: Receipt },
    ],
  },
  {
    label: "Talent",
    items: [
      { href: "/recruitment", label: "Recruitment", icon: UserSearch },
    ],
  },
  {
    label: "Time",
    items: [
      { href: "/attendance", label: "Time & Attendance", icon: Clock },
      { href: "/shift-schedules", label: "Shift Schedules", icon: CalendarDays },
      { href: "/ot-applications", label: "OT Applications", icon: Timer },
      { href: "/leave", label: "Leave", icon: CalendarOff },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Payroll Runs", icon: FileText },
      { href: "/pay-components", label: "Pay Components", icon: SlidersHorizontal },
      { href: "/loans", label: "Loans", icon: Landmark },
      { href: "/bank-files", label: "Bank Files", icon: Building },
    ],
  },
  {
    label: "Compliance",
    items: [
      { href: "/reports", label: "Gov't Reports", icon: ShieldCheck },
      { href: "/analytics", label: "Analytics", icon: BarChart2 },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "Company & Branding", icon: Building2 },
      { href: "/settings/pay-rules", label: "Pay Rules", icon: ClipboardList },
      { href: "/settings/holidays", label: "Holiday Calendar", icon: CalendarDays },
      { href: "/settings/leave-policies", label: "Leave Policies", icon: CalendarOff },
      { href: "/settings/roles", label: "Roles & Permissions", icon: KeyRound },
      { href: "/ai", label: "AI Assistant", icon: Sparkles },
    ],
  },
];

type Props = {
  tenantName: string;
  tenantInitials: string;
  userName: string;
  userRole: string;
  userInitials: string;
};

export function SidebarNav({
  tenantName,
  tenantInitials,
  userName,
  userRole,
  userInitials,
}: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Avoid layout shift on first render — render expanded until mounted
  const isCollapsed = mounted && collapsed;

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200 ease-in-out relative"
      style={{
        width: isCollapsed ? "64px" : "256px",
        background: "linear-gradient(180deg, #0C2240, #091A30)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute -left-16 -top-20 h-80 w-80"
        style={{
          background:
            "radial-gradient(circle, rgba(45,107,228,0.30) 0%, transparent 70%)",
        }}
      />

      {/* Toggle button */}
      <button
        onClick={toggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-[72px] z-50 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#0E2A4A] text-[#7E8FA8] shadow-md hover:text-white transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Brand */}
      <div className="flex items-center gap-[11px] px-[13px] py-[22px] overflow-hidden">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-[#5A93F7] to-[#2D6BE4] text-[19px] font-extrabold text-white shadow-[0_6px_16px_-4px_rgba(45,107,228,0.6)] ring-1 ring-white/40">
          S
        </div>
        {!isCollapsed && (
          <div className="relative leading-none overflow-hidden">
            <div className="text-[15.5px] font-bold tracking-[-0.2px] text-white whitespace-nowrap">
              Sentire Payroll
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[2.2px] text-[#7E8FA8] whitespace-nowrap">
              HRIS &amp; Payroll
            </div>
          </div>
        )}
      </div>

      {/* Workspace switcher */}
      {!isCollapsed ? (
        <div className="mx-3.5 mb-1 flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.045] px-3 py-2.5 hover:bg-white/[0.07] transition-colors overflow-hidden">
          <div className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-gradient-to-br from-[#3D5B86] to-[#27395A] text-[11px] font-bold text-[#CBD8EC]">
            {tenantInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-[#E4ECF7]">
              {tenantName}
            </div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.4px] text-[#7E8FA8]">
              Growth plan
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-none text-[#6C7E98]" />
        </div>
      ) : (
        <div className="mx-auto mb-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] bg-gradient-to-br from-[#3D5B86] to-[#27395A] text-[11px] font-bold text-[#CBD8EC] hover:brightness-110 transition-all">
          {tenantInitials}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {/* Section label — hidden when collapsed */}
            {!isCollapsed && (
              <div className="px-[23px] pb-1.5 pt-3.5 text-[10px] font-bold uppercase tracking-[1.6px] text-white/[0.34]">
                {section.label}
              </div>
            )}
            {isCollapsed && (
              <div className="mx-3 mt-3.5 mb-1 border-t border-white/[0.06]" />
            )}
            <div className={["space-y-px", isCollapsed ? "px-2" : "px-3.5"].join(" ")}>
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <div key={`${section.label}-${item.href}-${item.label}`} className="relative">
                    {active && !isCollapsed && (
                      <span className="absolute -left-3.5 bottom-1.5 top-1.5 w-[3px] rounded-r bg-[#5A93F7] shadow-[0_0_12px_#5A93F7]" />
                    )}
                    <Link
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      className={[
                        "flex items-center rounded-[9px] px-[10px] py-2 text-[13.5px] transition-colors",
                        isCollapsed ? "justify-center" : "gap-[11px]",
                        active
                          ? "bg-[linear-gradient(90deg,rgba(45,107,228,0.22),rgba(45,107,228,0.05))] font-semibold text-white"
                          : "font-medium text-[#AEBCD0] hover:bg-white/[0.055] hover:text-[#EAF1FB]",
                      ].join(" ")}
                    >
                      <item.icon
                        className="h-[17px] w-[17px] flex-none"
                        strokeWidth={1.8}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span
                              className={[
                                "ml-auto min-w-[18px] rounded-full px-[7px] py-px text-center text-[10px] font-bold",
                                item.badgeAmber
                                  ? "bg-[#D7A23F] text-[#3A2A06]"
                                  : "bg-[#2D6BE4] text-white",
                              ].join(" ")}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={[
          "flex items-center border-t border-white/[0.06] py-3",
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-3.5",
        ].join(" ")}
      >
        <div
          title={isCollapsed ? `${userName} · ${userRole}` : undefined}
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#D7A23F] to-[#B07F22] text-[12.5px] font-bold text-white cursor-default"
        >
          {userInitials}
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-[#EAF1FB]">
              {userName}
            </div>
            <div className="text-[11px] text-[#7E8FA8]">{userRole}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
