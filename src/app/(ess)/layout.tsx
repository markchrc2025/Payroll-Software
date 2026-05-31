"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileText, CalendarDays, UserCircle, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/ess", label: "Home", icon: LayoutDashboard },
  { href: "/ess/payslips", label: "Payslips", icon: FileText },
  { href: "/ess/leaves", label: "Leave", icon: CalendarDays },
  { href: "/ess/profile", label: "Profile", icon: UserCircle },
];

export default function EssLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    setCurrentDate(
      new Date().toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, []);

  useEffect(() => {
    if (pathname === "/ess/login") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("ess_token") : null;
    if (!token) {
      router.replace("/ess/login");
    }
  }, [pathname, router]);

  const isLogin = pathname === "/ess/login";

  if (isLogin) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-[family-name:var(--font-plus-jakarta-sans)]">
        {children}
      </div>
    );
  }

  function handleLogout() {
    localStorage.removeItem("ess_token");
    router.replace("/ess/login");
  }

  const activeLabel = NAV_ITEMS.find(
    ({ href }) => pathname === href || (href !== "/ess" && pathname.startsWith(href)),
  )?.label ?? "Home";

  return (
    <div className="min-h-screen bg-[#F0F4F8] font-[family-name:var(--font-plus-jakarta-sans)] lg:flex">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 bg-[#1E3A5F] z-40">
        {/* Branding */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <p className="text-white text-[13px] font-semibold leading-none">Sentire Payroll</p>
              <p className="text-white/45 text-[10px] mt-0.5">Employee Self-Service</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/ess" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  active
                    ? "bg-white/15 text-white font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-5 border-t border-white/10 pt-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Content wrapper ─────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">

        {/* Desktop top bar */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 bg-white border-b border-gray-100 items-center justify-between px-6">
          <p className="text-[14px] font-semibold text-gray-800">{activeLabel}</p>
          <span className="text-[12px] text-gray-400">{currentDate}</span>
        </header>

        {/* Page */}
        <main className="flex-1 pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around z-50">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/ess" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-xs transition-colors ${
                active ? "text-[#1E3A5F] font-medium" : "text-gray-400"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-[#1E3A5F]" : "text-gray-400"}`} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
