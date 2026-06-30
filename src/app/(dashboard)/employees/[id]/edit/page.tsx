/**
 * /employees/[id]/edit — Edit Employee Page (Server Component)
 *
 * Loads the existing employee plus all reference data, then hydrates the same
 * AddEmployeeWizard used by /employees/new in mode="edit" so Add and Edit share
 * one UI. Salary stays read-only in edit (it changes only via Movements).
 */

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AddEmployeeWizard } from "@/components/employees/AddEmployeeWizard";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { isR2Configured } from "@/lib/r2";

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

/** ISO date string (YYYY-MM-DD) for <input type="date">, or undefined. */
function isoDate(v: unknown): string | undefined {
  if (!v) return undefined;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>; // Next.js 16: params is a Promise
}) {
  const { id } = await params;
  const headers = await authHeaders();

  const [
    employee,
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
    get(`/api/employees/${id}`, headers).then((d) => d as unknown), // single object
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

  // get() returns json.data; for the single-employee endpoint that's the object.
  const emp = employee as Record<string, unknown> | null;
  if (!emp || Array.isArray(emp) || !emp.id) notFound();

  const statutoryIdsArr = Array.isArray(emp.statutoryIds)
    ? (emp.statutoryIds as { type: string; number: string }[])
    : [];
  const stat = (type: string) =>
    statutoryIdsArr.find((s) => s.type === type)?.number ?? "";

  // Shape initial values to match the wizard's CreateEmployeeInput field names.
  const initialData = {
    ...emp,
    hireDate: isoDate(emp.hireDate),
    birthDate: isoDate(emp.birthDate),
    regularizationDate: isoDate(emp.regularizationDate),
    resignationDate: isoDate(emp.resignationDate),
    lastWorkingDate: isoDate(emp.lastWorkingDate),
    endOfContractDate: isoDate(emp.endOfContractDate),
    statutoryIds: {
      tinNumber: stat("TIN"),
      sssNumber: stat("SSS"),
      philhealthNumber: stat("PHILHEALTH"),
      pagibigNumber: stat("PAGIBIG"),
      gsisMembershipId: stat("GSIS"),
    },
    // Exclude the employee from their own supervisor/manager pickers (handled
    // by filtering the employees list below).
  };

  const fullName = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
  const empList = (employees as { id: string }[]).filter((e) => e.id !== emp.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/employees" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Edit: {fullName}</h1>
            <p className="text-sm text-muted-foreground">
              Employee #{String(emp.employeeNumber ?? "")}
            </p>
          </div>
        </div>
        <Link
          href={`/employees/${encodeURIComponent(String(emp.employeeNumber ?? ""))}/documents`}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E8EBF1] bg-white px-3.5 py-2 text-sm font-medium text-[#4A586B] transition-colors hover:bg-[#F4F6F9] hover:text-[#0E1B2E]"
        >
          <FileText className="h-4 w-4" /> 201 File / Documents
        </Link>
      </div>

      <AddEmployeeWizard
        mode="edit"
        employeeId={String(emp.id)}
        employeeNumber={String(emp.employeeNumber ?? "")}
        hasEssPin={!!emp.hasEssPin}
        storageReady={isR2Configured()}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={initialData as any}
        departments={departments as { id: string; name: string }[]}
        branches={branches as { id: string; name: string }[]}
        positions={positions as { id: string; title: string; levelId: string | null; departmentId: string | null }[]}
        shiftSchedules={shiftSchedules as { id: string; name: string }[]}
        jobTypes={jobTypes as { id: string; name: string }[]}
        jobStatuses={jobStatuses as { id: string; name: string }[]}
        levels={levels as { id: string; name: string; rank: number }[]}
        workflows={workflows as { id: string; code: string; description: string | null }[]}
        employees={empList as { id: string; firstName: string; lastName: string; employeeNumber: string }[]}
      />
    </div>
  );
}
