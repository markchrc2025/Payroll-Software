import { requireCentralPage } from "@/lib/central-permission";
import prismaAdmin from "@/lib/prisma-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CpIcon } from "../../components/cp";
import TenantDetailClient from "./TenantDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function TenantDetailPage({ params }: Props) {
  await requireCentralPage("TENANTS", "READ");

  const { id } = await params;

  const [tenant, users] = await Promise.all([
    prismaAdmin.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, tradeName: true, companyCode: true,
        subdomain: true, industry: true, subscriptionTier: true,
        subscriptionStatus: true, trialEndsAt: true, billingEmail: true,
        featureFlags: true, payrollCycle: true, payDay1: true, payDay2: true,
        thirteenthMonthBasis: true, statutoryCutoffRule: true, workingDaysDenominator: true,
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
    <>
      <div className="cp-crumb">
        <Link href="/centralportal/tenants">Tenants</Link>
        <CpIcon name="chevR" size={14} />
        <span>{tenant.name}</span>
      </div>
      <TenantDetailClient tenant={tenantData} users={usersData} />
    </>
  );
}
