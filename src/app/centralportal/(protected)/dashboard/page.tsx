import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Users, TrendingUp, AlertCircle, Plus, ArrowRight } from "lucide-react";

const TIER_PILL: Record<string, string> = {
  PRO: "bg-violet-100 text-violet-700",
  GROWTH: "bg-blue-50 text-blue-700",
  STARTER: "bg-gray-100 text-gray-700",
};
const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  TRIALING: "bg-amber-50 text-amber-800",
  PAST_DUE: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
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
        id: true, name: true, subscriptionTier: true,
        subscriptionStatus: true, trialEndsAt: true, createdAt: true,
        _count: { select: { employees: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Total Tenants", value: total,   icon: Building2,   color: "#2563EB", bg: "#EFF6FF" },
    { label: "Active",        value: active,   icon: TrendingUp,  color: "#0b7a3e", bg: "#ECFDF3" },
    { label: "Trialing",      value: trialing, icon: Users,       color: "#b35c00", bg: "#FFFBEB" },
    { label: "Past Due",      value: pastDue,  icon: AlertCircle, color: "#c0392b", bg: "#FEF2F2" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#111827" }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Overview of all tenants and subscriptions
          </p>
        </div>
        <Link
          href="/centralportal/tenants/new"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: "#1E3A5F" }}
        >
          <Plus className="w-4 h-4" />
          Onboard Tenant
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl p-5 bg-white" style={{ border: "1px solid #E5E7EB" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: "#111827" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent Tenants */}
      <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #E5E7EB" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#F3F4F6" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#111827" }}>Recent Tenants</h2>
          <Link href="/centralportal/tenants" className="flex items-center gap-1 text-xs font-medium" style={{ color: "#1E3A5F" }}>
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
              {["Company", "Plan", "Status", "Employees", "Created"].map((h) => (
                <th key={h} className="text-left px-6 py-3 text-[10px] uppercase tracking-wider font-medium" style={{ color: "#9CA3AF" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTenants.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < recentTenants.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td className="px-6 py-3.5">
                  <Link href={`/centralportal/tenants/${t.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "#111827" }}>
                    {t.name}
                  </Link>
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${TIER_PILL[t.subscriptionTier] ?? "bg-gray-100 text-gray-700"}`}>
                    {t.subscriptionTier.charAt(0) + t.subscriptionTier.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[t.subscriptionStatus] ?? "bg-gray-100 text-gray-500"}`}>
                    {t.subscriptionStatus.charAt(0) + t.subscriptionStatus.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-[13px]" style={{ color: "#374151" }}>{t._count.employees}</td>
                <td className="px-6 py-3.5 text-[12px]" style={{ color: "#6B7280" }}>
                  {new Date(t.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
            {recentTenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#E5E7EB" }} />
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>No tenants yet</p>
                  <Link href="/centralportal/tenants/new" className="text-xs mt-1 inline-block hover:underline" style={{ color: "#1E3A5F" }}>
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
