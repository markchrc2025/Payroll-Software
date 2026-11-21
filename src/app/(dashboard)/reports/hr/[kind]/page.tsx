/**
 * Wave D (PAY-214): /reports/hr/expense-transactions, /leave-transactions,
 * /leave-entitlement and /time-clock (the sidebar's former "Soon" reports).
 */
import { notFound } from "next/navigation";
import { isHrReportKind } from "@/lib/reports/hr-reports-view";
import { HrReportView } from "./HrReportView";

export default async function HrReportPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isHrReportKind(kind)) notFound();
  return <HrReportView kind={kind} />;
}
