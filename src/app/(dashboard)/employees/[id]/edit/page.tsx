/**
 * /employees/[id]/edit — Edit Employee Page (Server Component)
 *
 * Loads existing employee data, departments, and branches server-side,
 * then hydrates the EmployeeForm with mode="edit".
 */

import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

async function getEmployee(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/employees/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

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

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>; // Next.js 16: params is a Promise
}) {
  const { id } = await params;
  const [employee, departments, branches] = await Promise.all([
    getEmployee(id),
    getDepartments(),
    getBranches(),
  ]);

  if (!employee) notFound();

  // Shape initial data — convert Date strings back to ISO date strings for inputs
  const initialData = {
    ...employee,
    hireDate: employee.hireDate
      ? new Date(employee.hireDate).toISOString().slice(0, 10)
      : undefined,
    birthDate: employee.birthDate
      ? new Date(employee.birthDate).toISOString().slice(0, 10)
      : undefined,
    regularizationDate: employee.regularizationDate
      ? new Date(employee.regularizationDate).toISOString().slice(0, 10)
      : undefined,
  };

  const fullName = `${employee.firstName} ${employee.lastName}`;

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
          <h1 className="text-2xl font-bold">Edit: {fullName}</h1>
          <p className="text-sm text-muted-foreground">
            Employee #{employee.employeeNumber}
          </p>
        </div>
      </div>

      <EmployeeForm
        mode="edit"
        employeeId={id}
        initialData={initialData}
        departments={departments}
        branches={branches}
      />
    </div>
  );
}
