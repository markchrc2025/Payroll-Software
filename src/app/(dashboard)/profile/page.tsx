import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prismaAdmin from "@/lib/prisma-admin";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const name = session.user.name?.trim() || "User";
  const email = session.user.email || "-";

  // Resolve the tenant's company code + the user's assigned role name, the way
  // the dashboard shell does — the bare tenant id (a database key) is not shown.
  const [tenant, role] = await Promise.all([
    session.user.tenantId
      ? prismaAdmin.tenant.findUnique({
          where: { id: session.user.tenantId },
          select: { name: true, companyCode: true },
        })
      : null,
    session.user.roleId
      ? prismaAdmin.role.findUnique({
          where: { id: session.user.roleId },
          select: { name: true },
        })
      : null,
  ]);

  const company = tenant?.name ?? "-";
  const companyCode = tenant?.companyCode ?? "-";
  const roleLabel =
    role?.name ??
    (session.user.systemRole === "SUPER_ADMIN" ? "Super Admin" : "Staff");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Account details and session identity.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
            <dd className="mt-1 text-sm font-medium text-foreground break-all">{email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{company}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company Code</dt>
            <dd className="mt-1 text-sm font-mono text-foreground break-all">{companyCode}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{roleLabel}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
