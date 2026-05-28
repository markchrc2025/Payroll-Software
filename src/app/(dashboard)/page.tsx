import { Users, Building2, GitBranch, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { withTenant } from "@/lib/with-tenant";

const getCachedDashboardStats = (tenantId: string) =>
  unstable_cache(
    () => _getDashboardStats(tenantId),
    ["dashboard-stats", tenantId],
    { revalidate: 60 } // refresh at most once per minute
  )();

async function _getDashboardStats(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [employees, departments, branches, nextRun] = await Promise.all([
      tx.employee.count({ where: { tenantId, deletedAt: null, employmentStatus: { not: "RESIGNED" } } }),
      tx.department.count({ where: { tenantId, deletedAt: null } }),
      tx.branch.count({ where: { tenantId, deletedAt: null } }),
      tx.payrollBook.findFirst({
        where: { tenantId, status: "DRAFT" },
        orderBy: { periodEnd: "asc" },
        select: { periodEnd: true },
      }),
    ]);
    return { employees, departments, branches, nextRun };
  });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { employees, departments, branches, nextRun } = await getCachedDashboardStats(
    session.user.tenantId
  );

  const today = new Date();
  const cutoffDays = nextRun?.periodEnd
    ? Math.ceil((new Date(nextRun.periodEnd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const stats = [
    { label: "Total Employees", value: employees.toString(), icon: Users, hint: "Active roster" },
    { label: "Departments", value: departments.toString(), icon: Building2, hint: "Across company" },
    { label: "Branches", value: branches.toString(), icon: GitBranch, hint: "All locations" },
    {
      label: "Next Payroll",
      value: cutoffDays !== null ? `${cutoffDays}d` : "—",
      icon: Wallet,
      hint: cutoffDays !== null ? "Days until cutoff" : "No draft run",
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome to Sentire Payroll — your HRIS &amp; Payroll command center.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-primary/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">
                {s.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Manage your workforce, automate Philippine-compliant payroll runs, and
            keep your company audit-ready — all from one place.
          </p>
          <p>Use the sidebar to navigate to Employees, Payroll, and Reports.</p>
        </CardContent>
      </Card>
    </div>
  );
}
