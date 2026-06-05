import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Clock, Building2, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: "#111827" }}>Customer Support</h1>
        <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>Accounts and issues that need your attention</p>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active",    key: "ACTIVE",    icon: CheckCircle2, color: "#0b7a3e", bg: "#ECFDF3" },
          { label: "Trialing",  key: "TRIALING",  icon: Clock,        color: "#b35c00", bg: "#FFFBEB" },
          { label: "Past Due",  key: "PAST_DUE",  icon: AlertCircle,  color: "#c0392b", bg: "#FEF2F2" },
          { label: "Cancelled", key: "CANCELLED", icon: Building2,    color: "#6B7280", bg: "#F3F4F6" },
        ].map(({ label, key, icon: Icon, color, bg }) => (
          <div key={key} className="rounded-xl p-4 bg-white" style={{ border: "1px solid #E5E7EB" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</p>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: "#111827" }}>{statusMap[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Past Due */}
        <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #FBD5D5" }}>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: "#FEE2E2" }}>
            <AlertCircle className="w-4 h-4" style={{ color: "#c0392b" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#111827" }}>
              Past Due <span className="font-normal" style={{ color: "#9CA3AF" }}>({pastDue.length})</span>
            </h2>
          </div>
          {pastDue.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#86EFAC" }} />
              <p className="text-sm" style={{ color: "#9CA3AF" }}>All clear — no overdue accounts</p>
            </div>
          ) : (
            pastDue.map((t, i) => (
              <div key={t.id} className="px-5 py-3.5 flex items-center justify-between" style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
                <div>
                  <Link href={`/centralportal/tenants/${t.id}`} className="text-sm font-medium hover:underline" style={{ color: "#111827" }}>{t.name}</Link>
                  {t.billingEmail && <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{t.billingEmail}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${TIER_PILL[t.subscriptionTier] ?? "bg-gray-100 text-gray-700"}`}>{t.subscriptionTier}</span>
                  <Link href={`/centralportal/tenants/${t.id}`} className="text-xs font-medium" style={{ color: "#1E3A5F" }}>View →</Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Trials Expiring Soon */}
        <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #FDE9C8" }}>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: "#FEF3C7" }}>
            <Clock className="w-4 h-4" style={{ color: "#b35c00" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#111827" }}>
              Trials Expiring in 7 Days <span className="font-normal" style={{ color: "#9CA3AF" }}>({expiringSoon.length})</span>
            </h2>
          </div>
          {expiringSoon.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#86EFAC" }} />
              <p className="text-sm" style={{ color: "#9CA3AF" }}>No trials expiring soon</p>
            </div>
          ) : (
            expiringSoon.map((t, i) => (
              <div key={t.id} className="px-5 py-3.5 flex items-center justify-between" style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
                <div>
                  <Link href={`/centralportal/tenants/${t.id}`} className="text-sm font-medium hover:underline" style={{ color: "#111827" }}>{t.name}</Link>
                  {t.trialEndsAt && (
                    <p className="text-xs mt-0.5" style={{ color: "#b35c00" }}>
                      Expires {new Date(t.trialEndsAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                <Link href={`/centralportal/tenants/${t.id}`} className="text-xs font-medium" style={{ color: "#1E3A5F" }}>View →</Link>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recently Onboarded */}
      <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #E5E7EB" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F3F4F6" }}>
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4" style={{ color: "#1E3A5F" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#111827" }}>Recently Onboarded</h2>
          </div>
          <Link href="/centralportal/tenants" className="text-xs font-medium" style={{ color: "#1E3A5F" }}>View all →</Link>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
              {["Company", "Plan", "Status", "Employees", "Created"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium" style={{ color: "#9CA3AF" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTenants.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < recentTenants.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td className="px-5 py-3.5">
                  <Link href={`/centralportal/tenants/${t.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "#111827" }}>{t.name}</Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${TIER_PILL[t.subscriptionTier] ?? "bg-gray-100 text-gray-700"}`}>{t.subscriptionTier}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_PILL[t.subscriptionStatus] ?? "bg-gray-100 text-gray-500"}`}>{t.subscriptionStatus}</span>
                </td>
                <td className="px-5 py-3.5 text-[13px]" style={{ color: "#374151" }}>{t._count.employees}</td>
                <td className="px-5 py-3.5 text-[12px]" style={{ color: "#6B7280" }}>
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
