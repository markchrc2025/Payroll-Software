"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building,
  DollarSign,
  Users,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardData {
  totalTenants: number;
  newThisMonth: number;
  totalEmployees: number;
  mrr: number;
  attentionCount: number;
  healthPct: number;
  attention: AttentionItem[];
  recentSignups: RecentItem[];
}

interface AttentionItem {
  id: string;
  name: string;
  subdomain: string | null;
  status: string;
  trialEndsAt: string | null;
}

interface RecentItem {
  id: string;
  name: string;
  subdomain: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  employeeCount: number;
  createdAt: string;
}

const STATUS_DOT: Record<string, string> = {
  PAST_DUE: "bg-amber-500",
  CANCELLED: "bg-red-500",
  TRIALING: "bg-amber-500",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  PAST_DUE: { bg: "bg-amber-50", text: "text-amber-800", label: "Overdue" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-800", label: "Cancelled" },
  TRIALING: { bg: "bg-amber-50", text: "text-amber-800", label: "Expiring" },
};

const TIER_BADGE: Record<string, { bg: string; text: string }> = {
  STARTER:    { bg: "bg-gray-100",   text: "text-gray-700" },
  GROWTH:     { bg: "bg-blue-100",   text: "text-blue-700" },
  PRO:        { bg: "bg-violet-100", text: "text-violet-700" },
};

const SIGNUP_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: "bg-green-50",  text: "text-green-700", label: "Active" },
  TRIALING:  { bg: "bg-amber-50",  text: "text-amber-800", label: "Trial" },
  PAST_DUE:  { bg: "bg-amber-50",  text: "text-amber-800", label: "Overdue" },
  CANCELLED: { bg: "bg-red-50",    text: "text-red-700",   label: "Cancelled" },
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "bg-blue-100",   text: "text-blue-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-amber-100",  text: "text-amber-700" },
  { bg: "bg-green-100",  text: "text-green-700" },
  { bg: "bg-pink-100",   text: "text-pink-700" },
];
function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${Math.round(n / 1_000)}K`;
  return `₱${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((r) => setData(r.data ?? null))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <p className="text-sm font-medium text-gray-900">Central Portal</p>
          <p className="text-xs text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => router.push("/admin/tenants")}
          className="flex items-center gap-1.5 bg-[#1E3A5F] text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#16304f] transition-colors"
        >
          <span className="text-sm leading-none">+</span> New tenant
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {[
          {
            icon: Building,
            label: "Tenants",
            value: loading ? null : data?.totalTenants ?? 0,
            sub: loading ? null : `+${data?.newThisMonth ?? 0} this month`,
            subColor: "text-green-600",
          },
          {
            icon: DollarSign,
            label: "Est. MRR",
            value: loading ? null : fmt(data?.mrr ?? 0),
            sub: "Active tenants",
            subColor: "text-gray-500",
          },
          {
            icon: Users,
            label: "Employees",
            value: loading ? null : (data?.totalEmployees ?? 0).toLocaleString(),
            sub: "Across all tenants",
            subColor: "text-gray-500",
          },
          {
            icon: Activity,
            label: "Health",
            value: loading ? null : `${data?.healthPct ?? 100}%`,
            sub: loading
              ? null
              : data?.attentionCount
              ? `${data.attentionCount} need attention`
              : "All tenants healthy",
            subColor: (data?.attentionCount ?? 0) > 0 ? "text-amber-600" : "text-gray-500",
          },
        ].map(({ icon: Icon, label, value, sub, subColor }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-gray-100 p-3.5"
          >
            <p className="flex items-center gap-1 text-[11px] text-gray-500 mb-1.5">
              <Icon size={13} />
              {label}
            </p>
            {value === null ? (
              <Skeleton className="h-6 w-16 mb-1" />
            ) : (
              <p className="text-[22px] font-medium text-gray-900 leading-tight">{value}</p>
            )}
            {sub === null ? (
              <Skeleton className="h-3 w-20 mt-1" />
            ) : (
              <p className={`text-[10px] mt-1 ${subColor}`}>{sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-2 gap-3">
        {/* Requires attention */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <p className="text-xs font-medium text-gray-900 mb-2.5">Requires attention</p>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2 py-2 border-b border-gray-50 last:border-0">
                <Skeleton className="w-2 h-2 rounded-full mt-1 shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))
          ) : !data?.attention.length ? (
            <p className="text-xs text-gray-400 py-4 text-center">All tenants healthy</p>
          ) : (
            data.attention.map((item) => {
              const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.TRIALING;
              const dot = STATUS_DOT[item.status] ?? "bg-gray-400";
              const reason =
                item.status === "PAST_DUE"
                  ? "Invoice overdue"
                  : item.status === "CANCELLED"
                  ? "Subscription cancelled"
                  : item.trialEndsAt
                  ? `Trial expires ${formatDate(item.trialEndsAt)}`
                  : "Needs attention";
              return (
                <div
                  key={item.id}
                  className="flex gap-2 items-start py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded"
                  onClick={() => router.push(`/admin/tenants/${item.id}`)}
                >
                  <div className={`w-2 h-2 rounded-full ${dot} mt-1 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-500">{reason}</p>
                  </div>
                  <span className={`text-[10px] ${badge.bg} ${badge.text} rounded-full px-2 py-0.5 shrink-0`}>
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Recent signups */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <p className="text-xs font-medium text-gray-900 mb-2.5">Recent signups</p>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))
          ) : !data?.recentSignups.length ? (
            <p className="text-xs text-gray-400 py-4 text-center">No tenants yet</p>
          ) : (
            data.recentSignups.map((item) => {
              const av = avatarColor(item.name);
              const tier = TIER_BADGE[item.subscriptionTier] ?? TIER_BADGE.STARTER;
              const sig = SIGNUP_STATUS[item.subscriptionStatus] ?? SIGNUP_STATUS.ACTIVE;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded"
                  onClick={() => router.push(`/admin/tenants/${item.id}`)}
                >
                  <div className={`w-7 h-7 rounded-lg ${av.bg} flex items-center justify-center shrink-0`}>
                    <span className={`text-[10px] font-medium ${av.text}`}>{initials(item.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-500">
                      <span className={`inline-block rounded-full px-1.5 py-0.5 mr-1 ${tier.bg} ${tier.text}`}>
                        {item.subscriptionTier}
                      </span>
                      {item.employeeCount} emp · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <span className={`text-[10px] ${sig.bg} ${sig.text} rounded-full px-2 py-0.5 shrink-0`}>
                    {sig.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
