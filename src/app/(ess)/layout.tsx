"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileText, CalendarDays, UserCircle } from "lucide-react";

const NAV_ITEMS = [
  { href: "/ess", label: "Home", icon: LayoutDashboard },
  { href: "/ess/payslips", label: "Payslips", icon: FileText },
  { href: "/ess/leaves", label: "Leave", icon: CalendarDays },
  { href: "/ess/profile", label: "Profile", icon: UserCircle },
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
    <div className="min-h-screen bg-[#F0F4F8] pb-16">
      {children}
      {!isLogin && (
        <nav className="fixed bottom-0 inset-x-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around z-50">
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
      )}
    </div>
  );
}
