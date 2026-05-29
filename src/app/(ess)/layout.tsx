"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileText, CalendarDays, Timer } from "lucide-react";

const NAV_ITEMS = [
  { href: "/ess", label: "Home", icon: LayoutDashboard },
  { href: "/ess/payslips", label: "Payslips", icon: FileText },
  { href: "/ess/leaves", label: "Leave", icon: CalendarDays },
  { href: "/ess/clock", label: "Clock", icon: Timer },
];

export default function EssLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/ess/login") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("ess_token") : null;
    if (!token) {
      router.replace("/ess/login");
    }
  }, [pathname, router]);

  const isLogin = pathname === "/ess/login";

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {children}
      {!isLogin && (
        <nav className="fixed bottom-0 inset-x-0 h-16 bg-white border-t flex items-center justify-around z-50">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 text-xs ${active ? "text-sky-500 font-medium" : "text-gray-500"}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
