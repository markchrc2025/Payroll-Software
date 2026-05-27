import { Users, Building2, GitBranch, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { label: "Total Employees", value: "—", icon: Users, hint: "Active roster" },
  { label: "Departments", value: "—", icon: Building2, hint: "Across company" },
  { label: "Branches", value: "—", icon: GitBranch, hint: "All locations" },
  { label: "Next Payroll", value: "—", icon: Wallet, hint: "Cutoff in days" },
];

export default function DashboardPage() {
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
