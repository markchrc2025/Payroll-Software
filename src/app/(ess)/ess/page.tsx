"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, CalendarDays, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface EssProfile {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_LINKS = [
  { href: "/ess/payslips", label: "Payslips", icon: FileText, description: "View your pay history" },
  { href: "/ess/leaves", label: "Leave", icon: CalendarDays, description: "Check balances & file requests" },
  { href: "/ess/clock", label: "Clock In / Out", icon: Timer, description: "Record your attendance" },
];

export default function EssDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<EssProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    fetch("/api/ess/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setProfile(d?.data ?? null); })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      {/* Greeting card */}
      <Card className="bg-sky-500 text-white">
        <CardContent className="pt-6 pb-4">
          {loading ? (
            <Skeleton className="h-7 w-56 bg-sky-400" />
          ) : (
            <>
              <p className="text-lg font-semibold">{getGreeting()}, {profile?.firstName ?? "Employee"}!</p>
              <p className="text-sky-100 text-sm">{profile?.employeeNumber}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-3">
        {QUICK_LINKS.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3 pb-2 pt-4">
                <div className="p-2 rounded-full bg-sky-50 text-sky-500">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* Sign out */}
      <button
        className="w-full text-sm text-red-500 underline text-center"
        onClick={() => {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
