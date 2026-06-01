"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/remotekiosk/setup") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("kiosk_token") : null;
    if (!token) {
      router.replace("/remotekiosk/setup");
    }
  }, [pathname, router]);

  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
