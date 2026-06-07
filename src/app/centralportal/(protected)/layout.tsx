import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CentralPortalShell from "./components/CentralPortalShell";
import { getCentralContext, hasCentralPermission } from "@/lib/central-permission";

export default async function CentralPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getCentralContext re-validates against the live DB (deactivated/soft-deleted
  // admins are bounced here, not when their 8h JWT eventually expires).
  const ctx = await getCentralContext();
  if (!ctx) redirect("/centralportal/login");

  const session = await auth();
  const user = {
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
  };

  // Dashboard is always reachable by any central admin. Other sections appear
  // only when the role grants READ. Settings covers both Users and Roles.
  const allowedHrefs = [
    "/centralportal/dashboard",
    ...(hasCentralPermission(ctx, "TENANTS", "READ") ? ["/centralportal/tenants"] : []),
    ...(hasCentralPermission(ctx, "BILLING", "READ") ? ["/centralportal/billing"] : []),
    ...(hasCentralPermission(ctx, "SUPPORT", "READ") ? ["/centralportal/support"] : []),
    ...(hasCentralPermission(ctx, "USERS", "READ") || hasCentralPermission(ctx, "ROLES", "READ")
      ? ["/centralportal/settings"]
      : []),
  ];

  return (
    <CentralPortalShell user={user} allowedHrefs={allowedHrefs} roleName={ctx.centralRoleName}>
      {children}
    </CentralPortalShell>
  );
}
