import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Clock, Building2, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [pastDue, expiringSoon, recentTenants, counts] = await Promise.all([
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null, subscriptionStatus: "PAST_DUE" },
      select: { id: true, name: true, billingEmail: true, createdAt: true, subscriptionTier: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null, subscriptionStatus: "TRIALING", trialEndsAt: { gte: now, lte: sevenDaysOut } },
      select: { id: true, name: true, trialEndsAt: true, subscriptionTier: true },
      orderBy: { trialEndsAt: "asc" },
      take: 10,
    }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true, name: true, subscriptionTier: true,
        subscriptionStatus: true, createdAt: true,
        _count: { select: { employees: true } },
      },
    }),
    prismaAdmin.tenant.groupBy({
      by: ["subscriptionStatus"],
      where: { deletedAt: null },
      _count: true,
    }),
  ]);

  const statusMap = Object.fromEntries(counts.map((c) => [c.subscriptionStatus, c._count]));

  const TIER_COLOR: Record<string, string> = { PRO: "#10B981", GROWTH: "#3B82F6", STARTER: "#6B7280" };
  const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    ACTIVE:    { bg: "rgba(16,185,129,0.1)",  text: "#10B981" },
    TRIALING:  { bg: "rgba(245,158,11,0.1)",  text: "#F59E0B" },
    PAST_DUE:  { bg: "rgba(239,68,68,0.1)",   text: "#EF4444" },
    CANCELLED: { bg: "rgba(107,114,128,0.1)", text: "#6B7280" },
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Customer Support</h1>
        <p className="text-sm text-white/40 mt-0.5">Accounts and issues that need your attention</p>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active",    key: "ACTIVE",    icon: CheckCircle2, color: "#10B981" },
          { label: "Trialing",  key: "TRIALING",  icon: Clock,        color: "#F59E0B" },
          { label: "Past Due",  key: "PAST_DUE",  icon: AlertCircle,  color: "#EF4444" },
          { label: "Cancelled", key: "CANCELLED", icon: Building2,    color: "#6B7280" },
        ].map(({ label, key, icon: Icon, color }) => (
          <div
            key={key}
            className="rounded-xl p-4"
            style={{ background: "#0F2340", border: `1px solid ${color}30` }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-2xl font-bold text-white">{statusMap[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Past Due */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#0F2340", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <div
            className="flex items-center gap-2.5 px-5 py-4 border-b"
            style={{ borderColor: "rgba(239,68,68,0.15)" }}
          >
            <AlertCircle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">
              Past Due
              <span className="ml-2 text-xs font-normal text-white/40">({pastDue.length})</span>
            </h2>
          </div>
          {pastDue.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400/40 mx-auto mb-2" />
              <p className="text-sm text-white/30">All clear — no overdue accounts</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {pastDue.map((t) => (
                <div key={t.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/centralportal/tenants/${t.id}`}
                      className="text-sm font-medium text-white hover:text-blue-400"
                    >
                      {t.name}
                    </Link>
                    {t.billingEmail && (
                      <p className="text-xs text-white/40 mt-0.5">{t.billingEmail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: `${TIER_COLOR[t.subscriptionTier] ?? "#6B7280"}25`, color: TIER_COLOR[t.subscriptionTier] ?? "#6B7280" }}
                    >
                      {t.subscriptionTier}
                    </span>
                    <Link
                      href={`/centralportal/tenants/${t.id}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trials Expiring Soon */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#0F2340", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <div
            className="flex items-center gap-2.5 px-5 py-4 border-b"
            style={{ borderColor: "rgba(245,158,11,0.15)" }}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">
              Trials Expiring in 7 Days
              <span className="ml-2 text-xs font-normal text-white/40">({expiringSoon.length})</span>
            </h2>
          </div>
          {expiringSoon.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400/40 mx-auto mb-2" />
              <p className="text-sm text-white/30">No trials expiring soon</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {expiringSoon.map((t) => (
                <div key={t.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/centralportal/tenants/${t.id}`}
                      className="text-sm font-medium text-white hover:text-blue-400"
                    >
                      {t.name}
                    </Link>
                    {t.trialEndsAt && (
                      <p className="text-xs text-amber-400/70 mt-0.5">
                        Expires {new Date(t.trialEndsAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/centralportal/tenants/${t.id}`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently Onboarded */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#0F2340", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Recently Onboarded</h2>
          </div>
          <Link href="/centralportal/tenants" className="text-xs text-blue-400 hover:text-blue-300">
            View all →
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {["Company", "Plan", "Status", "Employees", "Created"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs text-white/30 uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTenants.map((t, i) => (
              <tr
                key={t.id}
                className="hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: i < recentTenants.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                <td className="px-5 py-3.5">
                  <Link
                    href={`/centralportal/tenants/${t.id}`}
                    className="text-sm font-medium text-white hover:text-blue-400"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ background: `${TIER_COLOR[t.subscriptionTier] ?? "#6B7280"}25`, color: TIER_COLOR[t.subscriptionTier] ?? "#6B7280" }}
                  >
                    {t.subscriptionTier}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: STATUS_COLOR[t.subscriptionStatus]?.bg ?? "rgba(107,114,128,0.1)", color: STATUS_COLOR[t.subscriptionStatus]?.text ?? "#6B7280" }}
                  >
                    {t.subscriptionStatus}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-white/60">{t._count.employees}</td>
                <td className="px-5 py-3.5 text-sm text-white/40">
                  {new Date(t.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
