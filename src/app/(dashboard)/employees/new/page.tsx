/**
 * /employees/new — Add Employee wizard page (Server Component)
 *
 * Pre-fetches departments, branches, and positions on the server,
 * then renders the 9-step AddEmployeeWizard client component.
 */

import { AddEmployeeWizard } from "@/components/employees/AddEmployeeWizard";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function getDepartments() {
  const res = await fetch(`${BASE}/api/departments`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function getBranches() {
  const res = await fetch(`${BASE}/api/branches`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function getPositions() {
  const res = await fetch(`${BASE}/api/positions`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export default async function NewEmployeePage() {
  const [departments, branches, positions] = await Promise.all([
    getDepartments(),
    getBranches(),
    getPositions(),
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
        departments={departments}
        branches={branches}
        positions={positions}
      />
    </div>
  );
}
