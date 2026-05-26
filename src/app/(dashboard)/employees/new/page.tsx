/**
 * /employees/new — Create Employee Page (Server Component)
 *
 * Pre-fetches departments and branches on the server, then renders
 * the client-side EmployeeForm with mode="create".
 */

import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

async function getDepartments() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/departments`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function getBranches() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/branches`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export default async function NewEmployeePage() {
  const [departments, branches] = await Promise.all([
    getDepartments(),
    getBranches(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/employees"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Employee</h1>
          <p className="text-sm text-muted-foreground">
            Fill in the details below to create a new employee record.
          </p>
        </div>
      </div>

      <EmployeeForm
        mode="create"
        departments={departments}
        branches={branches}
      />
    </div>
  );
}
