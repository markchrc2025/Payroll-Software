import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Users, TrendingUp, AlertCircle, Plus, ArrowRight } from "lucide-react";

const TIER_COLOR: Record<string, string> = {
  PRO: "#10B981",
  GROWTH: "#3B82F6",
  STARTER: "#6B7280",
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#10B981",
  TRIALING: "#F59E0B",
  PAST_DUE: "#EF4444",
  CANCELLED: "#6B7280",
};

export default async function DashboardPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const [total, active, trialing, pastDue, recentTenants] = await Promise.all([
    prismaAdmin.tenant.count({ where: { deletedAt: null } }),
    prismaAdmin.tenant.count({ where: { deletedAt: null, subscriptionStatus: "ACTIVE" } }),
    prismaAdmin.tenant.count({ where: { deletedAt: null, subscriptionStatus: "TRIALING" } }),
    prismaAdmin.tenant.count({ where: { deletedAt: null, subscriptionStatus: "PAST_DUE" } }),
    prismaAdmin.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Total Tenants", value: total,   icon: Building2,    color: "#3B82F6" },
    { label: "Active",        value: active,   icon: TrendingUp,   color: "#10B981" },
    { label: "Trialing",      value: trialing, icon: Users,        color: "#F59E0B" },
    { label: "Past Due",      value: pastDue,  icon: AlertCircle,  color: "#EF4444" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Overview of all tenants and subscriptions
          </p>
        </div>
        <Link
          href="/centralportal/tenants/new"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: "#2D6BE4" }}
        >
          <Plus className="w-4 h-4" />
          Onboard Tenant
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl p-5"
            style={{
              background: "#0F2340",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent Tenants */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "#0F2340",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <h2 className="text-sm font-semibold text-white">Recent Tenants</h2>
          <Link
            href="/centralportal/tenants"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {["Company", "Plan", "Status", "Employees", "Created"].map((h) => (
                <th
                  key={h}
                  className="text-left px-6 py-3 text-xs text-white/30 uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTenants.map((t, i) => (
              <tr
                key={t.id}
                className="hover:bg-white/[0.02] transition-colors"
                style={{
                  borderBottom:
                    i < recentTenants.length - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                }}
              >
                <td className="px-6 py-3.5">
                  <Link
                    href={`/centralportal/tenants/${t.id}`}
                    className="text-sm font-medium text-white hover:text-blue-400"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-6 py-3.5">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{
                      background: `${TIER_COLOR[t.subscriptionTier] ?? "#6B7280"}25`,
                      color: TIER_COLOR[t.subscriptionTier] ?? "#6B7280",
                    }}
                  >
                    {t.subscriptionTier}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: `${STATUS_COLOR[t.subscriptionStatus] ?? "#6B7280"}25`,
                      color: STATUS_COLOR[t.subscriptionStatus] ?? "#6B7280",
                    }}
                  >
                    {t.subscriptionStatus}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-sm text-white/60">
                  {t._count.employees}
                </td>
                <td className="px-6 py-3.5 text-sm text-white/40">
                  {new Date(t.createdAt).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
            {recentTenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No tenants yet</p>
                  <Link
                    href="/centralportal/tenants/new"
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                  >
                    Onboard your first tenant →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
