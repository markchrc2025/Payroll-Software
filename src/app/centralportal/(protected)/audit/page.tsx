import { redirect } from "next/navigation";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import prismaAdmin from "@/lib/prisma-admin";
import { PageHead, CpIcon } from "../components/cp";
import { AuditFeed, type AuditEvent } from "./AuditFeed";

export const dynamic = "force-dynamic";

const BILLING_ENTITIES = new Set(["Invoice", "Payment", "TenantSubscription", "BillingPackage"]);

function kindOf(action: string, entity: string, hasActor: boolean): AuditEvent["kind"] {
  if (action === "LOGIN" || action === "LOGOUT" || action === "IMPERSONATE") return "security";
  if (BILLING_ENTITIES.has(entity)) return "billing";
  if (entity === "Tenant") return "tenant";
  if (!hasActor) return "system";
  return "tenant";
}

function verb(action: string): string {
  const map: Record<string, string> = {
    CREATE: "created", UPDATE: "updated", DELETE: "deleted", READ: "viewed",
    APPROVE: "approved", REJECT: "rejected", EXPORT: "exported",
    LOGIN: "signed in to", LOGOUT: "signed out of", IMPERSONATE: "impersonated",
  };
  return map[action] ?? action.toLowerCase();
}

export default async function AuditPage() {
  const ctx = await getSuperAdminContext();
  if (!ctx) redirect("/centralportal/login");

  const logs = await prismaAdmin.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, actorUserId: true, action: true, entity: true, entityId: true, ipAddress: true, createdAt: true },
  });

  // Resolve actor names in one pass.
  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter(Boolean) as string[])];
  const actors = actorIds.length
    ? await prismaAdmin.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(actors.map((a) => [a.id, `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email]));

  const events: AuditEvent[] = logs.map((l) => ({
    id: l.id,
    who: l.actorUserId ? (nameById.get(l.actorUserId) ?? "Unknown") : "System",
    action: verb(l.action),
    target: l.entity,
    time: l.createdAt.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    timeMs: l.createdAt.getTime(),
    ip: l.ipAddress ?? "—",
    kind: kindOf(l.action, l.entity, !!l.actorUserId),
  }));

  // Request-time clock for the feed's relative date ranges (server timestamp).
  // eslint-disable-next-line react-hooks/purity -- server component, intentional
  const nowMs = Date.now();

  return (
    <>
      <PageHead
        title="Audit log"
        sub="Every privileged action on the platform — exportable for compliance"
        actions={<button className="cp-btn cp-btn-ghost"><CpIcon name="chevR" size={15} /> Export CSV</button>}
      />
      {events.length === 0 ? (
        <section className="cp-card"><div className="cp-empty">No audit events recorded yet.</div></section>
      ) : (
        <AuditFeed events={events} nowMs={nowMs} />
      )}
    </>
  );
}
