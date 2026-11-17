import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { PageHead } from "../components/cp";
import { ComplianceClient, type RuleRow } from "./ComplianceClient";

export const dynamic = "force-dynamic";

const CATEGORIES = ["SSS_SCHEDULE", "PHILHEALTH_SCHEDULE", "PAGIBIG_SCHEDULE", "BIR_WITHHOLDING_TABLE"] as const;

export default async function CompliancePage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  // Global (tenantId null) statutory rules, newest first. The one in effect is
  // the latest that has started and not ended (versionInEffect); the rest are
  // history or upcoming.
  const rules = await prismaAdmin.statutoryRule.findMany({
    where: { tenantId: null, category: { in: [...CATEGORIES] } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true, category: true, version: true, legalBasis: true,
      effectiveFrom: true, effectiveTo: true, payload: true,
    },
  });

  const serial: RuleRow[] = rules.map((r) => ({
    id: r.id,
    category: r.category,
    version: r.version,
    legalBasis: r.legalBasis,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    payload: r.payload as Record<string, unknown>,
  }));

  return (
    <>
      <PageHead
        title="Compliance"
        sub="Statutory rates: SSS, PhilHealth, Pag-IBIG and the BIR withholding tax table. Publish a new version when the government changes a rate; it applies to every company from its start date, and earlier payrolls keep the version they used."
      />
      <ComplianceClient rules={serial} />
    </>
  );
}
