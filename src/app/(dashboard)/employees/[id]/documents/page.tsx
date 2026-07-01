/**
 * /employees/[id]/documents
 *
 * 201-file document management for a single employee. Loads data via the
 * (tenant-scoped, RLS-correct) employee APIs — the same server-side pattern
 * the profile and edit pages use — rather than querying Prisma directly at the
 * page, which bypassed withTenant/RLS.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { isR2Configured } from "@/lib/r2";
import { DocumentManager } from "@/components/employees/DocumentManager";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Forward the browser's session cookie so the API can authenticate. */
async function authHeaders(): Promise<HeadersInit> {
  const store = await cookies();
  return { Cookie: store.getAll().map((c) => `${c.name}=${c.value}`).join("; ") };
}

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Employee ID (employeeNumber) or legacy CUID
  const headers = await authHeaders();

  // Resolve the employee (accepts Employee ID or CUID).
  const empRes = await fetch(`${BASE}/api/employees/${id}`, { cache: "no-store", headers });
  if (!empRes.ok) notFound();
  const empJson = await empRes.json().catch(() => null);
  const employee = empJson?.data as
    | { id: string; firstName: string; lastName: string; employeeNumber: string }
    | null;
  if (!employee?.id) notFound();

  // Documents, by the resolved internal id.
  const docsRes = await fetch(`${BASE}/api/employees/${employee.id}/documents`, {
    cache: "no-store",
    headers,
  });
  const docsJson = docsRes.ok ? await docsRes.json().catch(() => null) : null;
  const documents = docsJson?.data ?? [];

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const storageReady = isR2Configured();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/employees" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">201 File: {fullName}</h1>
          <p className="text-sm text-muted-foreground">Employee #{employee.employeeNumber}</p>
        </div>
      </div>

      {!storageReady && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>File storage is not configured.</strong> Set <code>R2_ACCOUNT_ID</code>,{" "}
          <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code>, and{" "}
          <code>R2_BUCKET</code> to enable uploads.
        </div>
      )}

      <DocumentManager employeeId={employee.id} documents={documents} />
    </div>
  );
}
