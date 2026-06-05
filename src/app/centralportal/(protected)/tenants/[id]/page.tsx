import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import TenantDetailClient from "./TenantDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function TenantDetailPage({ params }: Props) {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const { id } = await params;

  const [tenant, users] = await Promise.all([
    prismaAdmin.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, tradeName: true, companyCode: true,
        subdomain: true, industry: true, subscriptionTier: true,
        subscriptionStatus: true, trialEndsAt: true, billingEmail: true,
        featureFlags: true, payrollCycle: true, payDay1: true, payDay2: true,
        contactEmail: true, contactPhone: true, tinNumber: true,
        address: true, city: true, province: true, zipCode: true,
        createdAt: true, updatedAt: true,
        _count: { select: { employees: true, users: true, payrollBooks: true } },
      },
    }),
    prismaAdmin.user.findMany({
      where: { tenantId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        systemRole: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
    }),
  ]);

  if (!tenant) notFound();

  // Serialize Dates to strings and narrow JSON for the client component
  const tenantData = {
    ...tenant,
    trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    featureFlags: (tenant.featureFlags ?? {}) as unknown as Record<string, boolean>,
  };
  const usersData = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="p-8">
      <Link
        href="/centralportal/tenants"
        className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Tenants
      </Link>
      <TenantDetailClient tenant={tenantData} users={usersData} />
    </div>
  );
}
