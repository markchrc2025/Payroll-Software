/**
 * Wave B (PAY-212): /background/education, /experience, /training,
 * /legal-documents (the sidebar's former "Soon" entries under Employees).
 */
import { notFound } from "next/navigation";
import { isBackgroundKind } from "@/lib/background/report-view";
import { BackgroundReport } from "./BackgroundReport";

export default async function BackgroundPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isBackgroundKind(kind)) notFound();
  return <BackgroundReport kind={kind} />;
}
