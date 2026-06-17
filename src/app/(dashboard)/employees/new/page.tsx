/**
 * /employees/new — Add Employee wizard page (Server Component)
 *
 * Pre-fetches departments, branches, positions, levels, shift schedules,
 * job types, job statuses, workflows, and existing employees (for the
 * supervisor / manager pickers) on the server.
 */

import { AddEmployeeWizard } from "@/components/employees/AddEmployeeWizard";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function authHeaders(): Promise<HeadersInit> {
  const store = await cookies();
  const cookieHeader = store.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  return { Cookie: cookieHeader };
}

async function get<T = unknown[]>(url: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { cache: "no-store", headers });
  if (!res.ok) return [] as unknown as T;
  const json = await res.json();
  return json.data ?? [];
}

export default async function NewEmployeePage() {
  const headers = await authHeaders();
  const [
    departments,
    branches,
    positions,
    shiftSchedules,
    jobTypes,
    jobStatuses,
    levels,
    workflows,
    employees,
  ] = await Promise.all([
    get("/api/departments", headers),
    get("/api/branches", headers),
    get("/api/positions", headers),
    get("/api/shifts?limit=200&isActive=true", headers),
    get("/api/job-types", headers),
    get("/api/job-statuses", headers),
    get("/api/job-levels", headers),
    get("/api/approval-workflows?limit=100", headers),
    get("/api/employees?limit=500", headers),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/employees" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Employee</h1>
          <p className="text-sm text-muted-foreground">
            Complete the steps below to create a new employee record.
          </p>
        </div>
      </div>

      <AddEmployeeWizard
        departments={departments as { id: string; name: string }[]}
        branches={branches as { id: string; name: string }[]}
        positions={positions as { id: string; title: string; departmentId: string | null }[]}
        shiftSchedules={shiftSchedules as { id: string; name: string }[]}
        jobTypes={jobTypes as { id: string; name: string }[]}
        jobStatuses={jobStatuses as { id: string; name: string }[]}
        levels={levels as { id: string; name: string; rank: number }[]}
        workflows={workflows as { id: string; code: string; description: string | null }[]}
        employees={employees as { id: string; firstName: string; lastName: string; employeeNumber: string }[]}
      />
    </div>
  );
}
