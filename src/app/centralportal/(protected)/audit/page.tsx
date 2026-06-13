import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { PageHead } from "../components/cp";
import { AuditFeed, type AuditEvent } from "./AuditFeed";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const logs = await prismaAdmin.centralAuditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, actorName: true, action: true, target: true, kind: true, ipAddress: true, createdAt: true },
  });

  const events: AuditEvent[] = logs.map((l) => ({
    id: l.id,
    who: l.actorName,
    action: l.action,
    target: l.target,
    time: l.createdAt.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    timeMs: l.createdAt.getTime(),
    ip: l.ipAddress ?? "—",
    kind: l.kind.toLowerCase() as AuditEvent["kind"],
  }));

  // Request-time clock for the feed's relative date ranges (server timestamp).
  // eslint-disable-next-line react-hooks/purity -- server component, intentional
  const nowMs = Date.now();

  return (
    <>
      <PageHead
        title="Audit log"
        sub="Every privileged action on the platform — exportable for compliance"
      />
      {events.length === 0 ? (
        <section className="cp-card"><div className="cp-empty">No privileged actions recorded yet.</div></section>
      ) : (
        <AuditFeed events={events} nowMs={nowMs} />
      )}
    </>
  );
}
