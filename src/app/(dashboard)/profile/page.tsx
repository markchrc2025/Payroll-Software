import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const name = session.user.name?.trim() || "User";
  const email = session.user.email || "-";

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
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tenant ID</dt>
            <dd className="mt-1 text-sm font-mono text-foreground break-all">{session.user.tenantId ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">System Role</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{session.user.systemRole}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
