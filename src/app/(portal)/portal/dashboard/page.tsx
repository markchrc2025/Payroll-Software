"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Coins, Users, HeartPulse, RefreshCw, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Attention = {
  id: string;
  name: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  reason: string;
  tag: string;
};

type RecentSignup = {
  id: string;
  name: string;
  subdomain: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  employeeCount: number;
  createdAt: string;
};

type Summary = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  totalEmployees: number;
  healthScore: number;
  mrr: number;
  tierDistribution: Record<string, number>;
  needsAttention: Attention[];
  recentSignups: RecentSignup[];
};

const TIER_PILL: Record<string, string> = {
  STARTER:  "bg-gray-100 text-gray-700",
  GROWTH:   "bg-blue-50 text-blue-700",
  PRO:      "bg-violet-100 text-violet-700",
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE:    "bg-green-50 text-green-700",
  TRIALING:  "bg-amber-50 text-amber-800",
  PAST_DUE:  "bg-amber-50 text-amber-800",
  CANCELLED: "bg-red-50 text-red-700",
};

const TAG_PILL: Record<string, string> = {
  Trial:    "bg-amber-50 text-amber-800",
  Expiring: "bg-red-50 text-red-700",
  Overdue:  "bg-amber-50 text-amber-800",
  Inactive: "bg-gray-100 text-gray-600",
};

const ATTENTION_DOT: Record<string, string> = {
  Trial:    "#D97706",
  Expiring: "#E24B4A",
  Overdue:  "#D97706",
  Inactive: "#D97706",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_BG = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-700"];

function fmtPeso(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${Math.round(n / 1000)}K`;
  return `₱${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/summary");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = [
    { label: "Tenants", icon: Building2, value: loading ? null : data?.totalTenants, sub: loading ? null : `${data?.activeTenants} active` },
    { label: "MRR",     icon: Coins,     value: loading ? null : (data ? fmtPeso(data.mrr) : "—"), sub: loading ? null : "Monthly recurring" },
    { label: "Employees", icon: Users,   value: loading ? null : data?.totalEmployees?.toLocaleString(), sub: loading ? null : "Across all tenants" },
    {
      label: "Health", icon: HeartPulse,
      value: loading ? null : `${data?.healthScore ?? 0}%`,
      sub: loading ? null : (
        data && data.needsAttention.length > 0
          ? `${data.needsAttention.length} need attention`
          : "All healthy"
      ),
      subColor: data && data.needsAttention.length > 0 ? "#D97706" : "#16A34A",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "#111827" }}>Central Portal</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] border transition-colors hover:bg-gray-50"
            style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <Link
            href="/portal/tenants/new"
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: "#1E3A5F" }}
          >
            + New tenant
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] p-4"
            style={{ background: "white", border: "0.5px solid #E5E7EB" }}
          >
            <p className="flex items-center gap-1.5 text-[11px] mb-1.5" style={{ color: "#6B7280" }}>
              <s.icon size={13} /> {s.label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-16 mb-1" />
            ) : (
              <p className="text-[22px] font-semibold leading-none mb-1" style={{ color: "#111827" }}>
                {s.value}
              </p>
            )}
            {loading ? (
              <Skeleton className="h-3 w-20" />
            ) : (
              <p className="text-[10px]" style={{ color: s.subColor ?? "#6B7280" }}>{s.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-2 gap-4">
        {/* Needs attention */}
        <div
          className="rounded-[10px] p-4"
          style={{ background: "white", border: "0.5px solid #E5E7EB" }}
        >
          <p className="text-[12px] font-semibold mb-3" style={{ color: "#111827" }}>Requires attention</p>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : data?.needsAttention.length === 0 ? (
            <p className="text-[11px] text-center py-6" style={{ color: "#9CA3AF" }}>All tenants look healthy.</p>
          ) : (
            <div className="space-y-0">
              {data?.needsAttention.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 py-2"
                  style={{ borderBottom: idx < (data.needsAttention.length - 1) ? "0.5px solid #F3F4F6" : "none" }}
                >
                  <span className="mt-1 shrink-0 rounded-full" style={{ width: 7, height: 7, background: ATTENTION_DOT[item.tag] ?? "#D97706", display: "inline-block", marginTop: 5 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color: "#111827" }}>{item.name}</p>
                    <p className="text-[10px]" style={{ color: "#6B7280" }}>{item.reason}</p>
                  </div>
                  <span className={`ml-auto text-[10px] rounded-full px-2 py-0.5 shrink-0 ${TAG_PILL[item.tag] ?? "bg-gray-100 text-gray-600"}`}>
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent signups */}
        <div
          className="rounded-[10px] p-4"
          style={{ background: "white", border: "0.5px solid #E5E7EB" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>Recent signups</p>
            <Link href="/portal/tenants" className="flex items-center gap-1 text-[10px]" style={{ color: "#1E3A5F" }}>
              View all <ArrowRight size={10} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : data?.recentSignups.length === 0 ? (
            <p className="text-[11px] text-center py-6" style={{ color: "#9CA3AF" }}>No tenants yet.</p>
          ) : (
            <div className="space-y-0">
              {data?.recentSignups.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 py-2"
                  style={{ borderBottom: idx < (data.recentSignups.length - 1) ? "0.5px solid #F3F4F6" : "none" }}
                >
                  <div className={`flex items-center justify-center rounded-[7px] text-[10px] font-semibold shrink-0 ${AVATAR_BG[idx % AVATAR_BG.length]}`} style={{ width: 28, height: 28 }}>
                    {initials(t.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color: "#111827" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color: "#6B7280" }}>
                      {t.subscriptionTier.charAt(0) + t.subscriptionTier.slice(1).toLowerCase()} · {t.employeeCount} emp · {fmtDate(t.createdAt)}
                    </p>
                  </div>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 shrink-0 ${STATUS_PILL[t.subscriptionStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.subscriptionStatus === "TRIALING" ? "Trial" : t.subscriptionStatus.charAt(0) + t.subscriptionStatus.slice(1).toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
